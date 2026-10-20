<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;

/**
 * Links to stored photos, in place of the photos themselves.
 *
 * Photos are kept in the database as data URLs. Sending them inside every
 * list made the staff dashboard alone 14 MB, so responses carry a short link
 * instead and the browser fetches (and caches) each image on its own.
 *
 * Links are signed, so they cannot be guessed or edited, and relative
 * ("/api/media/..."), so they go through the same address the app already
 * uses for the API. The expiry is the end of tomorrow rather than a fixed
 * time from now, which keeps a link the same all day and lets the browser
 * cache hit. The v parameter changes when the photo does.
 */
class MediaUrl
{
    /** A link for a stored photo, or the value unchanged when it is not a data URL (an old plain URL, or empty). */
    public static function for(string $route, array $parameters, ?string $stored): ?string
    {
        if ($stored === null || $stored === '') {
            return null;
        }

        if (! str_starts_with($stored, 'data:')) {
            return $stored;
        }

        return URL::temporarySignedRoute(
            $route,
            Carbon::tomorrow()->endOfDay(),
            $parameters + ['v' => substr(md5($stored), 0, 10)],
            false
        );
    }

    /** Whether a value sent back by the app is one of these links, for the given route path. */
    public static function isLinkTo(?string $value, string $path): bool
    {
        if (! is_string($value) || $value === '') {
            return false;
        }

        $linkPath = parse_url($value, PHP_URL_PATH);

        return is_string($linkPath) && str_ends_with(rtrim($linkPath, '/'), $path);
    }

    /**
     * Turn a stored data URL into an image response, cached privately by the
     * browser. A plain URL from an older record is redirected to.
     */
    public static function respond(?string $stored)
    {
        abort_if($stored === null || $stored === '', 404);

        if (! str_starts_with($stored, 'data:')) {
            return redirect()->away($stored);
        }

        abort_unless(preg_match('#^data:(image/[a-z0-9.+-]+);base64,#i', $stored, $match), 404);
        $bytes = base64_decode(substr($stored, strlen($match[0])), true);
        abort_if($bytes === false, 404);

        return response($bytes, 200, [
            'Content-Type' => $match[1],
            'Cache-Control' => 'private, max-age=86400, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
