<?php

namespace App\Models;

use App\Models\Concerns\HidesFromCustomers;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RiskAlert extends Model
{
    use HasFactory, HidesFromCustomers;

    /** The item's value is for the shop only. */
    protected array $customerHidden = ['current_value'];

    protected $primaryKey = 'risk_alerts_id';
    protected $fillable = ['item_id', 'risk_level', 'current_value', 'loan_amount', 'triggered_at', 'resolved'];
    protected $casts = ['current_value' => 'decimal:2', 'loan_amount' => 'decimal:2', 'triggered_at' => 'datetime', 'resolved' => 'boolean'];

    public function item() { return $this->belongsTo(Item::class, 'item_id', 'items_id'); }
}
