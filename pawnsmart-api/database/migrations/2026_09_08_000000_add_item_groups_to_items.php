<?php

use App\Models\Item;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Widens the items table from gold jewelry only to the three item groups the
 * pawnshop actually accepts: jewelry, watches or cellphones, and bulky items
 * such as gadgets, appliances, and power tools.
 *
 * The three groups are appraised in two different ways:
 *
 *   jewelry              - value is computed from the gold price, so karat and
 *                          weight_grams are required and stay in use.
 *   watch_phone, bulky   - value is typed in by the staff who appraised the
 *                          item, so karat and weight_grams do not apply and
 *                          become nullable. brand_model records what the item
 *                          is, for example "Samsung A54" or "LG 1.5HP".
 *
 * appraised_value stays the single source of truth for an item's value under
 * both paths. Only the way it is filled in differs.
 */
return new class extends Migration
{
    /**
     * Every item type the pawnshop accepts, across all three groups. The
     * category column stores the specific type; the group column stores which
     * of the three families that type belongs to.
     */
    private const ALL_CATEGORIES = [
        // jewelry
        'ring', 'necklace', 'bracelet', 'earrings', 'pendant', 'others',
        // watch_phone
        'watch', 'cellphone',
        // bulky
        'tablet', 'digital_camera', 'laptop', 'desktop_computer', 'notebook_netbook',
        'game_console', 'tv', 'refrigerator', 'aircon', 'home_theater', 'karaoke_machine',
        'electric_fan', 'washing_machine', 'gas_stove', 'sewing_machine', 'oven_toaster',
        'mixer_blender', 'water_dispenser', 'nebulizer', 'power_tool',
    ];

    /**
     * The jewelry only category list this table had before this migration.
     */
    private const JEWELRY_CATEGORIES = ['ring', 'necklace', 'bracelet', 'earrings', 'pendant'];

    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // Existing rows are all gold jewelry, so jewelry is the safe default.
            $table->enum('group', ['jewelry', 'watch_phone', 'bulky'])->default('jewelry')->after('staff_id');
            $table->enum('category', self::ALL_CATEGORIES)->change();
            $table->string('brand_model')->nullable()->after('description');
            // Gold measurements only apply to the jewelry group.
            $table->enum('karat', ['10k', '14k', '18k', '21k', '24k'])->nullable()->change();
            $table->decimal('weight_grams', 12, 3)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Non jewelry items cannot exist under the old schema, so drop them and
        // the rows that depend on them before narrowing the category list.
        $itemIds = Item::query()->where('group', '!=', 'jewelry')->pluck('items_id');

        if ($itemIds->isNotEmpty()) {
            Schema::getConnection()->table('risk_alerts')->whereIn('item_id', $itemIds)->delete();
            Schema::getConnection()->table('item_value_logs')->whereIn('item_id', $itemIds)->delete();
            Schema::getConnection()->table('transactions')->whereIn('item_id', $itemIds)->delete();
            Schema::getConnection()->table('items')->whereIn('items_id', $itemIds)->delete();
        }

        // 'others' is a jewelry category that the old enum did not have.
        Schema::getConnection()->table('items')->where('category', 'others')->update(['category' => 'ring']);
        Schema::getConnection()->table('items')->whereNull('karat')->update(['karat' => '18k']);
        Schema::getConnection()->table('items')->whereNull('weight_grams')->update(['weight_grams' => 0]);

        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['group', 'brand_model']);
            $table->enum('category', self::JEWELRY_CATEGORIES)->change();
            $table->enum('karat', ['10k', '14k', '18k', '21k', '24k'])->nullable(false)->change();
            $table->decimal('weight_grams', 12, 3)->nullable(false)->change();
        });
    }
};
