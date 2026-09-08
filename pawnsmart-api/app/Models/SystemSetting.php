<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SystemSetting extends Model
{
    use HasFactory;

    protected $primaryKey = 'system_settings_id';
    protected $fillable = ['setting_key', 'setting_value'];
}
