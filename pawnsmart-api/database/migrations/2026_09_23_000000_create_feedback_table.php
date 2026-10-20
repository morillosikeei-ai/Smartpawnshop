<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a customer thought of redeeming their pawn.
 *
 * Asked once, after the pawn is paid and the item handed back, because that is
 * the only moment the whole transaction is behind them and there is something
 * to have an opinion about. One row per pawn ticket: the unique key on
 * transaction_id is what stops the same redemption being rated twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('feedback', function (Blueprint $table) {
            $table->bigIncrements('feedback_id');
            $table->unsignedBigInteger('transaction_id')->unique();
            $table->unsignedBigInteger('customer_id');
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->timestamps();
            // The staff list reads newest first; the average reads them all.
            $table->index('created_at');
            $table->foreign('transaction_id')->references('transactions_id')->on('transactions')->cascadeOnDelete();
            $table->foreign('customer_id')->references('customers_id')->on('customers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feedback');
    }
};
