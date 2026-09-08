<?php

namespace App\Console\Commands;

use App\Mail\PasswordResetMail;
use Illuminate\Console\Command;
use Illuminate\Mail\Events\MessageSent;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * Sends a real password reset email and reports what the mail server answered.
 *
 * "The customer never got the email" has several causes that look identical
 * from the app: wrong credentials, a rejected recipient, or a message the
 * provider accepted and then filed as spam. This command separates them by
 * printing the mail server's own reply.
 */
class SendTestMail extends Command
{
    protected $signature = 'mail:test {email : Address to send the test to} {--debug : Print the full SMTP conversation}';

    protected $description = 'Send a test password reset email and report the mail server response.';

    public function handle(): int
    {
        $email = $this->argument('email');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error("{$email} is not a valid email address.");

            return self::FAILURE;
        }

        $this->line('Mailer:     '.config('mail.default'));
        $this->line('Host:       '.config('mail.mailers.smtp.host').':'.config('mail.mailers.smtp.port'));
        $this->line('From:       '.config('mail.from.address'));
        $this->line('Link base:  '.config('app.frontend_url'));
        $this->newLine();

        // The mail server's reply is the only proof the message was accepted.
        $serverReplies = [];
        Event::listen(MessageSent::class, function (MessageSent $event) use (&$serverReplies) {
            foreach (array_filter(explode(PHP_EOL, $event->sent->getDebug())) as $line) {
                if ($this->option('debug') || str_contains($line, 'RCPT TO') || str_contains($line, '250 2.0.0')) {
                    $serverReplies[] = $line;
                }
            }
        });

        try {
            Mail::to($email)->send(new PasswordResetMail(Str::random(64), 'Mail Test', 60));
        } catch (Throwable $exception) {
            $this->error('Send failed: '.$exception->getMessage());
            $this->newLine();
            $this->line('Check MAIL_USERNAME and MAIL_PASSWORD in .env. A Gmail app password stops working');
            $this->line('once the account password changes or two factor authentication is reset.');

            return self::FAILURE;
        }

        foreach ($serverReplies as $line) {
            $this->line($line);
        }

        $this->newLine();
        $this->info("The mail server accepted the message for {$email}.");
        $this->line('If it still does not arrive, the provider accepted it and filed it elsewhere:');
        $this->line('check the spam folder, and check that the link base above is an address the');
        $this->line("recipient's device can actually open.");

        return self::SUCCESS;
    }
}
