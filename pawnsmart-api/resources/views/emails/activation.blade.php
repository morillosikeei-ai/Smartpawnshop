@extends('emails.layout')

@section('title', 'Activate your Smart Pawn account')

@section('preheader', 'Your Smart Pawn account is ready. Set your password to start tracking your pawn tickets online.')

@section('content')
    <h1 style="margin:0 0 8px; font-size:22px; line-height:1.3; color:#111827;">Welcome to Smart Pawn!</h1>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#374151;">
        Hello {{ $customerName }},
    </p>
    <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#374151;">
        Our staff created your Smart Pawn customer account. Set your password to activate it.
    </p>

    {{-- Button --}}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;">
        <tr>
            <td align="center" bgcolor="#d4a72c" style="border-radius:10px;">
                <a href="{{ $activationUrl }}" target="_blank"
                   style="display:inline-block; padding:14px 34px; font-size:16px; font-weight:700; color:#111827; text-decoration:none; border-radius:10px;">
                    Activate My Account
                </a>
            </td>
        </tr>
    </table>

    {{-- What the account gives --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#fdf8ea; border:1px solid #f0dfa8; border-radius:10px; margin:0 0 24px;">
        <tr>
            <td style="padding:16px 20px; font-size:14px; line-height:1.7; color:#374151;">
                <strong style="color:#111827;">With your account you can:</strong><br>
                &#10003;&nbsp; See your pawn tickets and due dates<br>
                &#10003;&nbsp; Check your pawn amounts anytime<br>
                &#10003;&nbsp; Get notified about your pawned items
            </td>
        </tr>
    </table>

    <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#4b5563;">
        Choose a password with at least 8 characters. Mixing letters, numbers, and symbols makes it stronger.
    </p>

    {{-- Security note --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-left:4px solid #dc2626; background-color:#fef2f2; border-radius:6px; margin:0 0 24px;">
        <tr>
            <td style="padding:14px 18px; font-size:14px; line-height:1.6; color:#7f1d1d;">
                <strong>Did not register at our shop?</strong> Ignore this email and the account stays inactive.
                Do not forward this email to anyone.
            </td>
        </tr>
    </table>

    <p style="margin:0; font-size:13px; line-height:1.6; color:#6b7280;">
        Button not working? Copy this link into your browser:<br>
        <a href="{{ $activationUrl }}" target="_blank" style="color:#b7891a; word-break:break-all;">{{ $activationUrl }}</a>
    </p>
@endsection
