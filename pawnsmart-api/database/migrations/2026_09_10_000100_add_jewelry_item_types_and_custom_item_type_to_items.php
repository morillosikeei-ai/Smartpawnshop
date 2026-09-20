<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Widens the jewelry item types the shop can record, and gives the catch-all
 * "others" type a place to store what the item actually is.
 *
 * Jewelry gains chain, anklet, brooch_pin, and cufflinks. "others" already
 * existed but recorded nothing beyond the word itself, so an item pawned under
 * it read as "Others" everywhere it was shown. custom_item_type holds the exact
 * type the staff typed in, and is filled in for that type only.
 *
 * The watch_phone and bulky type lists are unchanged.
 */
return new class extends Migration
{
    /**
     * Every item type accepted after this migration, across all three groups.
     */
    private const ALL_CATEGORIES = [
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

    /**
     * The item types this table accepted before this migration.
     */
    private const PREVIOUS_CATEGORIES = [
        'ring', 'necklace', 'bracelet', 'earrings', 'pendant', 'others',
        'watch', 'cellphone',
        'tablet', 'digital_camera', 'laptop', 'desktop_computer', 'notebook_netbook',
        'game_console', 'tv', 'refrigerator', 'aircon', 'home_theater', 'karaoke_machine',
        'electric_fan', 'washing_machine', 'gas_stove', 'sewing_machine', 'oven_toaster',
        'mixer_blender', 'water_dispenser', 'nebulizer', 'power_tool',
    ];

    /**
     * The jewelry types added here, which the old enum cannot store.
     */
    private const ADDED_CATEGORIES = ['chain', 'anklet', 'brooch_pin', 'cufflinks'];

    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->enum('category', self::ALL_CATEGORIES)->change();
        });

        if (! Schema::hasColumn('items', 'custom_item_type')) {
            Schema::table('items', function (Blueprint $table) {
                // Filled in only when category is 'others', so it stays nullable.
                $table->string('custom_item_type', 100)->nullable()->after('category');
            });
        }
    }

    public function down(): void
    {
        // The added types cannot be stored by the old enum. They are jewelry, so
        // they fall back to the catch-all type, keeping the rows and their loans.
        Schema::getConnection()->table('items')
            ->whereIn('category', self::ADDED_CATEGORIES)
            ->update(['category' => 'others']);

        Schema::table('items', function (Blueprint $table) {
            $table->enum('category', self::PREVIOUS_CATEGORIES)->change();
        });

        if (Schema::hasColumn('items', 'custom_item_type')) {
            Schema::table('items', function (Blueprint $table) {
                $table->dropColumn('custom_item_type');
            });
        }
    }
};
