import { useEffect, useRef, useState } from "react";

// ── Web Speech API ambient types (not in TypeScript's DOM lib) ────────────────
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

export interface UseCaptionsOptions {
  enabled: boolean;
  lang?: string;
  onFinalCaption?: (text: string) => void;
}

export function useCaptions({
  enabled,
  lang = "en-US",
  onFinalCaption,
}: UseCaptionsOptions) {
  const [interimText, setInterimText] = useState<string>("");
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const onFinalRef = useRef(onFinalCaption);
  const enabledRef = useRef(enabled);

  useEffect(() => { onFinalRef.current = onFinalCaption; }, [onFinalCaption]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setInterimText("");
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
      return;
    }

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    let active = true;

    const createAndStart = () => {
      if (!active || !enabledRef.current) return;

      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = lang;
      rec.maxAlternatives = 1;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const text = result[0].transcript.trim();
            if (text) {
              onFinalRef.current?.(text);
              setInterimText("");
            }
          } else {
            interim += result[0].transcript;
          }
        }
        setInterimText(interim);
      };

      rec.onend = () => {
        setInterimText("");
        if (active && enabledRef.current) {
          setTimeout(createAndStart, 150);
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "aborted" || event.error === "not-allowed") {
          active = false;
        }
        setInterimText("");
      };

      recognitionRef.current = rec;
      try { rec.start(); } catch { /* already started */ }
    };

    createAndStart();

    return () => {
      active = false;
      setInterimText("");
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    };
  }, [enabled, lang]);

  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  return { interimText, supported };
}
