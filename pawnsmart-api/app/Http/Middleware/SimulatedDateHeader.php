<?php

namespace App\Http\Middleware;

use App\Support\SimulatedClock;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Tells the app the simulated "now" while pawnshop:time-travel is on, so the
 * portals count days from the same date as the API and show a banner.
 */
class SimulatedDateHeader
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (SimulatedClock::date() !== null) {
            $response->headers->set('X-Simulated-Now', now()->toIso8601String());
        }

        return $response;
    }
}
