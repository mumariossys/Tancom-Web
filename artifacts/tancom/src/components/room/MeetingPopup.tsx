import { X, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface RoomPopupEntry {
  id: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  autoDismissMs?: number;
}

// ── Single card ───────────────────────────────────────────────────────────────
function PopupCard({
  popup,
  onDismiss,
}: {
  popup: RoomPopupEntry;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const autoDismissMs = popup.autoDismissMs ?? 6000;

  useEffect(() => {
    // Tiny delay so the CSS transition fires (mount → visible)
    const raf = requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // wait for exit animation
    }, autoDismissMs);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  function handleAction() {
    popup.action?.onClick();
    handleDismiss();
  }

  return (
    <div
      className={`
        flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl
        shadow-2xl border border-gray-200/80 dark:border-gray-700/60
        px-3 py-2.5 min-w-[260px] max-w-[360px]
        transition-all duration-300 ease-out select-none
        ${visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}
      `}
    >
      {/* TanCom Icon */}
      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
        <span className="text-white text-base font-bold tracking-tight">TC</span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 leading-tight">
          {popup.title}
        </p>
        {popup.subtitle && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {popup.subtitle}
          </p>
        )}
      </div>

      {/* Action button */}
      {popup.action && (
        <div className="flex items-center shrink-0">
          <button
            onClick={handleAction}
            className="
              px-2.5 py-1.5 text-[12px] font-semibold rounded-lg
              bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-800/60
              text-blue-700 dark:text-blue-300 transition-colors
            "
          >
            {popup.action.label}
          </button>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-0.5 shrink-0" />
        </div>
      )}

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="
          shrink-0 w-6 h-6 flex items-center justify-center rounded-full
          text-gray-400 hover:text-gray-600 dark:hover:text-gray-200
          hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
        "
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Stack (renders up to 3 popups, stacked vertically) ────────────────────────
export function MeetingPopupStack({
  popups,
  onDismiss,
}: {
  popups: RoomPopupEntry[];
  onDismiss: (id: string) => void;
}) {
  // Show at most 3 at a time so they don't flood the screen
  const visible = popups.slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[95] flex flex-col gap-2 pointer-events-none">
      {visible.map((p) => (
        <div key={p.id} className="pointer-events-auto">
          <PopupCard popup={p} onDismiss={() => onDismiss(p.id)} />
        </div>
      ))}
    </div>
  );
}
