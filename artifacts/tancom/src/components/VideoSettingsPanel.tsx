import { useState } from "react";
import { X, FlipHorizontal2, Sparkles, Moon, Sun, Contrast } from "lucide-react";
import VirtualBackgroundPicker from "./VirtualBackgroundPicker";
import type { VirtualBg } from "@/hooks/useVirtualBackground";
import type { VideoEnhancement } from "@/hooks/useVideoEnhancement";

type Tab = "background" | "video";

interface VideoSettingsPanelProps {
  selectedBg: VirtualBg;
  onBgChange: (bg: VirtualBg) => void;
  enhancement: VideoEnhancement;
  onEnhancementChange: (patch: Partial<VideoEnhancement>) => void;
  onReset: () => void;
  onClose?: () => void;
}

export default function VideoSettingsPanel({
  selectedBg,
  onBgChange,
  enhancement,
  onEnhancementChange,
  onReset,
  onClose,
}: VideoSettingsPanelProps) {
  const [tab, setTab] = useState<Tab>("background");

  const anyActive =
    enhancement.mirror ||
    enhancement.lowLight ||
    enhancement.touchUp ||
    enhancement.brightness !== 0 ||
    enhancement.contrast !== 0;

  return (
    <div className="bg-gray-900 border-t border-gray-700 select-none">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-700/60 px-2">
        <button
          onClick={() => setTab("background")}
          className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
            tab === "background"
              ? "text-white border-blue-500"
              : "text-gray-400 border-transparent hover:text-gray-200"
          }`}
        >
          Background
        </button>
        <button
          onClick={() => setTab("video")}
          className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
            tab === "video"
              ? "text-white border-blue-500"
              : "text-gray-400 border-transparent hover:text-gray-200"
          }`}
        >
          Video &amp; Lighting
          {anyActive && tab !== "video" && (
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
          )}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-md text-gray-600 hover:text-white transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Background tab */}
      {tab === "background" && (
        <VirtualBackgroundPicker
          selected={selectedBg}
          onChange={onBgChange}
          onClose={onClose}
          compact
        />
      )}

      {/* Video & Lighting tab */}
      {tab === "video" && (
        <div className="p-3 space-y-3">
          {/* Toggle rows */}
          <div className="space-y-0.5">
            <ToggleRow
              icon={<FlipHorizontal2 className="h-3.5 w-3.5" />}
              label="Mirror my video"
              description="Flip camera horizontally"
              checked={enhancement.mirror}
              onChange={(v) => onEnhancementChange({ mirror: v })}
            />
            <ToggleRow
              icon={<Moon className="h-3.5 w-3.5" />}
              label="Low light enhancement"
              description="Brighten automatically in dark conditions"
              checked={enhancement.lowLight}
              onChange={(v) => onEnhancementChange({ lowLight: v })}
            />
            <ToggleRow
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="Touch up my appearance"
              description="Subtle softening and warmth boost"
              checked={enhancement.touchUp}
              onChange={(v) => onEnhancementChange({ touchUp: v })}
            />
          </div>

          <div className="border-t border-gray-700/60 pt-3 space-y-3">
            <SliderRow
              icon={<Sun className="h-3.5 w-3.5" />}
              label="Brightness"
              dimLabel="Darker"
              brightLabel="Brighter"
              value={enhancement.brightness}
              min={-50}
              max={80}
              step={5}
              onChange={(v) => onEnhancementChange({ brightness: v })}
            />
            <SliderRow
              icon={<Contrast className="h-3.5 w-3.5" />}
              label="Contrast"
              dimLabel="Softer"
              brightLabel="Sharper"
              value={enhancement.contrast}
              min={-30}
              max={50}
              step={5}
              onChange={(v) => onEnhancementChange({ contrast: v })}
            />
          </div>

          {anyActive && (
            <div className="border-t border-gray-700/60 pt-2">
              <button
                onClick={onReset}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                Reset all adjustments
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onChange(!checked); }}
      className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-800/50 cursor-pointer transition-colors"
    >
      <span className={`shrink-0 ${checked ? "text-blue-400" : "text-gray-500"}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white leading-tight">{label}</p>
        <p className="text-[10px] text-gray-500 leading-tight">{description}</p>
      </div>
      {/* Toggle switch */}
      <div
        aria-checked={checked}
        className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
          checked ? "bg-blue-600" : "bg-gray-600"
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </div>
    </div>
  );
}

function SliderRow({
  icon,
  label,
  dimLabel,
  brightLabel,
  value,
  min,
  max,
  step,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  dimLabel: string;
  brightLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-gray-500 shrink-0">{icon}</span>
        <span className="text-xs font-medium text-white flex-1">{label}</span>
        <span
          className={`text-[10px] w-9 text-right font-mono tabular-nums ${
            value === 0 ? "text-gray-600" : value > 0 ? "text-blue-400" : "text-orange-400"
          }`}
        >
          {value > 0 ? `+${value}` : value}%
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full cursor-pointer accent-blue-500"
          style={{
            background: `linear-gradient(to right, #3b82f6 ${
              ((value - min) / (max - min)) * 100
            }%, #374151 ${((value - min) / (max - min)) * 100}%)`,
          }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-gray-600">
        <span>{dimLabel}</span>
        <span>{brightLabel}</span>
      </div>
    </div>
  );
}
