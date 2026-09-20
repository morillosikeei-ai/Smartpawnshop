<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Records which precious metal an item is made of.
 *
 * The daily recompute values gold items from gold_prices and silver items from
 * silver_prices. Every existing item was recorded as gold, so the column
 * defaults to gold.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->enum('metal_type', ['gold', 'silver'])->default('gold')->after('karat');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('metal_type');
        });
    }
};
