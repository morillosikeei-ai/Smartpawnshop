<?php

namespace App\Console\Commands;

use App\Models\Transaction;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/**
 * Release items staff set aside for pickup that were not collected within
 * redemption_visit_days: the request is cleared, the customer is told to ask
 * again, and staff are told to return the item to the vault.
 */
class ExpirePickups extends Command
{
    protected $signature = 'redemptions:expire';
    protected $description = 'Release items set aside for pickup that were not collected in time.';

    public function handle(NotificationService $notifications): int
    {
        $count = 0;
        Transaction::with('item', 'customer')
            ->where('status', 'active')
            ->whereNotNull('redemption_confirmed_at')
            ->get()
            ->filter(fn (Transaction $transaction) => $transaction->pickupReadyUntil()?->isPast())
            ->each(function (Transaction $transaction) use ($notifications, &$count) {
                $transaction->update(['ready_to_redeem_at' => null, 'redemption_confirmed_at' => null]);
                $notifications->pickupExpired($transaction);
                $count++;
            });

        $this->info("Released {$count} item(s) not picked up in time.");

        return self::SUCCESS;
    }
}
