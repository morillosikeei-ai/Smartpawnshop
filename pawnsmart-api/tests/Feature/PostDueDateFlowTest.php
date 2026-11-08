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
 * After the due date: Overdue during the Extension Period, then
 * expired/unclaimed (forfeited), never for_sale on its own. Staff then review
 * it: Confirm for Sale at a typed price, or Extend. Customer and staff are
 * notified at each stage.
 */
class PostDueDateFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $customerUser;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-20 08:00:00');

        $this->staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $this->customerUser = User::create(['name' => 'Maria Cruz', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $this->customer = Customer::create([
            'user_id' => $this->customerUser->users_id,
            'name' => 'Maria Cruz',
            'contact_number' => '09170000000',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-1',
            'registered_by_staff_id' => $this->staff->users_id,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** A bulky item: no gold valuation, so only the due date drives the job. */
    private function pawn(string $dueDate, string $status = 'active'): Transaction
    {
        $item = Item::create([
            'customer_id' => $this->customer->customers_id,
            'staff_id' => $this->staff->users_id,
            'group' => Item::GROUP_BULKY,
            'category' => 'television',
            'description' => 'Smart TV',
            'condition' => 'good',
            'appraised_value' => 10000,
            'status' => $status,
        ]);

        return Transaction::create([
            'item_id' => $item->items_id,
            'customer_id' => $this->customer->customers_id,
            'ticket_number' => 'PT-'.uniqid(),
            'loan_amount' => 7000,
            'interest_rate' => 0.05,
            'loan_to_value_percent' => 70,
            'due_date' => $dueDate,
            'grace_period_days' => 7,
            'status' => $status,
        ]);
    }

    private function runDailyJob(): void
    {
        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 5000])->assertSuccessful();
    }

    private function notified(User $user, string $type): bool
    {
        return Notification::where('user_id', $user->users_id)->where('type', $type)->exists();
    }

    public function test_past_the_due_date_the_item_is_overdue_and_both_sides_are_told(): void
    {
        $transaction = $this->pawn('2026-11-18');

        $this->runDailyJob();

        $this->assertSame('overdue', $transaction->item->fresh()->status);
        // Still an open pawn: it can be redeemed or renewed in the extension period.
        $this->assertSame('active', $transaction->fresh()->status);
        $this->assertTrue($this->notified($this->customerUser, 'overdue'));
        $this->assertTrue($this->notified($this->staff, 'staff_overdue'));
    }

    public function test_after_the_extension_period_it_is_forfeited_and_never_put_up_for_sale_by_the_job(): void
    {
        // Due Nov 12 + 7 days: the last extension day is Nov 19, today is Nov 20.
        // The auction notice went out on Nov 12, more than 7 days ago.
        $transaction = $this->pawn('2026-11-12');
        $transaction->update(['auction_notice_sent_at' => '2026-11-12 08:00:00']);

        $this->runDailyJob();
        $this->runDailyJob();

        $this->assertSame('forfeited', $transaction->fresh()->status);
        $this->assertSame('forfeited', $transaction->item->fresh()->status);
        $this->assertTrue($this->notified($this->customerUser, 'forfeited'));
        $this->assertTrue($this->notified($this->staff, 'staff_forfeited'));
    }

    public function test_the_last_extension_day_is_still_overdue(): void
    {
        $transaction = $this->pawn('2026-11-13');

        $this->runDailyJob();

        $this->assertSame('overdue', $transaction->item->fresh()->status);
        $this->assertSame('active', $transaction->fresh()->status);
    }

    public function test_a_due_date_moved_forward_takes_the_item_out_of_overdue(): void
    {
        $transaction = $this->pawn('2026-11-18');
        $this->runDailyJob();

        $transaction->update(['due_date' => '2026-12-30']);
        $this->runDailyJob();

        $this->assertSame('active', $transaction->item->fresh()->status);
    }

    public function test_confirm_for_sale_needs_a_typed_price_and_tells_both_sides(): void
    {
        $transaction = $this->pawn('2026-10-01', 'forfeited');
        $item = $transaction->item;
        Sanctum::actingAs($this->staff);

        $this->postJson("/api/items/{$item->items_id}/for-sale", [])->assertStatus(422);
        $this->postJson("/api/items/{$item->items_id}/for-sale", ['sale_price' => 0, 'auction_date' => '2026-11-18'])->assertStatus(422);
        // PD 114: an item is only listed after it went unsold at its public auction.
        $this->postJson("/api/items/{$item->items_id}/for-sale", ['sale_price' => 8500])->assertStatus(422)->assertJsonValidationErrors('auction_date');
        $this->assertSame('forfeited', $item->fresh()->status);

        $this->postJson("/api/items/{$item->items_id}/for-sale", ['sale_price' => 8500, 'auction_date' => '2026-11-18'])->assertOk();

        $this->assertSame('for_sale', $item->fresh()->status);
        $this->assertSame('2026-11-18', $item->fresh()->auction_date->toDateString());
        $this->assertEquals(8500, (float) $item->fresh()->sale_price);
        $this->assertTrue($this->notified($this->customerUser, 'listed_for_sale'));
        $this->assertTrue($this->notified($this->staff, 'staff_listed_for_sale'));
    }

    public function test_extend_reopens_the_pawn_with_a_new_due_date_and_tells_both_sides(): void
    {
        $transaction = $this->pawn('2026-10-01', 'forfeited');
        Sanctum::actingAs($this->staff);

        $this->postJson("/api/transactions/{$transaction->transactions_id}/extend")->assertOk();

        $transaction->refresh();
        $this->assertSame('active', $transaction->status);
        $this->assertSame('active', $transaction->item->fresh()->status);
        // Today plus the default renewal term of 60 days.
        $this->assertSame('2027-01-19', $transaction->due_date->toDateString());
        $this->assertTrue($this->notified($this->customerUser, 'pawn_extended'));
        $this->assertTrue($this->notified($this->staff, 'staff_pawn_extended'));
    }

    public function test_extend_is_only_for_an_expired_pawn_not_yet_for_sale(): void
    {
        $open = $this->pawn('2026-12-30');
        $listed = $this->pawn('2026-10-01', 'forfeited');
        $listed->item->update(['status' => 'for_sale', 'sale_price' => 9000]);
        Sanctum::actingAs($this->staff);

        $this->postJson("/api/transactions/{$open->transactions_id}/extend")->assertStatus(422);
        $this->postJson("/api/transactions/{$listed->transactions_id}/extend")->assertStatus(422);
        $this->assertSame('for_sale', $listed->item->fresh()->status);
    }

    public function test_customers_cannot_review_expired_items(): void
    {
        $transaction = $this->pawn('2026-10-01', 'forfeited');
        Sanctum::actingAs($this->customerUser);

        $this->postJson("/api/transactions/{$transaction->transactions_id}/extend")->assertForbidden();
        $this->postJson("/api/items/{$transaction->item_id}/for-sale", ['sale_price' => 100])->assertForbidden();
    }

    public function test_an_extended_pawn_that_expires_again_is_announced_again(): void
    {
        $transaction = $this->pawn('2026-11-12');
        $transaction->update(['auction_notice_sent_at' => '2026-11-12 08:00:00']);
        $this->runDailyJob();
        Sanctum::actingAs($this->staff);
        $this->postJson("/api/transactions/{$transaction->transactions_id}/extend")->assertOk();
        // The new period needs its own notice.
        $this->assertNull($transaction->fresh()->auction_notice_sent_at);

        // New due date Jan 19 + 7 days: the notice goes out on Jan 19, and the
        // item goes to auction on Jan 27, the day after the last day.
        Carbon::setTestNow('2027-01-19 08:00:00');
        $this->runDailyJob();
        $this->assertNotNull($transaction->fresh()->auction_notice_sent_at);
        Carbon::setTestNow('2027-01-27 08:00:00');
        $this->runDailyJob();

        $this->assertSame('forfeited', $transaction->fresh()->status);
        $this->assertSame(2, Notification::where('user_id', $this->customerUser->users_id)->where('type', 'forfeited')->count());
    }
}
