<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Starts a short-lived queue worker in the background.
 *
 * The shop runs the API with `php artisan serve` and no separate worker, so a
 * queued email would otherwise wait in the jobs table forever. The worker
 * started here sends what is waiting and exits once the queue is empty
 * (--stop-when-empty). Two workers at once are safe: the database queue
 * hands each job to one of them only. Emails are rare and their routes are
 * throttled, so there is no need to limit how many start.
 *
 * Turn it off with QUEUE_AUTO_WORK=false where a real worker already runs
 * (for example under Supervisor in production).
 */
class QueueWorker
{
    /** A worker never runs longer than this, in seconds. */
    private const MAX_SECONDS = 120;

    public static function kick(): void
    {
        if (! config('queue.auto_work') || config('queue.default') === 'sync') {
            return;
        }

        $command = sprintf(
            '"%s" "%s" queue:work --stop-when-empty --tries=1 --max-time=%d',
            PHP_BINARY,
            base_path('artisan'),
            self::MAX_SECONDS,
        );

        try {
            if (PHP_OS_FAMILY === 'Windows') {
                // start /B runs it detached; popen returns without waiting.
                pclose(popen('start "" /B '.$command.' > NUL 2>&1', 'r'));
            } else {
                exec($command.' > /dev/null 2>&1 &');
            }
        } catch (Throwable $exception) {
            Log::warning('Could not start a background queue worker.', ['error' => $exception->getMessage()]);
        }
    }
}
