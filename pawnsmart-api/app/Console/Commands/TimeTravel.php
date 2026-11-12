<?php

namespace App\Console\Commands;

use App\Support\SimulatedClock;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;

/**
 * Demo and testing only: make the whole system treat another date as today.
 *
 *   php artisan pawnshop:time-travel                 show the date in use
 *   php artisan pawnshop:time-travel 2027-02-08      today is Feb 8, 2027
 *   php artisan pawnshop:time-travel +30             30 days after the date in use
 *   php artisan pawnshop:time-travel reset           back to the real date
 *
 * Due dates stay as they are; only "today" moves. Pair it with
 * pawnshop:daily-lifecycle --ticket=PT-... so the nightly job only touches
 * the demo pawn. Runs only with APP_ENV=local.
 */
class TimeTravel extends Command
{
    protected $signature = 'pawnshop:time-travel {date? : YYYY-MM-DD, +N days, or reset}';

    protected $description = 'Demo/testing only: set the date the system treats as today, or reset it.';

    public function handle(): int
    {
        if (! app()->environment('local')) {
            $this->error('Time travel only works with APP_ENV=local, so it can never affect a live shop.');

            return self::FAILURE;
        }

        $input = $this->argument('date');
        // The real date, read past the simulated clock this app may be on.
        $real = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Manila')))->format('Y-m-d');

        if ($input === null) {
            $date = SimulatedClock::date();
            $this->line($date ? "Simulated date: {$date} (real date: {$real})" : "Real date in use: {$real}");

            return self::SUCCESS;
        }

        if (strtolower($input) === 'reset') {
            @unlink(SimulatedClock::path());
            // Rate limits and cached values may hold future timestamps.
            Artisan::call('cache:clear');
            $this->info("Back to the real date: {$real}. Cache cleared.");

            return self::SUCCESS;
        }

        if (preg_match('/^\+(\d{1,4})$/', $input, $m)) {
            $from = SimulatedClock::date() ?? $real;
            $date = Carbon::parse($from)->addDays((int) $m[1])->toDateString();
        } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', $input) && strtotime($input)) {
            $date = $input;
        } else {
            $this->error('Use a date (YYYY-MM-DD), +N days, or reset.');

            return self::FAILURE;
        }

        if ($date < $real) {
            $this->error("{$date} is before the real date ({$real}). Time travel only goes forward.");

            return self::FAILURE;
        }

        file_put_contents(SimulatedClock::path(), $date);
        $this->info("The system now treats {$date} as today (real date: {$real}).");
        $this->line('Next: php artisan pawnshop:daily-lifecycle --ticket=PT-...   (refresh the portal after)');
        $this->line('When done: php artisan pawnshop:time-travel reset');

        return self::SUCCESS;
    }
}
