<?php

namespace Tests\Feature;

use App\Models\GoldPrice;
use App\Models\SilverPrice;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The price forecast broken down per karat and silver fineness, with the
 * admin's reference prices for pearl and a natural diamond.
 */
class PurityPricesTest extends TestCase
{
    use RefreshDatabase;

    public function test_each_karat_and_fineness_is_priced_today_and_forecast(): void
    {
        GoldPrice::create(['price_date' => today(), 'price_per_gram' => 8380, 'source' => 'api']);
        SilverPrice::create(['price_date' => today(), 'price_per_gram' => 108, 'source' => 'api']);
        SystemSetting::updateOrCreate(['setting_key' => 'natural_diamond_1ct_price'], ['setting_value' => '250000']);
        Sanctum::actingAs(User::create(['name' => 'Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']));

        $response = $this->getJson('/api/gold-prices/suggestion')->assertOk();

        $gold = collect($response->json('by_purity.gold'))->keyBy('code');
        $this->assertSame(['24k', '22k', '21k', '18k', '14k'], $gold->keys()->all());
        $this->assertEqualsWithDelta(8380, $gold['24k']['current'], 0.01);
        $this->assertEqualsWithDelta(7684.46, $gold['22k']['current'], 0.01);
        $this->assertEqualsWithDelta(7332.50, $gold['21k']['current'], 0.01);
        $this->assertEqualsWithDelta(6285.00, $gold['18k']['current'], 0.01);
        $this->assertEqualsWithDelta(4885.54, $gold['14k']['current'], 0.01);
        // One recorded day: the forecast is that day's price.
        $this->assertEqualsWithDelta(6285.00, $gold['18k']['predicted'], 0.01);

        $silver = collect($response->json('by_purity.silver'))->keyBy('code');
        $this->assertSame('Sterling silver 925', $silver['925']['label']);
        $this->assertEqualsWithDelta(99.90, $silver['925']['current'], 0.01);

        $references = collect($response->json('references'))->keyBy('key');
        $this->assertNull($references['pearl_price_per_gram']['price']);
        $this->assertEquals(250000, $references['natural_diamond_1ct_price']['price']);
    }
}
