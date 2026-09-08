<?php

namespace Database\Seeders;

use App\Models\GoldPrice;
use Illuminate\Database\Seeder;

/**
 * Seeds 10 days of sample gold price history.
 *
 * This gives GoldPriceService::predictNextPrice() real rows to average, so the
 * moving average forecast can be demonstrated right after seeding.
 */
class GoldPriceSeeder extends Seeder
{
    /**
     * Sample price per gram for the past 10 days, oldest first.
     * Values fluctuate between 3450 and 3600 to imitate normal market movement.
     */
    private const SAMPLE_PRICES = [3480.00, 3465.50, 3502.75, 3455.00, 3520.25, 3548.00, 3510.50, 3575.00, 3590.25, 3562.00];

    public function run(): void
    {
        foreach (self::SAMPLE_PRICES as $offset => $pricePerGram) {
            // Index 0 is the oldest day, so count backwards from 9 days ago.
            $priceDate = today()->subDays(count(self::SAMPLE_PRICES) - 1 - $offset);

            // price_date is unique, so updateOrCreate keeps re-seeding safe.
            GoldPrice::updateOrCreate(
                ['price_date' => $priceDate],
                [
                    'price_per_gram' => $pricePerGram,
                    'predicted_next_price' => null,
                    'source' => 'manual',
                ]
            );
        }
    }
}
