<?php

use App\Console\Commands\RunDailyPawnLifecycle;
use Illuminate\Support\Facades\Schedule;

Schedule::command(RunDailyPawnLifecycle::class)->dailyAt('00:05');
Schedule::command('gold:update-price')->daily();
// Holds end at closing time, so an hourly run frees an item soon after.
Schedule::command('reservations:expire')->hourly();
