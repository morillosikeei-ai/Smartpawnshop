<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    use HasFactory;

    protected $primaryKey = 'transactions_id';
    protected $fillable = ['item_id', 'customer_id', 'ticket_number', 'loan_amount', 'interest_rate', 'loan_to_value_percent', 'due_date', 'grace_period_days', 'status', 'redeemed_at', 'redeemed_by', 'ready_to_redeem_at', 'redemption_confirmed_at', 'interest_paid_until', 'pickup_code', 'pickup_code_expires_at', 'payment_method', 'payment_reference', 'amount_collected', 'cash_received'];
    protected $casts = ['loan_amount' => 'decimal:2', 'interest_rate' => 'decimal:4', 'loan_to_value_percent' => 'decimal:2', 'due_date' => 'date', 'redeemed_at' => 'datetime', 'ready_to_redeem_at' => 'datetime', 'redemption_confirmed_at' => 'datetime', 'interest_paid_until' => 'datetime', 'pickup_code_expires_at' => 'datetime', 'amount_collected' => 'decimal:2', 'cash_received' => 'decimal:2'];

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
     * Money owed today, sent with every transaction so a client never has to
     * recompute interest from a rate it may read differently.
     *
     * @var list<string>
     */
    protected $appends = ['days_elapsed', 'interest_due', 'total_payable', 'days_until_due'];

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
     * Interest owed so far.
     *
     * interest_rate is a fraction per month, so a loan held for half a month
     * owes half the monthly interest. A 30 day month keeps the arithmetic the
     * same as the redemption receipt.
     */
    public function interestDue(?CarbonInterface $asOf = null): float
    {
        return round((float) $this->loan_amount * (float) $this->interest_rate * ($this->daysElapsed($asOf) / 30), 2);
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

    /** How long a pickup code stays usable, in hours. */
    public const PICKUP_CODE_HOURS = 2;

    /** Whether this pawn has a pickup code that has not run out yet. */
    public function hasLivePickupCode(): bool
    {
        return $this->pickup_code !== null
            && $this->pickup_code_expires_at !== null
            && $this->pickup_code_expires_at->isFuture();
    }

    /** The staff member who took the redemption payment, when one has been taken. */
    public function redeemer() { return $this->belongsTo(User::class, 'redeemed_by', 'users_id'); }

    public function item() { return $this->belongsTo(Item::class, 'item_id', 'items_id'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customer_id', 'customers_id'); }
}
