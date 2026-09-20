<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Gives silver its own purity column and keeps karat for gold only.
 *
 * Silver fineness (800, 925, 950, 999) used to be written into the karat enum,
 * which on a database without 2026_09_18_000200 only accepts gold karats, so a
 * silver pawn failed with "Data truncated for column 'karat'". Silver now goes
 * into fineness and karat stays a gold karat.
 *
 * Existing rows are kept. A silver row that already holds 925 or 999 in karat
 * (from 2026_09_18_000200) has the value moved into fineness first, so the
 * karat list can drop the silver values without losing anything. 22k is added
 * to the gold karats.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('fineness', 4)->nullable()->after('metal_type');
        });

        DB::table('items')
            ->whereIn('karat', ['925', '999'])
            ->update(['fineness' => DB::raw('karat'), 'metal_type' => 'silver', 'karat' => null]);

        Schema::table('items', function (Blueprint $table) {
            $table->enum('karat', ['10k', '14k', '18k', '21k', '22k', '24k'])->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->enum('karat', ['10k', '14k', '18k', '21k', '22k', '24k', '925', '999'])->nullable()->change();
        });

        // Only 925 and 999 fit back into karat; 800 and 950 have no slot there.
        DB::table('items')
            ->whereIn('fineness', ['925', '999'])
            ->update(['karat' => DB::raw('fineness')]);

        // 22k has no slot in the older karat list.
        DB::table('items')->where('karat', '22k')->update(['karat' => null]);

        Schema::table('items', function (Blueprint $table) {
            $table->enum('karat', ['10k', '14k', '18k', '21k', '24k', '925', '999'])->nullable()->change();
            $table->dropColumn('fineness');
        });
    }
};
