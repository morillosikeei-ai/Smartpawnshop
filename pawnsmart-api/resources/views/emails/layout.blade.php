{{--
    Shared frame for every account email.

    Mail clients ignore <style> blocks and modern layout, so everything is
    tables with inline styles. No images are used: Gmail loads images through
    its own proxy, which cannot reach the shop's local network address.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>@yield('title')</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1f2937;">
    {{-- Inbox preview line, hidden in the body itself. --}}
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">@yield('preheader')</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
                    {{-- Brand header --}}
                    <tr>
                        <td style="background-color:#111827; border-radius:14px 14px 0 0; padding:28px 32px; text-align:center;">
                            <div style="font-size:24px; font-weight:800; letter-spacing:0.5px; color:#ffffff;">
                                Smart<span style="color:#d4a72c;">Pawn</span>
                            </div>
                            <div style="font-size:12px; color:#9ca3af; letter-spacing:2px; text-transform:uppercase; margin-top:4px;">
                                Pag-Asa Pawnshop
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="height:4px; background-color:#d4a72c; line-height:4px; font-size:0;">&nbsp;</td>
                    </tr>

                    {{-- Body --}}
                    <tr>
                        <td style="background-color:#ffffff; padding:36px 32px 28px; border-radius:0 0 14px 14px;">
                            @yield('content')

                            <p style="margin:28px 0 0; font-size:15px; line-height:1.6; color:#374151;">
                                Thank you,<br>
                                <strong style="color:#111827;">The Smart Pawn Team</strong>
                            </p>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="padding:24px 16px 0; text-align:center; font-size:12px; line-height:1.6; color:#6b7280;">
                            This is an automated message from Smart Pawn. Please do not reply to this email.<br>
                            Smart Pawn staff will never ask for your password by phone, text, or email.<br>
                            &copy; {{ date('Y') }} Pag-Asa Pawnshop. All rights reserved.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
