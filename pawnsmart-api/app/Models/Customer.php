<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use App\Support\MediaUrl;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    use HasFactory;

    protected $primaryKey = 'customers_id';
    protected $fillable = ['user_id', 'name', 'contact_number', 'address', 'valid_id_type', 'valid_id_number', 'valid_id_photo', 'registered_by_staff_id'];
    protected $casts = ['face_descriptor' => 'array', 'face_consent_at' => 'datetime', 'face_enrolled_at' => 'datetime'];

    /**
     * The face reference is biometric data. It leaves the API only through
     * the staff face endpoint, never in customer lists or a customer's own
     * account data; has_face_reference says whether one exists.
     */
    protected $hidden = ['face_photo', 'face_descriptor'];
    protected $appends = ['has_face_reference'];

    /**
     * The ID photo as a link (see App\Support\MediaUrl). Code that needs the
     * stored image itself reads getRawOriginal('valid_id_photo').
     */
    protected function validIdPhoto(): Attribute
    {
        return Attribute::get(fn (?string $value) => MediaUrl::for('media.customer-id', ['customer' => $this->customers_id], $value));
    }

    public function getHasFaceReferenceAttribute(): bool
    {
        return ! empty($this->attributes['face_descriptor'] ?? null);
    }

    public function user() { return $this->belongsTo(User::class, 'user_id', 'users_id'); }
    public function registeredByStaff() { return $this->belongsTo(User::class, 'registered_by_staff_id', 'users_id'); }
    public function items() { return $this->hasMany(Item::class, 'customer_id', 'customers_id'); }
    public function transactions() { return $this->hasMany(Transaction::class, 'customer_id', 'customers_id'); }
}
