<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Staff correct a customer's details from the New Pawn Transaction form.
 */
class CustomerUpdateTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $customerUser;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->staff = User::create(['name' => 'Shop Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $this->customerUser = User::create(['name' => 'Maria Cruz', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active', 'contact_number' => '09170000000']);
        $this->customer = Customer::create([
            'user_id' => $this->customerUser->users_id,
            'name' => 'Maria Cruz',
            'contact_number' => '09170000000',
            'address' => 'Old address',
            'valid_id_type' => 'UMID',
            'valid_id_number' => 'X-1',
            'registered_by_staff_id' => $this->staff->users_id,
        ]);
    }

    public function test_staff_update_details_and_the_sign_in_account_follows(): void
    {
        Sanctum::actingAs($this->staff);

        $this->putJson("/api/customers/{$this->customer->customers_id}", [
            'name' => 'Maria Santos Cruz',
            'contact_number' => '09181111111',
            'address' => '123 Rizal St, Cebu City',
            'valid_id_type' => 'National ID',
            'valid_id_number' => '1234-5678-9012-3456',
        ])->assertOk()->assertJsonPath('name', 'Maria Santos Cruz');

        $this->customer->refresh();
        $this->assertSame('123 Rizal St, Cebu City', $this->customer->address);
        $this->assertSame('National ID', $this->customer->valid_id_type);
        $this->assertSame('Maria Santos Cruz', $this->customerUser->fresh()->name);
        $this->assertSame('09181111111', $this->customerUser->fresh()->contact_number);

        $log = AuditLog::latest('audit_logs_id')->first();
        $this->assertStringContainsString("customer #{$this->customer->customers_id}", $log->action);
        $this->assertStringContainsString('address', $log->reason);
    }

    public function test_the_email_is_never_changed_here(): void
    {
        Sanctum::actingAs($this->staff);

        $this->putJson("/api/customers/{$this->customer->customers_id}", ['email' => 'someone-else@example.test', 'address' => 'New address'])->assertOk();

        $this->assertSame('maria@example.test', $this->customerUser->fresh()->email);
    }

    public function test_required_fields_cannot_be_blanked(): void
    {
        Sanctum::actingAs($this->staff);

        $this->putJson("/api/customers/{$this->customer->customers_id}", ['name' => ''])->assertUnprocessable();
    }

    public function test_customers_cannot_edit_customer_records(): void
    {
        Sanctum::actingAs($this->customerUser);

        $this->putJson("/api/customers/{$this->customer->customers_id}", ['address' => 'Somewhere'])->assertForbidden();
    }
}
