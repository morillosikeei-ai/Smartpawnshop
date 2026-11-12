<?php

namespace App\Console\Commands;

use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\ItemValueLog;
use App\Models\RiskAlert;
use App\Models\SilverPrice;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Services\GoldPriceService;
use App\Services\NotificationService;
use App\Support\SimulatedClock;
use Illuminate\Console\Command;

class RunDailyPawnLifecycle extends Command
{
    protected $signature = 'pawnshop:daily-lifecycle {--price= : Record this gold price per gram for today, as a manual reading}
        {--ticket= : Only process this pawn ticket (for demos and testing)}';
    protected $description = 'Refresh gold prices, item values, risk alerts, and forfeitures.';

    public function handle(NotificationService $notifications, GoldPriceService $goldPrices): int
    {
        // Today's gold price is recorded by gold:update-price (GoldAPI, run
        // before this job). This job only reads the latest recorded price.
        // It used to save the current_gold_price setting as the day's price,
        // which wrote a fallback figure over the market history and revalued
        // jewelry at it. Only an admin's --price is recorded here, as manual.
        $manualPrice = $this->option('price');
        if ($manualPrice !== null && is_numeric($manualPrice) && (float) $manualPrice > 0) {
            $price = (float) $manualPrice;
            $row = GoldPrice::updateOrCreate(['price_date' => GoldPriceService::priceDate()], ['price_per_gram' => $price, 'source' => 'manual']);
            $row->update(['predicted_next_price' => $goldPrices->predictNextPrice()]);
        } else {
            $price = (float) (GoldPrice::latest('price_date')->value('price_per_gram')
                ?: SystemSetting::where('setting_key', 'current_gold_price')->value('setting_value')
                ?: GoldPriceService::DEFAULT_PRICE);
        }
        $threshold = (float) (SystemSetting::where('setting_key', 'risk_threshold_percent')->value('setting_value') ?: 80);
        $dueSoonDays = $notifications->dueSoonNoticeDays();
        $noticeDays = $notifications->auctionNoticeDays();
        // Silver items follow the latest recorded silver price, never the gold
        // price above. The silver price itself is recorded by gold:update-price.
        $silverPrice = (float) SilverPrice::latest('price_date')->value('price_per_gram');
        $onlyTicket = $this->option('ticket');
        $simulating = SimulatedClock::date() !== null;
        Item::with(['transactions', 'customer'])->whereIn('status', ['active', 'overdue'])
            ->when($onlyTicket, fn ($query) => $query->whereHas('transactions', fn ($q) => $q->where('ticket_number', $onlyTicket)->where('status', 'active')))
            ->each(function (Item $item) use ($price, $silverPrice, $threshold, $notifications, $dueSoonDays, $noticeDays, $simulating) {
            $transaction = $item->transactions()->where('status', 'active')->latest('transactions_id')->first();

            // Watches, cellphones, and bulky items are not valued from the gold
            // price, so they get no daily value log and no value based risk
            // alert. Their due dates are still checked below.
            $isSilver = $item->metal_type === Item::METAL_SILVER;
            $itemPrice = $isSilver ? $silverPrice : $price;
            // With no silver price recorded yet a silver item keeps its value.
            // During demo time travel the gold price is today's real one, so
            // values are left alone rather than logged on a future date.
            if ($item->usesGoldPriceValuation() && $itemPrice > 0 && ! $simulating) {
                // Only the gold portion follows the gold price. A gemstone value
                // is a one-time estimate from intake and is left untouched, but
                // it still counts toward the item's total value.
                $computed = (float) $item->weight_grams * $item->karatPurityPercent() * $itemPrice;
                $total = $item->valueWithGold($computed);
                ItemValueLog::updateOrCreate(['item_id' => $item->items_id, 'log_date' => GoldPriceService::priceDate()], ['computed_value' => $total, 'gold_price_used' => $itemPrice]);
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
            $transaction->setRelation('item', $item);
            $today = now()->startOfDay();

            // PD 114: past the redemption period (due date + grace period) the
            // item goes to public auction, but only once the written auction
            // notice has had auction_notice_days to reach the customer. A
            // notice that never went out (the job was down, or the pawn is
            // older than this rule) is sent now and the item waits for it.
            if ($today->gt($transaction->forfeitureDate()->startOfDay())) {
                if (! $transaction->auction_notice_sent_at) {
                    $this->sendAuctionNotice($transaction, $notifications);
                    return;
                }
                if ($transaction->auction_notice_sent_at->copy()->startOfDay()->addDays($noticeDays)->gt($today)) {
                    return;
                }
                $transaction->update(['status' => 'forfeited']);
                $item->update(['status' => 'forfeited']);
                $notifications->itemForfeitedForStaff($transaction);
                $notifications->itemForfeitedForCustomer($transaction);
                return;
            }

            // The written notice goes out auction_notice_days before the
            // redemption period ends, once per period. A due date moved
            // forward (renewed, or extended) starts a period that needs its own.
            $inNoticeWindow = $transaction->days_until_forfeiture <= $noticeDays;
            if (! $inNoticeWindow && $transaction->auction_notice_sent_at) $transaction->update(['auction_notice_sent_at' => null]);
            if ($inNoticeWindow && ! $transaction->auction_notice_sent_at) $this->sendAuctionNotice($transaction, $notifications);

            $daysUntilDue = $transaction->days_until_due;

            // Past the due date but still inside the grace period (the
            // Extension Period): the item shows as Overdue. The transaction
            // stays active, so it can still be redeemed or renewed.
            if ($daysUntilDue < 0) {
                if ($item->status !== 'overdue') $item->update(['status' => 'overdue']);
                $notifications->loanOverdue($transaction, $transaction->days_until_forfeiture);
                $notifications->loanOverdueForCustomer($transaction, $transaction->days_until_forfeiture);
                return;
            }

            // A due date moved forward (renewed, or extended) is no longer overdue.
            if ($item->status === 'overdue') $item->update(['status' => 'active']);

            if ($daysUntilDue <= $dueSoonDays) $notifications->dueDateApproaching($transaction, $daysUntilDue);
        });

        // Frequency heuristic over the same day's data. It only reads
        // transactions, so it runs last and never blocks the lifecycle above.
        if (! $onlyTicket) $this->call(CheckUnusualActivity::class);

        $this->info('Daily pawnshop lifecycle completed.');
        return self::SUCCESS;
    }

    /** Send the PD 114 auction notice and record when it went out. */
    private function sendAuctionNotice(Transaction $transaction, NotificationService $notifications): void
    {
        $transaction->loadMissing('customer.user');
        $notifications->auctionNotice($transaction);
        $transaction->update(['auction_notice_sent_at' => now()]);
    }
}
