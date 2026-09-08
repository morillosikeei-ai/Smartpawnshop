<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GoldPrice extends Model
{
    use HasFactory;

    protected $primaryKey = 'gold_prices_id';
    protected $fillable = ['price_date', 'price_per_gram', 'predicted_next_price', 'source'];
    protected $casts = ['price_date' => 'date', 'price_per_gram' => 'decimal:2', 'predicted_next_price' => 'decimal:2'];
}
