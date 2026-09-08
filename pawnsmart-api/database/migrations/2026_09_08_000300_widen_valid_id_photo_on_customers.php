<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Holds the valid ID photo itself, not a path to one.
 *
 * The staff app reads the picked file with FileReader and sends a data URL, so
 * the column was receiving tens of kilobytes of base64 into a VARCHAR(255) and
 * MySQL rejected the insert with "1406 Data too long for column
 * 'valid_id_photo'". MEDIUMTEXT holds 16 MB, which is past any photo the app
 * will send after the client-side downscale.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->mediumText('valid_id_photo')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Going back to VARCHAR(255) would truncate every stored photo, so the
        // rows that cannot fit are cleared first and the column returns empty.
        DB::table('customers')->whereRaw('CHAR_LENGTH(valid_id_photo) > 255')->update(['valid_id_photo' => null]);

        Schema::table('customers', function (Blueprint $table) {
            $table->string('valid_id_photo')->nullable()->change();
        });
    }
};
