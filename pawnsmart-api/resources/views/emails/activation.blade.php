@component('mail::message')
# Hello, {{ $customerName }}!

Your Smart Pawn account has been created. Please set your password to activate your account.

@component('mail::button', ['url' => config('app.frontend_url') . '/activate?token=' . $token])
Set Your Password
@endcomponent

If you didn't request this, please ignore this email.

Thanks,<br>
Smart Pawn Team
@endcomponent
