<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Holds a customer places on an item for sale.
 *
 * The item keeps its for_sale status while it is held: a hold is a promise to
 * come and buy, not a sale. A row is active until it is claimed (staff mark
 * the item sold), cancelled, or passes expires_at.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_reservations', function (Blueprint $table) {
            $table->bigIncrements('item_reservations_id');
            $table->unsignedBigInteger('item_id');
            $table->unsignedBigInteger('customer_id');
            $table->timestamp('expires_at');
            $table->enum('status', ['active', 'claimed', 'cancelled', 'expired'])->default('active');
            // Who cancelled, when someone did: the customer or a staff member.
            $table->unsignedBigInteger('cancelled_by')->nullable();
            $table->timestamps();

            $table->foreign('item_id')->references('items_id')->on('items');
            $table->foreign('customer_id')->references('customers_id')->on('customers');
            $table->foreign('cancelled_by')->references('users_id')->on('users');
            $table->index(['item_id', 'status']);
            $table->index(['customer_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_reservations');
    }
};
