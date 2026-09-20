<?php

namespace Tests\Feature;

use App\Mail\PasswordResetMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PasswordResetEmailTest extends TestCase
{
    use RefreshDatabase;

    private function customer(): User
    {
        return User::create([
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@example.test',
            'password' => 'old-password',
            'role' => 'customer',
            'status' => 'active',
        ]);
    }

    public function test_reset_email_is_sent_for_an_address_whose_domain_has_no_dns(): void
    {
        Mail::fake();
        $this->customer();

        // example.test has no DNS records. A DNS check here used to reject the
        // request at random whenever the lookup was slow or offline.
        $this->postJson('/api/forgot-password', ['email' => ' Juan@Example.test '])->assertOk();

        Mail::assertSent(PasswordResetMail::class, fn (PasswordResetMail $mail) => $mail->hasTo('juan@example.test'));
    }

    public function test_every_reset_email_gets_its_own_subject_and_a_working_link(): void
    {
        $first = new PasswordResetMail('token-one', 'Juan', 60);
        $second = new PasswordResetMail('token-two', 'Juan', 60);

        $this->assertNotSame($first->envelope()->subject, $second->envelope()->subject);

        $html = $first->render();
        $this->assertStringContainsString('/reset-password?token=token-one', $html);
        $this->assertStringContainsString($first->reference, $html);
    }

    public function test_emailed_token_resets_the_password(): void
    {
        Mail::fake();
        $user = $this->customer();

        $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();

        $token = null;
        Mail::assertSent(PasswordResetMail::class, function (PasswordResetMail $mail) use (&$token) {
            $token = $mail->token;

            return true;
        });

        $this->postJson('/api/reset-password', [
            'token' => $token,
            'password' => 'brand-new-password',
            'password_confirmation' => 'brand-new-password',
        ])->assertOk();

        $this->assertTrue(Hash::check('brand-new-password', $user->fresh()->password));
        $this->assertSame(0, DB::table('password_reset_tokens')->count());
    }
}
