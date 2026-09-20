<?php

namespace App\Console\Commands;

use App\Models\ActivityFlag;
use App\Models\SystemSetting;
use App\Models\Transaction;
use Illuminate\Console\Command;

class CheckUnusualActivity extends Command
{
    protected $signature = 'pawn:check-unusual-activity {--threshold= : Transactions in the window before a customer is flagged} {--window= : Rolling window in days}';
    protected $description = 'Flag customers who opened more transactions inside the rolling window than the threshold allows.';

    /**
     * Fallbacks used when the settings row is missing or unreadable.
     */
    private const DEFAULT_THRESHOLD = 3;
    private const DEFAULT_WINDOW_DAYS = 7;

    /**
     * This is a frequency heuristic, not a fraud finding. It counts pawns per
     * customer over a rolling window and asks a human to look at the ones above
     * the threshold.
     */
    public function handle(): int
    {
        $threshold = max(1, (int) ($this->option('threshold') ?: SystemSetting::where('setting_key', 'unusual_activity_threshold')->value('setting_value') ?: self::DEFAULT_THRESHOLD));
        $windowDays = max(1, (int) ($this->option('window') ?: SystemSetting::where('setting_key', 'unusual_activity_window_days')->value('setting_value') ?: self::DEFAULT_WINDOW_DAYS));
        $windowStart = now()->subDays($windowDays);

        $counts = Transaction::where('created_at', '>=', $windowStart)
            ->selectRaw('customer_id, COUNT(*) as transaction_count')
            ->groupBy('customer_id')
            ->havingRaw('COUNT(*) > ?', [$threshold])
            ->pluck('transaction_count', 'customer_id');

        $flagged = 0;

        foreach ($counts as $customerId => $transactionCount) {
            // One open flag per customer. Re-running the check on the same
            // burst must not stack duplicate rows in front of the reviewer, so
            // the count on an existing open flag is refreshed instead.
            $flag = ActivityFlag::firstOrNew(['customer_id' => $customerId, 'resolved' => false]);

            if (!$flag->exists) {
                $flagged++;
            }

            $flag->fill([
                'reason' => "High pawn transaction frequency:{$transactionCount} pawns in {$windowDays} days.",
                'transaction_count' => $transactionCount,
                'window_days' => $windowDays,
                'flagged_at' => now(),
            ])->save();
        }

        $this->info("Unusual activity check completed. {$counts->count()} customer(s) above the threshold of {$threshold} in {$windowDays} days, {$flagged} new flag(s).");

        return self::SUCCESS;
    }
}
