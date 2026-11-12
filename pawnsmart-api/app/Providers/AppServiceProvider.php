<?php

namespace App\Providers;

use App\Support\SimulatedClock;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Demo time travel (pawnshop:time-travel), local environment only.
        SimulatedClock::apply();
    }
}
