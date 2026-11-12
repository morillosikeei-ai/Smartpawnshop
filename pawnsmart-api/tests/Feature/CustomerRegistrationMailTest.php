<?php

namespace Tests\Feature;

use App\Jobs\SendAccountMail;
use App\Mail\ActivationMail;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerRegistrationMailTest extends TestCase
{
    use RefreshDatabase;

    private function registerCustomer()
    {
        Sanctum::actingAs(User::create([
            'name' => 'Counter Staff',
            'email' => 'staff@example.test',
            'password' => 'secret-password',
            'role' => 'staff',
            'status' => 'active',
        ]));

        return $this->postJson('/api/customers', [
            'name' => 'Maria Santos',
            'email' => 'maria.santos.test@gmail.com',
            'contact_number' => '09170000000',
            'valid_id_type' => 'National ID',
            'valid_id_number' => 'ID-123',
            'birthdate' => '1990-01-15',
        ]);
    }

    public function test_saving_a_customer_queues_the_activation_email_instead_of_waiting_for_it(): void
    {
        Queue::fake();

        $this->registerCustomer()->assertCreated();

        Queue::assertPushed(SendAccountMail::class, fn (SendAccountMail $job) => $job->to === 'maria.santos.test@gmail.com'
            && $job->mail instanceof ActivationMail
            && $job->purpose === 'Activation');
    }

    public function test_the_queued_email_is_encrypted_and_sent_once_the_job_runs(): void
    {
        Mail::fake();

        // The test queue is sync, so the job runs within the request.
        $this->registerCustomer()->assertCreated();

        $this->assertInstanceOf(ShouldBeEncrypted::class, new SendAccountMail('a@b.c', new ActivationMail('t', 'n'), 'Activation'));
        Mail::assertSent(ActivationMail::class, fn (ActivationMail $mail) => $mail->hasTo('maria.santos.test@gmail.com'));
    }
}
