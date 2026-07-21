<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Observers\NoteObserver;

class Note extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'content',
        'summary',
        'embedding',
    ];

    /**
     * Conexões saindo desta nota (onde esta nota é a origem)
     */
    public function outgoingConnections(): HasMany
    {
        return $this->hasMany(Connection::class, 'source_note_id');
    }

    /**
     * Conexões chegando nesta nota (onde esta nota é o destino)
     */
    public function incomingConnections(): HasMany
    {
        return $this->hasMany(Connection::class, 'target_note_id');
    }

    /**
     * Notas que esta nota cita diretamente através dos links [[...]]
     */
    public function connectedNotes(): BelongsToMany
    {
        return $this->belongsToMany(
            Note::class,
            'connections',
            'source_note_id',
            'target_note_id'
        );
    }
    protected static function booted(): void
    {
        static::observe(NoteObserver::class);
    }
    

// Adicione este método dentro da classe Note:
}