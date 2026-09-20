<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets the karat column hold a silver fineness as well as a gold karat.
 *
 * A silver item (metal_type = silver) is graded 925 (sterling) or 999 (fine)
 * rather than by karat. Both live in the same Karat/Purity column so every
 * screen that shows the purity keeps reading one field.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->enum('karat', ['10k', '14k', '18k', '21k', '24k', '925', '999'])->nullable()->change();
        });
    }

    public function down(): void
    {
        // Silver rows cannot keep a silver fineness under the old list.
        Schema::getConnection()->table('items')->whereIn('karat', ['925', '999'])->update(['karat' => null]);

        Schema::table('items', function (Blueprint $table) {
            $table->enum('karat', ['10k', '14k', '18k', '21k', '24k'])->nullable()->change();
        });
    }
};
