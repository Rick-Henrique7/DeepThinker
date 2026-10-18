import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { notesApi, isDateString, localIsoDate, NOTES_CHANGED_EVENT, type NoteIndexItem, type TagCount } from '../lib/notes';
import {
  PERIODS,
  activityByDay,
  creationBins,
  linksOf,
  numericKeys,
  scopeNotes,
  sourceCounts,
  topTags,
  writingStats,
  type Period,
} from '../lib/dashboard';
import { ChartCard, ChartEmpty, OTHER_COLOR, seriesColor } from '../components/charts/chartKit';
import { ColumnChart } from '../components/charts/ColumnChart';
import { LineChart, type LinePoint } from '../components/charts/LineChart';
import { BarList } from '../components/charts/BarList';
import { StackedBar } from '../components/charts/StackedBar';
import { CalendarHeatmap } from '../components/charts/CalendarHeatmap';
import { StatTile } from '../components/charts/StatTile';
import { AudioSummaryCard } from '../components/AudioSummaryCard';

const PERIOD_KEY = 'deepthinker.painel.period';

function loadPeriod(): Period {
  try {
    const raw = localStorage.getItem(PERIOD_KEY);
    if (raw === 'null') return null;
    const n = Number(raw);
    return n === 30 || n === 90 || n === 365 ? n : 90;
  } catch {
    return 90;
  }
}

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * Painel "Seu pensamento em números": quanto você pensou, sobre o quê e como as ideias se ligam.
 * Os filtros (período e tag) ficam numa linha só, em cima, e valem para tudo o que está abaixo.
 */
export function PainelPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<NoteIndexItem[] | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [period, setPeriod] = useState<Period>(loadPeriod);
  const [tag, setTag] = useState<string | null>(null);
  const [propKey, setPropKey] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState<string>('created_at');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      notesApi
        .index()
        .then((list) => {
          setItems(list);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Não deu para carregar as notas.'));
      notesApi.tags().then(setTags).catch(() => setTags([]));
    };
    load();
    window.addEventListener(NOTES_CHANGED_EVENT, load);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, load);
  }, []);

  // Veio da paleta com "Ouvir o resumo das notas" (/painel#resumo-audio): desce até o player.
  const loaded = items !== null;
  useEffect(() => {
    if (loaded && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loaded, location.hash]);

  useEffect(() => {
    try {
      localStorage.setItem(PERIOD_KEY, String(period));
    } catch {
      // sem localStorage: volta para 90 dias ao recarregar
    }
  }, [period]);

  const all = items ?? [];
  const scoped = useMemo(() => scopeNotes(all, period, tag), [all, period, tag]);
  // O calendário mostra atividade (criar ou editar) dentro do período, de qualquer nota com a tag.
  const activity = useMemo(() => activityByDay(tag ? scopeNotes(all, null, tag) : all), [all, tag]);
  const bins = useMemo(() => creationBins(scoped, period), [scoped, period]);
  const tagsTop = useMemo(() => topTags(scoped), [scoped]);
  const sources = useMemo(() => sourceCounts(scoped), [scoped]);
  const hubs = useMemo(() => [...scoped].filter((n) => linksOf(n) > 0).sort((a, b) => linksOf(b) - linksOf(a)).slice(0, 8), [scoped]);
  const orphans = useMemo(() => scoped.filter((n) => linksOf(n) === 0), [scoped]);
  const numKeys = useMemo(() => numericKeys(scoped), [scoped]);
  const activeKey = propKey && numKeys.includes(propKey) ? propKey : numKeys[0] ?? null;
  const dateKeys = useMemo(() => {
    const keys = new Set<string>();
    scoped.forEach((n) => Object.entries(n.properties).forEach(([k, v]) => isDateString(v) && keys.add(k)));
    return [...keys];
  }, [scoped]);

  const propPoints: LinePoint[] = useMemo(() => {
    if (!activeKey) return [];
    return scoped
      .filter((n) => typeof n.properties[activeKey] === 'number')
      .map((n) => {
        const raw = dateKey === 'created_at' ? n.created_at : n.properties[dateKey];
        const when = typeof raw === 'string' && (dateKey === 'created_at' || isDateString(raw)) ? new Date(raw.length === 10 ? `${raw}T12:00:00` : raw) : null;
        return when ? { x: when.getTime(), y: n.properties[activeKey] as number, label: n.title, id: n.id } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && Number.isFinite(p.x));
  }, [scoped, activeKey, dateKey]);

  // Uma nota por dia (como o humor no diário)? Então dá para ligar os pontos com uma linha.
  const oneValuePerDay = useMemo(() => {
    const days = propPoints.map((p) => localIsoDate(new Date(p.x)));
    return new Set(days).size === days.length;
  }, [propPoints]);

  const totalLinks = scoped.reduce((s, n) => s + n.links_out, 0);
  const words = scoped.reduce((s, n) => s + n.words, 0);
  const avgLinks = scoped.length ? scoped.reduce((s, n) => s + linksOf(n), 0) / scoped.length : 0;
  const periodLabel = PERIODS.find((p) => p.value === period)!.label.toLowerCase();
  const heatWeeks = period === 30 ? 5 : period === 90 ? 13 : 53;
  const streak = useMemo(() => writingStats(activity, period === 30 || period === 90 ? period : 365), [activity, period]);
  const pages = Math.max(1, Math.round(words / 300));
  const openNote = (id: number) => navigate(`/grafo?focus=${id}`);
  const tagOptions = tag && !tags.some((t) => t.tag === tag) ? [{ tag, count: 0 }, ...tags] : tags;

  return (
    <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto space-y-4">
      <div className="px-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-white">Seu pensamento em números</h1>
        <p className="text-sm text-neutral-500">Quanto você escreveu, sobre o quê, e como as ideias se ligam.</p>
      </div>

      {/* Uma linha de filtros, acima de tudo que eles mudam. O período vem primeiro. */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Período" className="flex items-center gap-1 rounded-xl bg-neutral-900 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              type="button"
              role="radio"
              aria-checked={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={`inline-flex items-center gap-1 min-h-[44px] fino:min-h-[36px] px-2.5 sm:px-3 rounded-lg text-sm ${
                period === p.value ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {period === p.value && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              {p.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Filtrar por tag"
          value={tag ?? ''}
          onChange={(e) => setTag(e.target.value || null)}
          className="min-h-[44px] max-w-[12rem] rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 text-sm text-neutral-200 focus:outline-none focus:border-accent"
        >
          <option value="">Todas as tags</option>
          {tagOptions.map((t) => (
            <option key={t.tag} value={t.tag}>
              #{t.tag}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {items === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-neutral-900/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile
              label="Notas"
              value={scoped.length}
              detail={period === null ? (tag ? `com #${tag}` : 'desde o começo') : `de ${all.length.toLocaleString('pt-BR')} no total`}
            />
            <StatTile label="Ligações" value={totalLinks} detail={`${avgLinks.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por nota, em média`} />
            <StatTile
              label="Notas soltas"
              value={orphans.length}
              detail="sem nenhuma ligação"
              onClick={() => document.getElementById('notas-soltas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />
            <StatTile label="Palavras" value={words} detail={`≈ ${pages.toLocaleString('pt-BR')} ${pages === 1 ? 'página' : 'páginas'}`} />
          </div>

          <ChartCard
            title={period !== null && period <= 90 ? 'Notas criadas por semana' : 'Notas criadas por mês'}
            subtitle={period === null ? 'Desde a primeira nota' : `Nos últimos ${periodLabel}`}
            table={{ columns: [period !== null && period <= 90 ? 'Semana' : 'Mês', 'Notas'], rows: bins.map((b) => [b.title, b.value]) }}
          >
            {scoped.length === 0 ? (
              <ChartEmpty>Nenhuma nota criada nesse período.</ChartEmpty>
            ) : (
              <ColumnChart
                ariaLabel="Notas criadas ao longo do tempo"
                labels={bins.map((b) => b.label)}
                series={[{ name: 'Notas', values: bins.map((b) => b.value) }]}
                tooltipTitle={(i) => bins[i].title}
                unit={(n) => (n === 1 ? 'nota' : 'notas')}
              />
            )}
          </ChartCard>

          <ChartCard
            title="Dias em que você escreveu"
            subtitle={period === null || period === 365 ? 'Notas criadas ou editadas, nos últimos 12 meses' : `Notas criadas ou editadas, nos últimos ${periodLabel}`}
            table={{
              columns: ['Dia', 'Notas'],
              rows: [...activity.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, n]) => [day(`${d}T12:00:00`), n]),
            }}
          >
            <CalendarHeatmap
              counts={activity}
              maxWeeks={heatWeeks}
              ariaLabel="Calendário de dias com notas"
              aside={
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3 min-w-[15rem]">
                  {[
                    { label: 'Dias com nota', value: `${streak.activeDays}`, detail: `de ${streak.windowDays}` },
                    { label: 'Sequência atual', value: `${streak.current}`, detail: streak.current === 1 ? 'dia' : 'dias' },
                    { label: 'Maior sequência', value: `${streak.longest}`, detail: streak.longest === 1 ? 'dia' : 'dias' },
                    { label: 'Dia mais ativo', value: streak.busiestWeekday ?? '—', detail: '' },
                  ].map((st) => (
                    <div key={st.label} className="min-w-0">
                      <dt className="text-xs text-neutral-500">{st.label}</dt>
                      <dd className="mt-0.5 text-white">
                        <span className="text-lg font-semibold">{st.value}</span>
                        {st.detail && <span className="ml-1 text-xs text-neutral-400">{st.detail}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              }
            />
          </ChartCard>

          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard
              title="Tags mais usadas"
              subtitle="Toque numa tag para ver as notas"
              table={{ columns: ['Tag', 'Notas'], rows: tagsTop.map((t) => [`#${t.tag}`, t.count]) }}
            >
              {tagsTop.length === 0 ? (
                <ChartEmpty>Nenhuma tag ainda. Escreva #ideia numa nota ou use o painel de propriedades.</ChartEmpty>
              ) : (
                <BarList
                  ariaLabel="Tags mais usadas"
                  items={tagsTop.map((t) => ({ key: t.tag, label: `#${t.tag}`, value: t.count, hint: t.count === 1 ? 'nota' : 'notas' }))}
                  onSelect={(it) => navigate(`/grafo?view=tabela&tag=${encodeURIComponent(it.key)}`)}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Notas mais ligadas"
              subtitle="As ideias que mais se conectam com as outras"
              table={{ columns: ['Nota', 'Ligações'], rows: hubs.map((n) => [n.title, linksOf(n)]) }}
            >
              {hubs.length === 0 ? (
                <ChartEmpty>Nenhuma ligação ainda. Use [[Título]] para ligar uma nota a outra.</ChartEmpty>
              ) : (
                <BarList
                  ariaLabel="Notas mais ligadas"
                  items={hubs.map((n) => ({ key: String(n.id), label: n.title, value: linksOf(n), hint: linksOf(n) === 1 ? 'ligação' : 'ligações' }))}
                  onSelect={(it) => openNote(Number(it.key))}
                />
              )}
            </ChartCard>

            <ChartCard
              title="De onde vêm as notas"
              subtitle="Escritas por você ou criadas a partir de conversas e documentos"
              table={{ columns: ['Origem', 'Notas'], rows: sources.map((s) => [s.label, s.value]) }}
            >
              {sources.length === 0 ? (
                <ChartEmpty>Nenhuma nota nesse período.</ChartEmpty>
              ) : (
                <StackedBar
                  ariaLabel="Origem das notas"
                  items={sources.map((s) => ({
                    key: s.key,
                    label: s.label,
                    value: s.value,
                    color: s.colorIndex === null ? OTHER_COLOR : seriesColor(s.colorIndex),
                  }))}
                />
              )}
            </ChartCard>

            <section id="notas-soltas" className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-3 scroll-mt-20">
              <div>
                <h3 className="text-sm font-medium text-white">Notas soltas</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {orphans.length === 0
                    ? 'Todas as notas desse período têm pelo menos uma ligação.'
                    : 'Sem nenhuma ligação. Abra uma e ligue a uma ideia parecida.'}
                </p>
              </div>
              <ul className="space-y-1">
                {orphans.slice(0, 8).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNote(n.id)}
                      className="w-full flex items-center justify-between gap-3 min-h-[44px] fino:min-h-0 rounded-lg px-2 py-1.5 -mx-2 text-left hover:bg-neutral-900"
                    >
                      <span className="text-sm text-neutral-200 truncate">{n.title}</span>
                      <span className="text-xs text-neutral-500 whitespace-nowrap">{day(n.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {orphans.length > 8 && <p className="text-xs text-neutral-500">E mais {orphans.length - 8}.</p>}
            </section>
          </div>

          <ChartCard
            title={activeKey ? `${activeKey} ao longo do tempo` : 'Uma propriedade ao longo do tempo'}
            subtitle="Cada ponto é uma nota. Toque num ponto para abrir."
            table={
              activeKey
                ? {
                    columns: ['Data', 'Nota', activeKey],
                    rows: [...propPoints].sort((a, b) => a.x - b.x).map((p) => [new Date(p.x).toLocaleDateString('pt-BR'), p.label ?? '', p.y]),
                  }
                : undefined
            }
            actions={
              numKeys.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Propriedade"
                    value={activeKey ?? ''}
                    onChange={(e) => setPropKey(e.target.value)}
                    className="min-h-[44px] fino:min-h-[32px] max-w-[9rem] rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-200"
                  >
                    {numKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  {dateKeys.length > 0 && (
                    <select
                      aria-label="Data usada"
                      value={dateKey}
                      onChange={(e) => setDateKey(e.target.value)}
                      className="min-h-[44px] fino:min-h-[32px] max-w-[9rem] rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-200"
                    >
                      <option value="created_at">pela data de criação</option>
                      {dateKeys.map((k) => (
                        <option key={k} value={k}>
                          pela data em {k}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : undefined
            }
          >
            {!activeKey ? (
              <ChartEmpty>
                Nenhuma propriedade com número ainda. Dê uma nota às suas ideias, como <code>confiança: 3</code>, e veja como ela muda.
              </ChartEmpty>
            ) : propPoints.length === 0 ? (
              <ChartEmpty>Nenhuma nota com {activeKey} e essa data.</ChartEmpty>
            ) : (
              <LineChart
                ariaLabel={`${activeKey} das notas ao longo do tempo`}
                xType="time"
                series={[{ name: activeKey, points: propPoints }]}
                connect={oneValuePerDay}
                onSelectPoint={(p) => p.id && openNote(p.id)}
              />
            )}
          </ChartCard>

          <AudioSummaryCard />
        </>
      )}
    </div>
  );
}

export default PainelPage;
