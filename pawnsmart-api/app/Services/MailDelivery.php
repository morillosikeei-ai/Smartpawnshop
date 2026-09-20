<?php

namespace App\Services;

use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Sends account emails and retries the ones the mail server turns away.
 *
 * Gmail's SMTP relay drops a small share of connections: a slow TLS handshake,
 * a "421 try again later", or a socket that times out. A single attempt turns
 * each of those into an email the customer never receives. Retrying a few
 * times with a short pause gets nearly all of them through, and every outcome
 * is logged so a missing email can be traced in storage/logs.
 */
class MailDelivery
{
    /** Attempts before giving up, counting the first one. */
    private const ATTEMPTS = 3;

    /** Pause before each retry, in milliseconds. */
    private const BACKOFF_MS = [1000, 3000];

    /**
     * Send the mail and report whether the mail server accepted it.
     *
     * @param  array<string, mixed>  $context  Extra fields for the log entry.
     */
    public static function send(string $to, Mailable $mail, string $purpose, array $context = []): bool
    {
        $lastError = null;

        for ($attempt = 1; $attempt <= self::ATTEMPTS; $attempt++) {
            try {
                $sent = Mail::to($to)->send($mail);

                Log::info("{$purpose} email accepted by the mail server.", [
                    ...$context,
                    'attempt' => $attempt,
                    'message_id' => $sent?->getMessageId(),
                ]);

                return true;
            } catch (Throwable $exception) {
                $lastError = $exception;

                Log::warning("{$purpose} email attempt failed.", [
                    ...$context,
                    'attempt' => $attempt,
                    'error' => $exception->getMessage(),
                ]);

                // A fresh connection is needed after a failure, otherwise the
                // retry reuses the broken SMTP session and fails the same way.
                Mail::purge();

                if ($attempt < self::ATTEMPTS) {
                    usleep(self::BACKOFF_MS[$attempt - 1] * 1000);
                }
            }
        }

        Log::error("{$purpose} email could not be sent.", [
            ...$context,
            'mailer' => config('mail.default'),
            'error' => $lastError?->getMessage(),
        ]);

        return false;
    }
}
