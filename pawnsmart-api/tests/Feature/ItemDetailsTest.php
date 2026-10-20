<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\GoldPrice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A watch or cellphone carries structured details beside its brand/model:
 * IMEI and battery health for a phone, movement and papers for a watch.
 */
class ItemDetailsTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $customerUser = User::create(['name' => 'Maria Cruz', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $this->customer = Customer::create([
            'user_id' => $customerUser->users_id,
            'name' => 'Maria Cruz',
            'contact_number' => '09170000000',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-1',
            'registered_by_staff_id' => $staff->users_id,
        ]);
        GoldPrice::create(['price_date' => today(), 'price_per_gram' => 3560, 'source' => 'manual']);
        Sanctum::actingAs($staff);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'customer_id' => $this->customer->customers_id,
            'group' => 'watch_phone',
            'category' => 'cellphone',
            'description' => 'Small scratch on the back',
            'brand_model' => 'Samsung A54',
            'condition' => 'good',
            'appraised_value' => 12000,
            'loan_amount' => 8000,
            'loan_to_value_percent' => 66,
            'due_date' => today()->addDays(30)->toDateString(),
            'grace_period_days' => 7,
        ], $overrides);
    }

    public function test_cellphone_details_are_stored(): void
    {
        $this->postJson('/api/transactions', $this->payload(['item_details' => [
            'storage_capacity' => '128GB',
            'color' => 'Black',
            'imei' => '356789012345678',
            'battery_health' => '91',
            'network_status' => 'openline',
            'has_box' => true,
            'ownership_verified' => false,
            'movement_type' => 'automatic',
        ]]))->assertCreated()
            ->assertJsonPath('item.item_details.imei', '356789012345678')
            ->assertJsonPath('item.item_details.battery_health', 91)
            ->assertJsonPath('item.item_details.has_box', true)
            ->assertJsonPath('item.item_details.ownership_verified', false)
            // A watch field sent with a phone is dropped.
            ->assertJsonMissingPath('item.item_details.movement_type');
    }

    public function test_watch_details_are_stored(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'category' => 'watch',
            'brand_model' => 'Seiko SRPD55',
            'item_details' => [
                'brand' => 'Seiko',
                'model_reference' => 'SRPD55',
                'movement_type' => 'automatic',
                'has_papers' => true,
                'imei' => '356789012345678',
            ],
        ]))->assertCreated()
            ->assertJsonPath('item.item_details.movement_type', 'automatic')
            ->assertJsonPath('item.item_details.has_papers', true)
            ->assertJsonMissingPath('item.item_details.imei');
    }

    public function test_an_imei_must_be_15_digits(): void
    {
        $this->postJson('/api/transactions', $this->payload(['item_details' => ['imei' => '12345']]))
            ->assertStatus(422)->assertJsonValidationErrors('item_details.imei');
    }

    public function test_battery_health_is_a_percentage(): void
    {
        $this->postJson('/api/transactions', $this->payload(['item_details' => ['battery_health' => 140]]))
            ->assertStatus(422)->assertJsonValidationErrors('item_details.battery_health');
    }

    public function test_bulky_details_are_stored_for_any_bulky_type(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'group' => 'bulky',
            'category' => 'Electric bike',
            'brand_model' => 'Yadea G5',
            'item_details' => [
                'size_capacity' => '60V',
                'power_tested' => true,
                'has_warranty' => false,
                'imei' => '356789012345678',
            ],
        ]))->assertCreated()
            ->assertJsonPath('item.item_details.size_capacity', '60V')
            ->assertJsonPath('item.item_details.power_tested', true)
            ->assertJsonPath('item.item_details.has_warranty', false)
            ->assertJsonMissingPath('item.item_details.imei');
    }

    public function test_a_custom_watch_phone_type_keeps_no_details(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'category' => 'Smart ring',
            'item_details' => ['color' => 'Silver'],
        ]))->assertCreated()->assertJsonPath('item.item_details', null);
    }
}
