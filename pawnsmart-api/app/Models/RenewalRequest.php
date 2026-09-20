<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One GCash renewal payment a customer says they have made.
 *
 * The system is not a payment processor: the money moves in the customer's own
 * GCash app and this row only records the claim. A staff member checks the
 * reference number against the shop's GCash account before the pawn is
 * actually extended, so a pending row changes nothing about the loan.
 */
class RenewalRequest extends Model
{
    use HasFactory;

    protected $primaryKey = 'renewal_requests_id';
    protected $fillable = ['transaction_id', 'customer_id', 'amount', 'gcash_reference_number', 'receipt_path', 'status', 'reviewed_by', 'reviewed_at', 'review_note'];
    protected $casts = ['amount' => 'decimal:2', 'reviewed_at' => 'datetime'];

    /** receipt_path is sent as receipt_url instead, so the image is never in a response twice. */
    protected $hidden = ['receipt_path'];
    protected $appends = ['receipt_url'];

    /** The receipt the customer attached, as an image URL, or null when none was. */
    public function getReceiptUrlAttribute(): ?string
    {
        $stored = trim((string) $this->receipt_path);

        return $stored === '' ? null : $stored;
    }

    public function transaction() { return $this->belongsTo(Transaction::class, 'transaction_id', 'transactions_id'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customer_id', 'customers_id'); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewed_by', 'users_id'); }
}
