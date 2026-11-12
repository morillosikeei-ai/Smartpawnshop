<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Jewelry with no metal: a loose natural diamond, or a pearl strand on a
 * plain string. metal_type 'none' is valued from the stone alone, so the
 * daily gold and silver price updates leave it out.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE items DROP CONSTRAINT IF EXISTS items_metal_type_check');

            Schema::table('items', function (Blueprint $table) {
                $table->string('metal_type')->default('gold')->change();
            });

            return;
        }

        Schema::table('items', function (Blueprint $table) {
            $table->enum('metal_type', ['gold', 'silver', 'none'])->default('gold')->change();
        });
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE items DROP CONSTRAINT IF EXISTS items_metal_type_check');

            return;
        }

        Schema::table('items', function (Blueprint $table) {
            $table->enum('metal_type', ['gold', 'silver'])->default('gold')->change();
        });
    }
};
