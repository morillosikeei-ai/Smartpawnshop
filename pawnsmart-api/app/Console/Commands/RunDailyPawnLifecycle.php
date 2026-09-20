<?php

namespace App\Console\Commands;

use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\ItemValueLog;
use App\Models\RiskAlert;
use App\Models\SilverPrice;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class RunDailyPawnLifecycle extends Command
{
    protected $signature = 'pawnshop:daily-lifecycle {--price= : Manual fallback price per gram}';
    protected $description = 'Refresh gold prices, item values, risk alerts, and forfeitures.';

    public function handle(NotificationService $notifications): int
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
        $dueSoonDays = $notifications->dueSoonNoticeDays();
        // Silver items follow the latest recorded silver price, never the gold
        // price above. The silver price itself is recorded by gold:update-price.
        $silverPrice = (float) SilverPrice::latest('price_date')->value('price_per_gram');
        Item::with(['transactions', 'customer'])->whereIn('status', ['active', 'overdue'])->each(function (Item $item) use ($price, $silverPrice, $threshold, $notifications, $dueSoonDays) {
            $transaction = $item->transactions()->where('status', 'active')->latest('transactions_id')->first();

            // Watches, cellphones, and bulky items are not valued from the gold
            // price, so they get no daily value log and no value based risk
            // alert. Their due dates are still checked below.
            $isSilver = $item->metal_type === Item::METAL_SILVER;
            $itemPrice = $isSilver ? $silverPrice : $price;
            // With no silver price recorded yet a silver item keeps its value.
            if ($item->usesGoldPriceValuation() && $itemPrice > 0) {
                // Only the gold portion follows the gold price. A gemstone value
                // is a one-time estimate from intake and is left untouched, but
                // it still counts toward the item's total value.
                $computed = (float) $item->weight_grams * $item->karatPurityPercent() * $itemPrice;
                $total = $item->valueWithGold($computed);
                ItemValueLog::updateOrCreate(['item_id' => $item->items_id, 'log_date' => today()], ['computed_value' => $total, 'gold_price_used' => $itemPrice]);
                if ($transaction) {
                    // Read before the update, so the customer can be told how
                    // far the value moved rather than only where it landed.
                    $previousValue = $item->totalValue();
                    $item->update(['appraised_value' => $computed]);
                    $ratio = $transaction->loan_amount > 0 ? ($total / $transaction->loan_amount) * 100 : 100;
                    if ($ratio < 100 || $ratio < $threshold) $alert = RiskAlert::firstOrCreate(['item_id' => $item->items_id, 'resolved' => false], ['risk_level' => $ratio < 100 ? 'high' : 'medium', 'current_value' => $total, 'loan_amount' => $transaction->loan_amount, 'triggered_at' => now()]);

                    $notifications->itemValueChanged($item, $previousValue, $total);

                    // Only a newly raised alert is worth a message. An alert
                    // that was already open has been announced once already.
                    if (isset($alert) && $alert->wasRecentlyCreated) {
                        if ($alert->risk_level === 'high') $notifications->itemFlaggedHighRisk($item);
                        $notifications->itemAtRisk($item);
                    }
                }
            }

            if (!$transaction) return;
            if (now()->startOfDay()->gt($transaction->due_date->copy()->addDays($transaction->grace_period_days))) {
                $transaction->update(['status' => 'forfeited']);
                $item->update(['status' => 'forfeited']);
                $transaction->setRelation('item', $item);
                $notifications->itemForfeitedForStaff($transaction);
                $notifications->itemForfeitedForCustomer($transaction);
                return;
            }

            $transaction->setRelation('item', $item);
            $daysUntilDue = $transaction->days_until_due;

            // Past the due date but still inside the grace period: staff can
            // still arrange a renewal before the item is lost.
            if ($daysUntilDue < 0) {
                $notifications->loanOverdue($transaction, $transaction->days_until_forfeiture);
                return;
            }

            if ($daysUntilDue <= $dueSoonDays) $notifications->dueDateApproaching($transaction, $daysUntilDue);
        });

        // Frequency heuristic over the same day's data. It only reads
        // transactions, so it runs last and never blocks the lifecycle above.
        $this->call(CheckUnusualActivity::class);

        $this->info('Daily pawnshop lifecycle completed.');
        return self::SUCCESS;
    }
}
