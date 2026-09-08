<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ActivityFlag extends Model
{
    use HasFactory;

    protected $primaryKey = 'activity_flags_id';
    protected $fillable = ['customer_id', 'reason', 'transaction_count', 'window_days', 'flagged_at', 'resolved'];
    protected $casts = ['transaction_count' => 'integer', 'window_days' => 'integer', 'flagged_at' => 'datetime', 'resolved' => 'boolean'];

    public function customer() { return $this->belongsTo(Customer::class, 'customer_id', 'customers_id'); }
}
