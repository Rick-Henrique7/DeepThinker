import { useCallback, useEffect, useRef, useState } from 'react';

// Cada resultado (SpeechRecognitionResult) é um array-like de alternativas
// (SpeechRecognitionAlternative). A alternativa 0 é a "primária" com .transcript.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike extends ArrayLike<SpeechRecognitionAlternativeLike> {
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

/**
 * Hook de Speech-to-Text usando a Web Speech API nativa do navegador.
 *
 * Como o navegador entrega o texto: enquanto voce fala, ele manda varias
 * versoes PROVISORIAS da mesma frase ("hoje", "hoje eu", "hoje eu estava"...)
 * e, quando voce faz uma pausa, uma versao FINAL (isFinal = true).
 *
 * O bug antigo era somar todas as versoes provisorias ao texto, o que gerava
 * "hoje hoje eu hoje eu estava...". Agora:
 * - so as frases finais vao para onFinalText (cada uma uma unica vez);
 * - a frase provisoria fica em `interim`, para mostrar como previa na tela.
 *
 * A transcricao esta em `event.results[i][0].transcript`: cada resultado e uma
 * lista de alternativas, e a 0 e a mais provavel.
 */
export const useSpeechToText = (
  language: string = 'pt-BR',
  onFinalText?: (text: string) => void,
) => {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Indice do proximo resultado final ainda nao entregue (zera a cada start).
  const deliveredRef = useRef(0);
  // Guarda sempre a versao mais nova do callback sem recriar o reconhecedor.
  const onFinalRef = useRef(onFinalText);
  onFinalRef.current = onFinalText;

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      setError('Navegador não suporta reconhecimento de voz nativo. Use o Chrome ou o Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? '';
        if (result.isFinal) {
          if (i >= deliveredRef.current) {
            finalText += text;
            deliveredRef.current = i + 1;
          }
        } else {
          interimText += text;
        }
      }
      if (finalText.trim()) onFinalRef.current?.(finalText.trim());
      setInterim(interimText.trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" (silencio) e "aborted" (parou) nao sao erros de verdade
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(
          event.error === 'not-allowed'
            ? 'Permita o uso do microfone no navegador para ditar.'
            : `Erro na captura: ${event.error}`,
        );
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterim('');
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // ja estava parado
      }
    };
  }, [language]);

  const startListening = useCallback(() => {
    setError(null);
    if (recognitionRef.current && !isListening) {
      try {
        deliveredRef.current = 0;
        setInterim('');
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error(err);
        setError('Não foi possível iniciar o microfone. Verifique as permissões.');
      }
    }
  }, [isListening]);

  /** Para de ouvir. O navegador ainda entrega a ultima frase como final antes de encerrar. */
  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }
  }, [isListening]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    interim,
    error,
    supported,
    startListening,
    stopListening,
    toggleListening,
  };
};
