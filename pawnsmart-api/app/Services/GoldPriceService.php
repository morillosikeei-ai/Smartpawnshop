<?php

namespace App\Services;

use App\Models\GoldPrice;

/**
 * Gold price forecasting.
 *
 * Forecasting technique: Simple Moving Average (SMA).
 *
 * A moving average is one of the most basic time series forecasting methods.
 * The idea: the best guess for tomorrow's gold price is the average of the
 * prices we actually observed over the last few days. Recent days carry the
 * current market trend, while the averaging smooths out day-to-day noise so a
 * single unusual spike or dip does not distort the forecast.
 *
 * Here the window is the last 7 recorded days (one week of trading history).
 */
class GoldPriceService
{
    /**
     * Number of recent records averaged to produce the forecast (the SMA window).
     */
    public const WINDOW_SIZE = 7;

    /**
     * Fallback price used when no historical data exists yet, so a brand new
     * installation can still compute item values instead of failing.
     */
    public const DEFAULT_PRICE = 3500.00;

    /**
     * How far the forecast must sit from today's price before the move counts
     * as a trend rather than ordinary daily noise, in percent.
     */
    public const TREND_THRESHOLD_PERCENT = 1.0;

    /**
     * Predict the next gold price per gram using a simple moving average.
     *
     * Steps:
     *   1. Take the most recent 7 gold price records (newest first by price_date).
     *   2. Add up their price_per_gram values.
     *   3. Divide by how many records we actually got. If fewer than 7 rows
     *      exist we simply average whatever is available.
     *   4. Round to 2 decimals, because prices are money values in pesos.
     *
     * If the table is empty there is nothing to average, so we return the
     * default price instead of dividing by zero.
     */
    public function predictNextPrice(): float
    {
        // Step 1: newest records first, limited to the moving average window.
        $prices = GoldPrice::orderByDesc('price_date')
            ->limit(self::WINDOW_SIZE)
            ->pluck('price_per_gram');

        // No history yet: return the sensible default rather than erroring.
        if ($prices->isEmpty()) {
            return self::DEFAULT_PRICE;
        }

        // Steps 2 and 3: sum the observed prices, divide by the record count.
        // Cast to float first because decimal casts come back as strings.
        $average = $prices->map(fn ($price) => (float) $price)->sum() / $prices->count();

        // Step 4: money value, so two decimal places.
        return round($average, 2);
    }

    /**
     * Suggest whether a customer should redeem now or wait a few more days.
     *
     * This is a plain trend reading, not advice. It compares the forecast from
     * predictNextPrice() against the latest recorded price:
     *
     *   up     - the forecast is more than 1 percent above today's price, so
     *            an item's gold value looks likely to rise.
     *   down   - the forecast is more than 1 percent below today's price.
     *   stable - the move is inside 1 percent either way, which is normal
     *            day to day noise rather than a direction.
     *
     * The 1 percent band matters: without it every tiny fluctuation would read
     * as a trend and the suggestion would flip back and forth each day.
     *
     * @return array{
     *     trend: string, message: string, disclaimer: string,
     *     current_price: float, predicted_price: float,
     *     average_price: float, change_percent: float, sample_size: int
     * }
     */
    public function getRedemptionSuggestion(): array
    {
        $prices = GoldPrice::orderByDesc('price_date')
            ->limit(self::WINDOW_SIZE)
            ->pluck('price_per_gram')
            ->map(fn ($price) => (float) $price);

        $currentPrice = $prices->first() ?? self::DEFAULT_PRICE;
        $predictedPrice = $this->predictNextPrice();

        // The same 7 day window the forecast uses, shown so the customer can
        // see what the suggestion was based on.
        $averagePrice = $prices->isEmpty() ? self::DEFAULT_PRICE : round($prices->sum() / $prices->count(), 2);

        // Percent move from today's price to the forecast. Guard the divisor:
        // a zero current price would otherwise divide by zero.
        $changePercent = $currentPrice > 0
            ? round((($predictedPrice - $currentPrice) / $currentPrice) * 100, 2)
            : 0.0;

        if ($changePercent > self::TREND_THRESHOLD_PERCENT) {
            $trend = 'up';
            $message = 'Gold price is trending up - you may want to wait a few more days before redeeming.';
        } elseif ($changePercent < -self::TREND_THRESHOLD_PERCENT) {
            $trend = 'down';
            $message = 'Gold price is trending down - redeeming soon may get you a better value.';
        } else {
            $trend = 'stable';
            $message = 'Gold price is stable right now.';
        }

        return [
            'trend' => $trend,
            'message' => $message,
            'disclaimer' => 'General trend observation based on recent gold prices. This is not financial advice.',
            'current_price' => $currentPrice,
            'predicted_price' => $predictedPrice,
            'average_price' => $averagePrice,
            'change_percent' => $changePercent,
            'sample_size' => $prices->count(),
        ];
    }
}
