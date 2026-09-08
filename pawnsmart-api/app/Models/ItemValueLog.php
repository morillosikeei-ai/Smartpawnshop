<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ItemValueLog extends Model
{
    use HasFactory;

    protected $primaryKey = 'item_value_logs_id';
    protected $fillable = ['item_id', 'log_date', 'computed_value', 'gold_price_used'];
    protected $casts = ['log_date' => 'date', 'computed_value' => 'decimal:2', 'gold_price_used' => 'decimal:2'];

    public function item() { return $this->belongsTo(Item::class, 'item_id', 'items_id'); }
}
