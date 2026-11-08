<?php

namespace App\Mail;

use App\Support\FrontendUrl;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The written notice PD 114 requires before a pawned item is sold: the
 * redemption period is about to end and the item will go to public auction.
 *
 * Plain values only, so the queued job carries no model that could change.
 */
class AuctionNoticeMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $frontendUrl;

    public function __construct(
        public string $customerName,
        public string $itemName,
        public string $ticketNumber,
        public string $dueDate,
        public string $lastRedemptionDate,
        public string $amountDue,
    ) {
        $this->frontendUrl = FrontendUrl::forMail();
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Notice of public auction: Ticket #{$this->ticketNumber}");
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.auction-notice',
            text: 'emails.auction-notice-text',
            with: ['appUrl' => $this->frontendUrl],
        );
    }
}
