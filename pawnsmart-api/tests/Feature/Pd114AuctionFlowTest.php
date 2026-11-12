<?php

namespace Tests\Feature;

use App\Jobs\SendAccountMail;
use App\Mail\AuctionNoticeMail;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Notification;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * PD 114 (Pawnshop Regulation Act): 90 days after the due date to redeem, a
 * written notice before that period ends, and a public auction before any
 * sale. The due date here is Jan 1, so the last day to redeem is Apr 1.
 */
class Pd114AuctionFlowTest extends TestCase
{
    use RefreshDatabase;

    private const DUE = '2027-01-01';

    private User $staff;
    private User $customerUser;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        Carbon::setTestNow('2026-11-01 08:00:00');
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

    private function pawn(): Transaction
    {
        $item = Item::create([
            'customer_id' => $this->customer->customers_id,
            'staff_id' => $this->staff->users_id,
            'group' => Item::GROUP_BULKY,
            'category' => 'television',
            'description' => 'Smart TV',
            'condition' => 'good',
            'appraised_value' => 10000,
            'status' => 'active',
        ]);

        return Transaction::create([
            'item_id' => $item->items_id,
            'customer_id' => $this->customer->customers_id,
            'ticket_number' => 'PT-'.uniqid(),
            'loan_amount' => 3738,
            'interest_rate' => 0.05,
            'loan_to_value_percent' => 70,
            'due_date' => self::DUE,
            'grace_period_days' => 90,
            'status' => 'active',
        ]);
    }

    /** Run the nightly job on a day counted from the due date. */
    private function runOn(int $daysAfterDue): void
    {
        Carbon::setTestNow(Carbon::parse(self::DUE.' 00:05:00')->addDays($daysAfterDue));
        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 5000])->assertSuccessful();
    }

    /** Run the nightly job every day up to and including the given one. */
    private function runEveryNightUntil(int $daysAfterDue): void
    {
        for ($day = 1; $day <= $daysAfterDue; $day++) {
            $this->runOn($day);
        }
    }

    private function redeem(Transaction $transaction)
    {
        Carbon::setTestNow(Carbon::now()->setTime(10, 0));
        Sanctum::actingAs($this->staff);

        return $this->postJson("/api/transactions/{$transaction->transactions_id}/redeem", ['payment_method' => 'Cash']);
    }

    public function test_day_30_after_the_due_date_the_item_is_overdue_and_can_be_redeemed_with_interest(): void
    {
        $transaction = $this->pawn();
        $this->runOn(30);

        $this->assertSame('overdue', $transaction->item->fresh()->status);
        $this->assertNull($transaction->fresh()->auction_notice_sent_at);

        $response = $this->redeem($transaction)->assertOk();
        // Interest keeps accruing from the pawn day (Nov 1), 91 days by Jan 31.
        $this->assertSame(91, $response->json('days_elapsed'));
        $this->assertEqualsWithDelta(3738 * 0.05 * 91 / 30, $response->json('interest'), 0.01);
        $this->assertSame('redeemed', $transaction->fresh()->status);
    }

    public function test_the_auction_notice_goes_out_7_days_before_the_period_ends_in_app_and_by_email(): void
    {
        $transaction = $this->pawn();
        $this->runOn(82);
        $this->assertNull($transaction->fresh()->auction_notice_sent_at);

        $this->runOn(83);

        $this->assertNotNull($transaction->fresh()->auction_notice_sent_at);
        $notice = Notification::where('user_id', $this->customerUser->users_id)->where('type', 'auction_notice')->firstOrFail();
        $this->assertStringContainsString('April 1, 2027', $notice->message);
        $this->assertStringContainsString('public auction', $notice->message);
        $this->assertTrue(Notification::where('user_id', $this->staff->users_id)->where('type', 'staff_auction_notice')->exists());
        Queue::assertPushed(SendAccountMail::class, fn (SendAccountMail $job) => $job->to === 'maria@example.test' && $job->mail instanceof AuctionNoticeMail);

        // Sent once per period.
        $this->runOn(84);
        $this->assertSame(1, Notification::where('user_id', $this->customerUser->users_id)->where('type', 'auction_notice')->count());
    }

    public function test_day_89_after_the_due_date_the_item_can_still_be_redeemed(): void
    {
        $transaction = $this->pawn();
        $this->runEveryNightUntil(89);

        $this->assertSame('active', $transaction->fresh()->status);
        $this->assertSame('overdue', $transaction->item->fresh()->status);
        $this->redeem($transaction)->assertOk();
        $this->assertSame('redeemed', $transaction->fresh()->status);
    }

    public function test_day_91_after_the_due_date_with_the_notice_sent_the_item_is_for_auction(): void
    {
        $transaction = $this->pawn();
        $this->runEveryNightUntil(91);

        $this->assertSame('forfeited', $transaction->fresh()->status);
        $this->assertSame('forfeited', $transaction->item->fresh()->status);
        $this->assertTrue(Notification::where('user_id', $this->customerUser->users_id)->where('type', 'forfeited')->exists());
        $this->redeem($transaction)->assertStatus(422);
    }

    public function test_without_a_notice_the_item_is_not_forfeited_until_the_notice_has_had_7_days(): void
    {
        $transaction = $this->pawn();
        // The job did not run during the period, so no notice went out.
        $this->runOn(91);

        $this->assertSame('active', $transaction->fresh()->status);
        $this->assertNotNull($transaction->fresh()->auction_notice_sent_at, 'The missed notice is sent now.');
        $this->redeem($transaction->fresh())->assertOk();
    }

    public function test_a_late_notice_holds_the_auction_back_by_the_notice_days(): void
    {
        $transaction = $this->pawn();
        $this->runOn(91);

        $this->runOn(97);
        $this->assertSame('active', $transaction->fresh()->status);

        $this->runOn(98);
        $this->assertSame('forfeited', $transaction->fresh()->status);
    }

    public function test_the_auction_result_records_the_date_and_price_and_the_item_is_sold(): void
    {
        $transaction = $this->pawn();
        $transaction->update(['status' => 'forfeited']);
        $transaction->item->update(['status' => 'forfeited']);
        Carbon::setTestNow('2027-04-20 10:00:00');
        Sanctum::actingAs($this->staff);

        $this->postJson("/api/items/{$transaction->item_id}/auction-result", ['auction_date' => '2027-04-18'])->assertStatus(422);
        $this->postJson("/api/items/{$transaction->item_id}/auction-result", ['auction_date' => '2027-05-01', 'sold_price' => 9000])->assertStatus(422);

        $this->postJson("/api/items/{$transaction->item_id}/auction-result", ['auction_date' => '2027-04-18', 'sold_price' => 9000])->assertOk();

        $item = $transaction->item->fresh();
        $this->assertSame('sold', $item->status);
        $this->assertSame('2027-04-18', $item->auction_date->toDateString());
        $this->assertEquals(9000, (float) $item->auction_price);
        $this->assertTrue(Notification::where('user_id', $this->customerUser->users_id)->where('type', 'auction_sold')->exists());
        // Only an item set for auction has a result.
        $this->postJson("/api/items/{$transaction->item_id}/auction-result", ['auction_date' => '2027-04-18', 'sold_price' => 9000])->assertStatus(422);
    }

    public function test_a_new_pawn_gets_the_grace_period_from_the_admin_setting(): void
    {
        SystemSetting::updateOrCreate(['setting_key' => 'grace_period_days'], ['setting_value' => '90']);
        Sanctum::actingAs($this->staff);

        $this->postJson('/api/transactions', [
            'customer_id' => $this->customer->customers_id,
            'group' => Item::GROUP_BULKY,
            'category' => 'aircon',
            'brand_model' => 'LG 1.5HP',
            'description' => 'Window aircon',
            'condition' => 'good',
            'interest_rate' => 6,
            'appraised_value' => 10000,
            'loan_amount' => 7000,
            'loan_to_value_percent' => 70,
            'due_date' => '2026-12-31',
            // A shorter period sent by the app is not used.
            'grace_period_days' => 7,
        ])->assertCreated();

        $this->assertSame(90, Transaction::latest('transactions_id')->first()->grace_period_days);
    }

    public function test_the_due_date_comes_from_the_shop_clock_not_the_device(): void
    {
        SystemSetting::updateOrCreate(['setting_key' => 'loan_term_days'], ['setting_value' => '60']);
        // 8:00 AM on Nov 1 in UTC is already 4:00 PM on Nov 1 in Manila.
        Sanctum::actingAs($this->staff);

        $this->postJson('/api/transactions', [
            'customer_id' => $this->customer->customers_id,
            'group' => Item::GROUP_BULKY,
            'category' => 'aircon',
            'brand_model' => 'LG 1.5HP',
            'description' => 'Window aircon',
            'condition' => 'good',
            'interest_rate' => 6,
            'appraised_value' => 10000,
            'loan_amount' => 7000,
            'loan_to_value_percent' => 70,
            // A device with a wrong clock sent a due date before the pawn date.
            'due_date' => '2026-09-11',
        ])->assertCreated();

        $this->assertSame('2026-12-31', Transaction::latest('transactions_id')->first()->due_date->toDateString());
    }

    public function test_the_migration_set_the_90_day_period_and_the_7_day_notice(): void
    {
        $this->assertSame('90', SystemSetting::where('setting_key', 'grace_period_days')->value('setting_value'));
        $this->assertSame('7', SystemSetting::where('setting_key', 'auction_notice_days')->value('setting_value'));
    }
}
