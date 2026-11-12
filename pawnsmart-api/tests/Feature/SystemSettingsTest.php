<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Admin → System Settings: each setting only accepts a value it can use. */
class SystemSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@example.test', 'password' => 'secret-password', 'role' => 'admin', 'status' => 'active']));
        SystemSetting::updateOrCreate(['setting_key' => 'shop_opens_at'], ['setting_value' => '09:00']);
        SystemSetting::updateOrCreate(['setting_key' => 'shop_closes_at'], ['setting_value' => '18:00']);
    }

    private function save(string $key, string $value)
    {
        return $this->putJson('/api/system-settings', ['setting_key' => $key, 'setting_value' => $value]);
    }

    public function test_good_values_save_and_are_tidied(): void
    {
        $this->save('loan_term_days', '45')->assertOk();
        $this->save('jewelry_watch_phone_rate', '4.5')->assertOk();
        $this->save('natural_diamond_1ct_price', '43,653.32')->assertOk()->assertJsonPath('setting_value', '43653.32');
        $this->save('shop_open_days', '6, 1,2,2,3')->assertOk()->assertJsonPath('setting_value', '1,2,3,6');
        $this->save('shop_closes_at', '19:30')->assertOk();
        $this->save('gcash_payment_info', 'GCash 0970 885 6182')->assertOk();

        $this->assertSame('45', SystemSetting::where('setting_key', 'loan_term_days')->value('setting_value'));
    }

    public function test_bad_values_are_refused_with_a_message(): void
    {
        $this->save('loan_term_days', 'abc')->assertStatus(422)->assertJsonPath('errors.setting_value.0', 'Pawn term must be 1 to 365 days.');
        $this->save('loan_term_days', '0')->assertStatus(422);
        $this->save('jewelry_watch_phone_rate', '-5')->assertStatus(422);
        $this->save('grace_period_days', '30')->assertStatus(422)->assertJsonPath('errors.setting_value.0', 'The redemption period must be at least 90 days (P.D. 114), up to 365.');
        $this->save('shop_opens_at', '25:00')->assertStatus(422);
        $this->save('shop_opens_at', '19:00')->assertStatus(422)->assertJsonPath('errors.setting_value.0', 'Closing time must be after opening time.');
        $this->save('shop_open_days', '1,8')->assertStatus(422);
        $this->save('no_such_setting', '1')->assertStatus(422)->assertJsonPath('errors.setting_value.0', 'This is not a setting the system uses.');

        $this->assertNull(SystemSetting::where('setting_key', 'no_such_setting')->first());
    }

    public function test_only_the_admin_can_change_settings(): void
    {
        Sanctum::actingAs(User::create(['name' => 'Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']));

        $this->save('loan_term_days', '45')->assertForbidden();
    }
}
