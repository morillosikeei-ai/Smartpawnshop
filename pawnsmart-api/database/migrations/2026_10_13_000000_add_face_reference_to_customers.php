<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A customer's face reference, for checking the person who claims an item.
 *
 * face_photo is the photo staff take at registration, kept as a data URL like
 * valid_id_photo. face_descriptor is the 128 number face signature the browser
 * worked out from it, so a later check does not have to read the photo again.
 * Both are biometric data under the Data Privacy Act: they are only stored
 * with the customer's consent (face_consent_at) and never sent to customers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->mediumText('face_photo')->nullable()->after('valid_id_photo');
            $table->text('face_descriptor')->nullable()->after('face_photo');
            $table->timestamp('face_consent_at')->nullable()->after('face_descriptor');
            $table->timestamp('face_enrolled_at')->nullable()->after('face_consent_at');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['face_photo', 'face_descriptor', 'face_consent_at', 'face_enrolled_at']);
        });
    }
};
