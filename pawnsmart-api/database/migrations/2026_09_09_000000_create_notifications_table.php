<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * In app notifications for the Staff and Customer portals.
 *
 * One row is one message for one recipient. Staff and customer messages share
 * this table: who receives a row is the only difference between the two flows,
 * so the bell in either portal reads the same way.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->bigIncrements('notifications_id');
            $table->unsignedBigInteger('user_id');
            $table->string('type');
            $table->text('message');
            // The item the message is about, when there is one. It carries the
            // click through: the portal uses it with the type to decide which
            // screen to open.
            $table->unsignedBigInteger('related_item_id')->nullable();
            $table->boolean('is_read')->default(false);
            $table->timestamps();
            // The bell reads one recipient's newest rows, and the unread count
            // filters the same set.
            $table->index(['user_id', 'is_read', 'created_at']);
            // The triggers check whether the same message already went out for
            // an item, so a daily job does not repeat itself.
            $table->index(['user_id', 'type', 'related_item_id']);
            $table->foreign('user_id')->references('users_id')->on('users')->cascadeOnDelete();
            $table->foreign('related_item_id')->references('items_id')->on('items')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
