<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Daily silver price history, one row per day, shaped exactly like gold_prices.
 *
 * gold:update-price fills it from GoldAPI.io's XAG endpoint and stores the
 * next-day forecast beside it, the same way it does for gold. Silver items are
 * valued from this table instead of gold_prices.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('silver_prices', function (Blueprint $table) {
            $table->bigIncrements('silver_prices_id');
            $table->date('price_date')->unique();
            $table->decimal('price_per_gram', 14, 2);
            $table->json('melt_prices_json')->nullable();
            $table->decimal('predicted_next_price', 14, 2)->nullable();
            $table->enum('source', ['api', 'manual']);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('silver_prices');
    }
};
