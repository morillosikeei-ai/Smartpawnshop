<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Item extends Model
{
    use HasFactory;

    protected $primaryKey = 'items_id';
    protected $fillable = ['customer_id', 'staff_id', 'group', 'category', 'description', 'brand_model', 'karat', 'weight_grams', 'condition', 'photo_path', 'appraised_value', 'adjusted_value', 'adjustment_reason', 'sale_price', 'status'];
    protected $casts = ['weight_grams' => 'decimal:3', 'appraised_value' => 'decimal:2', 'adjusted_value' => 'decimal:2', 'sale_price' => 'decimal:2'];

    /**
     * The item group whose value is computed from the gold price.
     */
    public const GROUP_JEWELRY = 'jewelry';

    /**
     * The item group for watches and cellphones. Valued by hand.
     */
    public const GROUP_WATCH_PHONE = 'watch_phone';

    /**
     * The item group for bulky items: gadgets, appliances, power tools.
     * Valued by hand.
     */
    public const GROUP_BULKY = 'bulky';

    /**
     * Item types accepted in each group. The group column says which family an
     * item belongs to; the category column says which specific type it is.
     */
    public const CATEGORIES_BY_GROUP = [
        self::GROUP_JEWELRY => ['ring', 'necklace', 'bracelet', 'earrings', 'pendant', 'others'],
        self::GROUP_WATCH_PHONE => ['watch', 'cellphone'],
        self::GROUP_BULKY => [
            'tablet', 'digital_camera', 'laptop', 'desktop_computer', 'notebook_netbook',
            'game_console', 'tv', 'refrigerator', 'aircon', 'home_theater', 'karaoke_machine',
            'electric_fan', 'washing_machine', 'gas_stove', 'sewing_machine', 'oven_toaster',
            'mixer_blender', 'water_dispenser', 'nebulizer', 'power_tool',
        ],
    ];

    /**
     * system_settings key holding the monthly interest rate for each group, in
     * percent. Jewelry and watches or cellphones share one rate; bulky items
     * carry a higher rate because they lose value faster and are harder to
     * store and resell.
     */
    public const INTEREST_RATE_SETTING_KEY = [
        self::GROUP_JEWELRY => 'jewelry_watch_phone_rate',
        self::GROUP_WATCH_PHONE => 'jewelry_watch_phone_rate',
        self::GROUP_BULKY => 'bulky_item_rate',
    ];

    /**
     * Monthly interest rate in percent used when system_settings has no row for
     * the group's key.
     */
    public const DEFAULT_INTEREST_RATE_PERCENT = [
        'jewelry_watch_phone_rate' => 5.0,
        'bulky_item_rate' => 6.0,
    ];

    /**
     * Gold purity by karat, as a fraction of pure gold.
     *
     * Karat measures how much of the metal is gold out of 24 parts, so 24k is
     * pure gold (1.0) and 18k is 18 parts out of 24 (0.75). An item's gold
     * content is its weight multiplied by this fraction.
     */
    public const KARAT_PURITY = ['10k' => 0.417, '14k' => 0.583, '18k' => 0.75, '21k' => 0.875, '24k' => 1.0];

    /**
     * Purity fraction for this item's karat. Unknown karat falls back to pure
     * gold so a value is never silently reported as zero.
     */
    public function karatPurityPercent(): float
    {
        return self::KARAT_PURITY[$this->karat] ?? 1.0;
    }

    /**
     * Whether this item is valued from the gold price.
     *
     * Only jewelry is. Watches, cellphones, and bulky items keep the value the
     * appraising staff typed in, so they are left out of the daily gold price
     * recomputation and out of the gold price based risk alerts.
     */
    public function usesGoldPriceValuation(): bool
    {
        return $this->group === self::GROUP_JEWELRY;
    }

    /**
     * Item types allowed for a group, or an empty list for an unknown group.
     *
     * @return list<string>
     */
    public static function categoriesForGroup(?string $group): array
    {
        return self::CATEGORIES_BY_GROUP[$group] ?? [];
    }

    /**
     * Monthly interest rate in percent for a group, read from system_settings.
     *
     * Falls back to the built in default when the setting row is missing or is
     * not a number, so a transaction can always be created.
     */
    public static function interestRatePercentForGroup(string $group): float
    {
        $settingKey = self::INTEREST_RATE_SETTING_KEY[$group] ?? self::INTEREST_RATE_SETTING_KEY[self::GROUP_JEWELRY];
        $setting = SystemSetting::where('setting_key', $settingKey)->value('setting_value');

        return is_numeric($setting)
            ? (float) $setting
            : self::DEFAULT_INTEREST_RATE_PERCENT[$settingKey];
    }

    public function customer() { return $this->belongsTo(Customer::class, 'customer_id', 'customers_id'); }
    public function staff() { return $this->belongsTo(User::class, 'staff_id', 'users_id'); }
    public function transactions() { return $this->hasMany(Transaction::class, 'item_id', 'items_id'); }
    public function valueLogs() { return $this->hasMany(ItemValueLog::class, 'item_id', 'items_id'); }
    public function riskAlerts() { return $this->hasMany(RiskAlert::class, 'item_id', 'items_id'); }
}
