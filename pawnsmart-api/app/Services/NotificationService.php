<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Notification;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Writes the in app notifications both portals read.
 *
 * Every trigger lives here rather than in the code that causes it, so adding a
 * message never changes how a redemption, a daily job, or a pawn ticket works.
 * The callers only announce what happened.
 *
 * Staff and customer flows are the same shape: one row per recipient, a type
 * that says which screen to open, and the item that screen is about.
 */
class NotificationService
{
    /** A customer has said they are ready to redeem an item. */
    public const TYPE_STAFF_REDEEM_REQUEST = 'staff_redeem_request';

    /** A customer has asked for a redemption appointment at the branch. */
    public const TYPE_STAFF_APPOINTMENT_REQUEST = 'staff_appointment_request';

    /** A customer has asked to renew or extend an open loan. */
    public const TYPE_STAFF_RENEWAL_REQUEST = 'staff_renewal_request';

    /** A customer has submitted a GCash reference number for a renewal. */
    public const TYPE_STAFF_RENEWAL_PAYMENT = 'staff_renewal_payment';

    /** An item's value has fallen below its loan amount. */
    public const TYPE_STAFF_HIGH_RISK = 'staff_high_risk';

    /** A loan is past its due date and inside the grace period. */
    public const TYPE_STAFF_OVERDUE = 'staff_overdue';

    /** A loan passed its grace period and the item was forfeited. */
    public const TYPE_STAFF_FORFEITED = 'staff_forfeited';

    /** An item and its loan were recorded for the customer. */
    public const TYPE_CUSTOMER_ITEM_CREATED = 'item_created';

    /** The daily job moved an item's value by a noticeable amount. */
    public const TYPE_CUSTOMER_VALUE_CHANGED = 'value_changed';

    /** An item's value has come close to, or fallen under, its loan. */
    public const TYPE_CUSTOMER_RISK_NOTICE = 'risk_notice';

    /** A due date is coming up inside the notice window. */
    public const TYPE_CUSTOMER_DUE_SOON = 'due_soon';

    /** Staff accepted the customer's redemption request. */
    public const TYPE_CUSTOMER_REDEEM_CONFIRMED = 'redeem_confirmed';

    /** The redemption payment is done and the item is released. */
    public const TYPE_CUSTOMER_REDEMPTION_COMPLETE = 'redemption_complete';

    /** The item was forfeited after the grace period. */
    public const TYPE_CUSTOMER_FORFEITED = 'forfeited';

    /** Staff checked the GCash reference and extended the pawn. */
    public const TYPE_CUSTOMER_RENEWAL_CONFIRMED = 'renewal_confirmed';

    /** Staff could not match the GCash reference to a payment. */
    public const TYPE_CUSTOMER_RENEWAL_REJECTED = 'renewal_rejected';

    /**
     * system_settings key for how many days before a due date the customer is
     * told, and the value used when the row is missing.
     */
    public const DUE_SOON_DAYS_KEY = 'due_soon_notice_days';
    public const DEFAULT_DUE_SOON_DAYS = 5;

    /**
     * system_settings key for how far an item's value must move before the
     * customer hears about it, in percent, and the value used when the row is
     * missing. Without this the daily job would write a message every day.
     */
    public const VALUE_CHANGE_PERCENT_KEY = 'value_change_notice_percent';
    public const DEFAULT_VALUE_CHANGE_PERCENT = 5.0;

    /**
     * system_settings key for how many days a confirmed redemption request is
     * held for the customer, and the value used when the row is missing.
     */
    public const REDEMPTION_VISIT_DAYS_KEY = 'redemption_visit_days';
    public const DEFAULT_REDEMPTION_VISIT_DAYS = 3;

    /**
     * system_settings key for how many days a confirmed renewal adds to a due
     * date, and the value used when the row is missing. This is separate from
     * loan_term_days: staff still set a new pawn's due date by hand, and a
     * renewal must not change that.
     */
    public const RENEWAL_TERM_DAYS_KEY = 'renewal_term_days';
    public const DEFAULT_RENEWAL_TERM_DAYS = 60;

    /**
     * system_settings key holding the GCash number or account name the
     * customer pays, shown on the Renew Online panel. Free text, not a number,
     * so it is read directly rather than through setting().
     */
    public const GCASH_PAYMENT_INFO_KEY = 'gcash_payment_info';

    /**
     * How often a repeatable message may be sent again for the same item, in
     * days. A due date reminder is worth repeating; a forfeiture is not.
     */
    private const REPEAT_AFTER_DAYS = 3;

    /**
     * Write one row, unless the same message already went to this recipient
     * about this item recently.
     *
     * $repeatAfterDays of null means the message is sent once and never again
     * for that item, which is what a one time event like a forfeiture needs.
     */
    public function send(int $userId, string $type, string $message, ?int $itemId = null, ?int $repeatAfterDays = null): ?Notification
    {
        $alreadySent = Notification::where('user_id', $userId)
            ->where('type', $type)
            ->where('related_item_id', $itemId)
            ->when($repeatAfterDays !== null, fn ($query) => $query->where('created_at', '>=', now()->subDays($repeatAfterDays)))
            ->exists();

        if ($alreadySent) {
            return null;
        }

        return Notification::create([
            'user_id' => $userId,
            'type' => $type,
            'message' => $message,
            'related_item_id' => $itemId,
            'is_read' => false,
        ]);
    }

    /**
     * Send the same message to every active staff member and admin.
     *
     * Staff messages are about the shop's work rather than one person's
     * account, so everyone who can act on them gets a copy.
     */
    public function sendToStaff(string $type, string $message, ?int $itemId = null, ?int $repeatAfterDays = null): void
    {
        User::whereIn('role', ['staff', 'admin'])
            ->where('status', 'active')
            ->pluck('users_id')
            ->each(fn ($userId) => $this->send((int) $userId, $type, $message, $itemId, $repeatAfterDays));
    }

    /**
     * Send to the account behind a customer profile.
     *
     * A customer record without a user account cannot sign in and so has no
     * bell to read; nothing is written for one.
     */
    public function sendToCustomer(?Customer $customer, string $type, string $message, ?int $itemId = null, ?int $repeatAfterDays = null): ?Notification
    {
        $userId = $customer?->user_id;

        return $userId ? $this->send((int) $userId, $type, $message, $itemId, $repeatAfterDays) : null;
    }

    // Staff side triggers.

    /** A customer pressed "ready to redeem" on an open loan. */
    public function customerReadyToRedeem(Transaction $transaction): void
    {
        $this->sendToStaff(
            self::TYPE_STAFF_REDEEM_REQUEST,
            $this->customerName($transaction->customer).' is ready to pick up/pay for '.$this->itemName($transaction->item)
                .' (Ticket #'.$transaction->ticket_number.')',
            $transaction->item_id,
            self::REPEAT_AFTER_DAYS
        );
    }

    /** A customer asked for a redemption appointment from the payments screen. */
    public function customerRequestedAppointment(Transaction $transaction): void
    {
        $this->sendToStaff(
            self::TYPE_STAFF_APPOINTMENT_REQUEST,
            $this->customerName($transaction->customer).' has asked for a redemption appointment for '
                .$this->itemName($transaction->item).' (Ticket #'.$transaction->ticket_number.')',
            $transaction->item_id,
            self::REPEAT_AFTER_DAYS
        );
    }

    /** A customer asked to renew or extend an open loan. */
    public function customerRequestedRenewal(Transaction $transaction): void
    {
        $this->sendToStaff(
            self::TYPE_STAFF_RENEWAL_REQUEST,
            $this->customerName($transaction->customer).' has asked to renew or extend the pawn on '
                .$this->itemName($transaction->item).' (Ticket #'.$transaction->ticket_number
                .', due '.$this->date($transaction->due_date).')',
            $transaction->item_id,
            self::REPEAT_AFTER_DAYS
        );
    }

    /**
     * A customer submitted a GCash reference number for a renewal.
     *
     * Every pending claim needs its own message, because each one is a
     * different reference number a staff member has to check, so this one is
     * never suppressed as a repeat.
     */
    public function customerSubmittedRenewalPayment(Transaction $transaction, string $reference, float $amount): void
    {
        $this->sendToStaff(
            self::TYPE_STAFF_RENEWAL_PAYMENT,
            $this->customerName($transaction->customer).' submitted a GCash renewal payment (Ref: '.$reference.') for '
                .$this->itemName($transaction->item).' — '.$this->peso($amount)
                .' (Ticket #'.$transaction->ticket_number.')',
            $transaction->item_id
        );
    }

    /** The daily job flagged an item as high risk. */
    public function itemFlaggedHighRisk(Item $item): void
    {
        $this->sendToStaff(
            self::TYPE_STAFF_HIGH_RISK,
            $this->itemName($item).' owned by '.$this->customerName($item->customer)
                .' is now HIGH RISK — current value has dropped below the pawn amount.',
            $item->items_id,
            self::REPEAT_AFTER_DAYS
        );
    }

    /** A loan passed its due date but is still inside the grace period. */
    public function loanOverdue(Transaction $transaction, int $daysLeftBeforeForfeiture): void
    {
        $item = $transaction->item;

        $this->sendToStaff(
            self::TYPE_STAFF_OVERDUE,
            $this->itemName($item).' owned by '.$this->customerName($transaction->customer)
                .' (Ticket #'.$transaction->ticket_number.') is overdue — '.$daysLeftBeforeForfeiture.' days left before it becomes expired/unclaimed.',
            $transaction->item_id,
            self::REPEAT_AFTER_DAYS
        );
    }

    /** The daily job forfeited an item. Staff copy. */
    public function itemForfeitedForStaff(Transaction $transaction): void
    {
        $item = $transaction->item;

        $this->sendToStaff(
            self::TYPE_STAFF_FORFEITED,
            $this->itemName($item).' owned by '.$this->customerName($transaction->customer)
                .' (Ticket #'.$transaction->ticket_number.')'
                ." is now expired/unclaimed — mark it as 'For Sale' if ready.",
            $transaction->item_id
        );
    }

    // Customer side triggers.

    /** Staff recorded a new item and its loan. */
    public function itemRecorded(Item $item, Transaction $transaction): void
    {
        $this->sendToCustomer(
            $item->customer,
            self::TYPE_CUSTOMER_ITEM_CREATED,
            'Your '.$this->itemName($item).' has been recorded. Pawn amount: '.$this->peso($transaction->loan_amount)
                .', Due date: '.$this->date($transaction->due_date),
            $item->items_id
        );
    }

    /**
     * The daily job moved an item's value.
     *
     * Only a move past the configured percentage is worth a message, so a
     * customer is not told about every small gold price step.
     */
    public function itemValueChanged(Item $item, float $previousValue, float $newValue): void
    {
        if ($previousValue <= 0) {
            return;
        }

        $movePercent = abs(($newValue - $previousValue) / $previousValue) * 100;

        if ($movePercent < $this->valueChangeNoticePercent()) {
            return;
        }

        $this->sendToCustomer(
            $item->customer,
            self::TYPE_CUSTOMER_VALUE_CHANGED,
            'The value of your '.$this->itemName($item).' has changed to '.$this->peso($newValue),
            $item->items_id,
            self::REPEAT_AFTER_DAYS
        );
    }

    /** An item reached the medium or high risk band. */
    public function itemAtRisk(Item $item): void
    {
        $this->sendToCustomer(
            $item->customer,
            self::TYPE_CUSTOMER_RISK_NOTICE,
            'Notice: the value of your '.$this->itemName($item).' has dropped and is now close to your pawn amount.',
            $item->items_id,
            self::REPEAT_AFTER_DAYS
        );
    }

    /** A due date is inside the notice window. */
    public function dueDateApproaching(Transaction $transaction, int $daysLeft): void
    {
        $item = $transaction->item;

        $this->sendToCustomer(
            $transaction->customer,
            self::TYPE_CUSTOMER_DUE_SOON,
            'Your '.$this->itemName($item).' is due on '.$this->date($transaction->due_date).' — '.$daysLeft.' days left.',
            $transaction->item_id,
            self::REPEAT_AFTER_DAYS
        );
    }

    /** Staff accepted the customer's redemption request. */
    public function redemptionRequestConfirmed(Transaction $transaction): void
    {
        $this->sendToCustomer(
            $transaction->customer,
            self::TYPE_CUSTOMER_REDEEM_CONFIRMED,
            'Staff has confirmed your redemption request for '.$this->itemName($transaction->item)
                .'. Please visit the shop within '.$this->redemptionVisitDays().' days.',
            $transaction->item_id,
            self::REPEAT_AFTER_DAYS
        );
    }

    /** The redemption payment is complete. */
    public function redemptionCompleted(Transaction $transaction): void
    {
        $this->sendToCustomer(
            $transaction->customer,
            self::TYPE_CUSTOMER_REDEMPTION_COMPLETE,
            'Your payment/redemption for '.$this->itemName($transaction->item).' is complete. Thank you!',
            $transaction->item_id
        );
    }

    /** The item was forfeited. Customer copy. */
    public function itemForfeitedForCustomer(Transaction $transaction): void
    {
        $this->sendToCustomer(
            $transaction->customer,
            self::TYPE_CUSTOMER_FORFEITED,
            'Your '.$this->itemName($transaction->item).' is now expired/unclaimed because it is past the due date and extension period.',
            $transaction->item_id
        );
    }

    /**
     * Staff checked the GCash reference and extended the pawn.
     *
     * One row per confirmed renewal: a pawn can be renewed more than once, and
     * each new due date is news, so this is never suppressed as a repeat.
     */
    public function renewalConfirmed(Transaction $transaction): void
    {
        $this->sendToCustomer(
            $transaction->customer,
            self::TYPE_CUSTOMER_RENEWAL_CONFIRMED,
            'Your renewal payment for '.$this->itemName($transaction->item).' has been confirmed. New due date: '
                .$this->date($transaction->due_date).'.',
            $transaction->item_id
        );
    }

    /** Staff could not match the GCash reference, or the pawn is no longer open. */
    public function renewalRejected(Transaction $transaction, string $reason): void
    {
        $this->sendToCustomer(
            $transaction->customer,
            self::TYPE_CUSTOMER_RENEWAL_REJECTED,
            'Your renewal payment for '.$this->itemName($transaction->item).' could not be confirmed. '.$reason,
            $transaction->item_id
        );
    }

    /** Days before a due date that the customer is told about it. */
    public function dueSoonNoticeDays(): int
    {
        return (int) $this->setting(self::DUE_SOON_DAYS_KEY, self::DEFAULT_DUE_SOON_DAYS);
    }

    /** How far a value must move before the customer hears about it, in percent. */
    public function valueChangeNoticePercent(): float
    {
        return (float) $this->setting(self::VALUE_CHANGE_PERCENT_KEY, self::DEFAULT_VALUE_CHANGE_PERCENT);
    }

    /** How many days a confirmed redemption request is held. */
    public function redemptionVisitDays(): int
    {
        return (int) $this->setting(self::REDEMPTION_VISIT_DAYS_KEY, self::DEFAULT_REDEMPTION_VISIT_DAYS);
    }

    /** How many days a confirmed renewal adds to the due date. */
    public function renewalTermDays(): int
    {
        return (int) $this->setting(self::RENEWAL_TERM_DAYS_KEY, self::DEFAULT_RENEWAL_TERM_DAYS);
    }

    /** The GCash number the customer pays, or an empty string when unset. */
    public function gcashPaymentInfo(): string
    {
        return (string) (SystemSetting::where('setting_key', self::GCASH_PAYMENT_INFO_KEY)->value('setting_value') ?? '');
    }

    /** A numeric setting, or the built in default when it is missing or not a number. */
    private function setting(string $key, float|int $default): float|int
    {
        $value = SystemSetting::where('setting_key', $key)->value('setting_value');

        return is_numeric($value) ? (float) $value : $default;
    }

    private function itemName(?Item $item): string
    {
        return $item?->description ?: 'your item';
    }

    private function customerName(?Customer $customer): string
    {
        return $customer?->name ?: 'A customer';
    }

    private function peso(float|string|null $amount): string
    {
        return '₱'.number_format((float) $amount, 2);
    }

    private function date(Carbon|string|null $date): string
    {
        return $date ? Carbon::parse($date)->format('M j, Y') : 'the due date';
    }
}
