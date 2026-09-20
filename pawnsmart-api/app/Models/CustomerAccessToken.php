<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One QR code, as printed on a customer's pawn ticket.
 *
 * See the create_customer_access_tokens_table migration for why the token is
 * held both hashed and encrypted.
 */
class CustomerAccessToken extends Model
{
    protected $primaryKey = 'customer_access_tokens_id';

    protected $fillable = [
        'customer_id',
        'token_hash',
        'token_ciphertext',
        'failed_attempts',
        'locked_until',
        'last_used_at',
        'revoked_at',
    ];

    protected $casts = [
        'locked_until' => 'datetime',
        'last_used_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    protected $hidden = ['token_hash', 'token_ciphertext'];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customers_id');
    }

    /** Whether wrong email addresses have locked this code for now. */
    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }
}
