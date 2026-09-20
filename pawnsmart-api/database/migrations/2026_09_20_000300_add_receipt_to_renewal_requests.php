<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The customer's GCash receipt for a renewal.
 *
 * A reference number alone asks staff to search their GCash account for it.
 * The screenshot the customer already has on their phone shows the amount, the
 * time and the reference together, so most claims can be checked at a glance.
 *
 * Stored the same way item photos are: a downscaled JPEG data URL in the row,
 * so no file storage has to be configured or backed up separately.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('renewal_requests', function (Blueprint $table) {
            $table->mediumText('receipt_path')->nullable()->after('gcash_reference_number');
        });
    }

    public function down(): void
    {
        Schema::table('renewal_requests', function (Blueprint $table) {
            $table->dropColumn('receipt_path');
        });
    }
};
