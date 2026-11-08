<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Once;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Interest is charged on at least minimum_interest_days (default 30), even for
 * a pawn redeemed the same day, and the redemption, the portals and the GCash
 * renewal all charge the same amount.
 *
 * The loan is ₱3,738 at 5% a month: one month of interest is ₱186.90.
 */
class MinimumInterestTest extends TestCase
{
    use RefreshDatabase;

    private const PAWNED_AT = '2026-09-01 10:00:00';

    private User $staff;
    private User $customerUser;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(self::PAWNED_AT);
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
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Ring stone',
            'karat' => '18k',
            'weight_grams' => 2,
            'condition' => 'good',
            'appraised_value' => 5340,
            'status' => 'active',
        ]);

        return Transaction::create([
            'item_id' => $item->items_id,
            'customer_id' => $this->customer->customers_id,
            'ticket_number' => 'PT-'.uniqid(),
            'loan_amount' => 3738,
            'interest_rate' => 0.05,
            'loan_to_value_percent' => 70,
            'due_date' => '2026-10-31',
            'grace_period_days' => 7,
            'status' => 'active',
        ]);
    }

    /** @return array<string, array{int, int, float, float}> days held, days charged, interest, total */
    public static function redemptions(): array
    {
        return [
            'same day' => [0, 30, 186.90, 3924.90],
            'after 2 days' => [2, 30, 186.90, 3924.90],
            'after 15 days' => [15, 30, 186.90, 3924.90],
            'after 30 days' => [30, 30, 186.90, 3924.90],
            'after 45 days' => [45, 45, 280.35, 4018.35],
        ];
    }

    #[DataProvider('redemptions')]
    public function test_redemption_charges_at_least_the_minimum(int $daysHeld, int $daysCharged, float $interest, float $total): void
    {
        $transaction = $this->pawn();
        Carbon::setTestNow(Carbon::parse(self::PAWNED_AT)->addDays($daysHeld));
        Sanctum::actingAs($this->staff);

        $response = $this->postJson("/api/transactions/{$transaction->transactions_id}/redeem", ['payment_method' => 'Cash'])->assertOk();

        $response->assertJsonPath('days_elapsed', $daysHeld);
        $response->assertJsonPath('interest_days', $daysCharged);
        $this->assertEqualsWithDelta($interest, $response->json('interest'), 0.001);
        $this->assertEqualsWithDelta($total, $response->json('total_payable'), 0.001);
        // Collected defaults to the total payable, and the closed record keeps it.
        $this->assertEqualsWithDelta($total, (float) $transaction->fresh()->amount_collected, 0.001);
        $this->assertEqualsWithDelta($total, $transaction->fresh()->totalPayable(), 0.001);
    }

    public function test_the_portal_and_the_gcash_renewal_charge_what_the_counter_charges(): void
    {
        $transaction = $this->pawn();
        Carbon::setTestNow(Carbon::parse(self::PAWNED_AT)->addDays(2));
        Sanctum::actingAs($this->customerUser);

        $listed = collect($this->getJson('/api/transactions')->assertOk()->json())->firstWhere('transactions_id', $transaction->transactions_id);
        $this->assertSame(2, $listed['days_elapsed']);
        $this->assertSame(30, $listed['interest_days']);
        $this->assertEqualsWithDelta(186.90, $listed['interest_due'], 0.001);
        $this->assertEqualsWithDelta(3924.90, $listed['total_payable'], 0.001);

        $renewal = $this->getJson("/api/transactions/{$transaction->transactions_id}/renew-online")->assertOk();
        $this->assertEqualsWithDelta(186.90, $renewal->json('interest_due'), 0.001);
        $this->assertSame(30, $renewal->json('interest_days'));
    }

    public function test_the_admin_setting_changes_the_minimum_everywhere(): void
    {
        $transaction = $this->pawn();
        SystemSetting::updateOrCreate(['setting_key' => Transaction::MINIMUM_INTEREST_DAYS_KEY], ['setting_value' => '0']);
        Once::flush();
        Carbon::setTestNow(Carbon::parse(self::PAWNED_AT)->addDays(2));

        // With no minimum, two days cost 3738 x 0.05 x 2/30.
        $this->assertEqualsWithDelta(12.46, $transaction->fresh()->interestDue(), 0.001);
    }

    public function test_the_admin_can_only_save_whole_days(): void
    {
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@example.test', 'password' => 'secret-password', 'role' => 'admin', 'status' => 'active']));

        $this->putJson('/api/system-settings', ['setting_key' => 'minimum_interest_days', 'setting_value' => 'abc'])->assertStatus(422);
        $this->putJson('/api/system-settings', ['setting_key' => 'minimum_interest_days', 'setting_value' => '-5'])->assertStatus(422);
        $this->putJson('/api/system-settings', ['setting_key' => 'minimum_interest_days', 'setting_value' => '15'])->assertOk();

        $this->assertSame('15', SystemSetting::where('setting_key', 'minimum_interest_days')->value('setting_value'));
    }

    public function test_the_migration_adds_the_setting_with_30_days(): void
    {
        $this->assertSame('30', SystemSetting::where('setting_key', 'minimum_interest_days')->value('setting_value'));
    }
}
