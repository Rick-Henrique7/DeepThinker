<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Connection extends Model
{
    use HasFactory;

    protected $fillable = [
        'source_note_id',
        'target_note_id',
        'weight',
    ];

    public function sourceNote(): BelongsTo
    {
        return $this->belongsTo(Note::class, 'source_note_id');
    }

    public function targetNote(): BelongsTo
    {
        return $this->belongsTo(Note::class, 'target_note_id');
    }
}