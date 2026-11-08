<?php

namespace App\Console\Commands;

use App\Models\Transaction;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Moves a pawn's due date, to test what happens as it comes due.
 *
 * Changing the computer's clock would also move logins, tokens and logs, so
 * this moves the one ticket instead. Run pawnshop:daily-lifecycle afterwards
 * for the reminders, overdue notices, auction notice and forfeiture that the
 * nightly run would send. Local and testing environments only.
 *
 *   php artisan pawnshop:test-due                         list pawns you can test with
 *   php artisan pawnshop:test-due PT-123 today            due today
 *   php artisan pawnshop:test-due PT-123 +3               due in 3 days
 *   php artisan pawnshop:test-due PT-123 30ago            due 30 days ago (30 days overdue)
 *   php artisan pawnshop:test-due PT-123 2026-12-01       due on that date
 *   php artisan pawnshop:test-due PT-123 91ago --notice-days-ago=8
 *                                                         and the auction notice went out 8 days ago
 *   php artisan pawnshop:test-due PT-123 +60 --reopen     a pawn set for auction made active again
 *
 * Use "30ago", not "-30": a word starting with "-" is read as an option.
 */
class SetTestDueDate extends Command
{
    protected $signature = 'pawnshop:test-due
        {ticket? : Ticket number, e.g. PT-2026...}
        {when? : today, +N (in N days), Nago (N days ago), or a date (YYYY-MM-DD)}
        {--notice-days-ago= : Record the auction notice as sent this many days ago}
        {--clear-notice : Forget the auction notice, so the nightly run sends it again}
        {--reopen : Make a pawn set for auction (not yet sold or listed) active again}';

    protected $description = 'Testing only: list pawns or move one pawn\'s due date (and its auction notice).';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('This command only runs with APP_ENV=local, so it can never change real records.');

            return self::FAILURE;
        }

        $ticket = $this->argument('ticket');
        if (! $ticket) {
            $this->listPawns();

            return self::SUCCESS;
        }

        $transaction = Transaction::with('item')->where('ticket_number', $ticket)->first();
        if (! $transaction) {
            $this->error("No pawn with ticket {$ticket}. Run the command with no ticket to list them.");

            return self::FAILURE;
        }

        $when = $this->argument('when');
        if (! $when) {
            $this->error('Say when it is due: today, +N, Nago (e.g. 30ago), or a date such as 2026-12-01.');

            return self::FAILURE;
        }

        $due = $this->parseWhen($when);
        if (! $due) {
            $this->error("Could not read \"{$when}\". Use today, +N, Nago (e.g. 30ago), or a date such as 2026-12-01.");

            return self::FAILURE;
        }

        if ($this->option('reopen')) {
            if ($transaction->status !== 'forfeited' || $transaction->item?->status !== 'forfeited') {
                $this->error('--reopen only works on a pawn set for auction (not redeemed, listed or sold).');

                return self::FAILURE;
            }
            $transaction->update(['status' => 'active', 'auction_notice_sent_at' => null]);
            $transaction->item->update(['status' => 'active']);
        } elseif ($transaction->status !== 'active') {
            $this->error("This pawn is {$transaction->status}. Add --reopen to make a pawn set for auction active again.");

            return self::FAILURE;
        }

        $old = $transaction->due_date?->toDateString();
        $changes = ['due_date' => $due->toDateString()];
        if ($this->option('clear-notice')) {
            $changes['auction_notice_sent_at'] = null;
        }
        if ($this->option('notice-days-ago') !== null) {
            $changes['auction_notice_sent_at'] = now()->subDays((int) $this->option('notice-days-ago'));
        }
        $transaction->update($changes);
        $transaction->refresh();

        $lastDay = $transaction->forfeitureDate();
        $this->info("{$ticket} ({$transaction->item?->description}): due {$old} -> {$due->toDateString()}.");
        $this->line("Last day to redeem: {$lastDay->toDateString()} (due date + {$transaction->grace_period_days} days).");
        $this->line('Auction notice: '.($transaction->auction_notice_sent_at ? 'sent '.$transaction->auction_notice_sent_at->toDateString() : 'not sent yet'));
        $this->line('Now run: php artisan pawnshop:daily-lifecycle');
        $this->line("To undo: php artisan pawnshop:test-due {$ticket} {$old} --clear-notice");

        return self::SUCCESS;
    }

    private function listPawns(): void
    {
        $rows = Transaction::with('item.customer')->whereIn('status', ['active', 'forfeited'])->orderBy('due_date')->get()
            ->map(fn (Transaction $t) => [
                $t->ticket_number,
                $t->item?->description,
                $t->item?->customer?->name,
                $t->item?->status === 'forfeited' ? 'for auction' : $t->item?->status,
                $t->due_date?->toDateString(),
                $t->forfeitureDate()->toDateString(),
                $t->auction_notice_sent_at?->toDateString() ?? '-',
            ]);

        $this->table(['Ticket', 'Item', 'Customer', 'Status', 'Due date', 'Last day to redeem', 'Auction notice'], $rows);
    }

    private function parseWhen(string $when): ?Carbon
    {
        if ($when === 'today') return today();
        if (preg_match('/^\+?(\d{1,4})$/', $when, $m)) return today()->addDays((int) $m[1]);
        if (preg_match('/^(\d{1,4}) ?ago$/i', $when, $m)) return today()->subDays((int) $m[1]);
        if (preg_match('/^-(\d{1,4})$/', $when, $m)) return today()->subDays((int) $m[1]);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $when)) {
            try {
                return Carbon::createFromFormat('Y-m-d', $when)->startOfDay();
            } catch (\Throwable) {
                return null;
            }
        }

        return null;
    }
}
