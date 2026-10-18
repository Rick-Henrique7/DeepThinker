import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Loader2, Network, RotateCcw } from 'lucide-react';
import type { MindmapJob } from '../lib/documents';

interface Props {
  job: MindmapJob;
  onOpen: (noteId: number) => void;
  onRetry: (noteId: number, noteTitle: string) => void;
}

/** A linha "Desenhando o mapa mental..." que aparece embaixo do aviso de documento importado. */
export const DocumentMindmapStatus: React.FC<Props> = (props) => (
  <>
    <MindmapLine {...props} />
    <p className="mt-1.5 flex items-center gap-2 text-xs text-neutral-300">
      <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
      <Link to={`/leitor/${props.job.noteId}`} className="font-medium text-white underline underline-offset-2">
        Ler e grifar no Leitor
      </Link>
    </p>
  </>
);

const MindmapLine: React.FC<Props> = ({ job, onOpen, onRetry }) => {
  if (job.status === 'drawing') {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-neutral-300" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
        Desenhando o mapa mental do documento...
      </p>
    );
  }
  if (job.status === 'done') {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-300" role="status">
        <Network className="h-3.5 w-3.5 flex-shrink-0" />
        O mapa mental está no topo da nota.
        <button
          type="button"
          onClick={() => onOpen(job.noteId)}
          className="font-medium text-white underline underline-offset-2"
        >
          Abrir a nota
        </button>
      </p>
    );
  }
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-300" role="status">
      Não deu para desenhar o mapa mental ({job.error}).
      <button
        type="button"
        onClick={() => onRetry(job.noteId, job.noteTitle)}
        className="inline-flex items-center gap-1 font-medium text-white underline underline-offset-2"
      >
        <RotateCcw className="h-3 w-3" /> Tentar de novo
      </button>
    </p>
  );
};

export default DocumentMindmapStatus;
