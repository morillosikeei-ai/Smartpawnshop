<?php

namespace App\Jobs;

use App\Services\MailDelivery;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * Sends an account email (activation, password reset) off the request.
 *
 * Gmail's SMTP handshake alone takes around 10 seconds from the shop, and
 * MailDelivery retries twice more on failure, so sending inside the request
 * kept staff waiting up to half a minute on "Save customer". Queued, the
 * request answers at once and the email follows a few seconds later.
 *
 * The payload is encrypted because it holds the plain activation or reset
 * token; the database otherwise only ever stores a hash of a reset token.
 * MailDelivery does its own retries and logging, so the job runs once.
 */
class SendAccountMail implements ShouldQueue, ShouldBeEncrypted
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    /**
     * @param  array<string, mixed>  $context  Extra fields for the log entry.
     */
    public function __construct(
        public string $to,
        public Mailable $mail,
        public string $purpose,
        public array $context = [],
    ) {
        $this->afterCommit();
    }

    public function handle(): void
    {
        MailDelivery::send($this->to, $this->mail, $this->purpose, $this->context);
    }
}
