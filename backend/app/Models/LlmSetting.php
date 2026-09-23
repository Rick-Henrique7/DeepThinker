<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LlmSetting extends Model
{
    protected $fillable = ['provider', 'key', 'value'];

    public $timestamps = true;
}
