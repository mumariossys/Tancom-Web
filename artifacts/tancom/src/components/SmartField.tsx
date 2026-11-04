import * as React from "react";
import { Mic, MicOff, Sparkles, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Web Speech API ambient types (self-contained, no global augmentation) ─────
interface ISRAlternative { readonly transcript: string; }
interface ISRResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: ISRAlternative;
}
interface ISRResultList {
  readonly length: number;
  [index: number]: ISRResult;
}
interface ISREvent extends Event {
  readonly resultIndex: number;
  readonly results: ISRResultList;
}
interface ISRInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: ISREvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type ISRConstructor = new () => ISRInstance;

function getSR(): ISRConstructor | undefined {
  const w = window as { SpeechRecognition?: ISRConstructor; webkitSpeechRecognition?: ISRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

type OnChangeFn = (value: string) => void;

function useSmartField(getValue: () => string, onChange: OnChangeFn) {
  const [listening, setListening] = React.useState(false);
  const [rewriting, setRewriting] = React.useState(false);
  const [prevValue, setPrevValue] = React.useState<string | null>(null);
  const recognitionRef = React.useRef<ISRInstance | null>(null);
  const baseValueRef = React.useRef("");
  const interimRef = React.useRef("");

  const stopDictation = React.useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    interimRef.current = "";
  }, []);

  const startDictation = React.useCallback(() => {
    const SR = getSR();
    if (!SR) { alert("Speech recognition is not supported in this browser. Try Chrome or Edge."); return; }

    baseValueRef.current = getValue();
    interimRef.current = "";

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: ISREvent) => {
      let interim = "";
      let finalized = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalized += t;
        else interim += t;
      }
      if (finalized) baseValueRef.current += (baseValueRef.current && !baseValueRef.current.endsWith(" ") ? " " : "") + finalized;
      interimRef.current = interim;
      const combined = baseValueRef.current + (interimRef.current ? (baseValueRef.current.endsWith(" ") ? "" : " ") + interimRef.current : "");
      onChange(combined);
    };

    rec.onerror = () => { setListening(false); };
    rec.onend = () => { setListening(false); interimRef.current = ""; };

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [getValue, onChange]);

  const toggleDictation = React.useCallback(() => {
    if (listening) stopDictation();
    else startDictation();
  }, [listening, startDictation, stopDictation]);

  const rewrite = React.useCallback(async (context?: string) => {
    const text = getValue();
    if (!text.trim()) return;
    setPrevValue(text);
    setRewriting(true);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
      });
      if (!res.ok) throw new Error("Rewrite failed");
      const data = await res.json() as { rewritten: string };
      onChange(data.rewritten);
    } catch {
      setPrevValue(null);
    } finally {
      setRewriting(false);
    }
  }, [getValue, onChange]);

  const undoRewrite = React.useCallback(() => {
    if (prevValue !== null) { onChange(prevValue); setPrevValue(null); }
  }, [prevValue, onChange]);

  React.useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  return { listening, rewriting, prevValue, toggleDictation, rewrite, undoRewrite };
}

/* ─── SmartToolbar (shared) ──────────────────────────────── */
interface ToolbarProps {
  listening: boolean;
  rewriting: boolean;
  prevValue: string | null;
  hasValue: boolean;
  onDictate: () => void;
  onRewrite: () => void;
  onUndo: () => void;
  speechSupported: boolean;
}

function SmartToolbar({ listening, rewriting, prevValue, hasValue, onDictate, onRewrite, onUndo, speechSupported }: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 mt-1">
      {speechSupported && (
        <button
          type="button"
          onClick={onDictate}
          title={listening ? "Stop dictation" : "Dictate"}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-all",
            listening
              ? "bg-red-50 text-red-600 border border-red-200 animate-pulse"
              : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
          )}
        >
          {listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
          {listening ? "Stop" : "Dictate"}
        </button>
      )}
      <button
        type="button"
        onClick={onRewrite}
        disabled={rewriting || !hasValue}
        title="Rewrite with AI"
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-all",
          "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-violet-50 hover:text-violet-600 hover:border-violet-200",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-50 disabled:hover:text-gray-500 disabled:hover:border-gray-200"
        )}
      >
        {rewriting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {rewriting ? "Rewriting…" : "Rewrite"}
      </button>
      {prevValue !== null && (
        <button
          type="button"
          onClick={onUndo}
          title="Undo rewrite"
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-all"
        >
          <RotateCcw className="h-3 w-3" />
          Undo
        </button>
      )}
    </div>
  );
}

/* ─── SmartTextarea ──────────────────────────────────────── */
export interface SmartTextareaProps extends React.ComponentProps<"textarea"> {
  context?: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
}

export const SmartTextarea = React.forwardRef<HTMLTextAreaElement, SmartTextareaProps>(
  ({ context, value, onChange, className, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    const resolvedRef = (ref as React.RefObject<HTMLTextAreaElement>) ?? internalRef;
    const speechSupported = typeof window !== "undefined" && !!getSR();

    const getValue = React.useCallback(() => resolvedRef.current?.value ?? String(value ?? ""), [value]);
    const handleChange = React.useCallback((text: string) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (resolvedRef.current && nativeInputValueSetter) {
        nativeInputValueSetter.call(resolvedRef.current, text);
        resolvedRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      }
      onChange({ target: { value: text } } as React.ChangeEvent<HTMLTextAreaElement>);
    }, [onChange]);

    const { listening, rewriting, prevValue, toggleDictation, rewrite, undoRewrite } = useSmartField(getValue, handleChange);

    return (
      <div className="w-full">
        <textarea
          ref={resolvedRef}
          value={value}
          onChange={onChange}
          className={cn(
            "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            listening && "border-red-300 ring-1 ring-red-200",
            className
          )}
          {...props}
        />
        <SmartToolbar
          listening={listening}
          rewriting={rewriting}
          prevValue={prevValue}
          hasValue={!!String(value ?? "").trim()}
          onDictate={toggleDictation}
          onRewrite={() => rewrite(context)}
          onUndo={undoRewrite}
          speechSupported={speechSupported}
        />
      </div>
    );
  }
);
SmartTextarea.displayName = "SmartTextarea";

/* ─── SmartInput ─────────────────────────────────────────── */
export interface SmartInputProps extends React.ComponentProps<"input"> {
  context?: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}

export const SmartInput = React.forwardRef<HTMLInputElement, SmartInputProps>(
  ({ context, value, onChange, className, type = "text", ...props }, ref) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const resolvedRef = (ref as React.RefObject<HTMLInputElement>) ?? internalRef;
    const speechSupported = typeof window !== "undefined" && !!getSR();

    const getValue = React.useCallback(() => resolvedRef.current?.value ?? String(value ?? ""), [value]);
    const handleChange = React.useCallback((text: string) => {
      onChange({ target: { value: text } } as React.ChangeEvent<HTMLInputElement>);
    }, [onChange]);

    const { listening, rewriting, prevValue, toggleDictation, rewrite, undoRewrite } = useSmartField(getValue, handleChange);

    return (
      <div className="w-full">
        <input
          ref={resolvedRef}
          type={type}
          value={value}
          onChange={onChange}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            listening && "border-red-300 ring-1 ring-red-200",
            className
          )}
          {...props}
        />
        <SmartToolbar
          listening={listening}
          rewriting={rewriting}
          prevValue={prevValue}
          hasValue={!!String(value ?? "").trim()}
          onDictate={toggleDictation}
          onRewrite={() => rewrite(context)}
          onUndo={undoRewrite}
          speechSupported={speechSupported}
        />
      </div>
    );
  }
);
SmartInput.displayName = "SmartInput";
