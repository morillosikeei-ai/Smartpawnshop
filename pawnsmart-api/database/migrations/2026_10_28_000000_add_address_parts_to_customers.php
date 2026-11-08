<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A customer's address in parts, picked from the PSGC list at registration.
 *
 * province, city_municipality and barangay are the official PSGC names
 * (province is "Metro Manila" for NCR cities). street is the house number and
 * street typed by staff. The existing address column keeps the complete
 * address built from them, so every screen that shows it is unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('province')->nullable()->after('address');
            $table->string('city_municipality')->nullable()->after('province');
            $table->string('barangay')->nullable()->after('city_municipality');
            $table->string('street')->nullable()->after('barangay');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['province', 'city_municipality', 'barangay', 'street']);
        });
    }
};
