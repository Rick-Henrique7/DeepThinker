<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ConversationMessage extends Model
{
    use HasFactory;

    protected $fillable = [
        'note_id',
        'role',
        'content',
        'audio_url',
    ];

    public function note(): BelongsTo
    {
        return $this->belongsTo(Note::class);
    }
}