<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Notification;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * "I'm ready to pick up/pay" → staff "Item ready for pickup" → the item is
 * held for redemption_visit_days (3 by default), then goes back to the vault.
 */
class PickupReadyTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $customerUser;
    private Transaction $loan;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-10 10:00:00');
        $this->staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $this->customerUser = User::create(['name' => 'Maria Cruz', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $customer = Customer::create(['user_id' => $this->customerUser->users_id, 'name' => 'Maria Cruz', 'contact_number' => '09170000000', 'valid_id_type' => 'UMID', 'valid_id_number' => 'X-1', 'registered_by_staff_id' => $this->staff->users_id]);
        $item = Item::create(['customer_id' => $customer->customers_id, 'staff_id' => $this->staff->users_id, 'group' => Item::GROUP_BULKY, 'category' => 'television', 'description' => 'Smart TV', 'condition' => 'good', 'appraised_value' => 10000, 'status' => 'active']);
        $this->loan = Transaction::create(['item_id' => $item->items_id, 'customer_id' => $customer->customers_id, 'ticket_number' => 'PT-1', 'loan_amount' => 7000, 'interest_rate' => 0.05, 'loan_to_value_percent' => 70, 'due_date' => '2026-12-31', 'grace_period_days' => 90, 'status' => 'active']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function requestAndMarkReady(): void
    {
        Sanctum::actingAs($this->customerUser);
        $this->postJson("/api/transactions/{$this->loan->transactions_id}/ready-to-redeem")->assertOk();
        Sanctum::actingAs($this->staff);
        $this->postJson("/api/transactions/{$this->loan->transactions_id}/confirm-redemption")->assertOk();
    }

    public function test_marking_it_ready_holds_it_for_3_days_and_tells_the_customer_what_to_bring(): void
    {
        $this->requestAndMarkReady();

        $this->assertSame('2026-11-13T10:00:00+00:00', $this->loan->fresh()->pickup_ready_until);
        $notice = Notification::where('user_id', $this->customerUser->users_id)->where('type', 'redeem_confirmed')->firstOrFail();
        // Minimum interest: one month of 5% on 7,000.
        $this->assertStringContainsString('Bring ₱7,350.00', $notice->message);
        $this->assertStringContainsString('Fri, Nov 13, 6:00 PM', $notice->message);
    }

    public function test_it_goes_back_to_the_vault_when_not_picked_up_in_time(): void
    {
        $this->requestAndMarkReady();

        Carbon::setTestNow('2026-11-13 09:00:00');
        $this->artisan('redemptions:expire')->assertSuccessful();
        $this->assertNotNull($this->loan->fresh()->redemption_confirmed_at, 'Still within the 3 days.');

        Carbon::setTestNow('2026-11-13 10:30:00');
        $this->artisan('redemptions:expire')->assertSuccessful();

        $loan = $this->loan->fresh();
        $this->assertNull($loan->ready_to_redeem_at);
        $this->assertNull($loan->redemption_confirmed_at);
        $this->assertNull($loan->pickup_ready_until);
        $this->assertTrue(Notification::where('user_id', $this->customerUser->users_id)->where('type', 'pickup_expired')->exists());
        $this->assertTrue(Notification::where('user_id', $this->staff->users_id)->where('type', 'staff_pickup_expired')->exists());
        // The pawn itself is untouched: still open, still redeemable.
        $this->assertSame('active', $loan->status);
    }

    public function test_a_new_request_needs_staff_to_mark_it_ready_again(): void
    {
        $this->requestAndMarkReady();

        Sanctum::actingAs($this->customerUser);
        $this->postJson("/api/transactions/{$this->loan->transactions_id}/ready-to-redeem")->assertOk();

        $this->assertNull($this->loan->fresh()->redemption_confirmed_at);
    }
}
