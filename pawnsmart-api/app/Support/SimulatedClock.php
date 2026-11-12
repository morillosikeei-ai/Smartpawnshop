<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * A simulated "today" for demos and testing, local environment only.
 *
 * pawnshop:time-travel writes a date to storage/app/simulated-date.txt. While
 * that file exists, every request and command sees that date as today (the
 * time of day stays real), so a pawn keeps its real due date and the system
 * behaves as if the months had passed: overdue, auction notice, for auction.
 *
 * It never applies outside APP_ENV=local, so it cannot touch a live shop.
 */
class SimulatedClock
{
    public static function path(): string
    {
        return storage_path('app/simulated-date.txt');
    }

    /** The simulated date (Y-m-d), or null when the real clock is in use. */
    public static function date(): ?string
    {
        if (! app()->environment('local') || ! is_file(self::path())) {
            return null;
        }
        $date = trim((string) file_get_contents(self::path()));

        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : null;
    }

    /** Point Carbon's "now" at the simulated date, keeping the real time of day. */
    public static function apply(): void
    {
        $date = self::date();
        if ($date === null) {
            return;
        }
        $time = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Manila')))->format('H:i:s');
        $simulated = Carbon::parse($date.' '.$time, 'Asia/Manila')->setTimezone(config('app.timezone'));
        Carbon::setTestNow($simulated);
    }
}
