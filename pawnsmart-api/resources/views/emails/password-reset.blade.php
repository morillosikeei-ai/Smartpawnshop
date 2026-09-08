@component('mail::message')
# Hello, {{ $userName }}!

We received a request to reset the password for your Smart Pawn account.

@component('mail::button', ['url' => $resetUrl])
Reset Your Password
@endcomponent

This link expires in {{ $expiresInMinutes }} minutes and can only be used once.

If you did not request a password reset, you can ignore this email. Your password stays as it is.

Thanks,<br>
Smart Pawn Team
@endcomponent
