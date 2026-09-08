<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasFactory;

    protected $primaryKey = 'audit_logs_id';
    protected $fillable = ['user_id', 'action', 'ticket_number', 'reason'];

    public function user() { return $this->belongsTo(User::class, 'user_id', 'users_id'); }
}
