<?php

namespace App\Models;

use App\Models\Concerns\HidesFromCustomers;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    use HasFactory, HidesFromCustomers;

    protected $primaryKey = 'transactions_id';
    protected $fillable = ['item_id', 'customer_id', 'ticket_number', 'loan_amount', 'interest_rate', 'loan_to_value_percent', 'due_date', 'grace_period_days', 'auction_notice_sent_at', 'status', 'redeemed_at', 'redeemed_by', 'ready_to_redeem_at', 'redemption_confirmed_at', 'interest_paid_until', 'pickup_code', 'pickup_code_expires_at', 'payment_method', 'payment_reference', 'amount_collected', 'cash_received', 'locked_by', 'locked_at'];
    protected $casts = ['loan_amount' => 'decimal:2', 'interest_rate' => 'decimal:4', 'loan_to_value_percent' => 'decimal:2', 'due_date' => 'date', 'redeemed_at' => 'datetime', 'ready_to_redeem_at' => 'datetime', 'redemption_confirmed_at' => 'datetime', 'interest_paid_until' => 'datetime', 'auction_notice_sent_at' => 'datetime', 'pickup_code_expires_at' => 'datetime', 'amount_collected' => 'decimal:2', 'cash_received' => 'decimal:2', 'locked_at' => 'datetime'];

    /**
     * The pickup code never leaves the model on its own.
     *
     * It is what the customer shows to prove they are the one redeeming,
     * so it is worth only as much as its secrecy. Staff receive it from a
     * lookup they type it into, never from a list they can read.
     *
     * @var list<string>
     */
    protected $hidden = ['pickup_code', 'pickup_code_expires_at'];

    /**
     * Loan-to-value with the loan amount gives the appraised value, which is
     * for the shop only, so a customer does not get it.
     */
    protected array $customerHidden = ['loan_to_value_percent'];

    /**
     * Money owed today, sent with every transaction so a client never has to
     * recompute interest from a rate it may read differently.
     *
     * @var list<string>
     */
    protected $appends = ['days_elapsed', 'interest_days', 'minimum_interest_days', 'interest_due', 'total_payable', 'days_until_due', 'last_redemption_date', 'pickup_ready_until', 'amount_paid'];

    /** system_settings key for the fewest days of interest a pawn is charged, and its default. */
    public const MINIMUM_INTEREST_DAYS_KEY = 'minimum_interest_days';
    public const DEFAULT_MINIMUM_INTEREST_DAYS = 30;

    /**
     * The fewest days of interest charged, from system_settings. Read once per
     * request: reports call interestDue() for every transaction they total.
     */
    public static function minimumInterestDays(): int
    {
        return once(function () {
            $value = SystemSetting::where('setting_key', self::MINIMUM_INTEREST_DAYS_KEY)->value('setting_value');

            return is_numeric($value) ? max(0, (int) $value) : self::DEFAULT_MINIMUM_INTEREST_DAYS;
        });
    }

    /**
     * Whole days the loan has been outstanding. Interest accrues over these.
     *
     * A redeemed loan stops accruing on its redemption date. An open loan
     * accrues up to today. A renewed loan counts from the day its renta was
     * last paid, not from the day it was recorded.
     */
    public function daysElapsed(?CarbonInterface $asOf = null): int
    {
        $end = $this->redeemed_at ?: ($asOf ?: now());

        return max(0, (int) $this->accrualStart()->diffInDays($end));
    }

    /**
     * The day interest starts counting from.
     *
     * A confirmed renewal settles the renta owed up to that day, so accrual
     * restarts there. An unrenewed pawn still counts from the day it was
     * recorded.
     */
    public function accrualStart(): CarbonInterface
    {
        return $this->interest_paid_until ?: $this->created_at;
    }

    /**
     * Days of interest charged: the days elapsed, but never fewer than the
     * minimum_interest_days setting. A pawn redeemed the same day or after two
     * days still pays the minimum; past it, every day counts.
     */
    public function interestDays(?CarbonInterface $asOf = null): int
    {
        return max($this->daysElapsed($asOf), self::minimumInterestDays());
    }

    /**
     * Interest owed so far. The one place interest is worked out: redemption,
     * the GCash renewal amount, the portals, receipts and reports all read it.
     *
     * interest_rate is a fraction per month and a month is 30 days, so the
     * charge is loan x monthly rate x (charged days / 30).
     */
    public function interestDue(?CarbonInterface $asOf = null): float
    {
        return round((float) $this->loan_amount * (float) $this->interest_rate * ($this->interestDays($asOf) / 30), 2);
    }

    /**
     * Principal plus the interest owed so far.
     */
    public function totalPayable(?CarbonInterface $asOf = null): float
    {
        return round((float) $this->loan_amount + $this->interestDue($asOf), 2);
    }

    public function getDaysElapsedAttribute(): int
    {
        return $this->daysElapsed();
    }

    /**
     * What the customer actually paid to redeem this pawn: the amount staff
     * recorded at the counter, or the total payable for an older redemption
     * saved before that was recorded. Null for a pawn not redeemed. Revenue
     * is summed from this, so a past redemption keeps the amount it really
     * brought in even after interest rules change.
     */
    public function amountPaid(): ?float
    {
        if ($this->status !== 'redeemed') {
            return null;
        }

        return $this->amount_collected !== null ? (float) $this->amount_collected : $this->totalPayable();
    }

    public function getAmountPaidAttribute(): ?float
    {
        return $this->amountPaid();
    }

    public function getInterestDaysAttribute(): int
    {
        return $this->interestDays();
    }

    /** Sent so the customer's balance graph can draw past days the same way. */
    public function getMinimumInterestDaysAttribute(): int
    {
        return self::minimumInterestDays();
    }

    public function getInterestDueAttribute(): float
    {
        return $this->interestDue();
    }

    public function getTotalPayableAttribute(): float
    {
        return $this->totalPayable();
    }

    /**
     * Whole days until the due date. Negative once the loan is past due.
     */
    public function getDaysUntilDueAttribute(): int
    {
        return (int) now()->startOfDay()->diffInDays($this->due_date->copy()->startOfDay(), false);
    }

    /**
     * The last day the item can still be redeemed: the due date plus the grace
     * period. The daily job forfeits the loan after this day.
     */
    public function forfeitureDate(): CarbonInterface
    {
        return $this->due_date->copy()->addDays($this->grace_period_days);
    }

    /**
     * Until when an item staff set aside for pickup is held for the customer:
     * redemption_visit_days after staff marked it ready. Null when it is not.
     */
    public function pickupReadyUntil(): ?CarbonInterface
    {
        if (! $this->redemption_confirmed_at || $this->status !== 'active') {
            return null;
        }
        $days = once(fn () => (int) (SystemSetting::where('setting_key', 'redemption_visit_days')->value('setting_value') ?: 3));

        return $this->redemption_confirmed_at->copy()->addDays($days);
    }

    public function getPickupReadyUntilAttribute(): ?string
    {
        return $this->pickupReadyUntil()?->toIso8601String();
    }

    /** The last day to redeem or renew, as a date, for the portals. */
    public function getLastRedemptionDateAttribute(): ?string
    {
        return $this->due_date ? $this->forfeitureDate()->toDateString() : null;
    }

    /** Whole days until forfeiture. Never negative, so a message reads sensibly. */
    public function getDaysUntilForfeitureAttribute(): int
    {
        return max(0, (int) now()->startOfDay()->diffInDays($this->forfeitureDate()->startOfDay(), false));
    }

    /**
     * Every GCash renewal raised against this pawn, oldest first.
     *
     * Rejected and confirmed rows are kept alongside the pending one: the
     * history screens read them as the record of what was asked and what the
     * shop decided, not only as work waiting to be done.
     */
    public function renewalRequests() { return $this->hasMany(RenewalRequest::class, 'transaction_id', 'transactions_id')->orderBy('renewal_requests_id'); }

    /**
     * How long a processing lock is honoured, in minutes.
     *
     * A staff member who closes their browser mid payment cannot release
     * the lock they took, so an old lock is read as no lock at all. Long
     * enough to count money, short enough that nobody waits on a colleague
     * who has gone home.
     */
    public const LOCK_MINUTES = 10;

    /** Whether someone is holding this pawn right now. */
    public function isLocked(): bool
    {
        return $this->locked_by !== null
            && $this->locked_at !== null
            && $this->locked_at->gt(now()->subMinutes(self::LOCK_MINUTES));
    }

    /** How long a pickup code stays usable, in hours. */
    public const PICKUP_CODE_HOURS = 2;

    /** Whether this pawn has a pickup code that has not run out yet. */
    public function hasLivePickupCode(): bool
    {
        return $this->pickup_code !== null
            && $this->pickup_code_expires_at !== null
            && $this->pickup_code_expires_at->isFuture();
    }

    /** The staff member currently taking this payment, while a lock is held. */
    public function lockHolder() { return $this->belongsTo(User::class, 'locked_by', 'users_id'); }

    /** The staff member who took the redemption payment, when one has been taken. */
    public function redeemer() { return $this->belongsTo(User::class, 'redeemed_by', 'users_id'); }

    public function item() { return $this->belongsTo(Item::class, 'item_id', 'items_id'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customer_id', 'customers_id'); }
}
