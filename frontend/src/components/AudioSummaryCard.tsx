import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Headphones, Loader2, Pause, Play, Save, SkipBack, SkipForward } from 'lucide-react';
import { notesApi, notifyNotesChanged, type AudioStyle, type AudioSummary } from '../lib/notes';
import { estimateMinutes, pickVoice, portugueseVoices, speechSupported, unlockSpeech, useVoices } from '../lib/speech';
import { seriesColor } from './charts/chartKit';

const VOICES_KEY = 'deepthinker.audio.voices';
const RATES = [0.75, 1, 1.25, 1.5];

function loadVoices(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(VOICES_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/** Cada pessoa do roteiro tem um quadradinho de cor (a cor marca quem fala; o texto continua neutro). */
const speakerColor = (speaker: string) => (speaker === 'Bruno' ? seriesColor(1) : seriesColor(0));

const Segmented = <T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) => (
  <div role="radiogroup" aria-label={label} className="flex items-center gap-1 rounded-xl bg-neutral-900 p-1">
    {options.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        onClick={() => onChange(o.value)}
        className={`inline-flex items-center gap-1 min-h-[44px] fino:min-h-[36px] px-2.5 rounded-lg text-sm ${
          value === o.value ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-400 hover:text-white'
        }`}
      >
        {value === o.value && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
        {o.label}
      </button>
    ))}
  </div>
);

/**
 * "Resumo em áudio" (ideia do NotebookLM): a IA escreve um roteiro curto sobre o que você anotou
 * nos últimos dias e o navegador lê em voz alta, com uma voz (resumo) ou duas (conversa a dois).
 *
 * Como tocar uma fala depois da outra: cada fala é um SpeechSynthesisUtterance; quando ela termina
 * (onend), começa a próxima. A "rodada" (runRef) evita um problema: cancelar uma fala também
 * dispara onend, e sem a rodada o player pularia sozinho para a fala seguinte.
 */
export const AudioSummaryCard: React.FC = () => {
  const navigate = useNavigate();
  const voices = useVoices();
  const supported = speechSupported();
  const [days, setDays] = useState<7 | 30>(7);
  const [style, setStyle] = useState<AudioStyle>('resumo');
  const [script, setScript] = useState<AudioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [chosen, setChosen] = useState<Record<string, string>>(loadVoices);
  const [saved, setSaved] = useState<{ id: number; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const runRef = useRef(0);
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  // Os valores mais novos, lidos dentro do onend (que foi criado numa renderização antiga).
  const live = useRef({ script, rate, voices, chosen });
  live.current = { script, rate, voices, chosen };

  const stop = useCallback(() => {
    runRef.current++;
    if (speechSupported()) window.speechSynthesis.cancel();
    setPlaying(false);
  }, []);

  // Saiu da página: para de falar.
  useEffect(() => stop, [stop]);

  const speakFrom = useCallback((index: number) => {
    const { script: s, rate: r, voices: vs, chosen: ch } = live.current;
    if (!s || !speechSupported()) return;
    const synth = window.speechSynthesis;
    const run = ++runRef.current;
    synth.cancel();
    if (index < 0 || index >= s.lines.length) {
      setPlaying(false);
      setCurrent(-1);
      return;
    }
    const line = s.lines[index];
    const { voice, pitch } = pickVoice(line.speaker, vs, ch);
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = voice?.lang ?? 'pt-BR';
    if (voice) u.voice = voice;
    u.rate = r;
    u.pitch = pitch;
    u.onend = () => {
      if (runRef.current === run) speakFrom(index + 1);
    };
    u.onerror = (e) => {
      // "interrupted"/"canceled" é a gente mesmo cancelando (pausa ou pulo); não é erro.
      if (runRef.current !== run || e.error === 'interrupted' || e.error === 'canceled') return;
      setPlaying(false);
      setError('O navegador não conseguiu ler em voz alta. O roteiro continua aqui embaixo.');
    };
    setCurrent(index);
    setPlaying(true);
    // Alguns Chromes ignoram um speak() logo depois de cancel(); um respiro de 50 ms resolve.
    window.setTimeout(() => runRef.current === run && synth.speak(u), 50);
  }, []);

  // A fala atual fica visível na transcrição, sem pular a página inteira.
  useEffect(() => {
    if (current >= 0) lineRefs.current[current]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current]);

  const generate = async () => {
    stop();
    unlockSpeech();
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const result = await notesApi.audioSummary(days, style);
      setScript(result);
      setCurrent(-1);
      live.current.script = result;
      if (supported) speakFrom(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para gerar o resumo.');
    } finally {
      setLoading(false);
    }
  };

  const changeRate = (r: number) => {
    setRate(r);
    live.current.rate = r;
    if (playing) speakFrom(current);
  };

  const chooseVoice = (speaker: string, uri: string) => {
    const next = { ...chosen, [speaker]: uri };
    if (!uri) delete next[speaker];
    setChosen(next);
    live.current.chosen = next;
    try {
      localStorage.setItem(VOICES_KEY, JSON.stringify(next));
    } catch {
      // sem localStorage: a escolha vale só até recarregar
    }
  };

  /** Guarda o episódio como nota, ligado com [[ ]] a cada nota que ele cobriu. */
  const saveAsNote = async () => {
    if (!script) return;
    setSaving(true);
    setError(null);
    const date = new Date().toLocaleDateString('pt-BR');
    const links = script.notes.map((n) => `[[${n.title}]]`).join(', ');
    const body = script.lines.map((l) => (script.style === 'conversa' ? `**${l.speaker}:** ${l.text}` : l.text)).join('\n\n');
    const content = `---\ntipo: resumo em áudio\n---\nRoteiro a partir de ${script.notes.length} ${
      script.notes.length === 1 ? 'nota' : 'notas'
    }: ${links}\n\n${body}\n`;
    try {
      let title = `${script.title} (${date})`;
      let note;
      try {
        note = await notesApi.create(title, content);
      } catch (e) {
        // Já existe uma nota com esse título (gerou duas vezes no mesmo dia): acrescenta a hora.
        if ((e as { status?: number }).status !== 422) throw e;
        title = `${script.title} (${date} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`;
        note = await notesApi.create(title, content);
      }
      setSaved({ id: note.id, title: note.title });
      notifyNotesChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para salvar a nota.');
    } finally {
      setSaving(false);
    }
  };

  const speakers = script ? [...new Set(script.lines.map((l) => l.speaker))] : style === 'conversa' ? ['Ana', 'Bruno'] : ['Narrador'];
  const ptVoices = portugueseVoices(voices);
  const minutes = script ? estimateMinutes(script.lines.map((l) => l.text), rate) : 0;

  return (
    <section id="resumo-audio" aria-labelledby="audio-title" className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-4 scroll-mt-20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-neutral-900 p-2 text-neutral-300">
          <Headphones className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 id="audio-title" className="text-sm font-medium text-white">
            Resumo em áudio
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            A IA conta o que você anotou, como um podcast curto. Bom para ouvir no caminho.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Período do resumo"
          value={days}
          options={[
            { value: 7, label: '7 dias' },
            { value: 30, label: '30 dias' },
          ]}
          onChange={setDays}
        />
        <Segmented
          label="Estilo"
          value={style}
          options={[
            { value: 'resumo', label: 'Uma voz' },
            { value: 'conversa', label: 'Conversa a dois' },
          ]}
          onChange={setStyle}
        />
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-white text-black text-sm font-medium hover:bg-neutral-200 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? 'Escrevendo o roteiro...' : script ? 'Gerar de novo' : supported ? 'Gerar e ouvir' : 'Gerar roteiro'}
        </button>
      </div>

      {!supported && (
        <p className="text-xs text-neutral-500">
          Este navegador não lê textos em voz alta. O roteiro aparece aqui para você ler.
        </p>
      )}
      {supported && voices.length > 0 && ptVoices.length === 0 && (
        <p className="text-xs text-amber-300/90">
          Não achei voz em português neste aparelho; o navegador vai usar a voz padrão. Dá para instalar uma voz em
          português nas configurações de idioma do sistema.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {script && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-medium text-white truncate">{script.title}</div>
              <div className="text-xs text-neutral-500">
                {script.notes.length} {script.notes.length === 1 ? 'nota' : 'notas'} · cerca de {minutes} min
                {current >= 0 && ` · fala ${current + 1} de ${script.lines.length}`}
              </div>
            </div>
            {supported && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Fala anterior"
                  onClick={() => speakFrom(Math.max(0, current - 1))}
                  disabled={current <= 0}
                  className="p-2.5 rounded-full text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label={playing ? 'Pausar' : 'Ouvir'}
                  onClick={() => (playing ? stop() : speakFrom(current >= 0 ? current : 0))}
                  className="p-3 rounded-full bg-white text-black hover:bg-neutral-200"
                >
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  aria-label="Próxima fala"
                  onClick={() => speakFrom(current + 1)}
                  disabled={current < 0 || current >= script.lines.length - 1}
                  className="p-2.5 rounded-full text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
                <select
                  aria-label="Velocidade"
                  value={rate}
                  onChange={(e) => changeRate(Number(e.target.value))}
                  className="ml-1 min-h-[44px] fino:min-h-[36px] rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-200"
                >
                  {RATES.map((r) => (
                    <option key={r} value={r}>
                      {r.toLocaleString('pt-BR')}x
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* A transcrição: a fala atual fica destacada. Tocar numa fala começa dali. */}
          <ol className="max-h-80 overflow-y-auto space-y-1 pr-1" aria-label="Roteiro">
            {script.lines.map((l, i) => (
              <li key={i} ref={(el) => (lineRefs.current[i] = el)}>
                <button
                  type="button"
                  onClick={() => supported && speakFrom(i)}
                  aria-current={i === current ? 'true' : undefined}
                  className={`w-full text-left rounded-xl px-3 py-2 border-l-2 transition-colors ${
                    i === current ? 'bg-neutral-900 border-accent' : 'border-transparent hover:bg-neutral-900/60'
                  } ${supported ? '' : 'cursor-default'}`}
                >
                  {script.style === 'conversa' && (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
                      <span aria-hidden className="h-2 w-2 rounded-[3px]" style={{ background: speakerColor(l.speaker) }} />
                      {l.speaker}
                    </span>
                  )}
                  <span className={`block text-sm leading-relaxed ${i === current ? 'text-white' : 'text-neutral-300'}`}>{l.text}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            {saved ? (
              <button
                type="button"
                onClick={() => navigate(`/grafo?focus=${saved.id}`)}
                className="inline-flex items-center gap-1.5 min-h-[44px] fino:min-h-[36px] px-3 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-neutral-800/60"
              >
                <Check className="w-4 h-4" /> Salvo como "{saved.title}". Abrir
              </button>
            ) : (
              <button
                type="button"
                onClick={saveAsNote}
                disabled={saving}
                className="inline-flex items-center gap-1.5 min-h-[44px] fino:min-h-[36px] px-3 rounded-lg border border-neutral-800 text-sm text-neutral-300 hover:text-white hover:border-neutral-600 disabled:opacity-60"
              >
                <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar como nota'}
              </button>
            )}
            <span className="text-xs text-neutral-500 truncate">
              Sobre:{' '}
              {script.notes.slice(0, 4).map((n, i) => (
                <React.Fragment key={n.id}>
                  {i > 0 && ', '}
                  <button type="button" onClick={() => navigate(`/grafo?focus=${n.id}`)} className="underline decoration-neutral-700 hover:text-neutral-300">
                    {n.title}
                  </button>
                </React.Fragment>
              ))}
              {script.notes.length > 4 && ` e mais ${script.notes.length - 4}`}
            </span>
          </div>
        </div>
      )}

      {supported && ptVoices.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300 select-none">Escolher as vozes</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {speakers.map((sp) => (
              <label key={sp} className="flex items-center gap-2 text-xs text-neutral-400">
                <span className="w-16 flex-shrink-0">{sp}</span>
                <select
                  value={chosen[sp] ?? ''}
                  onChange={(e) => chooseVoice(sp, e.target.value)}
                  className="min-h-[44px] fino:min-h-[36px] w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-200"
                >
                  <option value="">Automática</option>
                  {ptVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
      )}
    </section>
  );
};

export default AudioSummaryCard;
