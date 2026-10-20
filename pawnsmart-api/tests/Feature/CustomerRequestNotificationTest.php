<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\Notification;
use App\Models\Transaction;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * "I'm ready to pick up/pay": the one request a customer raises.
 *
 * It has to reach the staff bell and leave staff something to act on, a stamp
 * the Redemption tab confirms. The Payments screen's appointment and renewal
 * requests did neither and were removed, so their endpoint is gone too.
 */
class CustomerRequestNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $admin;
    private User $customerUser;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $this->admin = User::create(['name' => 'Shop Admin', 'email' => 'admin@example.test', 'password' => 'secret-password', 'role' => 'admin', 'status' => 'active']);
        $this->customerUser = User::create(['name' => 'Maria Cruz', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $this->customer = Customer::create([
            'user_id' => $this->customerUser->users_id,
            'name' => 'Maria Cruz',
            'contact_number' => '09170000000',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-1',
            'registered_by_staff_id' => $this->staff->users_id,
        ]);

        GoldPrice::create(['price_date' => today(), 'price_per_gram' => 3560, 'source' => 'manual']);
    }

    private function loan(array $overrides = []): Transaction
    {
        $item = Item::create([
            'customer_id' => $this->customer->customers_id,
            'staff_id' => $this->staff->users_id,
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Gold ring',
            'karat' => '18k',
            'weight_grams' => 5,
            'condition' => 'good',
            'appraised_value' => 13350,
            'status' => 'active',
        ]);

        return Transaction::create(array_merge([
            'item_id' => $item->items_id,
            'customer_id' => $this->customer->customers_id,
            'ticket_number' => 'PT-'.uniqid(),
            'loan_amount' => 9000,
            'interest_rate' => 0.05,
            'loan_to_value_percent' => 70,
            'due_date' => today()->addDays(30),
            'grace_period_days' => 7,
            'status' => 'active',
        ], $overrides));
    }

    private function raise(Transaction $loan): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->customerUser);

        return $this->postJson('/api/transactions/'.$loan->transactions_id.'/ready-to-redeem');
    }

    public function test_a_redemption_request_stamps_the_loan_and_notifies_every_active_staff_member(): void
    {
        $loan = $this->loan();

        $this->raise($loan)->assertOk();

        $this->assertNotNull($loan->fresh()->ready_to_redeem_at);

        $rows = Notification::where('type', NotificationService::TYPE_STAFF_REDEEM_REQUEST)->get();

        // One row for the staff member and one for the admin.
        $this->assertCount(2, $rows);
        $this->assertStringContainsString('Ticket #'.$loan->ticket_number, $rows->first()->message);
        $this->assertSame($loan->item_id, $rows->first()->related_item_id);
    }

    public function test_a_request_against_someone_elses_loan_is_not_found(): void
    {
        $loan = $this->loan();

        $other = User::create(['name' => 'Ben Reyes', 'email' => 'ben@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        Customer::create([
            'user_id' => $other->users_id,
            'name' => 'Ben Reyes',
            'contact_number' => '09170000001',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-2',
            'registered_by_staff_id' => $this->staff->users_id,
        ]);

        Sanctum::actingAs($other);
        $this->postJson('/api/transactions/'.$loan->transactions_id.'/ready-to-redeem')->assertNotFound();

        $this->assertNull($loan->fresh()->ready_to_redeem_at);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_a_closed_loan_cannot_be_requested_on(): void
    {
        $loan = $this->loan(['status' => 'redeemed']);

        $this->raise($loan)->assertStatus(422);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_the_removed_appointment_and_renewal_requests_are_gone(): void
    {
        $loan = $this->loan();

        Sanctum::actingAs($this->customerUser);
        $this->postJson('/api/transactions/'.$loan->transactions_id.'/customer-request', ['type' => 'appointment'])->assertNotFound();

        $this->assertDatabaseCount('notifications', 0);
    }
}
