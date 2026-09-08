<?php

namespace App\Console\Commands;

use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\ItemValueLog;
use App\Models\RiskAlert;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Services\GoldPriceService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Records one gold price row per day and stores the next-day forecast beside it.
 *
 * Runs automatically once a day from the scheduler (see routes/console.php).
 * An admin can also run it by hand and pass a price to override the API.
 */
class UpdateGoldPrice extends Command
{
    protected $signature = 'gold:update-price {price? : Manually entered price per gram}';

    protected $description = "Record today's gold price per gram and predict tomorrow's price.";

    /**
     * Response keys we accept from the external API, in order of preference.
     * Different gold price providers name the per gram field differently.
     */
    private const API_PRICE_KEYS = ['price_gram_24k', 'price_per_gram', 'price'];

    /**
     * Last resort price when there is no argument, no API, and no history.
     */
    private const DEFAULT_PRICE = GoldPriceService::DEFAULT_PRICE;

    /**
     * Risk margin in percent, used when system_settings has no
     * risk_threshold_percent row. 10 means "warn once an item is worth less
     * than 10 percent above the loan it secures".
     */
    private const DEFAULT_RISK_THRESHOLD_PERCENT = 10.0;

    public function handle(GoldPriceService $goldPriceService): int
    {
        // Step 1: work out today's price and where it came from.
        [$pricePerGram, $source] = $this->resolvePrice();

        // Step 2: one row per day. price_date is unique, so updateOrCreate
        // rewrites today's row instead of failing when the command reruns.
        $goldPrice = GoldPrice::updateOrCreate(
            ['price_date' => today()],
            ['price_per_gram' => $pricePerGram, 'source' => $source]
        );

        // Step 3: forecast tomorrow from the 7 day moving average. Today's row
        // is already saved above, so the newest price is part of the average.
        $predictedNextPrice = $goldPriceService->predictNextPrice();
        $goldPrice->update(['predicted_next_price' => $predictedNextPrice]);

        // Step 4: report what was saved.
        $this->info(sprintf(
            'Gold price for %s: PHP %s/gram (source: %s), predicted next: PHP %s',
            $goldPrice->price_date->toDateString(),
            number_format($pricePerGram, 2),
            $source,
            number_format($predictedNextPrice, 2)
        ));

        // Step 5: today's price changes what every pawned jewelry item is
        // worth, so recompute and log each active jewelry item at the new
        // price, and check whether any of them now secures its loan too thinly.
        // The other item groups are valued by hand and are skipped.
        ['recomputed' => $recomputedCount, 'high' => $highCount, 'medium' => $mediumCount] =
            $this->recomputeItemValues($pricePerGram);

        $this->info("Recomputed values for {$recomputedCount} active jewelry items.");

        // Step 6: report the risk picture.
        $alertCount = $highCount + $mediumCount;
        $this->info("Triggered {$alertCount} risk alerts ({$highCount} high, {$mediumCount} medium).");

        return self::SUCCESS;
    }

    /**
     * Recompute and log today's value of every active jewelry item.
     *
     * An item's value is its gold content at today's market price:
     *
     *     value = weight in grams * karat purity fraction * price per gram
     *
     * One row per item per day keeps a history the pawnshop can chart later.
     * The (item_id, log_date) pair is unique, so updateOrCreate rewrites
     * today's row rather than failing when the command reruns.
     *
     * Each item is also checked for risk at its new value.
     *
     * Only the jewelry group is processed. A watch, cellphone, or bulky item
     * keeps the value the appraising staff typed in, so a gold price move says
     * nothing about what it is worth. Logging or risk scoring those items from
     * the gold price would report drift that did not happen. If those groups
     * need alerts later, they need a separate rule based on the due date.
     *
     * @return array{recomputed: int, high: int, medium: int} counts
     */
    private function recomputeItemValues(float $pricePerGram): array
    {
        $counts = ['recomputed' => 0, 'high' => 0, 'medium' => 0];
        $riskThresholdPercent = $this->riskThresholdPercent();

        // chunkById keeps memory flat when the shop holds many items.
        Item::where('status', 'active')->where('group', Item::GROUP_JEWELRY)->chunkById(200, function ($items) use ($pricePerGram, $riskThresholdPercent, &$counts) {
            foreach ($items as $item) {
                $computedValue = round((float) $item->weight_grams * $item->karatPurityPercent() * $pricePerGram, 2);

                ItemValueLog::updateOrCreate(
                    ['item_id' => $item->items_id, 'log_date' => today()],
                    ['computed_value' => $computedValue, 'gold_price_used' => $pricePerGram]
                );

                $counts['recomputed']++;

                $riskLevel = $this->evaluateRisk($item, $computedValue, $riskThresholdPercent);
                if ($riskLevel !== null) {
                    $counts[$riskLevel]++;
                }
            }
        }, 'items_id');

        return $counts;
    }

    /**
     * Risk margin in percent, read from system_settings.
     */
    private function riskThresholdPercent(): float
    {
        $setting = SystemSetting::where('setting_key', 'risk_threshold_percent')->value('setting_value');

        return is_numeric($setting) ? (float) $setting : self::DEFAULT_RISK_THRESHOLD_PERCENT;
    }

    /**
     * Check one item's value against the loan it secures, and record or clear
     * its risk alert.
     *
     * The pawnshop only gets its money back if the item is worth at least the
     * loan. The bands are:
     *
     *   high   - value is below the loan. The shop loses money today.
     *   medium - value is above the loan but inside the safety margin, so a
     *            small further drop in gold price would put it underwater.
     *   safe   - value is comfortably above the loan. No alert row is written,
     *            and any old unresolved alert for the item is resolved.
     *
     * One unresolved alert per item: updateOrCreate keyed on
     * (item_id, resolved = false) refreshes the open alert instead of piling
     * up a new row every day the item stays at risk.
     *
     * @return string|null 'high', 'medium', or null when the item is safe
     */
    private function evaluateRisk(Item $item, float $computedValue, float $riskThresholdPercent): ?string
    {
        // Risk is about the loan, so an item with no live loan cannot be at risk.
        $loanAmount = (float) Transaction::where('item_id', $item->items_id)
            ->where('status', 'active')
            ->orderByDesc('transactions_id')
            ->value('loan_amount');

        if ($loanAmount <= 0) {
            return null;
        }

        // Top of the warning band: the loan plus the safety margin.
        $mediumRiskCeiling = $loanAmount * (1 + $riskThresholdPercent / 100);

        if ($computedValue < $loanAmount) {
            $riskLevel = 'high';
        } elseif ($computedValue <= $mediumRiskCeiling) {
            $riskLevel = 'medium';
        } else {
            // Value recovered above the margin, so close any open alert.
            RiskAlert::where('item_id', $item->items_id)
                ->where('resolved', false)
                ->update(['resolved' => true]);

            return null;
        }

        RiskAlert::updateOrCreate(
            ['item_id' => $item->items_id, 'resolved' => false],
            [
                'risk_level' => $riskLevel,
                'current_value' => $computedValue,
                'loan_amount' => $loanAmount,
                'triggered_at' => now(),
            ]
        );

        return $riskLevel;
    }

    /**
     * Decide today's price per gram and its source.
     *
     * Priority: manual argument, then the external API, then the most recent
     * saved price, then the built in default.
     *
     * @return array{0: float, 1: string} price per gram and source
     */
    private function resolvePrice(): array
    {
        // Admin typed a price: trust it and mark the row as manual.
        $manualPrice = $this->argument('price');
        if ($manualPrice !== null && is_numeric($manualPrice)) {
            return [round((float) $manualPrice, 2), 'manual'];
        }

        if ($manualPrice !== null) {
            $this->warn("Ignoring non numeric price argument: {$manualPrice}");
        }

        // No argument: try the external API.
        $apiPrice = $this->fetchApiPrice();
        if ($apiPrice !== null) {
            return [$apiPrice, 'api'];
        }

        // API unavailable: carry forward the last known price so the daily row
        // still exists. Not a real reading, so the source stays manual.
        $lastKnownPrice = GoldPrice::orderByDesc('price_date')->value('price_per_gram');
        if ($lastKnownPrice !== null) {
            return [round((float) $lastKnownPrice, 2), 'manual'];
        }

        Log::warning('Gold price update: no API price and no saved history, using default price.');
        $this->warn('No API price and no saved history. Using default price.');

        return [self::DEFAULT_PRICE, 'manual'];
    }

    /**
     * Fetch today's price per gram from the configured API.
     *
     * Returns null on any failure so the caller can fall back. A missing gold
     * price must never break the daily run.
     */
    private function fetchApiPrice(): ?float
    {
        $url = config('services.gold_price.url');

        if (! $url) {
            Log::warning('Gold price update: GOLD_PRICE_API_URL is not configured, falling back.');
            $this->warn('No GOLD_PRICE_API_URL configured. Falling back to the last saved price.');

            return null;
        }

        try {
            $response = Http::timeout(10)
                ->withHeaders(array_filter(['x-access-token' => config('services.gold_price.key')]))
                ->get($url);

            if (! $response->successful()) {
                throw new \RuntimeException("API responded with status {$response->status()}.");
            }

            // Providers name the per gram field differently, so check each key.
            foreach (self::API_PRICE_KEYS as $key) {
                $value = $response->json($key);
                if (is_numeric($value) && (float) $value > 0) {
                    return round((float) $value, 2);
                }
            }

            throw new \RuntimeException('API response contained no usable price per gram.');
        } catch (Throwable $exception) {
            Log::warning('Gold price update: API fetch failed, falling back.', [
                'url' => $url,
                'error' => $exception->getMessage(),
            ]);
            $this->warn("Gold price API fetch failed: {$exception->getMessage()}");

            return null;
        }
    }
}
