<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $primaryKey = 'users_id';

    public function getAuthIdentifierName(): string
    {
        return 'users_id';
    }

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'contact_number',
        'status',
        'activation_token',
        'is_activated',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_activated' => 'boolean',
        ];
    }

    public function customerProfile()
    {
        return $this->hasOne(Customer::class, 'user_id', 'users_id');
    }

    public function registeredCustomers()
    {
        return $this->hasMany(Customer::class, 'registered_by_staff_id', 'users_id');
    }

    public function staffItems()
    {
        return $this->hasMany(Item::class, 'staff_id', 'users_id');
    }

    /**
     * In app notifications this account receives, newest first.
     *
     * Named apart from the Notifiable trait's own notifications() relation,
     * which belongs to Laravel's mail and database channels and is unused here.
     */
    public function portalNotifications()
    {
        return $this->hasMany(Notification::class, 'user_id', 'users_id')->latest('notifications_id');
    }
}
