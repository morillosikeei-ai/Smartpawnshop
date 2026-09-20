<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Lets items.category hold any item type, not only the fixed list.
 *
 * The staff form now suggests each group's item types but also accepts a
 * custom type typed in by the staff. The enum column would reject that text,
 * so the column becomes a plain string. Suggested types keep their existing
 * keys, so every current row stays as it is.
 */
return new class extends Migration
{
    /**
     * Every item type the enum accepted before this migration.
     */
    private const ENUM_CATEGORIES = [
        // jewelry
        'ring', 'necklace', 'bracelet', 'earrings', 'pendant',
        'chain', 'anklet', 'brooch_pin', 'cufflinks', 'others',
        // watch_phone
        'watch', 'cellphone',
        // bulky
        'tablet', 'digital_camera', 'laptop', 'desktop_computer', 'notebook_netbook',
        'game_console', 'tv', 'refrigerator', 'aircon', 'home_theater', 'karaoke_machine',
        'electric_fan', 'washing_machine', 'gas_stove', 'sewing_machine', 'oven_toaster',
        'mixer_blender', 'water_dispenser', 'nebulizer', 'power_tool',
    ];

    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('category', 100)->change();
        });
    }

    public function down(): void
    {
        // A custom type cannot be stored by the enum. It moves to
        // custom_item_type under the catch-all type, which every screen shows
        // as the typed text, so the rows and their loans are kept.
        DB::table('items')
            ->whereNotIn('category', self::ENUM_CATEGORIES)
            ->update([
                'custom_item_type' => DB::raw('category'),
                'category' => 'others',
            ]);

        Schema::table('items', function (Blueprint $table) {
            $table->enum('category', self::ENUM_CATEGORIES)->change();
        });
    }
};
