<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Staff may now type any gemstone type, not only the suggested ones, so the
 * column grows from 20 to 50 characters to match the API's max:50 rule.
 * Existing values are kept.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('gemstone_type', 50)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Longer typed values would not fit back into 20 characters.
        DB::table('items')->whereRaw('CHAR_LENGTH(gemstone_type) > 20')->update(['gemstone_type' => DB::raw('LEFT(gemstone_type, 20)')]);

        Schema::table('items', function (Blueprint $table) {
            $table->string('gemstone_type', 20)->nullable()->change();
        });
    }
};
