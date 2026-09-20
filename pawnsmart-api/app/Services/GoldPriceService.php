<?php

namespace App\Services;

use App\Models\GoldPrice;
use App\Models\SilverPrice;

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
     * Silver counterpart of DEFAULT_PRICE, used when silver_prices is empty.
     */
    public const DEFAULT_SILVER_PRICE = 70.00;

    /**
     * How far the forecast must sit from today's price before the move counts
     * as a trend rather than ordinary daily noise, in percent.
     */
    public const TREND_THRESHOLD_PERCENT = 1.0;

    /**
     * Day to day movement, as a fraction of the average price, at which the
     * forecast is treated as carrying no useful signal.
     *
     * A moving average predicts a steady series well and a jumpy one poorly, so
     * spread is what the confidence figure is measured against. Two percent is
     * a wide daily swing for gold: at or above it, the stability half of the
     * score falls to zero.
     */
    public const UNSTABLE_SPREAD_RATIO = 0.02;

    /**
     * Bounds on the reported confidence, in percent.
     *
     * A moving average over a handful of days is never certain, so the figure
     * is never shown as 0 or 100.
     */
    public const MIN_CONFIDENCE_PERCENT = 10;
    public const MAX_CONFIDENCE_PERCENT = 95;

    /** Confidence at or above this reads as High, and as Moderate at the lower one. */
    public const HIGH_CONFIDENCE_PERCENT = 75;
    public const MODERATE_CONFIDENCE_PERCENT = 50;

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
     * Predict the next silver price per gram using a simple moving average.
     *
     * Same steps as predictNextPrice(), over silver_prices instead of
     * gold_prices: average the most recent 7 rows (or however many exist),
     * round to 2 decimals, and return the default silver price when the table
     * is empty.
     */
    public function predictNextSilverPrice(): float
    {
        // Step 1: newest records first, limited to the moving average window.
        $prices = SilverPrice::orderByDesc('price_date')
            ->limit(self::WINDOW_SIZE)
            ->pluck('price_per_gram');

        // No history yet: return the sensible default rather than erroring.
        if ($prices->isEmpty()) {
            return self::DEFAULT_SILVER_PRICE;
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
     *     average_price: float, change_percent: float, sample_size: int,
     *     confidence: int, confidence_label: string
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
            $message = "Gold price is trending up - you may want to wait a few more days before redeeming, as your item's value could increase.";
        } elseif ($changePercent < -self::TREND_THRESHOLD_PERCENT) {
            $trend = 'down';
            $message = 'Gold price is trending down - redeeming or renewing soon may get you a better value before it drops further.';
        } else {
            $trend = 'stable';
            $message = 'Gold price is fairly stable right now - no urgency either way.';
        }

        $confidence = $this->confidencePercent($prices->all(), $averagePrice);

        return [
            'trend' => $trend,
            'message' => $message,
            'disclaimer' => 'This is a general trend observation, not a guarantee or financial advice.',
            'current_price' => $currentPrice,
            'predicted_price' => $predictedPrice,
            'average_price' => $averagePrice,
            'change_percent' => $changePercent,
            'sample_size' => $prices->count(),
            'confidence' => $confidence,
            'confidence_label' => $this->confidenceLabel($confidence),
        ];
    }

    /**
     * How much weight the forecast carries, in percent.
     *
     * Two things decide it, and both are visible in the data the forecast is
     * built from:
     *
     *   coverage  - how much of the 7 day window actually has records. Two days
     *               of history is a weaker basis than seven.
     *   stability - how tightly the observed prices sit around their own
     *               average. A moving average follows a steady series closely
     *               and lags a jumpy one, so spread lowers the score.
     *
     * Stability sets the score and coverage scales it, so a full week of wild
     * prices reports no confidence while three quiet days still report some.
     * The result is clamped, because a seven point average is never certain
     * either way.
     *
     * @param list<float> $prices
     */
    public function confidencePercent(array $prices, float $averagePrice): int
    {
        if ($prices === [] || $averagePrice <= 0) {
            return self::MIN_CONFIDENCE_PERCENT;
        }

        $coverage = min(1.0, count($prices) / self::WINDOW_SIZE);

        // Mean absolute deviation as a fraction of the average: the typical
        // distance of a day from the middle of the window.
        $deviation = array_sum(array_map(fn (float $price) => abs($price - $averagePrice), $prices)) / count($prices);
        $spreadRatio = $deviation / $averagePrice;
        $stability = max(0.0, 1.0 - ($spreadRatio / self::UNSTABLE_SPREAD_RATIO));

        $score = $stability * (0.6 + (0.4 * $coverage));

        return (int) max(self::MIN_CONFIDENCE_PERCENT, min(self::MAX_CONFIDENCE_PERCENT, round($score * 100)));
    }

    /** The confidence figure as a word, for a reader who skips the number. */
    public function confidenceLabel(int $confidence): string
    {
        if ($confidence >= self::HIGH_CONFIDENCE_PERCENT) {
            return 'High';
        }

        return $confidence >= self::MODERATE_CONFIDENCE_PERCENT ? 'Moderate' : 'Low';
    }
}
