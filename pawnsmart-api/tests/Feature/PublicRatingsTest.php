<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Feedback;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The landing page shows the shop's rating to anyone, so it carries the
 * figures and a few good reviews, and nothing that points at a person.
 */
class PublicRatingsTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
    }

    private function rate(string $name, int $rating, ?string $comment): void
    {
        $user = User::create(['name' => $name, 'email' => md5($name).'@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $customer = Customer::create([
            'user_id' => $user->users_id,
            'name' => $name,
            'contact_number' => '09170000000',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-'.$name,
            'registered_by_staff_id' => $this->staff->users_id,
        ]);
        $item = Item::create([
            'customer_id' => $customer->customers_id,
            'staff_id' => $this->staff->users_id,
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Ring of '.$name,
            'karat' => '18k',
            'weight_grams' => 5,
            'condition' => 'good',
            'appraised_value' => 13350,
        ]);
        $transaction = Transaction::create([
            'ticket_number' => 'PT-'.md5($name),
            'item_id' => $item->items_id,
            'customer_id' => $customer->customers_id,
            'staff_id' => $this->staff->users_id,
            'loan_amount' => 9000,
            'interest_rate' => 0.05,
            'loan_to_value_percent' => 70,
            'due_date' => now()->addDays(30)->toDateString(),
            'grace_period_days' => 7,
            'status' => 'redeemed',
        ]);
        Feedback::create(['transaction_id' => $transaction->transactions_id, 'customer_id' => $customer->customers_id, 'rating' => $rating, 'comment' => $comment]);
    }

    public function test_anyone_sees_the_summary_and_only_good_reviews_with_initials(): void
    {
        $this->rate('Maria Dela Cruz', 5, 'Fast and fair appraisal.');
        $this->rate('Juan Santos', 4, 'Friendly staff.');
        $this->rate('Pedro Reyes', 2, 'Long wait.');
        $this->rate('Ana Lim', 5, null);

        $response = $this->getJson('/api/ratings')->assertOk();

        $response->assertJsonPath('total', 4)
            ->assertJsonPath('average_rating', 4)
            ->assertJsonPath('rating_counts.5', 2)
            ->assertJsonPath('rating_counts.2', 1);

        $reviews = $response->json('reviews');
        $this->assertCount(2, $reviews);
        $this->assertSame(['J. S.', 'M. C.'], array_column($reviews, 'initials'));

        // No name, ticket, or item anywhere in the public answer.
        $body = $response->getContent();
        foreach (['Maria', 'Dela Cruz', 'Juan', 'Santos', 'Pedro', 'Long wait', 'PT-', 'Ring of'] as $private) {
            $this->assertStringNotContainsString($private, $body);
        }
    }

    public function test_no_ratings_yet(): void
    {
        $this->getJson('/api/ratings')->assertOk()->assertJsonPath('total', 0)->assertJsonPath('average_rating', null)->assertJsonPath('reviews', []);
    }
}
