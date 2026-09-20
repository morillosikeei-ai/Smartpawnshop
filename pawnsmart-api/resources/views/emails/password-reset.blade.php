@extends('emails.layout')

@section('title', 'Reset your Smart Pawn password')

@section('preheader', 'Use this link within '.$expiresInMinutes.' minutes to set a new password for your Smart Pawn account.')

@section('content')
    <h1 style="margin:0 0 8px; font-size:22px; line-height:1.3; color:#111827;">Reset your password</h1>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#374151;">
        Hello {{ $userName }},
    </p>
    <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#374151;">
        We received a request to reset the password for your Smart Pawn account.
        Click the button below to choose a new password.
    </p>

    {{-- Button --}}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;">
        <tr>
            <td align="center" bgcolor="#d4a72c" style="border-radius:10px;">
                <a href="{{ $resetUrl }}" target="_blank"
                   style="display:inline-block; padding:14px 34px; font-size:16px; font-weight:700; color:#111827; text-decoration:none; border-radius:10px;">
                    Reset My Password
                </a>
            </td>
        </tr>
    </table>

    {{-- Request details --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#fdf8ea; border:1px solid #f0dfa8; border-radius:10px; margin:0 0 24px;">
        <tr>
            <td style="padding:16px 20px; font-size:14px; line-height:1.7; color:#374151;">
                <strong style="color:#111827;">Requested:</strong> {{ $requestedAt }}<br>
                <strong style="color:#111827;">Link expires:</strong> {{ $expiresAt }} ({{ $expiresInMinutes }} minutes)<br>
                <strong style="color:#111827;">Reference:</strong> {{ $reference }}
            </td>
        </tr>
    </table>

    <p style="margin:0 0 8px; font-size:14px; line-height:1.6; color:#4b5563;">
        <strong style="color:#111827;">Good to know</strong>
    </p>
    <ul style="margin:0 0 24px; padding-left:20px; font-size:14px; line-height:1.7; color:#4b5563;">
        <li>The link works once. After you set a new password, it stops working.</li>
        <li>If you asked for more than one reset email, only the newest link works.</li>
        <li>Your current password stays the same until you set a new one.</li>
    </ul>

    {{-- Security note --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-left:4px solid #dc2626; background-color:#fef2f2; border-radius:6px; margin:0 0 24px;">
        <tr>
            <td style="padding:14px 18px; font-size:14px; line-height:1.6; color:#7f1d1d;">
                <strong>Did not ask for this?</strong> Ignore this email. Your account is safe and nobody can
                change your password without this link. Do not forward this email to anyone.
            </td>
        </tr>
    </table>

    <p style="margin:0; font-size:13px; line-height:1.6; color:#6b7280;">
        Button not working? Copy this link into your browser:<br>
        <a href="{{ $resetUrl }}" target="_blank" style="color:#b7891a; word-break:break-all;">{{ $resetUrl }}</a>
    </p>
@endsection
