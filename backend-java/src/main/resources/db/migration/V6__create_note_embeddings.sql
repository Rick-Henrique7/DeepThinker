-- Memória da IA: o vetor (embedding) de cada nota.
-- Uma linha por nota; apagar a nota apaga o vetor (CASCADE).
-- model diz qual modelo gerou o vetor: vetores de modelos diferentes não se comparam.
-- content_hash evita recalcular quando a nota não mudou.
CREATE TABLE note_embeddings (
    note_id      BIGINT PRIMARY KEY REFERENCES notes (id) ON DELETE CASCADE,
    model        VARCHAR(64) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    vector       BYTEA NOT NULL,
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX note_embeddings_model_idx ON note_embeddings (model);
