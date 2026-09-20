<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Holds the item photos themselves, not a path to one.
 *
 * Item photos are stored the same way as the customer's valid ID photo: the
 * staff app downscales each picked file and sends it as a data URL. An item can
 * have several photos, so the column holds a JSON list of those data URLs,
 * which is far past VARCHAR(255). MEDIUMTEXT holds 16 MB.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->mediumText('photo_path')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Going back to VARCHAR(255) would truncate every stored photo, so the
        // rows that cannot fit are cleared first and the column returns empty.
        DB::table('items')->whereRaw('CHAR_LENGTH(photo_path) > 255')->update(['photo_path' => null]);

        Schema::table('items', function (Blueprint $table) {
            $table->string('photo_path')->nullable()->change();
        });
    }
};
