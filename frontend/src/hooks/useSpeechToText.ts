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
 * IMPORTANTE: o retorno de `event.results` é um ArrayLike de `SpeechRecognitionResult`,
 * onde cada resultado é ele próprio um ArrayLike de alternativas. A transcrição
 * real está em `event.results[i][0].transcript` (não `event.results[i].transcript`).
 */
export const useSpeechToText = (language: string = 'pt-BR') => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Navegador não suporta reconhecimento de voz nativo.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        // result é um ArrayLike de alternativas — pega a primeira
        const alt = result && result[0];
        if (alt && typeof alt.transcript === 'string') {
          currentTranscript += alt.transcript;
        }
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Erro no Speech Recognition:', event.error, event.message);
      setError(`Erro na captura: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    };
  }, [language]);

  const startListening = useCallback(() => {
    setError(null);
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error(err);
        setError('Não foi possível iniciar o microfone. Verifique as permissões.');
      }
    }
  }, [isListening]);

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

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
};
