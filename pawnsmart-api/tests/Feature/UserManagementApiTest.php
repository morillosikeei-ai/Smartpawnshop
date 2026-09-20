<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserManagementApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_only_update_status_and_password_without_changing_name_or_email(): void
    {
        $admin = User::create([
            'name' => 'System Admin',
            'email' => 'admin@example.test',
            'password' => 'secret-password',
            'role' => 'admin',
            'status' => 'active',
        ]);

        $staff = User::create([
            'name' => 'Jessica',
            'email' => 'jessica@example.test',
            'password' => 'old-password',
            'role' => 'staff',
            'status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson('/api/users/'.$staff->users_id, [
            'name' => 'Changed Name',
            'email' => 'changed@example.test',
            'status' => 'inactive',
            'password' => 'new-password',
        ]);

        $response->assertOk()
            ->assertJsonPath('status', 'inactive')
            ->assertJsonPath('name', 'Jessica')
            ->assertJsonPath('email', 'jessica@example.test');

        $staff = $staff->fresh();

        $this->assertSame('Jessica', $staff->name);
        $this->assertSame('jessica@example.test', $staff->email);
        $this->assertSame('inactive', $staff->status);
        $this->assertTrue(Hash::check('new-password', $staff->password));
    }
}
