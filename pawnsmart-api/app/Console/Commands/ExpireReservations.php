<?php

namespace App\Console\Commands;

use App\Services\ReservationService;
use Illuminate\Console\Command;

class ExpireReservations extends Command
{
    protected $signature = 'reservations:expire';
    protected $description = 'Release holds on items for sale whose time ran out, and tell their customers.';

    public function handle(ReservationService $reservations): int
    {
        $count = $reservations->expireDue();
        $this->info("Expired {$count} reservation(s).");

        return self::SUCCESS;
    }
}
