<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\RiskAlert;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The staff dashboard calendar reads active pawns by due date and colours each
 * day by the worst item on it.
 */
class StaffCalendarTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-09-15 10:00:00');

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
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function pawn(string $dueDate, string $status = 'active', ?string $risk = null): Transaction
    {
        $item = Item::create([
            'customer_id' => $this->customer->customers_id,
            'staff_id' => $this->staff->users_id,
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Ring due '.$dueDate,
            'karat' => '18k',
            'weight_grams' => 5,
            'condition' => 'good',
            'appraised_value' => 13350,
            'status' => 'active',
        ]);

        if ($risk) {
            RiskAlert::create(['item_id' => $item->items_id, 'risk_level' => $risk, 'current_value' => 9000, 'loan_amount' => 9000, 'triggered_at' => now(), 'resolved' => false]);
        }

        return Transaction::create([
            'item_id' => $item->items_id,
            'customer_id' => $this->customer->customers_id,
            'ticket_number' => 'PT-'.uniqid(),
            'loan_amount' => 9000,
            'interest_rate' => 0.05,
            'loan_to_value_percent' => 70,
            'due_date' => $dueDate,
            'grace_period_days' => 7,
            'status' => $status,
        ]);
    }

    public function test_days_are_counted_and_coloured_by_the_worst_item(): void
    {
        $this->pawn('2026-09-20');
        $this->pawn('2026-09-20', risk: 'medium');
        $this->pawn('2026-09-22');
        $this->pawn('2026-09-10');                       // overdue
        $this->pawn('2026-09-25', 'redeemed');          // not active, left out
        $this->pawn('2026-10-05', risk: 'high');        // next month

        Sanctum::actingAs($this->staff);
        $response = $this->getJson('/api/calendar?month=2026-09')->assertOk();

        $days = collect($response->json('days'))->keyBy('date');
        $this->assertSame(['count' => 2, 'level' => 'medium'], collect($days['2026-09-20'])->only('count', 'level')->all());
        $this->assertSame('normal', $days['2026-09-22']['level']);
        $this->assertSame('high', $days['2026-09-10']['level']);
        $this->assertArrayNotHasKey('2026-09-25', $days->all());
        $this->assertCount(4, $response->json('items'));

        // At-risk items are listed whatever the month, high first.
        $this->assertSame(['high', 'medium'], array_column($response->json('at_risk'), 'risk'));
    }

    public function test_today_items_are_returned_for_the_default_panel(): void
    {
        $this->pawn('2026-09-15');

        Sanctum::actingAs($this->staff);
        $response = $this->getJson('/api/calendar?month=2026-11')->assertOk();

        $this->assertSame('2026-09-15', $response->json('today'));
        $this->assertCount(1, $response->json('today_items'));
        $this->assertSame(0, $response->json('today_items.0.days_left'));
        $this->assertSame([], $response->json('days'));
    }

    public function test_customers_cannot_read_the_calendar(): void
    {
        Sanctum::actingAs(User::where('role', 'customer')->first());
        $this->getJson('/api/calendar')->assertForbidden();
    }

    public function test_month_must_be_year_and_month(): void
    {
        Sanctum::actingAs($this->staff);
        $this->getJson('/api/calendar?month=2026-9-1')->assertUnprocessable();
    }
}
