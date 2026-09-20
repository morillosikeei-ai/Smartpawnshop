<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stores GoldAPI.io's per-karat melt prices beside the day's 24k price.
 *
 * The API already adjusts each karat's price per gram for purity, so the daily
 * item-value recompute can use the exact 18k (or 14k, ...) price instead of
 * multiplying a purity percent by the 24k price. Rows entered by hand, or
 * carried forward when the API fails, leave it null and keep using the
 * purity x price calculation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gold_prices', function (Blueprint $table) {
            $table->json('melt_prices_json')->nullable()->after('price_per_gram');
        });
    }

    public function down(): void
    {
        Schema::table('gold_prices', function (Blueprint $table) {
            $table->dropColumn('melt_prices_json');
        });
    }
};
