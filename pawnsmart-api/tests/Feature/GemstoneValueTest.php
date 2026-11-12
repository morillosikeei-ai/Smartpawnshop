<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\ItemValueLog;
use App\Models\RiskAlert;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Jewelry with a gemstone or diamond is worth its gold plus the staff's own
 * estimate for the stone. Only the gold portion follows the gold price.
 */
class GemstoneValueTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $customerUser = User::create(['name' => 'Maria Cruz', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $this->customer = Customer::create([
            'user_id' => $customerUser->users_id,
            'name' => 'Maria Cruz',
            'contact_number' => '09170000000',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-1',
            'registered_by_staff_id' => $staff->users_id,
        ]);

        // 5 g of 18k at 3,560/g is a 13,350 gold value.
        GoldPrice::create(['price_date' => today(), 'price_per_gram' => 3560, 'source' => 'manual']);
        Sanctum::actingAs($staff);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'customer_id' => $this->customer->customers_id,
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Diamond ring',
            'karat' => '18k',
            'weight_grams' => 5,
            'condition' => 'good',
            'loan_amount' => 9000,
            'loan_to_value_percent' => 70,
            'due_date' => today()->addDays(60)->toDateString(),
            'grace_period_days' => 7,
        ], $overrides);
    }

    public function test_a_gemstone_is_stored_and_added_to_the_gold_value(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'has_gemstone' => true,
            'gemstone_value' => 5000,
            'gemstone_details' => '0.5 carat, round cut',
            'loan_amount' => 15000,
        ]))
            ->assertCreated()
            ->assertJsonPath('item.has_gemstone', true)
            ->assertJsonPath('item.gemstone_value', '5000.00')
            ->assertJsonPath('item.gemstone_details', '0.5 carat, round cut')
            ->assertJsonPath('item.appraised_value', '13350.00')
            ->assertJsonPath('item.total_value', 18350);
    }

    public function test_without_a_gemstone_the_loan_is_capped_at_the_gold_value(): void
    {
        $this->postJson('/api/transactions', $this->payload(['loan_amount' => 15000]))
            ->assertStatus(422)->assertJsonValidationErrors('loan_amount');

        $this->postJson('/api/transactions', $this->payload())
            ->assertCreated()
            ->assertJsonPath('item.has_gemstone', false)
            ->assertJsonPath('item.gemstone_value', null)
            ->assertJsonPath('item.total_value', 13350);
    }

    public function test_the_gemstone_type_is_stored_beside_the_details(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'has_gemstone' => true,
            'gemstone_value' => 5000,
            'gemstone_type' => 'ruby',
            'gemstone_details' => '0.3 carat, oval cut',
            'loan_amount' => 15000,
        ]))
            ->assertCreated()
            ->assertJsonPath('item.gemstone_type', 'ruby')
            ->assertJsonPath('item.gemstone_details', '0.3 carat, oval cut');
    }

    public function test_a_typed_gemstone_type_outside_the_list_is_kept(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'has_gemstone' => true,
            'gemstone_value' => 5000,
            'gemstone_type' => ' Topaz ',
            'loan_amount' => 15000,
        ]))
            ->assertCreated()
            ->assertJsonPath('item.gemstone_type', 'Topaz');
    }

    public function test_a_gemstone_type_longer_than_50_characters_is_rejected(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'has_gemstone' => true,
            'gemstone_value' => 5000,
            'gemstone_type' => str_repeat('a', 51),
        ]))->assertStatus(422)->assertJsonValidationErrors('gemstone_type');
    }

    public function test_without_a_gemstone_the_type_is_not_stored(): void
    {
        $this->postJson('/api/transactions', $this->payload(['gemstone_type' => 'diamond']))
            ->assertCreated()
            ->assertJsonPath('item.gemstone_type', null);
    }

    public function test_a_ticked_gemstone_needs_a_value(): void
    {
        $this->postJson('/api/transactions', $this->payload(['has_gemstone' => true]))
            ->assertStatus(422)->assertJsonValidationErrors('gemstone_value');
    }

    public function test_non_jewelry_never_stores_a_gemstone(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'group' => Item::GROUP_BULKY,
            'category' => 'laptop',
            'karat' => null,
            'weight_grams' => null,
            'brand_model' => 'Lenovo',
            'appraised_value' => 10000,
            'has_gemstone' => true,
            'gemstone_value' => 5000,
            'loan_amount' => 12000,
        ]))->assertStatus(422)->assertJsonValidationErrors('loan_amount');

        $this->assertDatabaseCount('items', 0);
    }

    public function test_the_daily_job_recomputes_only_the_gold_and_keeps_the_gemstone(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'has_gemstone' => true,
            'gemstone_value' => 5000,
            'loan_amount' => 12000,
        ]))->assertCreated();

        // At 2,000/g the gold is worth 7,500. Gold alone would sit far below
        // the 12,000 loan, but with the 5,000 stone the item is worth 12,500.
        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 2000])->assertSuccessful();

        $item = Item::firstOrFail();
        $this->assertSame('7500.00', $item->appraised_value);
        $this->assertSame('5000.00', $item->gemstone_value);
        $this->assertSame(12500.0, $item->totalValue());
        $this->assertEquals(12500, (float) ItemValueLog::where('item_id', $item->items_id)->value('computed_value'));
        $this->assertFalse(RiskAlert::where('item_id', $item->items_id)->where('risk_level', 'high')->exists());
    }

    public function test_a_natural_diamond_is_valued_from_its_carats_and_the_reference_price(): void
    {
        \App\Models\SystemSetting::updateOrCreate(['setting_key' => 'natural_diamond_1ct_price'], ['setting_value' => '43653.32']);

        // 0.5 ct x 43,653.32 = 21,826.66, on top of the 13,350 gold value.
        $this->postJson('/api/transactions', $this->payload([
            'has_gemstone' => true,
            'gemstone_type' => 'natural_diamond',
            'gemstone_weight' => 0.5,
            'loan_amount' => 20000,
        ]))
            ->assertCreated()
            ->assertJsonPath('item.gemstone_type', 'natural_diamond')
            ->assertJsonPath('item.gemstone_weight', '0.500')
            ->assertJsonPath('item.gemstone_value', '21826.66')
            ->assertJsonPath('item.total_value', 35176.66);
    }

    public function test_a_pearl_is_valued_from_its_grams_and_the_staff_value_wins_when_sent(): void
    {
        \App\Models\SystemSetting::updateOrCreate(['setting_key' => 'pearl_price_per_gram'], ['setting_value' => '112.62']);

        // 10 g x 112.62 = 1,126.20.
        $this->postJson('/api/transactions', $this->payload([
            'has_gemstone' => true, 'gemstone_type' => 'pearl', 'gemstone_weight' => 10,
        ]))->assertCreated()->assertJsonPath('item.gemstone_value', '1126.20');

        // Staff changed the suggested value: theirs is kept.
        $this->postJson('/api/transactions', $this->payload([
            'has_gemstone' => true, 'gemstone_type' => 'pearl', 'gemstone_weight' => 10, 'gemstone_value' => 1500,
        ]))->assertCreated()->assertJsonPath('item.gemstone_value', '1500.00');
    }

    public function test_a_reference_price_of_zero_needs_the_staff_value(): void
    {
        \App\Models\SystemSetting::updateOrCreate(['setting_key' => 'pearl_price_per_gram'], ['setting_value' => '0']);

        $this->postJson('/api/transactions', $this->payload([
            'has_gemstone' => true, 'gemstone_type' => 'pearl', 'gemstone_weight' => 10,
        ]))->assertStatus(422)->assertJsonValidationErrors('gemstone_value');
    }

    public function test_a_pure_natural_diamond_with_no_metal_is_valued_from_the_stone_alone(): void
    {
        \App\Models\SystemSetting::updateOrCreate(['setting_key' => 'natural_diamond_1ct_price'], ['setting_value' => '43653.32']);

        // 1 ct loose diamond: 43,653.32, no karat and no metal weight.
        $response = $this->postJson('/api/transactions', $this->payload([
            'metal_type' => 'none',
            'karat' => null,
            'weight_grams' => null,
            'has_gemstone' => true,
            'gemstone_type' => 'natural_diamond',
            'gemstone_weight' => 1,
            'loan_amount' => 30000,
        ]))
            ->assertCreated()
            ->assertJsonPath('item.metal_type', 'none')
            ->assertJsonPath('item.karat', null)
            ->assertJsonPath('item.weight_grams', null)
            ->assertJsonPath('item.gemstone_value', '43653.32')
            ->assertJsonPath('item.total_value', 43653.32);

        // The daily price job leaves it alone: no metal to follow the price.
        GoldPrice::create(['price_date' => today()->addDay(), 'price_per_gram' => 9999, 'source' => 'manual']);
        $this->artisan('pawnshop:daily-lifecycle');
        $item = Item::find($response->json('item.items_id'));
        $this->assertSame(43653.32, $item->totalValue());
    }

    public function test_a_stone_only_item_needs_its_gemstone(): void
    {
        $this->postJson('/api/transactions', $this->payload([
            'metal_type' => 'none', 'karat' => null, 'weight_grams' => null, 'loan_amount' => 100,
        ]))->assertStatus(422)->assertJsonValidationErrors('has_gemstone');
    }
}
