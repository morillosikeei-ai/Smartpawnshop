<?php

use App\Models\SystemSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Holds the frequency heuristic results from pawn:check-unusual-activity.
 *
 * A row means one customer opened more transactions inside the rolling window
 * than the threshold allows. It is a prompt for a human to look, not a finding
 * of fraud, so the only state it carries is whether somebody reviewed it.
 */
return new class extends Migration
{
    /**
     * Defaults for the heuristic, in the same store as every other tunable.
     */
    private const NEW_SETTINGS = [
        'unusual_activity_threshold' => '3',
        'unusual_activity_window_days' => '7',
    ];

    public function up(): void
    {
        Schema::create('activity_flags', function (Blueprint $table) {
            $table->bigIncrements('activity_flags_id');
            $table->unsignedBigInteger('customer_id');
            $table->text('reason');
            $table->unsignedInteger('transaction_count');
            $table->unsignedInteger('window_days');
            $table->timestamp('flagged_at');
            $table->boolean('resolved')->default(false);
            $table->timestamps();
            $table->index(['customer_id', 'resolved']);
            $table->foreign('customer_id')->references('customers_id')->on('customers');
        });

        foreach (self::NEW_SETTINGS as $key => $value) {
            SystemSetting::firstOrCreate(['setting_key' => $key], ['setting_value' => $value]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_flags');
        SystemSetting::whereIn('setting_key', array_keys(self::NEW_SETTINGS))->delete();
    }
};
