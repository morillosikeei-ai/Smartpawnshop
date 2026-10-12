<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A customer's hold on an item for sale. See the item_reservations migration.
 *
 * A row still marked active after expires_at no longer holds the item; the
 * hourly reservations:expire command marks it expired and tells the customer.
 * Every check goes through scopeHolding, so a late run of that command never
 * keeps an item held.
 */
class ItemReservation extends Model
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_CLAIMED = 'claimed';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_EXPIRED = 'expired';

    /** Most items one customer may hold at once. */
    public const MAX_ACTIVE_PER_CUSTOMER = 2;

    protected $primaryKey = 'item_reservations_id';
    protected $fillable = ['item_id', 'customer_id', 'expires_at', 'status', 'cancelled_by'];
    protected $casts = ['expires_at' => 'datetime'];

    public function item() { return $this->belongsTo(Item::class, 'item_id', 'items_id'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customer_id', 'customers_id'); }

    /** Reservations that hold their item right now. */
    public function scopeHolding(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_ACTIVE)->where('expires_at', '>', now());
    }
}
