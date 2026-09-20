<?php

namespace Tests\Feature;

use App\Models\GoldPrice;
use App\Models\SilverPrice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The public, no-login POST /api/estimate: weight x purity x the latest
 * recorded price of the chosen metal.
 */
class EstimateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        GoldPrice::create(['price_date' => today(), 'price_per_gram' => 4000, 'source' => 'manual']);
        SilverPrice::create(['price_date' => today(), 'price_per_gram' => 70, 'source' => 'manual']);
    }

    public function test_gold_is_the_default_and_uses_karat_purity_and_the_gold_price(): void
    {
        $this->postJson('/api/estimate', ['karat' => '18k', 'weight_grams' => 5])
            ->assertOk()
            ->assertJson(['metal_type' => 'gold', 'karat' => '18k', 'purity' => 0.75, 'price_per_gram' => 4000, 'estimated_value' => 15000]);
    }

    public function test_silver_uses_fineness_and_the_silver_price(): void
    {
        $this->postJson('/api/estimate', ['metal_type' => 'silver', 'karat' => '925', 'weight_grams' => 10])
            ->assertOk()
            ->assertJson(['metal_type' => 'silver', 'karat' => '925', 'purity' => 0.925, 'price_per_gram' => 70, 'estimated_value' => 647.5]);
    }

    public function test_a_purity_from_the_other_metal_is_rejected(): void
    {
        $this->postJson('/api/estimate', ['metal_type' => 'silver', 'karat' => '18k', 'weight_grams' => 5])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('karat');

        $this->postJson('/api/estimate', ['karat' => '925', 'weight_grams' => 5])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('karat');
    }

    public function test_no_recorded_silver_price_answers_503(): void
    {
        SilverPrice::query()->delete();

        $this->postJson('/api/estimate', ['metal_type' => 'silver', 'karat' => '999', 'weight_grams' => 5])
            ->assertStatus(503);
    }
}
