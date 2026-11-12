<?php

use App\Console\Commands\RunDailyPawnLifecycle;
use App\Services\GoldPriceService;
use Illuminate\Support\Facades\Schedule;

Schedule::command(RunDailyPawnLifecycle::class)->dailyAt('00:05');
// Gold and silver prices are filed under Philippine days, so the fetch runs
// at midnight Manila time.
Schedule::command('gold:update-price')->daily()->timezone(GoldPriceService::PRICE_TIMEZONE);
// Holds end at closing time, so an hourly run frees an item soon after.
Schedule::command('reservations:expire')->hourly();
// An item set aside for pickup goes back to the vault when it is not collected.
Schedule::command('redemptions:expire')->hourly();
