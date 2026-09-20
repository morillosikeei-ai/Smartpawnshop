<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Lets items.condition hold any condition, not only good, fair, or damaged.
 *
 * The staff form suggests those three but also accepts a condition typed in by
 * the staff, such as "Minor scratches". The enum column would reject that
 * text, so it becomes a plain string. Existing rows keep their values.
 */
return new class extends Migration
{
    private const ENUM_CONDITIONS = ['good', 'fair', 'damaged'];

    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('condition', 100)->change();
        });
    }

    public function down(): void
    {
        // The enum cannot store a custom condition. It falls back to "fair",
        // the neutral middle value, so the rows and their loans are kept.
        DB::table('items')
            ->whereNotIn('condition', self::ENUM_CONDITIONS)
            ->update(['condition' => 'fair']);

        Schema::table('items', function (Blueprint $table) {
            $table->enum('condition', self::ENUM_CONDITIONS)->change();
        });
    }
};
