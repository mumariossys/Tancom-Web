import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { X, Video, Link2, AlertCircle, ArrowRight, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Accept raw code, full URL, or invite link and return just the meeting code.
 * Examples that all resolve correctly:
 *   "ABC-DEF-GHI"  → "ABC-DEF-GHI"
 *   "https://tancom.us/meetings/ABC-DEF-GHI/join"  → "ABC-DEF-GHI"
 *   "tancom.us/meetings/ABC-DEF-GHI/join"           → "ABC-DEF-GHI"
 *   "/meetings/ABC-DEF-GHI/join"                    → "ABC-DEF-GHI"
 */
function parseMeetingCode(raw: string): string {
  const trimmed = raw.trim();

  // Try to extract from a URL path pattern /meetings/<code>/join
  const urlMatch = trimmed.match(/\/meetings\/([^/?#\s]+)(?:\/join)?/i);
  if (urlMatch) return urlMatch[1];

  // Try to extract from a bare domain path like "tancom.us/meetings/<code>"
  const domainMatch = trimmed.match(/tancom\.us\/meetings\/([^/?#\s]+)/i);
  if (domainMatch) return domainMatch[1];

  // Otherwise treat the whole trimmed string as the code
  return trimmed;
}

function isValidCode(code: string): boolean {
  return code.length >= 4 && !/\s/.test(code);
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function JoinMeetingModal({ open, onClose }: Props) {
  const [, setLocation] = useLocation();
  const [rawInput, setRawInput] = useState("");
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRawInput("");
      setPasscode("");
      setShowPasscode(false);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleJoin = () => {
    const code = parseMeetingCode(rawInput);
    if (!isValidCode(code)) {
      setError("Please enter a valid meeting ID or invite link.");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    onClose();
    setLocation(`/meetings/${encodeURIComponent(code)}/join`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleJoin();
  };

  const parsedPreview = rawInput.trim() ? parseMeetingCode(rawInput) : null;
  const showPreview = parsedPreview && parsedPreview !== rawInput.trim() && isValidCode(parsedPreview);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors rounded-full hover:bg-white/10 p-1"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Video className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">Join a Meeting</h2>
              <p className="text-blue-100 text-sm">Enter a meeting ID or paste an invite link</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">

          {/* Meeting ID / link input */}
          <div className="space-y-1.5">
            <Label htmlFor="join-code" className="text-sm font-medium text-gray-700">
              Meeting ID or invite link
            </Label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                id="join-code"
                ref={inputRef}
                value={rawInput}
                onChange={(e) => { setRawInput(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. ABC-DEF-1234 or https://tancom.us/…"
                className={`pl-9 font-mono text-sm h-11 ${error ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {/* Parsed preview — shows extracted code when user pastes a full URL */}
            {showPreview && (
              <p className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                <span className="font-medium">Meeting ID detected:</span>
                <span className="font-mono">{parsedPreview}</span>
              </p>
            )}

            {/* Error */}
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          {/* Passcode toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowPasscode((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {showPasscode ? "Hide passcode field" : "Meeting has a passcode?"}
            </button>

            {showPasscode && (
              <div className="mt-2 space-y-1.5">
                <Label htmlFor="join-passcode" className="text-sm font-medium text-gray-700">
                  Passcode
                </Label>
                <Input
                  id="join-passcode"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter meeting passcode"
                  className="h-11"
                />
                <p className="text-xs text-gray-400">
                  The passcode will be verified in the pre-join screen.
                </p>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-blue-800">Where do I find the meeting ID?</p>
            <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
              <li>In the invitation email from the host</li>
              <li>In a shared invite link (paste the whole link here)</li>
              <li>Shown on screen after the host starts the meeting</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={handleJoin}
            disabled={!rawInput.trim()}
          >
            Join Meeting
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
