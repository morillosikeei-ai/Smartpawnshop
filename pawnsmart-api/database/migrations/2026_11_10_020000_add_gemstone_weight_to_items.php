<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The size of a gemstone on jewelry: carats for a natural diamond, grams for
 * a pearl. With the admin's reference price it gives the suggested gemstone
 * value; staff may still change that value.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->decimal('gemstone_weight', 10, 3)->nullable()->after('gemstone_type');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('gemstone_weight');
        });
    }
};
