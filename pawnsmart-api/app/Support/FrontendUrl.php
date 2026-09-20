<?php

namespace App\Support;

/**
 * The address of the Ionic app, as the device that called the API sees it.
 *
 * Mail links must open the app on the address the device already uses, which on
 * a Wi-Fi network is the machine's LAN address rather than localhost. The
 * address is read from the caller's Origin header so that a new address from the
 * router keeps the links working without anyone editing configuration.
 *
 * The Origin header comes from the caller, so a link built from it would
 * otherwise send a password reset token to any host an attacker names. Only an
 * origin that CORS already accepts is used; anything else falls back to the
 * configured FRONTEND_URL.
 */
class FrontendUrl
{
    public static function resolve(): string
    {
        $fallback = rtrim((string) config('app.frontend_url'), '/');
        $origin = request()->headers->get('Origin');

        if (! is_string($origin) || $origin === '') {
            return $fallback;
        }

        $origin = rtrim($origin, '/');

        return self::isAllowed($origin) ? $origin : $fallback;
    }

    /**
     * The link base for an emailed link.
     *
     * Emails are often opened on a phone, where a localhost link cannot load.
     * The calling device's origin is kept when another device can reach it;
     * a loopback origin falls back to the network address instead.
     */
    public static function forMail(): string
    {
        $url = self::resolve();

        return self::isReachableByDevice($url) ? $url : self::forDevice()['url'];
    }

    /**
     * The same address, but one a different device can actually open.
     *
     * A QR code is read by a phone, not by the machine that printed it, so a
     * loopback address is useless here: the phone's own localhost is the phone.
     * That is what "localhost refused to connect" after a scan means. Every
     * loopback candidate is therefore skipped, and the first address that
     * belongs to the network wins:
     *
     *   1. FRONTEND_URL, when it names a real host.
     *   2. The origin the staff browser used, when CORS accepts it.
     *   3. The host the staff browser used to reach this API, on the app port.
     *   4. The machine's own LAN address, on the app port.
     *
     * When every candidate is loopback the loopback address is still returned,
     * because a ticket must print; `isReachableByDevice` says so, and the staff
     * screen shows what to fix.
     *
     * The returned `source` says which candidate won, because the last one is
     * a guess: a machine with VMware, VirtualBox, or WSL adapters has several
     * addresses and the lookup can pick a virtual one no phone can reach.
     *
     * @return array{url: string, source: string}
     */
    public static function forDevice(): array
    {
        $port = self::frontendPort();

        $candidates = [
            'config' => rtrim((string) config('app.frontend_url'), '/'),
            'origin' => self::allowedOrigin(),
            'request-host' => self::hostUrl(request()->getHost(), $port, request()->isSecure()),
            'detected' => self::hostUrl(self::machineAddress(), $port, false),
        ];

        foreach ($candidates as $source => $candidate) {
            if ($candidate !== null && $candidate !== '' && ! self::isLoopback($candidate)) {
                return ['url' => $candidate, 'source' => $source];
            }
        }

        return ['url' => self::resolve(), 'source' => 'loopback'];
    }

    /**
     * Whether a URL can be opened from another device on the network.
     *
     * A loopback address cannot, so a QR code built on one will fail on every
     * phone that scans it.
     */
    public static function isReachableByDevice(string $url): bool
    {
        return ! self::isLoopback($url);
    }

    private static function isLoopback(string $url): bool
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        if ($host === '') {
            return true;
        }

        return $host === 'localhost'
            || $host === '::1'
            || $host === '[::1]'
            || $host === '0.0.0.0'
            || str_starts_with($host, '127.');
    }

    /** The Origin of the caller, when CORS accepts it. */
    private static function allowedOrigin(): ?string
    {
        $origin = request()->headers->get('Origin');

        if (! is_string($origin) || $origin === '') {
            return null;
        }

        $origin = rtrim($origin, '/');

        return self::isAllowed($origin) ? $origin : null;
    }

    /** The port the Ionic app is served on, taken from FRONTEND_URL. */
    private static function frontendPort(): int
    {
        $port = parse_url((string) config('app.frontend_url'), PHP_URL_PORT);

        return is_int($port) ? $port : 8100;
    }

    private static function hostUrl(?string $host, int $port, bool $secure): ?string
    {
        if ($host === null || $host === '') {
            return null;
        }

        return ($secure ? 'https://' : 'http://').$host.':'.$port;
    }

    /**
     * This machine's address on the network, as the router handed it out.
     *
     * SERVER_ADDR is the address the request arrived on, which is already the
     * LAN address whenever staff reach the API over Wi-Fi. The host lookup is
     * the fallback for a request that arrived on loopback.
     */
    private static function machineAddress(): ?string
    {
        $serverAddress = request()->server('SERVER_ADDR');

        if (is_string($serverAddress) && filter_var($serverAddress, FILTER_VALIDATE_IP) && ! str_starts_with($serverAddress, '127.')) {
            return $serverAddress;
        }

        $hostname = gethostname();

        if ($hostname === false) {
            return null;
        }

        $resolved = gethostbyname($hostname);

        return filter_var($resolved, FILTER_VALIDATE_IP) ? $resolved : null;
    }

    private static function isAllowed(string $origin): bool
    {
        $allowed = array_map(
            static fn ($value) => rtrim(trim((string) $value), '/'),
            (array) config('cors.allowed_origins', [])
        );

        if (in_array('*', $allowed, true) || in_array($origin, $allowed, true)) {
            return true;
        }

        foreach ((array) config('cors.allowed_origins_patterns', []) as $pattern) {
            if (preg_match($pattern, $origin) === 1) {
                return true;
            }
        }

        return false;
    }
}
