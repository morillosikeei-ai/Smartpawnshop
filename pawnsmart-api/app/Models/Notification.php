<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One in app message for one recipient.
 *
 * Nothing here is sent by email or SMS. The row is the delivery: the portal
 * bell reads it, and marking it read is the only change a recipient can make.
 */
class Notification extends Model
{
    use HasFactory;

    protected $primaryKey = 'notifications_id';
    protected $fillable = ['user_id', 'type', 'message', 'related_item_id', 'is_read'];
    protected $casts = ['is_read' => 'boolean'];

    public function user() { return $this->belongsTo(User::class, 'user_id', 'users_id'); }
    public function item() { return $this->belongsTo(Item::class, 'related_item_id', 'items_id'); }
}
