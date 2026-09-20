<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds a structured gemstone type beside the free-text gemstone_details.
 *
 * gemstone_type holds one of Item::GEMSTONE_TYPES (diamond, ruby, sapphire,
 * emerald, pearl, other). It is nullable: items without a stone, and items
 * recorded before this migration, leave it empty. gemstone_details keeps the
 * specifics such as carat and cut.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('gemstone_type', 20)->nullable()->after('gemstone_value');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('gemstone_type');
        });
    }
};
