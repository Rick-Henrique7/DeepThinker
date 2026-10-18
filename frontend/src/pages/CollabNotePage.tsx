import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, Trash2, UserPlus, Users, WifiOff } from 'lucide-react';
import { getStoredUser } from '../lib/auth';
import { collabApi, CollabSession, type CollabNote, type CollabStatus, type Peer, type ShareInfo } from '../lib/collab';
import { CollabEditor } from '../components/CollabEditor';
import { notifyNotesChanged } from '../lib/notes';

/** Espera tanto tempo sem digitar para salvar (o histórico agrupa as mudanças seguidas). */
const SAVE_DELAY = 2000;

/**
 * Nota aberta para edição em conjunto (/compartilhada/:id). Serve para a dona e para quem foi
 * convidada: todos editam o mesmo texto ao mesmo tempo e veem os cursores uns dos outros.
 */
export function CollabNotePage() {
  const { id } = useParams();
  const noteId = Number(id);
  const [note, setNote] = useState<CollabNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CollabSession | null>(null);
  const [status, setStatus] = useState<CollabStatus>('conectando');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [save, setSave] = useState<'salvo' | 'pendente' | 'salvando' | 'erro'>('salvo');
  const timer = useRef(0);
  const sessionRef = useRef<CollabSession | null>(null);

  useEffect(() => {
    if (!Number.isFinite(noteId)) return;
    let alive = true;
    collabApi
      .show(noteId)
      .then((n) => {
        if (!alive) return;
        setNote(n);
        const s = new CollabSession({
          noteId,
          name: getStoredUser()?.name ?? 'Alguém',
          initial: n.content ?? '',
          onStatus: setStatus,
          onPeers: setPeers,
        });
        sessionRef.current = s;
        setSession(s);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      clearTimeout(timer.current);
      const s = sessionRef.current;
      // Saindo com mudança ainda não salva: salva já (sem esperar)
      if (s && timer.current) collabApi.save(noteId, s.text.toString()).catch(() => undefined);
      s?.destroy();
      sessionRef.current = null;
    };
  }, [noteId]);

  const saveNow = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    timer.current = 0;
    setSave('salvando');
    try {
      await collabApi.save(noteId, s.text.toString());
      setSave('salvo');
      notifyNotesChanged();
    } catch {
      setSave('erro');
    }
  }, [noteId]);

  const onLocalChange = useCallback(() => {
    setSave('pendente');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(saveNow, SAVE_DELAY);
  }, [saveNow]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-sm text-neutral-400">
        <p>Não deu para abrir esta nota: {error}</p>
        <Link to="/" className="mt-3 inline-block text-accent underline">Voltar</Link>
      </div>
    );
  }
  if (!note || !session) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-neutral-500">
        <Loader2 className="h-6 w-6 mx-auto animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <Link
          to={note.is_owner ? `/grafo?focus=${note.id}` : '/'}
          aria-label="Voltar"
          className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-900 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-white break-words">{note.title}</h1>
          <p className="text-xs text-neutral-500">
            {note.is_owner ? 'Sua nota, editada em conjunto' : `Nota de ${note.owner_name}, compartilhada com você`}
          </p>
        </div>
        <SaveBadge state={save} status={status} />
      </header>

      <Presence me={session.color} peers={peers} />

      {status === 'removido' ? (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          O convite para esta nota foi removido. Você não pode mais editá-la.
        </p>
      ) : (
        <CollabEditor session={session} peers={peers} onLocalChange={onLocalChange} />
      )}

      <p className="text-[11px] text-neutral-500">
        Tudo o que é digitado aparece na hora para quem está nesta nota e é salvo sozinho. As versões anteriores ficam
        no histórico da nota.
      </p>

      {note.is_owner && <SharePanel noteId={note.id} />}
    </div>
  );
}

function SaveBadge({ state, status }: { state: string; status: CollabStatus }) {
  if (status === 'reconectando' || status === 'conectando') {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-2.5 py-1 text-xs text-amber-300">
        <WifiOff className="h-3.5 w-3.5" /> {status === 'conectando' ? 'Conectando...' : 'Reconectando...'}
      </span>
    );
  }
  const text = { salvo: 'Salvo', pendente: 'Editando...', salvando: 'Salvando...', erro: 'Não salvou' }[state];
  return (
    <span
      role="status"
      className={`flex items-center gap-1.5 rounded-full bg-neutral-900 px-2.5 py-1 text-xs ${state === 'erro' ? 'text-rose-300' : 'text-neutral-400'}`}
    >
      {state === 'salvo' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Loader2 className={`h-3.5 w-3.5 ${state === 'erro' ? '' : 'animate-spin'}`} />}
      {text}
    </span>
  );
}

function Presence({ me, peers }: { me: string; peers: Peer[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400" aria-label="Quem está na nota">
      <Users className="h-4 w-4" />
      <span className="flex items-center gap-1.5 rounded-full border border-neutral-800 px-2 py-0.5">
        <span className="h-2 w-2 rounded-full" style={{ background: me }} /> Você
      </span>
      {peers.map((p) => (
        <span key={p.clientId} data-peer={p.name} className="flex items-center gap-1.5 rounded-full border border-neutral-800 px-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} /> {p.name}
        </span>
      ))}
      {peers.length === 0 && <span className="text-neutral-500">Só você aqui agora.</span>}
    </div>
  );
}

function SharePanel({ noteId }: { noteId: number }) {
  const [shares, setShares] = useState<ShareInfo[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await collabApi.shares(noteId);
      setShares(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setShares([]);
    }
  }, [noteId]);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await collabApi.invite(noteId, email);
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (s: ShareInfo) => {
    try {
      await collabApi.revoke(noteId, s.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
        <UserPlus className="h-4 w-4" /> Convidar para editar junto
      </div>
      <form onSubmit={invite} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e-mail da pessoa (ela precisa ter conta)"
          aria-label="E-mail de quem convidar"
          className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="flex items-center justify-center gap-2 rounded-full bg-white px-4 min-h-[44px] text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Convidar
        </button>
      </form>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {shares && shares.length > 0 && (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-200">{s.name}</p>
                <p className="truncate text-[11px] text-neutral-500">{s.email}</p>
              </div>
              <button
                type="button"
                onClick={() => revoke(s)}
                aria-label={`Remover ${s.name}`}
                title="Remover convite"
                className="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {shares && shares.length === 0 && <p className="text-xs text-neutral-500">Ninguém convidado ainda.</p>}
    </section>
  );
}

export default CollabNotePage;
