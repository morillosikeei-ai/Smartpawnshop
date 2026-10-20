<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One announced exception to the shop's usual week.
 *
 * Either the branch is shut that day, or it keeps shorter hours. Both are
 * worth a customer knowing before they travel.
 */
class ShopClosure extends Model
{
    use HasFactory;

    protected $primaryKey = 'shop_closures_id';
    protected $fillable = ['closure_date', 'label', 'kind', 'opens_at', 'closes_at'];
    protected $casts = ['closure_date' => 'date'];
}
