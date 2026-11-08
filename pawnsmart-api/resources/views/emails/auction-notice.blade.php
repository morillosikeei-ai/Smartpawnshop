@extends('emails.layout')

@section('title', 'Notice of public auction')

@section('preheader', 'Redeem or renew Ticket #'.$ticketNumber.' by '.$lastRedemptionDate.', or it will be sold at public auction.')

@section('content')
    <h1 style="margin:0 0 8px; font-size:22px; line-height:1.3; color:#111827;">Notice of public auction</h1>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#374151;">
        Hello {{ $customerName }},
    </p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#374151;">
        Your pawned <strong>{{ $itemName }}</strong> (Ticket #{{ $ticketNumber }}) was due on {{ $dueDate }}.
        Under the Pawnshop Regulation Act (P.D. 114) you may still redeem it, or renew it, until the end of
        the redemption period.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#fdf8ea; border:1px solid #f0dfa8; border-radius:10px; margin:0 0 24px;">
        <tr>
            <td style="padding:16px 20px; font-size:14px; line-height:1.7; color:#374151;">
                <strong style="color:#111827;">Last day to redeem or renew:</strong> {{ $lastRedemptionDate }}<br>
                <strong style="color:#111827;">Amount due today:</strong> {{ $amountDue }} (interest continues until you pay)<br>
                <strong style="color:#111827;">Ticket:</strong> #{{ $ticketNumber }}
            </td>
        </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-left:4px solid #dc2626; background-color:#fef2f2; border-radius:6px; margin:0 0 24px;">
        <tr>
            <td style="padding:14px 18px; font-size:14px; line-height:1.6; color:#7f1d1d;">
                <strong>If the item is not redeemed or renewed by {{ $lastRedemptionDate }}</strong>, it will be
                sold at a public auction. You will be told the result.
            </td>
        </tr>
    </table>

    <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#4b5563;">
        To redeem, visit the shop with your pawn ticket and valid ID. To renew, use Renew Online in your
        customer portal at <a href="{{ $appUrl }}" style="color:#1d4ed8;">{{ $appUrl }}</a>.
    </p>

    <p style="margin:0 0 8px; font-size:12px; line-height:1.6; color:#6b7280;">
        Privacy notice: we use your name, contact details and pawn records only to manage your pawn and to send
        notices required by law, under the Data Privacy Act of 2012 (R.A. 10173). You may ask to see or correct
        your data at the shop.
    </p>
@endsection
