<?php

namespace App\Mail;

use App\Support\FrontendUrl;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Str;

class ActivationMail extends Mailable
{
    use Queueable, SerializesModels;

    public $token;
    public $customerName;

    /** The app's address as the device that created the account reaches it. */
    public string $frontendUrl;

    /**
     * Create a new message instance.
     */
    public function __construct($token, $customerName)
    {
        $this->token = $token;
        $this->customerName = $customerName;
        $this->frontendUrl = FrontendUrl::forMail();
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Welcome to Smart Pawn: activate your account',
        );
    }

    /**
     * A unique entity ID stops Gmail folding a resent link into an old thread.
     */
    public function headers(): Headers
    {
        return new Headers(text: ['X-Entity-Ref-ID' => (string) Str::uuid()]);
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.activation',
            text: 'emails.activation-text',
            with: [
                'token' => $this->token,
                'customerName' => $this->customerName,
                'activationUrl' => $this->frontendUrl.'/activate?token='.$this->token,
                'appUrl' => $this->frontendUrl,
            ],
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        return [];
    }
}
