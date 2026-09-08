<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    use HasFactory;

    protected $primaryKey = 'customers_id';
    protected $fillable = ['user_id', 'name', 'contact_number', 'address', 'valid_id_type', 'valid_id_number', 'valid_id_photo', 'registered_by_staff_id'];

    public function user() { return $this->belongsTo(User::class, 'user_id', 'users_id'); }
    public function registeredByStaff() { return $this->belongsTo(User::class, 'registered_by_staff_id', 'users_id'); }
    public function items() { return $this->hasMany(Item::class, 'customer_id', 'customers_id'); }
    public function transactions() { return $this->hasMany(Transaction::class, 'customer_id', 'customers_id'); }
}
