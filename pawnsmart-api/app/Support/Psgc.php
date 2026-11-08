<?php

namespace App\Support;

/**
 * The Philippine Standard Geographic Code list: provinces, cities and
 * municipalities, and barangays, read from resources/psgc.
 *
 * The files are built from the PSA's PSGC publication (via psgc.gitlab.io);
 * see resources/psgc/README.md. Metro Manila has no province, so it is listed
 * as a province with the code "NCR" and its cities sit directly under it.
 */
class Psgc
{
    public const METRO_MANILA = 'NCR';

    /** @var array<string, mixed> Decoded files, kept for the rest of the request. */
    private static array $loaded = [];

    /** @return array<int, array{code: string, name: string}> */
    public static function provinces(): array
    {
        return self::read('provinces.json') ?? [];
    }

    /** @return array<int, array{code: string, name: string}> */
    public static function cities(string $provinceCode): array
    {
        return (self::read('cities.json') ?? [])[$provinceCode] ?? [];
    }

    /** @return array<int, string> */
    public static function barangays(string $cityCode): array
    {
        // The code becomes a file name, so only digits are accepted.
        if (! preg_match('/^\d{9}$/', $cityCode)) {
            return [];
        }

        return self::read("barangays/{$cityCode}.json") ?? [];
    }

    public static function provinceName(string $code): ?string
    {
        foreach (self::provinces() as $province) {
            if ($province['code'] === $code) {
                return $province['name'];
            }
        }

        return null;
    }

    public static function cityName(string $provinceCode, string $cityCode): ?string
    {
        foreach (self::cities($provinceCode) as $city) {
            if ($city['code'] === $cityCode) {
                return $city['name'];
            }
        }

        return null;
    }

    /**
     * The complete address as "House No./Street, Brgy. Barangay, City, Province".
     * A missing street is left out. A barangay already named "Barangay 1"
     * reads "Brgy. 1", not "Brgy. Barangay 1".
     */
    public static function completeAddress(?string $street, string $barangay, string $city, string $province): string
    {
        $barangay = preg_replace('/^(barangay|brgy\.?)\s+/i', '', trim($barangay));
        $parts = array_filter([trim((string) $street), 'Brgy. '.$barangay, $city, $province], fn ($part) => $part !== '');

        return implode(', ', $parts);
    }

    private static function read(string $file): ?array
    {
        if (! array_key_exists($file, self::$loaded)) {
            $path = resource_path('psgc/'.$file);
            self::$loaded[$file] = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        }

        return self::$loaded[$file];
    }
}
