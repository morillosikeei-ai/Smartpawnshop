<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * GCash renewal payments the customer submits from the portal.
 *
 * The shop takes no card or wallet payment through the system: the customer
 * pays from their own GCash app and types the reference number here. One row
 * is one such claim, and it stays pending until a staff member checks the
 * reference against the shop's GCash account and confirms or rejects it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('renewal_requests', function (Blueprint $table) {
            $table->bigIncrements('renewal_requests_id');
            $table->unsignedBigInteger('transaction_id');
            $table->unsignedBigInteger('customer_id');
            // The renta quoted when the customer submitted. Interest keeps
            // accruing, so the figure is kept rather than recomputed: staff
            // confirm against what the customer was actually asked to pay.
            $table->decimal('amount', 12, 2);
            $table->string('gcash_reference_number', 50);
            $table->enum('status', ['pending', 'confirmed', 'rejected'])->default('pending');
            // Who acted on the claim, and when. Null while it is pending.
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            // Why it was rejected, shown back to the customer.
            $table->string('review_note', 255)->nullable();
            $table->timestamps();
            // The staff list reads the pending rows, oldest first.
            $table->index(['status', 'created_at']);
            // One reference number is one payment: a resubmission of the same
            // reference must not become a second renewal.
            $table->unique('gcash_reference_number');
            $table->foreign('transaction_id')->references('transactions_id')->on('transactions')->cascadeOnDelete();
            $table->foreign('customer_id')->references('customers_id')->on('customers')->cascadeOnDelete();
            $table->foreign('reviewed_by')->references('users_id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('renewal_requests');
    }
};
