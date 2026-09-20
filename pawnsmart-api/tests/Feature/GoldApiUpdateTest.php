<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\ItemValueLog;
use App\Models\SilverPrice;
use App\Models\User;
use App\Services\GoldPriceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * gold:update-price reads GoldAPI.io's per-karat melt prices, and falls back to
 * the last saved price whenever the API cannot be used.
 */
class GoldApiUpdateTest extends TestCase
{
    use RefreshDatabase;

    private const MELT = ['24k' => 4000, '22k' => 3667, '18k' => 3100, '14k' => 2333];

    private const SILVER_MELT = ['24k' => 70, '18k' => 52.5];

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.goldapi.url' => 'https://www.goldapi.io/api/XAU/PHP',
            'services.goldapi.silver_url' => 'https://www.goldapi.io/api/XAG/PHP',
            'services.goldapi.key' => 'test-key',
        ]);
    }

    private function jewelry(string $karat, string $metalType = Item::METAL_GOLD): Item
    {
        $staff = User::firstOrCreate(['email' => 'staff@example.test'], ['name' => 'Shop Staff', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $customer = Customer::firstOrCreate(['valid_id_number' => 'X-1'], [
            'user_id' => User::firstOrCreate(['email' => 'maria@example.test'], ['name' => 'Maria Cruz', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active'])->users_id,
            'name' => 'Maria Cruz',
            'contact_number' => '09170000000',
            'valid_id_type' => 'UMID',
            'registered_by_staff_id' => $staff->users_id,
        ]);

        return Item::create([
            'customer_id' => $customer->customers_id,
            'staff_id' => $staff->users_id,
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => "{$karat} ring",
            // Silver purity lives in fineness; karat is for gold only.
            'karat' => $metalType === Item::METAL_SILVER ? null : $karat,
            'fineness' => $metalType === Item::METAL_SILVER ? $karat : null,
            'metal_type' => $metalType,
            'weight_grams' => 5,
            'condition' => 'good',
            'appraised_value' => 10000,
            'status' => 'active',
        ]);
    }

    private function loggedValue(Item $item): float
    {
        return (float) ItemValueLog::where('item_id', $item->items_id)->value('computed_value');
    }

    public function test_it_saves_the_24k_melt_price_and_the_full_karat_map(): void
    {
        Http::fake(['*' => Http::response(['metal' => 'XAU', 'currency' => 'PHP', 'melt_price_per_gram' => self::MELT])]);

        $this->artisan('gold:update-price')->assertSuccessful();

        $row = GoldPrice::whereDate('price_date', today())->firstOrFail();
        $this->assertSame('4000.00', $row->price_per_gram);
        $this->assertSame('api', $row->source);
        $this->assertEquals(3100, $row->melt_prices_json['18k']);

        Http::assertSent(fn (Request $request) => $request->hasHeader('x-access-token', 'test-key')
            && $request->url() === 'https://www.goldapi.io/api/XAU/PHP');
    }

    public function test_items_use_their_karat_melt_price_and_fall_back_for_missing_karats(): void
    {
        Http::fake(['*' => Http::response(['melt_price_per_gram' => self::MELT])]);
        $eighteen = $this->jewelry('18k');
        // 21k is not in the API map, so it uses purity 0.875 x the 24k price.
        $twentyOne = $this->jewelry('21k');

        $this->artisan('gold:update-price')->assertSuccessful();

        $this->assertEquals(5 * 3100, $this->loggedValue($eighteen));
        $this->assertEquals(5 * 0.875 * 4000, $this->loggedValue($twentyOne));
    }

    public function test_a_protocol_relative_url_is_requested_over_https(): void
    {
        config(['services.goldapi.url' => '//www.goldapi.io/api/price/XAU/PHP']);
        Http::fake(['*' => Http::response(['melt_price_per_gram' => self::MELT])]);

        $this->artisan('gold:update-price')->assertSuccessful();

        Http::assertSent(fn (Request $request) => $request->url() === 'https://www.goldapi.io/api/price/XAU/PHP');
    }

    /**
     * @return array<string, array{0: \Closure}>
     */
    public static function failures(): array
    {
        return [
            'bad key' => [fn () => Http::response(['error' => 'Invalid API key'], 401)],
            'rate limit' => [fn () => Http::response(['error' => 'Too many requests'], 429)],
            'network' => [fn () => throw new ConnectionException('Connection timed out')],
            'unexpected body' => [fn () => Http::response(['price' => 4000])],
        ];
    }

    /**
     * @dataProvider failures
     */
    public function test_any_api_failure_logs_a_warning_and_reuses_the_last_price(\Closure $response): void
    {
        Log::spy();
        Http::fake(['*' => $response]);
        GoldPrice::create(['price_date' => today()->subDay(), 'price_per_gram' => 3560, 'source' => 'api']);
        $item = $this->jewelry('18k');

        $this->artisan('gold:update-price')->assertSuccessful();

        $row = GoldPrice::whereDate('price_date', today())->firstOrFail();
        $this->assertSame('3560.00', $row->price_per_gram);
        $this->assertSame('manual', $row->source);
        $this->assertNull($row->melt_prices_json);
        // No melt prices for the day, so the purity x price calculation is used.
        $this->assertEquals(5 * 0.75 * 3560, $this->loggedValue($item));
        Log::shouldHaveReceived('warning')->withArgs(fn ($message) => str_contains($message, 'Gold price update: API fetch failed'))->once();
    }

    public function test_a_manual_price_clears_the_melt_prices_and_uses_purity(): void
    {
        Http::fake();
        $item = $this->jewelry('18k');

        $this->artisan('gold:update-price', ['price' => 3800])->assertSuccessful();

        $row = GoldPrice::whereDate('price_date', today())->firstOrFail();
        $this->assertNull($row->melt_prices_json);
        $this->assertEquals(5 * 0.75 * 3800, $this->loggedValue($item));
        // The manual price is gold only, so only the silver endpoint is called.
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'XAU'));
    }

    public function test_it_saves_todays_silver_price_forecast_and_melt_map_from_the_xag_endpoint(): void
    {
        Http::fake([
            '*XAU*' => Http::response(['melt_price_per_gram' => self::MELT]),
            '*XAG*' => Http::response(['metal' => 'XAG', 'melt_price_per_gram' => self::SILVER_MELT]),
        ]);
        SilverPrice::create(['price_date' => today()->subDay(), 'price_per_gram' => 66, 'source' => 'api']);

        $this->artisan('gold:update-price')->assertSuccessful();

        $row = SilverPrice::whereDate('price_date', today())->firstOrFail();
        $this->assertSame('70.00', $row->price_per_gram);
        $this->assertSame('api', $row->source);
        $this->assertEquals(52.5, $row->melt_prices_json['18k']);
        // 7 day average of 66 and 70.
        $this->assertSame('68.00', $row->predicted_next_price);
        // Gold is untouched by the silver path.
        $this->assertSame('4000.00', GoldPrice::whereDate('price_date', today())->value('price_per_gram'));

        Http::assertSent(fn (Request $request) => $request->hasHeader('x-access-token', 'test-key')
            && $request->url() === 'https://www.goldapi.io/api/XAG/PHP');
    }

    public function test_silver_items_are_valued_from_silver_prices_and_gold_items_from_gold(): void
    {
        Http::fake([
            '*XAU*' => Http::response(['melt_price_per_gram' => self::MELT]),
            '*XAG*' => Http::response(['melt_price_per_gram' => self::SILVER_MELT]),
        ]);
        $gold = $this->jewelry('18k');
        $silver = $this->jewelry('925', Item::METAL_SILVER);

        $this->artisan('gold:update-price')->assertSuccessful();

        $this->assertEquals(5 * 3100, $this->loggedValue($gold));
        // The API's melt map is keyed by karat, so a 925 item uses its
        // fineness x the silver price per gram.
        $this->assertEquals(5 * 0.925 * 70, $this->loggedValue($silver));
        $this->assertEquals(70, ItemValueLog::where('item_id', $silver->items_id)->value('gold_price_used'));
    }

    public function test_a_silver_api_failure_reuses_the_last_silver_price_and_leaves_gold_alone(): void
    {
        Log::spy();
        Http::fake([
            '*XAU*' => Http::response(['melt_price_per_gram' => self::MELT]),
            '*XAG*' => Http::response(['error' => 'Too many requests'], 429),
        ]);
        SilverPrice::create(['price_date' => today()->subDay(), 'price_per_gram' => 66, 'source' => 'api']);
        $silver = $this->jewelry('999', Item::METAL_SILVER);

        $this->artisan('gold:update-price')->assertSuccessful();

        $row = SilverPrice::whereDate('price_date', today())->firstOrFail();
        $this->assertSame('66.00', $row->price_per_gram);
        $this->assertSame('manual', $row->source);
        $this->assertNull($row->melt_prices_json);
        $this->assertEquals(5 * 0.999 * 66, $this->loggedValue($silver));
        $this->assertSame('api', GoldPrice::whereDate('price_date', today())->value('source'));
        Log::shouldHaveReceived('warning')->withArgs(fn ($message) => str_contains($message, 'Silver price update: API fetch failed'))->once();
    }

    public function test_an_empty_silver_history_predicts_the_default_silver_price(): void
    {
        $this->assertSame(GoldPriceService::DEFAULT_SILVER_PRICE, app(GoldPriceService::class)->predictNextSilverPrice());
    }
}
