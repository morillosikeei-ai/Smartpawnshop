<?php

namespace App\Console\Commands;

use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\ItemValueLog;
use App\Models\RiskAlert;
use App\Models\SystemSetting;
use App\Models\Transaction;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class RunDailyPawnLifecycle extends Command
{
    protected $signature = 'pawnshop:daily-lifecycle {--price= : Manual fallback price per gram}';
    protected $description = 'Refresh gold prices, item values, risk alerts, and forfeitures.';

    public function handle(): int
    {
        $price = (float) ($this->option('price') ?: SystemSetting::where('setting_key', 'current_gold_price')->value('setting_value'));
        $source = 'manual';
        if (!$price) {
            $response = Http::timeout(10)->get('https://www.goldapi.io/api/XAU/PHP');
            if ($response->successful() && $response->json('price_gram_24k')) { $price = (float) $response->json('price_gram_24k'); $source = 'api'; }
        }
        if (!$price) { $price = (float) (GoldPrice::latest('price_date')->value('price_per_gram') ?: 3560); }
        $history = GoldPrice::orderByDesc('price_date')->limit(7)->pluck('price_per_gram')->map(fn ($value) => (float) $value)->all();
        $prediction = count($history) ? array_sum($history) / count($history) : $price;
        GoldPrice::updateOrCreate(['price_date' => today()], ['price_per_gram' => $price, 'predicted_next_price' => $prediction, 'source' => $source]);
        $threshold = (float) (SystemSetting::where('setting_key', 'risk_threshold_percent')->value('setting_value') ?: 80);
        Item::with('transactions')->whereIn('status', ['active', 'overdue'])->each(function (Item $item) use ($price, $threshold) {
            $transaction = $item->transactions()->where('status', 'active')->latest('transactions_id')->first();

            // Watches, cellphones, and bulky items are not valued from the gold
            // price, so they get no daily value log and no value based risk
            // alert. Their due dates are still checked below.
            if ($item->usesGoldPriceValuation()) {
                $computed = (float) $item->weight_grams * $item->karatPurityPercent() * $price;
                ItemValueLog::updateOrCreate(['item_id' => $item->items_id, 'log_date' => today()], ['computed_value' => $computed, 'gold_price_used' => $price]);
                if ($transaction) {
                    $item->update(['appraised_value' => $computed]);
                    $ratio = $transaction->loan_amount > 0 ? ($computed / $transaction->loan_amount) * 100 : 100;
                    if ($ratio < 100 || $ratio < $threshold) RiskAlert::firstOrCreate(['item_id' => $item->items_id, 'resolved' => false], ['risk_level' => $ratio < 100 ? 'high' : 'medium', 'current_value' => $computed, 'loan_amount' => $transaction->loan_amount, 'triggered_at' => now()]);
                }
            }

            if (!$transaction) return;
            if (now()->startOfDay()->gt($transaction->due_date->copy()->addDays($transaction->grace_period_days))) { $transaction->update(['status' => 'forfeited']); $item->update(['status' => 'forfeited']); }
        });

        // Frequency heuristic over the same day's data. It only reads
        // transactions, so it runs last and never blocks the lifecycle above.
        $this->call(CheckUnusualActivity::class);

        $this->info('Daily pawnshop lifecycle completed.');
        return self::SUCCESS;
    }
}
