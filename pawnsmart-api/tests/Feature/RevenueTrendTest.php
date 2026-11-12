<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The admin dashboard's revenue: what was actually collected at the counter,
 * counted on the shop's (Manila) day.
 */
class RevenueTrendTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-10 10:00:00');
        $this->admin = User::create(['name' => 'Admin', 'email' => 'admin@example.test', 'password' => 'secret-password', 'role' => 'admin', 'status' => 'active']);
        $customerUser = User::create(['name' => 'Maria Cruz', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $this->customer = Customer::create(['user_id' => $customerUser->users_id, 'name' => 'Maria Cruz', 'contact_number' => '0917', 'valid_id_type' => 'UMID', 'valid_id_number' => 'X', 'registered_by_staff_id' => $this->admin->users_id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function redeemed(string $redeemedAtUtc, ?float $collected): Transaction
    {
        $item = Item::create(['customer_id' => $this->customer->customers_id, 'staff_id' => $this->admin->users_id, 'group' => Item::GROUP_BULKY, 'category' => 'television', 'description' => 'TV', 'condition' => 'good', 'appraised_value' => 10000, 'status' => 'redeemed']);
        $transaction = Transaction::create(['item_id' => $item->items_id, 'customer_id' => $this->customer->customers_id, 'ticket_number' => 'PT-'.uniqid(), 'loan_amount' => 7000, 'interest_rate' => 0.05, 'loan_to_value_percent' => 70, 'due_date' => '2026-12-31', 'grace_period_days' => 90, 'status' => 'redeemed', 'redeemed_at' => $redeemedAtUtc, 'amount_collected' => $collected]);
        $transaction->forceFill(['created_at' => '2026-10-01 10:00:00'])->save();

        return $transaction;
    }

    public function test_revenue_is_what_was_collected_on_the_shop_day(): void
    {
        // 7:30 AM in Manila on Nov 10 is 11:30 PM on Nov 9 in UTC.
        $this->redeemed('2026-11-09 23:30:00', 7000);
        // An older redemption saved before the amount was recorded.
        $older = $this->redeemed('2026-11-08 03:00:00', null);
        Sanctum::actingAs($this->admin);

        $response = $this->getJson('/api/dashboard/admin')->assertOk();

        $trend = collect($response->json('revenue_trend'))->pluck('revenue', 'date');
        $this->assertEquals(7000, $trend['2026-11-10'], 'Counted on the Manila day, at the amount collected.');
        $this->assertEquals(0, $trend['2026-11-09']);
        $this->assertEquals($older->totalPayable(), $trend['2026-11-08']);
        $this->assertEquals(7000, $response->json('stats.revenue_today'));
    }
}
