<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

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

    public string $token;
    public string $userName;
    public int $expiresInMinutes;

    public function __construct(string $token, string $userName, int $expiresInMinutes)
    {
        $this->token = $token;
        $this->userName = $userName;
        $this->expiresInMinutes = $expiresInMinutes;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Reset Your Smart Pawn Password',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.password-reset',
            with: [
                'resetUrl' => config('app.frontend_url').'/reset-password?token='.$this->token,
                'userName' => $this->userName,
                'expiresInMinutes' => $this->expiresInMinutes,
            ],
        );
    }
}
