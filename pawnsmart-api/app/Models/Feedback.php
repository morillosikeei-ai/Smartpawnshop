<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One customer's rating of one finished pawn.
 *
 * Optional, and asked for only once. Nothing in the shop's work depends on it:
 * it is a satisfaction measure, not a step in the redemption.
 */
class Feedback extends Model
{
    use HasFactory;

    protected $table = 'feedback';
    protected $primaryKey = 'feedback_id';
    protected $fillable = ['transaction_id', 'customer_id', 'rating', 'comment'];
    protected $casts = ['rating' => 'integer'];

    public function transaction() { return $this->belongsTo(Transaction::class, 'transaction_id', 'transactions_id'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customer_id', 'customers_id'); }
}
