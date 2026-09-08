<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    use HasFactory;

    protected $primaryKey = 'transactions_id';
    protected $fillable = ['item_id', 'customer_id', 'ticket_number', 'loan_amount', 'interest_rate', 'loan_to_value_percent', 'due_date', 'grace_period_days', 'status', 'redeemed_at'];
    protected $casts = ['loan_amount' => 'decimal:2', 'interest_rate' => 'decimal:4', 'loan_to_value_percent' => 'decimal:2', 'due_date' => 'date', 'redeemed_at' => 'datetime'];

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
     * accrues up to today.
     */
    public function daysElapsed(?CarbonInterface $asOf = null): int
    {
        $end = $this->redeemed_at ?: ($asOf ?: now());

        return max(0, (int) $this->created_at->diffInDays($end));
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

    public function item() { return $this->belongsTo(Item::class, 'item_id', 'items_id'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customer_id', 'customers_id'); }
}
