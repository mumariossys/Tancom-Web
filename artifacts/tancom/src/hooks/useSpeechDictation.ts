import { useState, useRef, useCallback, useEffect } from "react";

export type DictationState = "idle" | "listening";

export interface UseSpeechDictationOptions {
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  language?: string;
}

export interface UseSpeechDictationReturn {
  state: DictationState;
  isSupported: boolean;
  interimText: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

export function useSpeechDictation(
  options: UseSpeechDictationOptions = {}
): UseSpeechDictationReturn {
  const { onInterimTranscript, onFinalTranscript, language = "en-US" } = options;

  const [state, setState] = useState<DictationState>("idle");
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<AnySpeechRecognition>(null);
  const accumulatedRef = useRef("");
  const stateRef = useRef<DictationState>("idle");

  const SpeechRecognitionCtor: AnySpeechRecognition =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
      : null;

  const isSupported = !!SpeechRecognitionCtor;

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    stateRef.current = "idle";
    setState("idle");
    setInterimText("");
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognitionCtor) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }

    const recognition: AnySpeechRecognition = new SpeechRecognitionCtor();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      stateRef.current = "listening";
      setState("listening");
      setInterimText("");
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      let newFinal = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          newFinal += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (newFinal) {
        accumulatedRef.current += (accumulatedRef.current ? " " : "") + newFinal.trim();
        onFinalTranscript?.(accumulatedRef.current);
      }

      setInterimText(interim);
      if (interim) {
        onInterimTranscript?.(
          accumulatedRef.current + (accumulatedRef.current ? " " : "") + interim
        );
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      stateRef.current = "idle";
      setState("idle");
      setInterimText("");
    };

    recognition.onend = () => {
      setInterimText("");
      if (stateRef.current === "listening") {
        stateRef.current = "idle";
        setState("idle");
      }
    };

    recognitionRef.current = recognition;
    accumulatedRef.current = "";
    recognition.start();
  }, [SpeechRecognitionCtor, language, onFinalTranscript, onInterimTranscript]);

  const reset = useCallback(() => {
    stop();
    accumulatedRef.current = "";
    setInterimText("");
  }, [stop]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  return { state, isSupported, interimText, start, stop, reset };
}
