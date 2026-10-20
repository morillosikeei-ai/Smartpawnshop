<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Staff keep a face reference for a customer, with consent, and record how a
 * claimant's face compared at redemption. The reference never reaches a
 * customer.
 */
class CustomerFaceTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $customerUser;
    private Customer $customer;

    private const PHOTO = 'data:image/jpeg;base64,AAAA';

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
    }

    private function descriptor(): array
    {
        return array_fill(0, 128, 0.05);
    }

    public function test_staff_enroll_a_face_with_consent(): void
    {
        Sanctum::actingAs($this->staff);

        $this->putJson("/api/customers/{$this->customer->customers_id}/face", [
            'face_photo' => self::PHOTO,
            'face_descriptor' => $this->descriptor(),
            'consent' => true,
            'id_match' => 'match',
        ])->assertOk()->assertJsonPath('has_face_reference', true)->assertJsonMissingPath('face_photo');

        $face = $this->getJson("/api/customers/{$this->customer->customers_id}/face")->assertOk();
        $this->assertSame(self::PHOTO, $face->json('face_photo'));
        $this->assertCount(128, $face->json('face_descriptor'));
        $this->assertTrue(AuditLog::where('action', 'like', 'Enrolled face reference%')->exists());
    }

    public function test_enrolling_needs_consent_and_a_full_descriptor(): void
    {
        Sanctum::actingAs($this->staff);
        $url = "/api/customers/{$this->customer->customers_id}/face";

        $this->putJson($url, ['face_photo' => self::PHOTO, 'face_descriptor' => $this->descriptor()])->assertUnprocessable();
        $this->putJson($url, ['face_photo' => self::PHOTO, 'face_descriptor' => [0.1, 0.2], 'consent' => true])->assertUnprocessable();
        $this->putJson($url, ['face_photo' => 'not an image', 'face_descriptor' => $this->descriptor(), 'consent' => true])->assertUnprocessable();
    }

    public function test_customers_never_receive_the_face_reference(): void
    {
        $this->customer->forceFill(['face_photo' => self::PHOTO, 'face_descriptor' => $this->descriptor(), 'face_enrolled_at' => now()])->save();

        Sanctum::actingAs($this->customerUser);
        $this->getJson("/api/customers/{$this->customer->customers_id}/face")->assertForbidden();

        $me = $this->getJson('/api/me')->assertOk();
        $this->assertStringNotContainsString(self::PHOTO, $me->getContent());
        $this->assertStringNotContainsString('face_descriptor', $me->getContent());
    }

    public function test_id_photo_is_sent_as_a_link_and_survives_a_save_with_that_link(): void
    {
        $idPhoto = 'data:image/jpeg;base64,'.base64_encode('id-card-pixels');
        $this->customer->forceFill(['valid_id_photo' => $idPhoto])->save();
        Sanctum::actingAs($this->staff);

        $link = collect($this->getJson('/api/customers')->assertOk()->json())->firstWhere('customers_id', $this->customer->customers_id)['valid_id_photo'];
        $this->assertStringStartsWith('/api/media/customers/', $link);
        $this->assertSame('id-card-pixels', $this->get($link)->assertOk()->getContent());

        // The staff form sends back the link it was given when the photo did not change.
        $this->putJson("/api/customers/{$this->customer->customers_id}", [
            'name' => 'Maria Cruz', 'contact_number' => '09171111111', 'address' => '', 'valid_id_type' => 'UMID', 'valid_id_number' => 'X-1', 'valid_id_photo' => $link,
        ])->assertOk();

        $this->assertSame($idPhoto, $this->customer->fresh()->getRawOriginal('valid_id_photo'));
        // The face check still gets the image itself.
        $this->assertSame($idPhoto, $this->getJson("/api/customers/{$this->customer->customers_id}/face")->json('valid_id_photo'));
    }

    public function test_staff_remove_a_face_reference(): void
    {
        $this->customer->forceFill(['face_photo' => self::PHOTO, 'face_descriptor' => $this->descriptor(), 'face_enrolled_at' => now()])->save();
        Sanctum::actingAs($this->staff);

        $this->deleteJson("/api/customers/{$this->customer->customers_id}/face")->assertOk()->assertJsonPath('has_face_reference', false);
        $this->assertNull($this->customer->fresh()->face_photo);
    }

    public function test_redemption_face_check_is_logged_against_the_ticket(): void
    {
        $item = Item::create([
            'customer_id' => $this->customer->customers_id,
            'staff_id' => $this->staff->users_id,
            'group' => Item::GROUP_JEWELRY,
            'category' => 'ring',
            'description' => 'Gold ring',
            'karat' => '18k',
            'weight_grams' => 5,
            'condition' => 'good',
            'appraised_value' => 13350,
        ]);
        $transaction = Transaction::create([
            'ticket_number' => 'PT-FACE-1',
            'item_id' => $item->items_id,
            'customer_id' => $this->customer->customers_id,
            'staff_id' => $this->staff->users_id,
            'loan_amount' => 9000,
            'interest_rate' => 5,
            'loan_to_value_percent' => 70,
            'due_date' => now()->addDays(30)->toDateString(),
            'grace_period_days' => 7,
            'status' => 'active',
        ]);
        Sanctum::actingAs($this->staff);

        $this->postJson("/api/transactions/{$transaction->transactions_id}/face-check", ['result' => 'no_match', 'distance' => 0.71])->assertOk();
        $this->postJson("/api/transactions/{$transaction->transactions_id}/face-check", ['result' => 'maybe'])->assertUnprocessable();

        $log = AuditLog::where('ticket_number', 'PT-FACE-1')->first();
        $this->assertSame('Face did not match at redemption', $log->action);
        $this->assertStringContainsString('0.710', $log->reason);
    }
}
