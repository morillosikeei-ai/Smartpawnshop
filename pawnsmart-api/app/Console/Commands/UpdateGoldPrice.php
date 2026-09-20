<?php

namespace App\Console\Commands;

use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\ItemValueLog;
use App\Models\RiskAlert;
use App\Models\SilverPrice;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Services\GoldPriceService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Records one gold price row per day and stores the next-day forecast beside it.
 * Does the same for silver in silver_prices.
 *
 * Runs automatically once a day from the scheduler (see routes/console.php).
 * An admin can also run it by hand and pass a price to override the API.
 */
class UpdateGoldPrice extends Command
{
    protected $signature = 'gold:update-price {price? : Manually entered price per gram}';

    protected $description = "Record today's gold and silver prices per gram and predict tomorrow's prices.";

    /**
     * Last resort price when there is no argument, no API, and no history.
     */
    private const DEFAULT_PRICE = GoldPriceService::DEFAULT_PRICE;

    /**
     * Silver counterpart of DEFAULT_PRICE.
     */
    private const DEFAULT_SILVER_PRICE = GoldPriceService::DEFAULT_SILVER_PRICE;

    /**
     * Risk margin in percent, used when system_settings has no
     * risk_threshold_percent row. 10 means "warn once an item is worth less
     * than 10 percent above the loan it secures".
     */
    private const DEFAULT_RISK_THRESHOLD_PERCENT = 10.0;

    public function handle(GoldPriceService $goldPriceService): int
    {
        // Step 1: work out today's price and where it came from.
        [$pricePerGram, $source, $meltPrices] = $this->resolvePrice();

        // Step 2: one row per day. price_date is unique, so updateOrCreate
        // rewrites today's row instead of failing when the command reruns.
        // melt_prices_json is written every time, so a manual or carried
        // forward rerun clears per-karat prices that no longer apply.
        $goldPrice = GoldPrice::updateOrCreate(
            ['price_date' => today()],
            ['price_per_gram' => $pricePerGram, 'melt_prices_json' => $meltPrices, 'source' => $source]
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

        // Step 4b: the same daily row and forecast for silver, from the XAG
        // endpoint. The manual price argument is a gold price, so silver
        // always tries the API first.
        [$silverPricePerGram, $silverSource, $silverMeltPrices] = $this->resolveSilverPrice();

        $silverPrice = SilverPrice::updateOrCreate(
            ['price_date' => today()],
            ['price_per_gram' => $silverPricePerGram, 'melt_prices_json' => $silverMeltPrices, 'source' => $silverSource]
        );

        $predictedNextSilverPrice = $goldPriceService->predictNextSilverPrice();
        $silverPrice->update(['predicted_next_price' => $predictedNextSilverPrice]);

        $this->info(sprintf(
            'Silver price for %s: PHP %s/gram (source: %s), predicted next: PHP %s',
            $silverPrice->price_date->toDateString(),
            number_format($silverPricePerGram, 2),
            $silverSource,
            number_format($predictedNextSilverPrice, 2)
        ));

        // Step 5: today's price changes what every pawned jewelry item is
        // worth, so recompute and log each active jewelry item at the new
        // price, and check whether any of them now secures its loan too thinly.
        // Silver items use today's silver price, everything else gold's.
        // The other item groups are valued by hand and are skipped.
        ['recomputed' => $recomputedCount, 'high' => $highCount, 'medium' => $mediumCount] =
            $this->recomputeItemValues(
                $pricePerGram,
                $goldPrice->melt_prices_json,
                $silverPricePerGram,
                $silverPrice->melt_prices_json
            );

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
     * or, when today's row carries the API's per-karat melt prices, the
     * item's karat price directly:
     *
     *     value = weight in grams * melt price per gram for that karat
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
     * An item with metal_type silver is valued the same way from today's
     * silver price and silver melt prices instead of gold's. Its log row
     * stores the silver price in gold_price_used.
     *
     * @param  array<string, mixed>|null  $meltPrices  today's gold melt_prices_json, or null
     * @param  array<string, mixed>|null  $silverMeltPrices  today's silver melt_prices_json, or null
     * @return array{recomputed: int, high: int, medium: int} counts
     */
    private function recomputeItemValues(float $pricePerGram, ?array $meltPrices, float $silverPricePerGram, ?array $silverMeltPrices): array
    {
        $counts = ['recomputed' => 0, 'high' => 0, 'medium' => 0];
        $riskThresholdPercent = $this->riskThresholdPercent();

        // chunkById keeps memory flat when the shop holds many items.
        Item::where('status', 'active')->where('group', Item::GROUP_JEWELRY)->chunkById(200, function ($items) use ($pricePerGram, $meltPrices, $silverPricePerGram, $silverMeltPrices, $riskThresholdPercent, &$counts) {
            foreach ($items as $item) {
                $isSilver = $item->metal_type === Item::METAL_SILVER;
                $itemPricePerGram = $isSilver ? $silverPricePerGram : $pricePerGram;
                $itemMeltPrices = $isSilver ? $silverMeltPrices : $meltPrices;

                // Only the metal portion is recomputed. A gemstone value is a
                // one-time estimate from intake, added on top unchanged.
                $computedValue = $item->valueWithGold($item->goldValueAt($itemPricePerGram, $itemMeltPrices));

                ItemValueLog::updateOrCreate(
                    ['item_id' => $item->items_id, 'log_date' => today()],
                    ['computed_value' => $computedValue, 'gold_price_used' => $itemPricePerGram]
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
     * @return array{0: float, 1: string, 2: array<string, float>|null} price per
     *         gram, source, and the API's per-karat melt prices (null unless
     *         the price came from the API)
     */
    private function resolvePrice(): array
    {
        // Admin typed a price: trust it and mark the row as manual.
        $manualPrice = $this->argument('price');
        if ($manualPrice !== null && is_numeric($manualPrice)) {
            return [round((float) $manualPrice, 2), 'manual', null];
        }

        if ($manualPrice !== null) {
            $this->warn("Ignoring non numeric price argument: {$manualPrice}");
        }

        // No argument: try the external API.
        $meltPrices = $this->fetchApiMeltPrices();
        if ($meltPrices !== null) {
            return [round($meltPrices['24k'], 2), 'api', $meltPrices];
        }

        // API unavailable: carry forward the last known price so the daily row
        // still exists. Not a real reading, so the source stays manual.
        $lastKnownPrice = GoldPrice::orderByDesc('price_date')->value('price_per_gram');
        if ($lastKnownPrice !== null) {
            return [round((float) $lastKnownPrice, 2), 'manual', null];
        }

        Log::warning('Gold price update: no API price and no saved history, using default price.');
        $this->warn('No API price and no saved history. Using default price.');

        return [self::DEFAULT_PRICE, 'manual', null];
    }

    /**
     * Decide today's silver price per gram and its source.
     *
     * Same order as resolvePrice() minus the manual argument, which is a gold
     * price: the external API, then the most recent saved silver price, then
     * the built in silver default.
     *
     * @return array{0: float, 1: string, 2: array<string, float>|null} price per
     *         gram, source, and the API's per-karat melt prices (null unless
     *         the price came from the API)
     */
    private function resolveSilverPrice(): array
    {
        $meltPrices = $this->fetchApiMeltPrices('silver');
        if ($meltPrices !== null) {
            return [round($meltPrices['24k'], 2), 'api', $meltPrices];
        }

        // API unavailable: carry forward the last known price so the daily row
        // still exists. Not a real reading, so the source stays manual.
        $lastKnownPrice = SilverPrice::orderByDesc('price_date')->value('price_per_gram');
        if ($lastKnownPrice !== null) {
            return [round((float) $lastKnownPrice, 2), 'manual', null];
        }

        Log::warning('Silver price update: no API price and no saved history, using default price.');
        $this->warn('No silver API price and no saved history. Using default silver price.');

        return [self::DEFAULT_SILVER_PRICE, 'manual', null];
    }

    /**
     * Fetch today's per-karat melt prices from GoldAPI.io.
     *
     * The response's melt_price_per_gram holds a price per gram for each karat
     * ("24k", "18k", ...), already adjusted for purity. The 24k price becomes
     * the day's price_per_gram; the whole map is kept for per-karat lookups.
     *
     * $metal picks the endpoint: gold reads GOLD_PRICE_API_URL (XAU), silver
     * reads SILVER_PRICE_API_URL (XAG). Both send the same key.
     *
     * Returns null on any failure (not configured, network error, bad key,
     * rate limit, unexpected body) so the caller can fall back. A missing gold
     * or silver price must never break the daily run.
     *
     * @param  'gold'|'silver'  $metal
     * @return array<string, float>|null karat => price per gram, with a 24k entry
     */
    private function fetchApiMeltPrices(string $metal = 'gold'): ?array
    {
        $isSilver = $metal === 'silver';
        $label = $isSilver ? 'Silver' : 'Gold';
        $url = (string) config($isSilver ? 'services.goldapi.silver_url' : 'services.goldapi.url');
        $key = (string) config('services.goldapi.key');

        if ($url === '' || $key === '') {
            $urlEnv = $isSilver ? 'SILVER_PRICE_API_URL' : 'GOLD_PRICE_API_URL';
            Log::warning("{$label} price update: {$urlEnv} or GOLD_PRICE_API_KEY is not configured, falling back.");
            $this->warn(($isSilver ? 'GoldAPI silver URL' : 'GoldAPI URL').' or key not configured. Falling back to the last saved price.');

            return null;
        }

        // A protocol-relative URL ("//www.goldapi.io/...") cannot be requested
        // as is, so it is sent over https.
        if (str_starts_with($url, '//')) {
            $url = 'https:'.$url;
        }

        try {
            $response = Http::timeout(10)
                ->acceptJson()
                ->withHeaders(['x-access-token' => $key])
                ->get($url);

            // Bad key (401/403), rate limit (429), and server errors all land here.
            if (! $response->successful()) {
                throw new \RuntimeException("API responded with status {$response->status()}.");
            }

            $melt = $response->json('melt_price_per_gram');
            if (! is_array($melt)) {
                throw new \RuntimeException('API response has no melt_price_per_gram object.');
            }

            // Keep only usable prices, keyed by lower-case karat as items store it.
            $meltPrices = [];
            foreach ($melt as $karat => $price) {
                if (is_numeric($price) && (float) $price > 0) {
                    $meltPrices[strtolower((string) $karat)] = (float) $price;
                }
            }

            if (! isset($meltPrices['24k'])) {
                throw new \RuntimeException('API response has no usable melt_price_per_gram["24k"].');
            }

            return $meltPrices;
        } catch (Throwable $exception) {
            Log::warning("{$label} price update: API fetch failed, falling back.", [
                'url' => $url,
                'error' => $exception->getMessage(),
            ]);
            $this->warn("{$label} price API fetch failed: {$exception->getMessage()}");

            return null;
        }
    }
}
