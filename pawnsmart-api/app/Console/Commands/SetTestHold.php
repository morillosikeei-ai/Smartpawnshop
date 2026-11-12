<?php

namespace App\Console\Commands;

use App\Models\ItemReservation;
use App\Services\ReservationService;
use Illuminate\Console\Command;

/**
 * Moves when a reservation (a hold on an item for sale) runs out, to test
 * what happens when it does. Run reservations:expire afterwards, which the
 * scheduler normally runs every hour. Local and testing environments only.
 *
 *   php artisan pawnshop:test-hold              list active holds
 *   php artisan pawnshop:test-hold 6 now        hold 6 ran out a minute ago
 *   php artisan pawnshop:test-hold 6 30m        hold 6 runs out in 30 minutes
 *   php artisan pawnshop:test-hold 6 2h         ... in 2 hours
 *   php artisan pawnshop:test-hold 6 1d         ... in 1 day
 */
class SetTestHold extends Command
{
    protected $signature = 'pawnshop:test-hold
        {reservation? : Reservation number, from the list}
        {when? : now (already ran out), or a time from now such as 30m, 2h, 1d}';

    protected $description = 'Testing only: list holds on items for sale, or move when one runs out.';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('This command only runs with APP_ENV=local, so it can never change real records.');

            return self::FAILURE;
        }

        $id = $this->argument('reservation');
        if (! $id) {
            $this->listHolds();

            return self::SUCCESS;
        }

        $reservation = ItemReservation::with('item', 'customer')->find($id);
        if (! $reservation || $reservation->status !== ItemReservation::STATUS_ACTIVE) {
            $this->error("No active hold number {$id}. Run the command with no number to list them.");

            return self::FAILURE;
        }

        $when = strtolower((string) $this->argument('when'));
        if ($when === 'now') {
            $expires = now()->subMinute();
        } elseif (preg_match('/^(\d{1,4})(m|h|d)$/', $when, $m)) {
            $expires = match ($m[2]) {
                'm' => now()->addMinutes((int) $m[1]),
                'h' => now()->addHours((int) $m[1]),
                'd' => now()->addDays((int) $m[1]),
            };
        } else {
            $this->error('Say when it runs out: now, or a time from now such as 30m, 2h, 1d.');

            return self::FAILURE;
        }

        $old = $reservation->expires_at;
        $reservation->update(['expires_at' => $expires]);

        $this->info("Hold {$id} on {$reservation->item?->description} ({$reservation->customer?->name}):");
        $this->line('  runs out '.$this->shopTime($old).'  ->  '.$this->shopTime($expires));
        $this->line('Now run: php artisan reservations:expire');
        $this->line("To undo: php artisan pawnshop:test-hold {$id} 2d   (or Cancel it in the portal)");

        return self::SUCCESS;
    }

    private function listHolds(): void
    {
        $rows = ItemReservation::with('item', 'customer')
            ->where('status', ItemReservation::STATUS_ACTIVE)
            ->orderBy('expires_at')
            ->get()
            ->map(fn (ItemReservation $r) => [
                $r->item_reservations_id,
                $r->item?->description,
                $r->customer?->name,
                $this->shopTime($r->expires_at),
                $r->expires_at->isPast() ? 'ran out, waiting for reservations:expire' : 'holding',
            ]);

        if ($rows->isEmpty()) {
            $this->line('No active holds. Reserve an item in the customer portal (Items for Sale) first.');

            return;
        }

        $this->table(['#', 'Item', 'Customer', 'Runs out (shop time)', 'State'], $rows);
    }

    private function shopTime($time): string
    {
        return $time ? $time->copy()->setTimezone(ReservationService::SHOP_TIMEZONE)->format('M j, Y g:i A') : '-';
    }
}
