<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Photos taken at intake are stored on the item and returned as photo_urls,
 * so the customer portal and the staff screens can show them.
 */
class ItemPhotoTest extends TestCase
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

        GoldPrice::create(['price_date' => today(), 'price_per_gram' => 3560, 'source' => 'manual']);
        Sanctum::actingAs($staff);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
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
        ], $overrides);
    }

    private function photo(string $marker, int $padding = 20): string
    {
        return 'data:image/jpeg;base64,'.$marker.str_repeat('A', $padding);
    }

    public function test_intake_photos_are_stored_in_order_and_returned_as_photo_urls(): void
    {
        $photos = [$this->photo('front'), $this->photo('back')];

        $this->postJson('/api/transactions', $this->payload(['photos' => $photos]))
            ->assertCreated()
            ->assertJsonPath('item.photo_urls', $photos)
            ->assertJsonMissingPath('item.photo_path');

        $this->assertSame($photos, Item::firstOrFail()->photo_urls);
    }

    public function test_an_item_without_photos_has_an_empty_list(): void
    {
        $this->postJson('/api/transactions', $this->payload())
            ->assertCreated()
            ->assertJsonPath('item.photo_urls', []);
    }

    public function test_an_older_single_photo_path_reads_as_a_list_of_one(): void
    {
        $item = new Item(['photo_path' => 'https://example.test/ring.jpg']);

        $this->assertSame(['https://example.test/ring.jpg'], $item->photo_urls);
    }

    public function test_only_image_data_urls_are_accepted(): void
    {
        $this->postJson('/api/transactions', $this->payload(['photos' => ['https://example.test/ring.jpg']]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('photos.0');
    }

    public function test_too_many_photos_are_refused(): void
    {
        $photos = array_map(fn ($index) => $this->photo("p{$index}"), range(1, Item::MAX_PHOTOS + 1));

        $this->postJson('/api/transactions', $this->payload(['photos' => $photos]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('photos');
    }

    public function test_photos_too_large_together_are_refused_with_a_clear_message(): void
    {
        $photos = array_map(fn ($index) => $this->photo("p{$index}", 250000), range(1, 4));

        $this->postJson('/api/transactions', $this->payload(['photos' => $photos]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photos' => 'too large together']);

        $this->assertSame(0, Item::count());
    }
}
