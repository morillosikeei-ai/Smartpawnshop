<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The staff form suggests item types but lets the staff type a custom one.
 * Whatever text is sent is stored as the item type.
 */
class CustomItemTypeTest extends TestCase
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
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Gold item',
            'karat' => '18k',
            'weight_grams' => 5,
            'condition' => 'good',
            'loan_amount' => 9000,
            'loan_to_value_percent' => 70,
            'due_date' => today()->addDays(60)->toDateString(),
            'grace_period_days' => 7,
        ], $overrides);
    }

    public function test_a_custom_typed_item_type_is_accepted_and_stored_as_typed(): void
    {
        $this->postJson('/api/transactions', $this->payload(['category' => 'Gold tiara']))
            ->assertCreated()
            ->assertJsonPath('item.category', 'Gold tiara');

        $item = Item::firstOrFail();
        $this->assertSame('Gold tiara', $item->itemTypeLabel());
    }

    public function test_custom_item_types_work_for_every_group(): void
    {
        $nonJewelry = ['karat' => null, 'weight_grams' => null, 'brand_model' => 'Generic', 'appraised_value' => 10000];

        $this->postJson('/api/transactions', $this->payload([...$nonJewelry, 'group' => Item::GROUP_WATCH_PHONE, 'category' => 'Smart ring']))
            ->assertCreated()->assertJsonPath('item.category', 'Smart ring');
        $this->postJson('/api/transactions', $this->payload([...$nonJewelry, 'group' => Item::GROUP_BULKY, 'category' => 'Electric bike']))
            ->assertCreated()->assertJsonPath('item.category', 'Electric bike');
    }

    public function test_a_suggested_item_type_is_still_stored_as_its_key(): void
    {
        $this->postJson('/api/transactions', $this->payload(['category' => 'brooch_pin']))
            ->assertCreated()
            ->assertJsonPath('item.category', 'brooch_pin');

        $this->assertSame('Brooch Pin', Item::firstOrFail()->itemTypeLabel());
    }

    public function test_a_custom_typed_condition_is_accepted_and_stored_as_typed(): void
    {
        $this->postJson('/api/transactions', $this->payload(['condition' => 'Minor scratches']))
            ->assertCreated()
            ->assertJsonPath('item.condition', 'Minor scratches');

        $this->postJson('/api/transactions', $this->payload(['condition' => '']))
            ->assertStatus(422)->assertJsonValidationErrors('condition');
    }

    public function test_the_item_type_is_still_required_and_limited_in_length(): void
    {
        $this->postJson('/api/transactions', $this->payload(['category' => '']))
            ->assertStatus(422)->assertJsonValidationErrors('category');
        $this->postJson('/api/transactions', $this->payload(['category' => str_repeat('a', 101)]))
            ->assertStatus(422)->assertJsonValidationErrors('category');
    }
}
