<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemReservation;
use App\Models\Notification;
use App\Models\ShopClosure;
use App\Models\User;
use App\Services\ReservationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Customers hold an item for sale for two open days, one customer per item,
 * at most two items per customer.
 */
class ItemReservationTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $customerUser;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        // Monday 2026-10-12, 10:00 in Manila (02:00 UTC). The shop's default
        // week is Monday to Saturday, closing at 18:00.
        Carbon::setTestNow(Carbon::parse('2026-10-12 10:00', ReservationService::SHOP_TIMEZONE)->utc());

        $this->staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        [$this->customerUser, $this->customer] = $this->makeCustomer('maria');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function makeCustomer(string $name): array
    {
        $user = User::create(['name' => ucfirst($name), 'email' => $name.'@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $customer = Customer::create([
            'user_id' => $user->users_id,
            'name' => ucfirst($name),
            'contact_number' => '09170000000',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-'.$name,
            'registered_by_staff_id' => $this->staff->users_id,
        ]);

        return [$user, $customer];
    }

    private function saleItem(string $status = 'for_sale'): Item
    {
        return Item::create([
            'customer_id' => $this->customer->customers_id,
            'staff_id' => $this->staff->users_id,
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Gold ring',
            'karat' => '18k',
            'weight_grams' => 5,
            'condition' => 'good',
            'appraised_value' => 13350,
            'sale_price' => 9000,
            'status' => $status,
        ]);
    }

    private function inManila(string $time): Carbon
    {
        return Carbon::parse($time, ReservationService::SHOP_TIMEZONE)->utc();
    }

    public function test_hold_lasts_until_closing_on_the_second_open_day(): void
    {
        $service = app(ReservationService::class);

        // Monday morning: Monday and Tuesday count.
        $this->assertTrue($service->holdUntil()->equalTo($this->inManila('2026-10-13 18:00')));

        // Monday after closing: Tuesday and Wednesday.
        $this->assertTrue($service->holdUntil($this->inManila('2026-10-12 19:00'))->equalTo($this->inManila('2026-10-14 18:00')));

        // Saturday morning: Saturday, then Sunday is skipped, then Monday.
        $this->assertTrue($service->holdUntil($this->inManila('2026-10-17 10:00'))->equalTo($this->inManila('2026-10-19 18:00')));
    }

    public function test_hold_skips_announced_closures(): void
    {
        ShopClosure::create(['closure_date' => '2026-10-13', 'label' => 'Holiday', 'kind' => 'closed']);

        $this->assertTrue(app(ReservationService::class)->holdUntil()->equalTo($this->inManila('2026-10-14 18:00')));
    }

    public function test_customer_reserves_an_item_and_staff_are_told(): void
    {
        $item = $this->saleItem();
        Sanctum::actingAs($this->customerUser);

        $this->postJson("/api/items/{$item->items_id}/reserve")
            ->assertCreated()
            ->assertJsonPath('status', 'active');

        $this->assertTrue(Notification::where('user_id', $this->staff->users_id)->where('type', 'staff_item_reserved')->exists());

        $listed = $this->getJson('/api/items/for-sale')->assertOk()->json();
        $this->assertNotNull($listed[0]['reserved_until']);
    }

    public function test_an_item_cannot_be_reserved_twice(): void
    {
        $item = $this->saleItem();
        [$otherUser] = $this->makeCustomer('juan');

        Sanctum::actingAs($this->customerUser);
        $this->postJson("/api/items/{$item->items_id}/reserve")->assertCreated();

        Sanctum::actingAs($otherUser);
        $this->postJson("/api/items/{$item->items_id}/reserve")->assertUnprocessable();
    }

    public function test_a_customer_holds_at_most_two_items(): void
    {
        $items = [$this->saleItem(), $this->saleItem(), $this->saleItem()];
        Sanctum::actingAs($this->customerUser);

        $this->postJson("/api/items/{$items[0]->items_id}/reserve")->assertCreated();
        $this->postJson("/api/items/{$items[1]->items_id}/reserve")->assertCreated();
        $this->postJson("/api/items/{$items[2]->items_id}/reserve")->assertUnprocessable();
    }

    public function test_only_items_for_sale_can_be_reserved(): void
    {
        $item = $this->saleItem('forfeited');
        Sanctum::actingAs($this->customerUser);

        $this->postJson("/api/items/{$item->items_id}/reserve")->assertUnprocessable();
    }

    public function test_staff_cannot_reserve(): void
    {
        $item = $this->saleItem();
        Sanctum::actingAs($this->staff);

        $this->postJson("/api/items/{$item->items_id}/reserve")->assertForbidden();
    }

    public function test_customer_cancels_own_hold_but_not_someone_elses(): void
    {
        $item = $this->saleItem();
        [$otherUser] = $this->makeCustomer('juan');
        Sanctum::actingAs($this->customerUser);
        $id = $this->postJson("/api/items/{$item->items_id}/reserve")->json('item_reservations_id');

        Sanctum::actingAs($otherUser);
        $this->postJson("/api/reservations/{$id}/cancel")->assertForbidden();

        Sanctum::actingAs($this->customerUser);
        $this->postJson("/api/reservations/{$id}/cancel")->assertOk()->assertJsonPath('status', 'cancelled');
        $this->assertNull($this->getJson('/api/items/for-sale')->json('0.reserved_until'));
    }

    public function test_staff_cancel_tells_the_customer(): void
    {
        $item = $this->saleItem();
        Sanctum::actingAs($this->customerUser);
        $id = $this->postJson("/api/items/{$item->items_id}/reserve")->json('item_reservations_id');

        Sanctum::actingAs($this->staff);
        $this->assertCount(1, $this->getJson('/api/reservations')->assertOk()->json());
        $this->postJson("/api/reservations/{$id}/cancel")->assertOk();

        $this->assertTrue(Notification::where('user_id', $this->customerUser->users_id)->where('type', 'reservation_cancelled')->exists());
    }

    public function test_marking_sold_claims_the_hold(): void
    {
        $item = $this->saleItem();
        Sanctum::actingAs($this->customerUser);
        $id = $this->postJson("/api/items/{$item->items_id}/reserve")->json('item_reservations_id');

        Sanctum::actingAs($this->staff);
        $this->postJson("/api/items/{$item->items_id}/sold")->assertOk();

        $this->assertSame('claimed', ItemReservation::find($id)->status);
    }

    public function test_expired_holds_free_the_item_and_tell_the_customer(): void
    {
        $item = $this->saleItem();
        Sanctum::actingAs($this->customerUser);
        $id = $this->postJson("/api/items/{$item->items_id}/reserve")->json('item_reservations_id');

        // Past Tuesday's closing time: the hold no longer counts, even before the command runs.
        Carbon::setTestNow($this->inManila('2026-10-13 18:30'));
        $this->assertNull($this->getJson('/api/items/for-sale')->json('0.reserved_until'));

        $this->artisan('reservations:expire')->assertSuccessful();

        $this->assertSame('expired', ItemReservation::find($id)->status);
        $this->assertTrue(Notification::where('user_id', $this->customerUser->users_id)->where('type', 'reservation_expired')->exists());
    }
}
