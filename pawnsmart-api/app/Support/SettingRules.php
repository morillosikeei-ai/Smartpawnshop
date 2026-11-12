<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

/**
 * What each system setting may hold. The admin's Settings form saves one
 * setting at a time; a value that fails its rule is refused with a message
 * the form shows under that field, so a typo can never break interest,
 * due dates or the shop's hours.
 */
class SettingRules
{
    /**
     * key => [kind, min, max, message]. Kinds: int (whole number), number
     * (decimals allowed), time (HH:MM, 24h), days (list of weekdays 1-7),
     * text.
     */
    public const RULES = [
        'loan_term_days' => ['int', 1, 365, 'Pawn term must be 1 to 365 days.'],
        'grace_period_days' => ['int', 90, 365, 'The redemption period must be at least 90 days (P.D. 114), up to 365.'],
        'auction_notice_days' => ['int', 1, 60, 'The auction notice must go out 1 to 60 days before the period ends.'],
        'minimum_interest_days' => ['int', 0, 999, 'Minimum interest days must be a whole number of days, from 0 to 999.'],
        'due_soon_notice_days' => ['int', 0, 60, 'The due date reminder must be 0 to 60 days before.'],
        'redemption_visit_days' => ['int', 0, 30, 'The ready-for-pickup hold must be 0 to 30 days.'],
        'renewal_term_days' => ['int', 1, 365, 'The online renewal extension must be 1 to 365 days.'],
        'unusual_activity_threshold' => ['int', 1, 100, 'The unusual activity count must be 1 to 100 pawns.'],
        'unusual_activity_window_days' => ['int', 1, 90, 'The unusual activity window must be 1 to 90 days.'],
        'jewelry_watch_phone_rate' => ['number', 0, 100, 'The interest rate must be 0 to 100 percent a month.'],
        'bulky_item_rate' => ['number', 0, 100, 'The interest rate must be 0 to 100 percent a month.'],
        'default_loan_to_value' => ['number', 1, 100, 'The pawn-to-value must be 1 to 100 percent.'],
        'risk_threshold_percent' => ['number', 0, 100, 'The risk safety margin must be 0 to 100 percent.'],
        'value_change_notice_percent' => ['number', 0, 100, 'The value change notice must be 0 to 100 percent.'],
        'current_gold_price' => ['number', 1, 1000000, 'The fallback gold price must be a positive amount per gram.'],
        'natural_diamond_1ct_price' => ['number', 0, 100000000, 'The diamond reference price must be 0 or more (0 = not set).'],
        'pearl_price_per_gram' => ['number', 0, 10000000, 'The pearl reference price must be 0 or more (0 = not set).'],
        'shop_opens_at' => ['time', null, null, 'Opening time must be a 24-hour time such as 09:00.'],
        'shop_closes_at' => ['time', null, null, 'Closing time must be a 24-hour time such as 18:00.'],
        'shop_open_days' => ['days', null, null, 'Open days must be numbers 1 (Monday) to 7 (Sunday), separated by commas, e.g. 1,2,3,4,5,6.'],
        'gcash_payment_info' => ['text', 3, 255, 'The GCash details must be 3 to 255 characters.'],
    ];

    /**
     * The cleaned value to save, or a validation error for the setting.
     *
     * @param  array<string, string>  $current  the other settings, for cross-checks
     */
    public static function clean(string $key, string $value, array $current = []): string
    {
        $rule = self::RULES[$key] ?? null;
        if ($rule === null) {
            self::fail('This is not a setting the system uses.');
        }
        [$kind, $min, $max, $message] = $rule;
        $value = trim($value);

        switch ($kind) {
            case 'int':
                if (! preg_match('/^\d+$/', $value) || (int) $value < $min || (int) $value > $max) self::fail($message);
                return (string) (int) $value;
            case 'number':
                $number = str_replace(',', '', $value);
                if (! is_numeric($number) || (float) $number < $min || (float) $number > $max) self::fail($message);
                return (string) (0 + $number);
            case 'time':
                if (! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value)) self::fail($message);
                $opens = $key === 'shop_opens_at' ? $value : ($current['shop_opens_at'] ?? null);
                $closes = $key === 'shop_closes_at' ? $value : ($current['shop_closes_at'] ?? null);
                if ($opens && $closes && $opens >= $closes) self::fail('Closing time must be after opening time.');
                return $value;
            case 'days':
                $days = array_filter(array_map('trim', explode(',', $value)), fn ($day) => $day !== '');
                if ($days === [] || array_filter($days, fn ($day) => ! preg_match('/^[1-7]$/', $day))) self::fail($message);
                $days = array_unique(array_map('intval', $days));
                sort($days);
                return implode(',', $days);
            default:
                if (mb_strlen($value) < $min || mb_strlen($value) > $max) self::fail($message);
                return $value;
        }
    }

    private static function fail(string $message): never
    {
        throw ValidationException::withMessages(['setting_value' => $message]);
    }
}
