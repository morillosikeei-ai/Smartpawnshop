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
 * Staff has the final say on an item's value and its loan terms. The computed
 * gold value is a reference only, so the API checks that the numbers are sane
 * rather than that they match a formula.
 */
class StaffLoanTermsTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $customerUser = User::create(['name' => 'Maria Cruz', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $this->customer = Customer::create([
            'user_id' => $customerUser->users_id,
            'name' => 'Maria Cruz',
            'contact_number' => '09170000000',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-1',
            'registered_by_staff_id' => $this->staff->users_id,
        ]);

        // 5 g of 18k at this price computes to about 13,350.
        GoldPrice::create(['price_date' => today(), 'price_per_gram' => 3560, 'source' => 'manual']);
        Sanctum::actingAs($this->staff);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'customer_id' => $this->customer->customers_id,
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Gold ring',
            'karat' => '18k',
            'weight_grams' => 5,
            'condition' => 'good',
            'loan_amount' => 9000,
            'loan_to_value_percent' => 70,
            'due_date' => today()->addDays(60)->toDateString(),
            'grace_period_days' => 7,
        ], $overrides);
    }

    public function test_staff_can_raise_the_value_without_a_reason_and_set_any_ltv(): void
    {
        // A ring with a gemstone: staff values it well above its gold content
        // and lends an amount that matches no fixed LTV formula.
        $this->postJson('/api/transactions', $this->payload([
            'adjusted_value' => 25000,
            'loan_amount' => 18000,
            'loan_to_value_percent' => 72,
        ]))->assertCreated()->assertJsonPath('loan_amount', '18000.00');
    }

    public function test_loan_amount_cannot_exceed_the_final_appraised_value(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'adjusted_value' => 10000,
            'loan_amount' => 10001,
        ]))->assertStatus(422)->assertJsonValidationErrors('loan_amount');
    }

    public function test_loan_amount_is_checked_against_the_computed_value_when_not_adjusted(): void
    {
        $this->postJson('/api/transactions', $this->payload(['loan_amount' => 20000]))
            ->assertStatus(422)->assertJsonValidationErrors('loan_amount');
    }

    public function test_loan_terms_must_be_positive(): void
    {
        $this->postJson('/api/transactions', $this->payload(['loan_amount' => 0, 'loan_to_value_percent' => -5]))
            ->assertStatus(422)->assertJsonValidationErrors(['loan_amount', 'loan_to_value_percent']);
    }

    public function test_the_same_rules_apply_to_staff_appraised_groups(): void
    {
        $base = [
            'group' => Item::GROUP_BULKY,
            'category' => 'aircon',
            'brand_model' => 'LG 1.5HP',
            'karat' => null,
            'weight_grams' => null,
            'appraised_value' => 8000,
        ];

        $this->postJson('/api/transactions', $this->payload([...$base, 'loan_amount' => 7500, 'loan_to_value_percent' => 93.75]))
            ->assertCreated();
        $this->postJson('/api/transactions', $this->payload([...$base, 'loan_amount' => 8500]))
            ->assertStatus(422)->assertJsonValidationErrors('loan_amount');
    }
}
