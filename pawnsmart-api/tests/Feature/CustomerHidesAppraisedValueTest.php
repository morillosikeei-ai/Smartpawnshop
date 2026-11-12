<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The appraised value is for the shop only. A customer gets no value field,
 * nor the loan-to-value percent it could be worked back from. Staff get both.
 */
class CustomerHidesAppraisedValueTest extends TestCase
{
    use RefreshDatabase;

    private const ITEM_VALUE_FIELDS = ['appraised_value', 'adjusted_value', 'adjustment_reason', 'total_value', 'gemstone_value', 'value_logs'];

    private User $staff;
    private User $customerUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $this->customerUser = User::create(['name' => 'Maria Cruz', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $customer = Customer::create(['user_id' => $this->customerUser->users_id, 'name' => 'Maria Cruz', 'contact_number' => '09170000000', 'valid_id_type' => 'UMID', 'valid_id_number' => 'X-1', 'registered_by_staff_id' => $this->staff->users_id]);
        $item = Item::create(['customer_id' => $customer->customers_id, 'staff_id' => $this->staff->users_id, 'group' => Item::GROUP_BULKY, 'category' => 'television', 'description' => 'Smart TV', 'condition' => 'good', 'appraised_value' => 10000, 'status' => 'active']);
        Transaction::create(['item_id' => $item->items_id, 'customer_id' => $customer->customers_id, 'ticket_number' => 'PT-1', 'loan_amount' => 7000, 'interest_rate' => 0.05, 'loan_to_value_percent' => 70, 'due_date' => '2026-12-31', 'grace_period_days' => 90, 'status' => 'active']);
    }

    public function test_a_customer_gets_no_value_fields(): void
    {
        Sanctum::actingAs($this->customerUser);

        $item = $this->getJson('/api/items')->assertOk()->json('0');
        foreach (self::ITEM_VALUE_FIELDS as $field) {
            $this->assertArrayNotHasKey($field, $item);
        }

        $transaction = $this->getJson('/api/transactions')->assertOk()->json('0');
        $this->assertArrayNotHasKey('loan_to_value_percent', $transaction);
        $this->assertArrayNotHasKey('appraised_value', $transaction['item']);
        // The pawn amount is still the customer's to see.
        $this->assertEquals(7000, $transaction['loan_amount']);

        $dashboard = $this->getJson('/api/dashboard/customer')->assertOk()->json();
        $this->assertArrayNotHasKey('appraised_value', $dashboard['items'][0]);
        $this->assertArrayNotHasKey('loan_to_value_percent', $dashboard['transactions'][0]);
    }

    public function test_staff_still_get_the_value_fields(): void
    {
        Sanctum::actingAs($this->staff);

        $item = $this->getJson('/api/items')->assertOk()->json('0');
        $this->assertEquals(10000, $item['appraised_value']);
        $this->assertEquals(10000, $item['total_value']);

        $transaction = $this->getJson('/api/transactions')->assertOk()->json('0');
        $this->assertEquals(70, $transaction['loan_to_value_percent']);
    }
}
