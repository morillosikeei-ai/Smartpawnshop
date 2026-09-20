<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets a jewelry item carry a gemstone or diamond on top of its gold.
 *
 * appraised_value stays the gold portion, recomputed from the gold price.
 * gemstone_value is the staff's own estimate for the stone, entered once at
 * intake and never recomputed. gemstone_details is a free note for reference
 * only, such as "0.5 carat, round cut". All three are nullable: items recorded
 * before this migration, and items without a stone, leave them empty.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->boolean('has_gemstone')->nullable()->after('weight_grams');
            $table->decimal('gemstone_value', 12, 2)->nullable()->after('has_gemstone');
            $table->text('gemstone_details')->nullable()->after('gemstone_value');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['has_gemstone', 'gemstone_value', 'gemstone_details']);
        });
    }
};
