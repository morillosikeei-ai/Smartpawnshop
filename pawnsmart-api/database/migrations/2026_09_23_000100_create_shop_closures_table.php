<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Days the shop is shut, or open for less than usual.
 *
 * The weekly pattern lives in system_settings because it rarely changes. This
 * table is for the exceptions a customer actually needs warning about: a
 * public holiday, a fiesta, a day the branch closes early. One row is one
 * date, so a date can only be announced once.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shop_closures', function (Blueprint $table) {
            $table->bigIncrements('shop_closures_id');
            $table->date('closure_date')->unique();
            $table->string('label', 120);
            // A half day is still a closure worth showing: the customer who
            // turns up at four needs to know as much as the one who turns up
            // on a holiday.
            $table->enum('kind', ['closed', 'half_day'])->default('closed');
            $table->string('opens_at', 5)->nullable();
            $table->string('closes_at', 5)->nullable();
            $table->timestamps();
            $table->index('closure_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_closures');
    }
};
