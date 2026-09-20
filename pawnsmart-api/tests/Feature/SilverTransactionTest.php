<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\SilverPrice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Silver jewelry on a new pawn transaction: stored as metal_type silver with
 * its fineness (800, 925, 950, 999) in the fineness column, karat left empty,
 * and valued from silver_prices instead of gold_prices.
 */
class SilverTransactionTest extends TestCase
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

        GoldPrice::create(['price_date' => today(), 'price_per_gram' => 4000, 'source' => 'manual']);
        SilverPrice::create(['price_date' => today(), 'price_per_gram' => 70, 'source' => 'manual']);
        Sanctum::actingAs($this->staff);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'customer_id' => $this->customer->customers_id,
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Plain band',
            'karat' => '18k',
            'weight_grams' => 10,
            'condition' => 'good',
            'loan_amount' => 100,
            'loan_to_value_percent' => 70,
            'due_date' => today()->addDays(60)->toDateString(),
            'grace_period_days' => 7,
        ], $overrides);
    }

    public function test_a_silver_925_item_is_saved_in_fineness_and_valued_from_the_silver_price(): void
    {
        $this->postJson('/api/transactions', $this->payload(['metal_type' => 'silver', 'karat' => null, 'fineness' => '925']))->assertCreated();

        $item = Item::firstOrFail();
        $this->assertSame('silver', $item->metal_type);
        $this->assertSame('925', $item->fineness);
        $this->assertNull($item->karat);
        $this->assertEquals(10 * 0.925 * 70, (float) $item->appraised_value);
        $this->assertEquals(0.925, $item->karatPurityPercent());
    }

    public function test_every_silver_fineness_saves(): void
    {
        foreach (['800' => 0.8, '925' => 0.925, '950' => 0.95, '999' => 0.999] as $fineness => $purity) {
            $response = $this->postJson('/api/transactions', $this->payload(['metal_type' => 'silver', 'karat' => null, 'fineness' => (string) $fineness]))->assertCreated();

            $item = Item::findOrFail($response->json('item_id'));
            $this->assertSame((string) $fineness, $item->fineness);
            $this->assertNull($item->karat);
            $this->assertEquals(round(10 * $purity * 70, 2), (float) $item->appraised_value);
        }
    }

    public function test_an_older_client_sending_silver_fineness_as_karat_still_saves_it_in_fineness(): void
    {
        $this->postJson('/api/transactions', $this->payload(['metal_type' => 'silver', 'karat' => '925']))->assertCreated();

        $item = Item::firstOrFail();
        $this->assertSame('925', $item->fineness);
        $this->assertNull($item->karat);
    }

    public function test_a_gold_18k_item_keeps_its_karat_and_no_fineness(): void
    {
        $this->postJson('/api/transactions', $this->payload(['karat' => '18k', 'fineness' => '925']))->assertCreated();

        $item = Item::firstOrFail();
        $this->assertSame('gold', $item->metal_type);
        $this->assertSame('18k', $item->karat);
        $this->assertNull($item->fineness);
        $this->assertEquals(10 * 0.75 * 4000, (float) $item->appraised_value);
    }

    public function test_gold_22k_is_accepted(): void
    {
        $this->postJson('/api/transactions', $this->payload(['karat' => '22k']))->assertCreated();

        $item = Item::firstOrFail();
        $this->assertSame('22k', $item->karat);
        $this->assertEquals(10 * 0.917 * 4000, (float) $item->appraised_value);
    }

    public function test_gold_stays_the_default(): void
    {
        $this->postJson('/api/transactions', $this->payload())->assertCreated();

        $item = Item::firstOrFail();
        $this->assertSame('gold', $item->metal_type);
        $this->assertEquals(10 * 0.75 * 4000, (float) $item->appraised_value);
    }

    public function test_a_purity_from_the_other_metal_is_rejected(): void
    {
        $this->postJson('/api/transactions', $this->payload(['metal_type' => 'silver', 'karat' => '18k']))
            ->assertUnprocessable()->assertJsonValidationErrors('fineness');

        $this->postJson('/api/transactions', $this->payload(['karat' => '999']))
            ->assertUnprocessable()->assertJsonValidationErrors('karat');
    }

    public function test_silver_prices_are_listed_and_on_the_dashboard(): void
    {
        $this->getJson('/api/silver-prices')->assertOk()->assertJsonPath('0.price_per_gram', '70.00');
        $this->getJson('/api/dashboard/staff')->assertOk()->assertJsonPath('silver_prices.0.price_per_gram', '70.00');
    }
}
