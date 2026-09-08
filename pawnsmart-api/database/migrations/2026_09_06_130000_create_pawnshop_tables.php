<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->bigIncrements('customers_id');
            $table->unsignedBigInteger('user_id')->unique();
            $table->string('name');
            $table->string('contact_number');
            $table->text('address')->nullable();
            $table->string('valid_id_type');
            $table->string('valid_id_number');
            $table->string('valid_id_photo')->nullable();
            $table->unsignedBigInteger('registered_by_staff_id');
            $table->timestamps();
            $table->foreign('user_id')->references('users_id')->on('users');
            $table->foreign('registered_by_staff_id')->references('users_id')->on('users');
        });

        Schema::create('items', function (Blueprint $table) {
            $table->bigIncrements('items_id');
            $table->unsignedBigInteger('customer_id');
            $table->unsignedBigInteger('staff_id');
            $table->enum('category', ['ring', 'necklace', 'bracelet', 'earrings', 'pendant']);
            $table->text('description');
            $table->enum('karat', ['10k', '14k', '18k', '21k', '24k']);
            $table->decimal('weight_grams', 12, 3);
            $table->enum('condition', ['good', 'fair', 'damaged']);
            $table->string('photo_path')->nullable();
            $table->decimal('appraised_value', 14, 2);
            $table->decimal('adjusted_value', 14, 2)->nullable();
            $table->text('adjustment_reason')->nullable();
            $table->decimal('sale_price', 14, 2)->nullable();
            $table->enum('status', ['active', 'overdue', 'redeemed', 'forfeited', 'for_sale', 'sold'])->default('active');
            $table->timestamps();
            $table->foreign('customer_id')->references('customers_id')->on('customers');
            $table->foreign('staff_id')->references('users_id')->on('users');
        });

        Schema::create('transactions', function (Blueprint $table) {
            $table->bigIncrements('transactions_id');
            $table->unsignedBigInteger('item_id');
            $table->unsignedBigInteger('customer_id');
            $table->string('ticket_number')->unique();
            $table->decimal('loan_amount', 14, 2);
            $table->decimal('interest_rate', 8, 4);
            $table->decimal('loan_to_value_percent', 8, 2);
            $table->date('due_date');
            $table->unsignedInteger('grace_period_days');
            $table->enum('status', ['active', 'redeemed', 'forfeited'])->default('active');
            $table->timestamp('redeemed_at')->nullable();
            $table->timestamps();
            $table->foreign('item_id')->references('items_id')->on('items');
            $table->foreign('customer_id')->references('customers_id')->on('customers');
        });

        Schema::create('gold_prices', function (Blueprint $table) {
            $table->bigIncrements('gold_prices_id');
            $table->date('price_date')->unique();
            $table->decimal('price_per_gram', 14, 2);
            $table->decimal('predicted_next_price', 14, 2)->nullable();
            $table->enum('source', ['api', 'manual']);
            $table->timestamps();
        });

        Schema::create('item_value_logs', function (Blueprint $table) {
            $table->bigIncrements('item_value_logs_id');
            $table->unsignedBigInteger('item_id');
            $table->date('log_date');
            $table->decimal('computed_value', 14, 2);
            $table->decimal('gold_price_used', 14, 2);
            $table->timestamps();
            $table->unique(['item_id', 'log_date']);
            $table->foreign('item_id')->references('items_id')->on('items');
        });

        Schema::create('risk_alerts', function (Blueprint $table) {
            $table->bigIncrements('risk_alerts_id');
            $table->unsignedBigInteger('item_id');
            $table->enum('risk_level', ['low', 'medium', 'high']);
            $table->decimal('current_value', 14, 2);
            $table->decimal('loan_amount', 14, 2);
            $table->timestamp('triggered_at');
            $table->boolean('resolved')->default(false);
            $table->timestamps();
            $table->foreign('item_id')->references('items_id')->on('items');
        });

        Schema::create('system_settings', function (Blueprint $table) {
            $table->bigIncrements('system_settings_id');
            $table->string('setting_key')->unique();
            $table->text('setting_value');
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->bigIncrements('audit_logs_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('action');
            $table->string('ticket_number')->nullable();
            $table->text('reason')->nullable();
            $table->timestamps();
            $table->foreign('user_id')->references('users_id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::disableForeignKeyConstraints();
        foreach (['audit_logs', 'risk_alerts', 'item_value_logs', 'gold_prices', 'transactions', 'items', 'customers', 'system_settings'] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::enableForeignKeyConstraints();
    }
};