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
 * The events that write notifications, from the action that causes them.
 *
 * Each test drives the real endpoint or the real daily command, so a trigger
 * that stops firing fails here rather than going quietly missing from the bell.
 */
class NotificationTriggerTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $customerUser;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

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

        GoldPrice::create(['price_date' => today(), 'price_per_gram' => 3560, 'source' => 'manual']);
    }

    private function item(array $overrides = []): Item
    {
        return Item::create(array_merge([
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
        ], $overrides));
    }

    private function loan(Item $item, array $overrides = []): Transaction
    {
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

    public function test_recording_an_item_notifies_the_customer(): void
    {
        Sanctum::actingAs($this->staff);

        $this->postJson('/api/transactions', [
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
        ])->assertCreated();

        $notification = Notification::where('user_id', $this->customerUser->users_id)
            ->where('type', NotificationService::TYPE_CUSTOMER_ITEM_CREATED)
            ->firstOrFail();

        $this->assertStringContainsString('Your Gold ring has been recorded', $notification->message);
        $this->assertStringContainsString('Pawn amount: ₱9,000.00', $notification->message);
        $this->assertNotNull($notification->related_item_id);
    }

    public function test_a_redemption_request_notifies_staff_and_the_confirmation_notifies_the_customer(): void
    {
        $item = $this->item();
        $loan = $this->loan($item);

        Sanctum::actingAs($this->customerUser);
        $this->postJson('/api/transactions/'.$loan->transactions_id.'/ready-to-redeem')->assertOk();

        $staffRow = Notification::where('user_id', $this->staff->users_id)
            ->where('type', NotificationService::TYPE_STAFF_REDEEM_REQUEST)
            ->firstOrFail();

        $this->assertSame('Maria Cruz is ready to pick up/pay for Gold ring (Ticket #'.$loan->ticket_number.')', $staffRow->message);
        $this->assertSame($item->items_id, $staffRow->related_item_id);
        $this->assertNotNull($loan->fresh()->ready_to_redeem_at);

        Sanctum::actingAs($this->staff);
        $this->postJson('/api/transactions/'.$loan->transactions_id.'/confirm-redemption')->assertOk();

        $customerRow = Notification::where('user_id', $this->customerUser->users_id)
            ->where('type', NotificationService::TYPE_CUSTOMER_REDEEM_CONFIRMED)
            ->firstOrFail();

        $this->assertStringContainsString('Staff has confirmed your redemption request for Gold ring', $customerRow->message);
        $this->assertNotNull($loan->fresh()->redemption_confirmed_at);
    }

    public function test_a_customer_cannot_raise_a_request_on_someone_elses_loan(): void
    {
        $loan = $this->loan($this->item());

        $stranger = User::create(['name' => 'Other', 'email' => 'other@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        Customer::create([
            'user_id' => $stranger->users_id,
            'name' => 'Other Person',
            'contact_number' => '09170000001',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-2',
            'registered_by_staff_id' => $this->staff->users_id,
        ]);

        Sanctum::actingAs($stranger);

        $this->postJson('/api/transactions/'.$loan->transactions_id.'/ready-to-redeem')->assertNotFound();
        $this->assertNull($loan->fresh()->ready_to_redeem_at);
        $this->assertSame(0, Notification::where('type', NotificationService::TYPE_STAFF_REDEEM_REQUEST)->count());
    }

    public function test_completing_a_redemption_notifies_the_customer(): void
    {
        $loan = $this->loan($this->item());

        Sanctum::actingAs($this->staff);
        $this->postJson('/api/transactions/'.$loan->transactions_id.'/redeem')->assertOk();

        $this->assertStringContainsString(
            'Your payment/redemption for Gold ring is complete',
            Notification::where('user_id', $this->customerUser->users_id)
                ->where('type', NotificationService::TYPE_CUSTOMER_REDEMPTION_COMPLETE)
                ->firstOrFail()->message
        );
    }

    public function test_the_daily_job_tells_the_customer_about_an_approaching_due_date(): void
    {
        $this->loan($this->item(), ['due_date' => today()->addDays(2)]);

        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 3560])->assertSuccessful();

        $this->assertStringContainsString(
            '2 days left',
            Notification::where('user_id', $this->customerUser->users_id)
                ->where('type', NotificationService::TYPE_CUSTOMER_DUE_SOON)
                ->firstOrFail()->message
        );
    }

    public function test_the_daily_job_tells_staff_about_an_overdue_loan(): void
    {
        $loan = $this->loan($this->item(), ['due_date' => today()->subDays(2)]);

        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 3560])->assertSuccessful();

        $this->assertSame(
            'Gold ring owned by Maria Cruz (Ticket #'.$loan->ticket_number.') is overdue — 5 days left before it becomes expired/unclaimed.',
            Notification::where('user_id', $this->staff->users_id)
                ->where('type', NotificationService::TYPE_STAFF_OVERDUE)
                ->firstOrFail()->message
        );
    }

    public function test_the_daily_job_tells_both_sides_when_an_item_is_forfeited(): void
    {
        $this->loan($this->item(), ['due_date' => today()->subDays(30)]);

        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 3560])->assertSuccessful();

        $this->assertStringContainsString(
            "mark it as 'For Sale' if ready",
            Notification::where('user_id', $this->staff->users_id)
                ->where('type', NotificationService::TYPE_STAFF_FORFEITED)
                ->firstOrFail()->message
        );

        $this->assertStringContainsString(
            'is now expired/unclaimed because it is past the due date and extension period',
            Notification::where('user_id', $this->customerUser->users_id)
                ->where('type', NotificationService::TYPE_CUSTOMER_FORFEITED)
                ->firstOrFail()->message
        );
    }

    public function test_the_daily_job_flags_a_high_risk_item_to_staff_and_warns_the_customer(): void
    {
        // A loan larger than the item is worth, so the day's recomputation puts
        // the value under the loan: the high risk band.
        $this->loan($this->item(), ['loan_amount' => 99000]);

        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 3560])->assertSuccessful();

        $this->assertStringContainsString(
            'is now HIGH RISK — current value has dropped below the pawn amount.',
            Notification::where('user_id', $this->staff->users_id)
                ->where('type', NotificationService::TYPE_STAFF_HIGH_RISK)
                ->firstOrFail()->message
        );

        $this->assertStringContainsString(
            'has dropped and is now close to your pawn amount',
            Notification::where('user_id', $this->customerUser->users_id)
                ->where('type', NotificationService::TYPE_CUSTOMER_RISK_NOTICE)
                ->firstOrFail()->message
        );
    }

    public function test_a_small_daily_value_move_writes_no_message_and_a_large_one_does(): void
    {
        $item = $this->item(['appraised_value' => 13350]);
        $this->loan($item);

        // Same gold price as the item was appraised at: no move worth telling.
        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 3560])->assertSuccessful();

        $this->assertSame(0, Notification::where('type', NotificationService::TYPE_CUSTOMER_VALUE_CHANGED)->count());

        // A 20% higher gold price moves the value well past the 5% threshold.
        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 4272])->assertSuccessful();

        $this->assertStringContainsString(
            'The value of your Gold ring has changed to ₱',
            Notification::where('user_id', $this->customerUser->users_id)
                ->where('type', NotificationService::TYPE_CUSTOMER_VALUE_CHANGED)
                ->firstOrFail()->message
        );
    }

    public function test_a_repeated_daily_run_does_not_repeat_the_same_message(): void
    {
        $this->loan($this->item(), ['due_date' => today()->addDays(2)]);

        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 3560])->assertSuccessful();
        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 3560])->assertSuccessful();

        $this->assertSame(1, Notification::where('type', NotificationService::TYPE_CUSTOMER_DUE_SOON)->count());
    }
}
