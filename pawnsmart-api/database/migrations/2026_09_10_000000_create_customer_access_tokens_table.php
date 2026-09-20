<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The QR code printed on a pawn ticket, as a row per customer.
 *
 * The QR carries nothing but a random token, so a ticket that is lost or
 * photographed says nothing about the customer or the loan. The token alone
 * does not open the portal either: the scan lands on a page that asks for the
 * registered email address first.
 *
 * The token is stored twice on purpose. `token_hash` is a plain SHA-256 of the
 * token and is what a scan is looked up by, so the stored value is useless to
 * anyone who reads the table. `token_ciphertext` is the same token under the
 * application key, so staff can reprint a ticket with the QR the customer
 * already has rather than silently invalidating it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_access_tokens', function (Blueprint $table) {
            $table->bigIncrements('customer_access_tokens_id');
            $table->unsignedBigInteger('customer_id');
            $table->char('token_hash', 64)->unique();
            $table->text('token_ciphertext');
            // Wrong email addresses typed against one QR code, and the time the
            // code stays locked once there have been too many.
            $table->unsignedTinyInteger('failed_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->foreign('customer_id')->references('customers_id')->on('customers')->cascadeOnDelete();
            $table->index(['customer_id', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_access_tokens');
    }
};
