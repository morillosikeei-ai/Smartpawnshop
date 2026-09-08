<?php

use App\Console\Commands\RunDailyPawnLifecycle;
use Illuminate\Support\Facades\Schedule;

Schedule::command(RunDailyPawnLifecycle::class)->dailyAt('00:05');
Schedule::command('gold:update-price')->daily();
