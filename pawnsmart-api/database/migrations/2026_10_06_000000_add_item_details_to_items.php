<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Structured details for a pawned watch or cellphone.
 *
 * Each kind has its own set of fields (IMEI and battery health for a phone,
 * movement and papers for a watch; see Item::DETAIL_FIELDS), none of them
 * shared with jewelry or bulky items, so they are kept together in one JSON
 * column rather than as a dozen mostly empty columns. Older items have none.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->json('item_details')->nullable()->after('brand_model');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('item_details');
        });
    }
};
