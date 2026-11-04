import * as React from "react"
import { Wand2, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const AI_SKIP_TYPES = new Set([
  "password", "number", "date", "time", "datetime-local",
  "month", "week", "range", "color", "file", "hidden", "checkbox", "radio",
])

async function correctText(text: string): Promise<string> {
  try {
    const res = await fetch("/api/ai/correct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return text
    const data = await res.json() as { corrected?: string }
    return data.corrected ?? text
  } catch {
    return text
  }
}

export interface InputProps extends React.ComponentProps<"input"> {
  noAiCorrect?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, noAiCorrect, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    const [correcting, setCorrecting] = React.useState(false)
    const [done, setDone] = React.useState(false)

    const mergedRef = React.useCallback(
      (el: HTMLInputElement | null) => {
        (innerRef as React.MutableRefObject<HTMLInputElement | null>).current = el
        if (typeof ref === "function") ref(el)
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
      },
      [ref],
    )

    const showBtn = !noAiCorrect && !AI_SKIP_TYPES.has(type ?? "text")

    const handleCorrect = async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = innerRef.current
      if (!el || !el.value.trim() || correcting) return
      setCorrecting(true)
      try {
        const corrected = await correctText(el.value)
        if (corrected !== el.value) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
          setter?.call(el, corrected)
          el.dispatchEvent(new Event("input", { bubbles: true }))
          el.dispatchEvent(new Event("change", { bubbles: true }))
        }
        setDone(true)
        setTimeout(() => setDone(false), 1800)
      } finally {
        setCorrecting(false)
      }
    }

    const baseClass = cn(
      "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors",
      "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
      "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
      showBtn && "pr-8",
      className,
    )

    if (!showBtn) {
      return (
        <input
          type={type}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className,
          )}
          ref={mergedRef}
          {...props}
        />
      )
    }

    return (
      <div className="relative w-full">
        <input
          type={type}
          className={baseClass}
          ref={mergedRef}
          {...props}
        />
        <button
          type="button"
          title="AI Correction — fix grammar & spelling"
          tabIndex={-1}
          onMouseDown={handleCorrect}
          disabled={correcting}
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors",
            "text-muted-foreground/50 hover:text-violet-500",
            done && "text-green-500 hover:text-green-500",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {correcting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : done ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    )
  },
)
Input.displayName = "Input"

export { Input }
