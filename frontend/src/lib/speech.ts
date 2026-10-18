/**
 * Voz do navegador (Web Speech API, `speechSynthesis`). Não precisa de servidor nem custa nada:
 * as vozes vêm do sistema operacional (Windows, macOS, Android, iOS) ou do próprio Chrome.
 *
 * Três cuidados que essa API pede:
 * - as vozes carregam DEPOIS da página (evento "voiceschanged"); no começo a lista pode vir vazia;
 * - pause() e resume() falham no Android e às vezes no Chrome. Por isso, para pausar, a gente
 *   cancela a fala e lembra em qual estava; "continuar" recomeça aquela fala;
 * - o Chrome corta falas muito longas (uns 15 segundos). O roteiro vem em falas curtas, de 1 a 3 frases.
 */
import { useEffect, useState } from 'react';

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** Nomes comuns de vozes femininas e masculinas em português (a API não informa o gênero). */
const FEMALE = /maria|francisca|thalita|luciana|joana|fernanda|vit[oó]ria|leila|raquel|helo[ií]sa|camila|brenda|elza|giovanna|leticia|let[ií]cia|manuela|yara|female|mulher|google portugu/i;
const MALE = /daniel|ant[oô]nio|felipe|f[aá]bio|donato|j[uú]lio|humberto|ricardo|valerio|duarte|cristiano|nicolau|male|homem/i;

export type VoiceGender = 'f' | 'm' | null;

export function voiceGender(v: SpeechSynthesisVoice): VoiceGender {
  if (FEMALE.test(v.name)) return 'f';
  if (MALE.test(v.name)) return 'm';
  return null;
}

/** Vozes em português: do Brasil primeiro, depois as "naturais"/online (soam melhor), depois as outras. */
export function portugueseVoices(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase().replace('_', '-') === 'pt-br' ? 0 : 10) + (/natural|online|neural|premium|enhanced/i.test(v.name) ? 0 : 1);
  return all.filter((v) => v.lang.toLowerCase().startsWith('pt')).sort((a, b) => score(a) - score(b));
}

/** Lista de vozes que se atualiza quando o navegador termina de carregá-las. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (speechSupported() ? window.speechSynthesis.getVoices() : []));
  useEffect(() => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    const update = () => setVoices(synth.getVoices());
    update();
    synth.addEventListener('voiceschanged', update);
    return () => synth.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

/**
 * Escolhe uma voz para cada pessoa do roteiro. Ana prefere voz feminina e Bruno masculina;
 * se o sistema só tiver uma voz, os dois usam a mesma e a diferença fica no tom (pitch).
 */
export function pickVoice(
  speaker: string,
  voices: SpeechSynthesisVoice[],
  chosen: Record<string, string>
): { voice: SpeechSynthesisVoice | null; pitch: number } {
  const pt = portugueseVoices(voices);
  const byUri = voices.find((v) => v.voiceURI === chosen[speaker]);
  const want: VoiceGender = speaker === 'Ana' ? 'f' : speaker === 'Bruno' ? 'm' : null;
  const voice = byUri ?? (want ? pt.find((v) => voiceGender(v) === want) : undefined) ?? pt[0] ?? null;
  // Mesma voz para os dois? Afina a Ana e engrossa o Bruno para dar para distinguir quem fala.
  const other = speaker === 'Ana' ? 'Bruno' : speaker === 'Bruno' ? 'Ana' : null;
  let pitch = 1;
  if (other && voice) {
    const otherVoice =
      voices.find((v) => v.voiceURI === chosen[other]) ?? pt.find((v) => voiceGender(v) === (other === 'Ana' ? 'f' : 'm')) ?? pt[0];
    if (otherVoice?.voiceURI === voice.voiceURI) pitch = speaker === 'Ana' ? 1.15 : 0.8;
  }
  return { voice, pitch };
}

/**
 * O iOS só deixa o site falar se a primeira fala começar dentro de um toque do usuário.
 * Uma fala vazia no clique de "Gerar" destrava a voz para quando o roteiro chegar.
 */
export function unlockSpeech() {
  if (!speechSupported()) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

/** Minutos aproximados: vozes sintéticas em português falam umas 160 palavras por minuto. */
export function estimateMinutes(texts: string[], rate = 1): number {
  const words = texts.reduce((s, t) => s + t.split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / (160 * rate)));
}
