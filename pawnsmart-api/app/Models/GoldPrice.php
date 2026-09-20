<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GoldPrice extends Model
{
    use HasFactory;

    protected $primaryKey = 'gold_prices_id';
    protected $fillable = ['price_date', 'price_per_gram', 'melt_prices_json', 'predicted_next_price', 'source'];
    // melt_prices_json: the API's purity-adjusted price per gram by karat,
    // e.g. {"24k": 4000, "18k": 3000}. Null for manual or carried-forward rows.
    protected $casts = ['price_date' => 'date', 'price_per_gram' => 'decimal:2', 'melt_prices_json' => 'array', 'predicted_next_price' => 'decimal:2'];
}
