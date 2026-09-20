<?php

namespace App\Mail;

use App\Support\FrontendUrl;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Str;

/**
 * The password reset link sent to an account's own inbox.
 *
 * Receiving this mail is the proof of ownership: the token in the link is the
 * only way to set a new password, so nobody can reset an account they cannot
 * read the mail for.
 */
class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    /** Times in the email are shown in the shop's local time. */
    private const DISPLAY_TIMEZONE = 'Asia/Manila';

    public string $token;
    public string $userName;
    public int $expiresInMinutes;

    /** The app's address as the device that asked for the reset reaches it. */
    public string $frontendUrl;

    /**
     * A short code unique to this email.
     *
     * Gmail folds mails with the same subject into one old conversation, so a
     * second reset request looked like it never arrived. A code in the subject
     * keeps every request its own message, and lets staff match a customer's
     * email to the log entry.
     */
    public string $reference;

    public function __construct(string $token, string $userName, int $expiresInMinutes)
    {
        $this->token = $token;
        $this->userName = $userName;
        $this->expiresInMinutes = $expiresInMinutes;
        $this->frontendUrl = FrontendUrl::forMail();
        $this->reference = strtoupper(Str::random(6));
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Reset your Smart Pawn password (Ref {$this->reference})",
        );
    }

    public function headers(): Headers
    {
        return new Headers(text: ['X-Entity-Ref-ID' => (string) Str::uuid()]);
    }

    public function content(): Content
    {
        $now = now()->setTimezone(self::DISPLAY_TIMEZONE);

        return new Content(
            view: 'emails.password-reset',
            text: 'emails.password-reset-text',
            with: [
                'resetUrl' => $this->frontendUrl.'/reset-password?token='.$this->token,
                'userName' => $this->userName,
                'expiresInMinutes' => $this->expiresInMinutes,
                'requestedAt' => $now->format('M j, Y g:i A'),
                'expiresAt' => $now->copy()->addMinutes($this->expiresInMinutes)->format('M j, Y g:i A'),
                'reference' => $this->reference,
                'appUrl' => $this->frontendUrl,
            ],
        );
    }
}
