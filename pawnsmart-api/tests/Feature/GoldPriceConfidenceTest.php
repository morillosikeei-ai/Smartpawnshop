<?php

namespace Tests\Feature;

use App\Models\GoldPrice;
use App\Services\GoldPriceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The confidence figure reported beside the gold price forecast.
 *
 * It is read as "how much weight this forecast carries", so it has to move with
 * the data: steady prices over a full window score high, a jumpy or short
 * window scores low.
 */
class GoldPriceConfidenceTest extends TestCase
{
    use RefreshDatabase;

    private function record(array $prices): void
    {
        foreach ($prices as $offset => $price) {
            GoldPrice::create([
                'price_date' => today()->subDays($offset),
                'price_per_gram' => $price,
                'source' => 'manual',
            ]);
        }
    }

    public function test_a_steady_full_window_reports_high_confidence(): void
    {
        $this->record([3560, 3561, 3559, 3560, 3562, 3558, 3560]);

        $suggestion = app(GoldPriceService::class)->getRedemptionSuggestion();

        $this->assertGreaterThanOrEqual(GoldPriceService::HIGH_CONFIDENCE_PERCENT, $suggestion['confidence']);
        $this->assertSame('High', $suggestion['confidence_label']);
    }

    public function test_a_volatile_window_reports_lower_confidence_than_a_steady_one(): void
    {
        $this->record([3900, 3200, 3850, 3250, 3800, 3300, 3750]);

        $suggestion = app(GoldPriceService::class)->getRedemptionSuggestion();

        $this->assertSame(GoldPriceService::MIN_CONFIDENCE_PERCENT, $suggestion['confidence']);
        $this->assertSame('Low', $suggestion['confidence_label']);
    }

    public function test_a_short_history_scores_below_a_full_one_at_the_same_steadiness(): void
    {
        $this->record([3560, 3560]);

        $short = app(GoldPriceService::class)->getRedemptionSuggestion();

        GoldPrice::query()->delete();
        $this->record([3560, 3560, 3560, 3560, 3560, 3560, 3560]);

        $full = app(GoldPriceService::class)->getRedemptionSuggestion();

        $this->assertLessThan($full['confidence'], $short['confidence']);
    }

    public function test_confidence_stays_inside_its_bounds_with_no_history(): void
    {
        $service = app(GoldPriceService::class);

        $this->assertSame(GoldPriceService::MIN_CONFIDENCE_PERCENT, $service->confidencePercent([], 0.0));
        $this->assertSame(GoldPriceService::MIN_CONFIDENCE_PERCENT, $service->getRedemptionSuggestion()['confidence']);
    }

    public function test_the_suggestion_endpoint_returns_the_confidence_fields(): void
    {
        $this->record([3560, 3555, 3558]);

        $user = \App\Models\User::create([
            'name' => 'Reader',
            'email' => 'reader@example.test',
            'password' => 'secret-password',
            'role' => 'admin',
            'status' => 'active',
        ]);

        \Laravel\Sanctum\Sanctum::actingAs($user);

        $this->getJson('/api/gold-prices/suggestion')
            ->assertOk()
            ->assertJsonStructure(['trend', 'current_price', 'predicted_price', 'change_percent', 'sample_size', 'confidence', 'confidence_label']);
    }
}
