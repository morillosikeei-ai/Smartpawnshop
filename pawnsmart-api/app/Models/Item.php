<?php

namespace App\Models;

use App\Support\MediaUrl;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Item extends Model
{
    use HasFactory;

    protected $primaryKey = 'items_id';
    protected $fillable = ['customer_id', 'staff_id', 'group', 'category', 'custom_item_type', 'description', 'brand_model', 'item_details', 'karat', 'metal_type', 'fineness', 'weight_grams', 'has_gemstone', 'gemstone_value', 'gemstone_type', 'gemstone_details', 'condition', 'photo_path', 'appraised_value', 'adjusted_value', 'adjustment_reason', 'sale_price', 'status'];
    protected $casts = ['item_details' => 'array', 'weight_grams' => 'decimal:3', 'has_gemstone' => 'boolean', 'gemstone_value' => 'decimal:2', 'appraised_value' => 'decimal:2', 'adjusted_value' => 'decimal:2', 'sale_price' => 'decimal:2'];

    /**
     * total_value is sent with every item so each screen shows the same total:
     * gold plus gemstone for jewelry with a stone, the appraised value otherwise.
     */
    protected $appends = ['total_value', 'photo_urls'];

    /**
     * photo_path is sent as photo_urls instead. Sending both would put every
     * photo in each response twice.
     */
    protected $hidden = ['photo_path'];

    /** Most photos one item keeps. */
    public const MAX_PHOTOS = 4;

    /**
     * The item's photos, first one first, as links the app can show. Each
     * link serves one stored photo (see App\Support\MediaUrl), so a list of
     * items no longer carries every photo inside it.
     */
    public function getPhotoUrlsAttribute(): array
    {
        return array_map(
            fn (string $photo, int $index) => MediaUrl::for('media.item', ['item' => $this->items_id, 'index' => $index], $photo),
            $this->storedPhotos(),
            array_keys($this->storedPhotos())
        );
    }

    /**
     * The photos as stored, first one first.
     *
     * photo_path holds a JSON list of data URLs for items recorded with photos.
     * A single plain URL or data URL, as an older record might hold, is read as
     * a list of one; an empty column is an empty list.
     */
    public function storedPhotos(): array
    {
        $stored = trim((string) $this->photo_path);

        if ($stored === '') {
            return [];
        }

        if (str_starts_with($stored, '[')) {
            $decoded = json_decode($stored, true);

            return is_array($decoded)
                ? array_values(array_filter($decoded, fn ($photo) => is_string($photo) && $photo !== ''))
                : [];
        }

        return [$stored];
    }

    /**
     * The gemstone portion of this item's value, or zero when it has none.
     *
     * Only jewelry carries a gemstone. The value is the staff's own estimate
     * from intake and is never recomputed from the gold price.
     */
    public function gemstoneValue(): float
    {
        return $this->group === self::GROUP_JEWELRY && $this->has_gemstone
            ? (float) $this->gemstone_value
            : 0.0;
    }

    /**
     * The item's value for a given gold portion: the gold portion plus the
     * gemstone portion when there is one. The daily jobs pass the freshly
     * computed gold value; everything else uses totalValue().
     */
    public function valueWithGold(float $goldValue): float
    {
        return round($goldValue + $this->gemstoneValue(), 2);
    }

    /**
     * The item's current total value: appraised_value (the gold portion for
     * jewelry, the staff value otherwise) plus any gemstone value.
     */
    public function totalValue(): float
    {
        return $this->valueWithGold((float) $this->appraised_value);
    }

    public function getTotalValueAttribute(): float
    {
        return $this->totalValue();
    }

    /**
     * The item group whose value is computed from the gold price.
     */
    public const GROUP_JEWELRY = 'jewelry';

    /**
     * Precious metal of a jewelry item. Gold items are valued from
     * gold_prices, silver items from silver_prices.
     */
    public const METAL_GOLD = 'gold';
    public const METAL_SILVER = 'silver';

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
     * The catch-all item type. An item recorded under it must also carry the
     * exact type in custom_item_type, which is what every screen displays in
     * place of the word "Others".
     */
    public const CATEGORY_OTHERS = 'others';

    /**
     * Item types accepted in each group. The group column says which family an
     * item belongs to; the category column says which specific type it is.
     */
    public const CATEGORIES_BY_GROUP = [
        self::GROUP_JEWELRY => [
            'ring', 'necklace', 'bracelet', 'earrings', 'pendant',
            'chain', 'anklet', 'brooch_pin', 'cufflinks',
            // The catch-all type. An item stored under it also carries the
            // exact type the staff typed in, in custom_item_type.
            self::CATEGORY_OTHERS,
        ],
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
    public const KARAT_PURITY = ['10k' => 0.417, '14k' => 0.583, '18k' => 0.75, '21k' => 0.875, '22k' => 0.917, '24k' => 1.0];

    /**
     * Silver purity by fineness, as a fraction of pure silver. 925 is sterling
     * silver (92.5 percent), 999 is fine silver. Stored in the fineness column,
     * never in karat, which holds gold karats only.
     */
    public const SILVER_PURITY = ['800' => 0.8, '925' => 0.925, '950' => 0.95, '999' => 0.999];

    /**
     * Gemstone types the staff form suggests. Staff may also type any other
     * stone, so gemstone_type is not limited to these. The specifics (carat,
     * cut) stay in the free-text gemstone_details.
     */
    public const GEMSTONE_TYPES = ['diamond', 'ruby', 'sapphire', 'emerald', 'pearl', 'other'];

    /**
     * The structured details kept in item_details, per watch_phone item type.
     *
     * Only these keys are stored; anything else sent is dropped. A custom
     * watch_phone type (a smart ring, say) has no structured details and keeps
     * only its brand/model and description. Bulky items all share one set,
     * keyed by the group rather than the type.
     */
    public const DETAIL_FIELDS = [
        'cellphone' => [
            'storage_capacity', 'color', 'imei', 'serial_number', 'battery_health',
            'network_status', 'functionality_status',
            'has_receipt', 'has_box', 'has_charger_accessories', 'ownership_verified',
        ],
        'watch' => [
            'brand', 'model_reference', 'serial_number', 'movement_type', 'material',
            'year_age', 'authenticity_status',
            'has_box', 'has_papers', 'has_receipt', 'has_accessories',
        ],
        // Every bulky item, whatever its type.
        'bulky' => [
            'serial_number', 'color', 'size_capacity', 'year_age', 'specifications',
            'functionality_status', 'power_tested', 'has_remote_accessories',
            'has_box', 'has_receipt', 'has_warranty', 'ownership_verified',
        ],
    ];

    /** Yes/No details, stored as true or false. */
    public const DETAIL_FLAGS = [
        'has_receipt', 'has_box', 'has_charger_accessories', 'ownership_verified', 'has_papers', 'has_accessories',
        'power_tested', 'has_remote_accessories', 'has_warranty',
    ];

    /**
     * Purity fraction for this item's karat. Unknown karat falls back to pure
     * gold so a value is never silently reported as zero.
     */
    /**
     * The item type as a person should read it.
     *
     * An item recorded under the catch-all type reads as what the staff typed
     * in, so no screen ever shows the uninformative word "Others".
     */
    public function itemTypeLabel(): string
    {
        if ($this->category === self::CATEGORY_OTHERS && filled($this->custom_item_type)) {
            return trim($this->custom_item_type);
        }

        // A suggested type is stored as a key such as brooch_pin and is made
        // readable. A custom type the staff typed in is shown as typed.
        if (preg_match('/^[a-z0-9_]+$/', (string) $this->category)) {
            return ucwords(str_replace('_', ' ', (string) $this->category));
        }

        return trim((string) $this->category);
    }

    /**
     * The gold portion of this item's value at a day's gold price.
     *
     * When that day has the API's per-karat melt prices, which are already
     * purity-adjusted, the item's own karat price is used directly. Otherwise,
     * or when the item's karat is not in the list, it falls back to
     * weight x karat purity x 24k price per gram.
     *
     * @param  array<string, mixed>|null  $meltPrices  melt_prices_json of the day
     */
    public function goldValueAt(float $pricePerGram, ?array $meltPrices = null): float
    {
        $karatPrice = $meltPrices ? (array_change_key_case($meltPrices, CASE_LOWER)[strtolower((string) $this->purityCode())] ?? null) : null;

        if (is_numeric($karatPrice) && (float) $karatPrice > 0) {
            return (float) $this->weight_grams * (float) $karatPrice;
        }

        return (float) $this->weight_grams * $this->karatPurityPercent() * $pricePerGram;
    }

    public function karatPurityPercent(): float
    {
        if ($this->metal_type === self::METAL_SILVER) {
            return self::SILVER_PURITY[$this->purityCode()] ?? 1.0;
        }

        return self::KARAT_PURITY[$this->karat] ?? 1.0;
    }

    /**
     * The purity grade this item is valued by: the silver fineness for silver,
     * the gold karat for gold. A silver row recorded before the fineness column
     * existed may still carry its fineness in karat, so that is the fallback.
     */
    public function purityCode(): ?string
    {
        if ($this->metal_type === self::METAL_SILVER) {
            return $this->fineness ?: $this->karat;
        }

        return $this->karat;
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
