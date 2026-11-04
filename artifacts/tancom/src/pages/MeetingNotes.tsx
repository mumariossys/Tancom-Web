import { useState, useCallback } from "react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SmartTextarea } from "@/components/SmartField";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NotebookPen,
  FileText,
  Sparkles,
  Download,
  Plus,
  MoreVertical,
  Trash2,
  Pencil,
  Calendar,
  CheckSquare,
  Lightbulb,
  Star,
  ChevronRight,
  Loader2,
  Copy,
  Check,
  BookOpen,
  Mic,
  MicOff,
  WandSparkles,
  RotateCcw,
  Square,
} from "lucide-react";
import {
  listMeetings,
  getListMeetingsQueryKey,
  listMeetingNotes,
  getListMeetingNotesQueryKey,
  createMeetingNote,
  updateMeetingNote,
  deleteMeetingNote,
  getMeetingSummary,
  getGetMeetingSummaryQueryKey,
  generateMeetingSummary,
  exportMeetingNotes,
  getExportMeetingNotesQueryKey,
  polishNoteText,
} from "@workspace/api-client-react";
import type { Meeting, MeetingNote } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSpeechDictation } from "@/hooks/useSpeechDictation";
import { cn } from "@/lib/utils";

type NoteType = "note" | "action" | "decision" | "highlight";

const NOTE_TYPE_CONFIG: Record<
  NoteType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    badgeClass: string;
    dictationHint: string;
  }
> = {
  note: {
    label: "Note",
    icon: FileText,
    color: "text-gray-600",
    badgeClass: "bg-gray-50 text-gray-700 border-gray-200",
    dictationHint: "Speak your meeting note…",
  },
  action: {
    label: "Action Item",
    icon: CheckSquare,
    color: "text-blue-600",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    dictationHint: "Speak an action item or task…",
  },
  decision: {
    label: "Decision",
    icon: Lightbulb,
    color: "text-purple-600",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    dictationHint: "Speak a decision that was made…",
  },
  highlight: {
    label: "Highlight",
    icon: Star,
    color: "text-amber-600",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    dictationHint: "Speak a key highlight or moment…",
  },
};

function NoteTypeBadge({ type }: { type: NoteType }) {
  const cfg = NOTE_TYPE_CONFIG[type] ?? NOTE_TYPE_CONFIG.note;
  return (
    <Badge variant="outline" className={cn("text-xs gap-1", cfg.badgeClass)}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function MeetingListItem({
  meeting,
  selected,
  noteCount,
  onClick,
}: {
  meeting: Meeting;
  selected: boolean;
  noteCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 rounded-lg transition-colors border mb-1",
        selected
          ? "bg-blue-50 border-blue-200 text-blue-900"
          : "bg-white border-gray-100 hover:bg-gray-50 text-gray-800"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{meeting.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {format(new Date(meeting.createdAt), "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {noteCount !== undefined && noteCount > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">
              {noteCount}
            </span>
          )}
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              selected ? "text-blue-500" : "text-gray-300"
            )}
          />
        </div>
      </div>
      {meeting.status && (
        <span
          className={cn("text-xs capitalize mt-1 inline-block", {
            "text-green-600": meeting.status === "active",
            "text-blue-600": meeting.status === "scheduled",
            "text-gray-500": meeting.status === "ended",
          })}
        >
          {meeting.status}
        </span>
      )}
    </button>
  );
}

function NoteCard({
  note,
  isOwner,
  isHostUser,
  onEdit,
  onDelete,
}: {
  note: MeetingNote;
  isOwner: boolean;
  isHostUser: boolean;
  onEdit: (note: MeetingNote) => void;
  onDelete: (noteId: number) => void;
}) {
  const cfg = NOTE_TYPE_CONFIG[note.noteType as NoteType] ?? NOTE_TYPE_CONFIG.note;
  const canDelete = isOwner || isHostUser;

  return (
    <div className="group flex gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className={cn("mt-0.5 shrink-0", cfg.color)}>
        <cfg.icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <NoteTypeBadge type={note.noteType as NoteType} />
            <span className="text-xs text-gray-400">{note.authorName}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">
              {format(new Date(note.createdAt), "h:mm a")}
            </span>
          </div>
          {(isOwner || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwner && (
                  <DropdownMenuItem onClick={() => onEdit(note)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(note.id)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{note.content}</p>
      </div>
    </div>
  );
}

function parseSummaryList(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SummaryPanel({ meetingId, isHost }: { meetingId: number; isHost: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useQuery({
    queryKey: getGetMeetingSummaryQueryKey(meetingId),
    queryFn: ({ signal }) => getMeetingSummary(meetingId, { signal }),
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: () => generateMeetingSummary(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetMeetingSummaryQueryKey(meetingId) });
      toast({ title: "AI Summary generated!" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to generate summary",
        description: err?.message ?? "Please add notes first.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (!summary) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center gap-3">
          <Sparkles className="h-8 w-8 text-gray-300" />
          <div>
            <p className="text-sm font-medium text-gray-600">No AI Summary Yet</p>
            <p className="text-xs text-gray-400 mt-1">
              {isHost
                ? "Generate an AI summary from your meeting notes."
                : "The host can generate an AI summary for this meeting."}
            </p>
          </div>
          {isHost && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate Summary
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI Summary
          </CardTitle>
          {isHost && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Regenerate
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Generated {format(new Date(summary.generatedAt), "MMM d 'at' h:mm a")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-sm text-gray-700 leading-relaxed">{summary.summary}</p>
        {parseSummaryList(summary.keyPoints).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Key Points</p>
            <ul className="space-y-1">
              {parseSummaryList(summary.keyPoints).map((kp, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-blue-500 shrink-0">•</span>{kp}
                </li>
              ))}
            </ul>
          </div>
        )}
        {parseSummaryList(summary.actionItems).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Action Items</p>
            <ul className="space-y-1">
              {parseSummaryList(summary.actionItems).map((ai, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <CheckSquare className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />{ai}
                </li>
              ))}
            </ul>
          </div>
        )}
        {parseSummaryList(summary.decisions).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Decisions</p>
            <ul className="space-y-1">
              {parseSummaryList(summary.decisions).map((d, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-purple-500 shrink-0 mt-0.5" />{d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Voice Dictation Panel ──────────────────────────────────────────────── */

interface DictationPanelProps {
  noteType: NoteType;
  onInsert: (text: string) => void;
  onClose: () => void;
}

function DictationPanel({ noteType, onInsert, onClose }: DictationPanelProps) {
  const { toast } = useToast();
  const [rawText, setRawText] = useState("");
  const [polishedText, setPolishedText] = useState<string | null>(null);
  const [activeText, setActiveText] = useState(""); // what user is editing
  const [phase, setPhase] = useState<"record" | "review">("record");
  const cfg = NOTE_TYPE_CONFIG[noteType];

  const polishMutation = useMutation({
    mutationFn: (content: string) =>
      polishNoteText({ content, noteType }),
    onSuccess: (data) => {
      setPolishedText(data.polished);
      setActiveText(data.polished);
    },
    onError: () => {
      toast({ title: "AI polish failed", description: "Using original text.", variant: "destructive" });
      setActiveText(rawText);
    },
  });

  const handleFinalTranscript = useCallback((text: string) => {
    setRawText(text);
    setActiveText(text);
  }, []);

  const handleInterimTranscript = useCallback((text: string) => {
    setActiveText(text);
  }, []);

  const dictation = useSpeechDictation({
    onFinalTranscript: handleFinalTranscript,
    onInterimTranscript: handleInterimTranscript,
  });

  function handleStopAndReview() {
    dictation.stop();
    setPhase("review");
  }

  function handlePolish() {
    if (!rawText.trim()) return;
    polishMutation.mutate(rawText.trim());
  }

  function handleUseOriginal() {
    setActiveText(rawText);
    setPolishedText(null);
  }

  function handleInsert() {
    if (!activeText.trim()) return;
    onInsert(activeText.trim());
    onClose();
  }

  function handleReRecord() {
    setRawText("");
    setPolishedText(null);
    setActiveText("");
    setPhase("record");
    dictation.reset();
  }

  const isListening = dictation.state === "listening";
  const hasText = rawText.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Note type indicator */}
      <div className="flex items-center gap-2">
        <NoteTypeBadge type={noteType} />
        <span className="text-xs text-gray-500">Voice dictation</span>
      </div>

      {phase === "record" && (
        <>
          {/* Live transcript area */}
          <div
            className={cn(
              "min-h-[100px] rounded-lg border-2 p-3 text-sm transition-colors",
              isListening
                ? "border-red-300 bg-red-50/40"
                : "border-gray-200 bg-gray-50"
            )}
          >
            {activeText ? (
              <p className={cn("leading-relaxed", isListening ? "text-gray-700" : "text-gray-800")}>
                {rawText}
                {dictation.interimText && (
                  <span className="text-gray-400 italic"> {dictation.interimText}</span>
                )}
              </p>
            ) : (
              <p className="text-gray-400 italic">
                {isListening ? cfg.dictationHint : "Click the microphone to start speaking…"}
              </p>
            )}
          </div>

          {!dictation.isSupported && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 border border-amber-200">
              Your browser doesn't support voice dictation. Please use Chrome, Edge, or Safari.
            </p>
          )}

          {/* Recording controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isListening ? (
                <Button
                  size="sm"
                  variant="default"
                  onClick={dictation.start}
                  disabled={!dictation.isSupported}
                  className="gap-2 bg-red-500 hover:bg-red-600 text-white"
                >
                  <Mic className="h-4 w-4" />
                  Start Recording
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleStopAndReview}
                  className="gap-2 bg-gray-800 hover:bg-gray-900 text-white animate-pulse"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop
                </Button>
              )}
              {isListening && (
                <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  Recording
                </div>
              )}
            </div>
            {hasText && !isListening && (
              <Button size="sm" variant="default" onClick={handleStopAndReview} className="gap-2">
                Review & Save
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </>
      )}

      {phase === "review" && (
        <>
          {/* Original transcription */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transcription</p>
              <button
                onClick={handleReRecord}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Re-record
              </button>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 leading-relaxed">
              {rawText || <span className="text-gray-400 italic">No text recorded.</span>}
            </div>
          </div>

          {/* AI Polish button */}
          {!polishedText && (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePolish}
              disabled={!hasText || polishMutation.isPending}
              className="w-full gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              {polishMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <WandSparkles className="h-4 w-4" />
              )}
              {polishMutation.isPending ? "Polishing with AI…" : "Polish with AI"}
            </Button>
          )}

          {/* Polished version comparison */}
          {polishedText && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide flex items-center gap-1">
                  <WandSparkles className="h-3 w-3" />
                  AI Polished
                </p>
                <button
                  onClick={handleUseOriginal}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Use original instead
                </button>
              </div>
            </div>
          )}

          {/* Editable final text */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Final Note <span className="font-normal text-gray-400 normal-case">(edit before saving)</span>
            </p>
            <SmartTextarea
              value={activeText}
              onChange={(e) => setActiveText(e.target.value)}
              className="min-h-[90px] resize-none text-sm"
              placeholder="Your note text…"
              autoFocus
              context="meeting note"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {!polishedText && hasText && (
              <Button
                size="sm"
                variant="outline"
                onClick={handlePolish}
                disabled={polishMutation.isPending}
                className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
              >
                {polishMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <WandSparkles className="h-3.5 w-3.5" />
                )}
                Polish with AI
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleInsert}
              disabled={!activeText.trim()}
              className="gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Save Note
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function MeetingNotesPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("note");
  const [editingNote, setEditingNote] = useState<MeetingNote | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editType, setEditType] = useState<NoteType>("note");
  const [deleteNoteId, setDeleteNoteId] = useState<number | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [dictationOpen, setDictationOpen] = useState(false);
  const [dictationNoteType, setDictationNoteType] = useState<NoteType>("note");
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: meetings, isLoading: meetingsLoading } = useQuery({
    queryKey: getListMeetingsQueryKey(),
    queryFn: ({ signal }) => listMeetings(undefined, { signal }),
  });

  const selectedMeeting = meetings?.find((m) => m.id === selectedMeetingId);
  const isHost = selectedMeeting?.hostClerkId === user?.id;

  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: getListMeetingNotesQueryKey(selectedMeetingId ?? 0),
    queryFn: ({ signal }) => listMeetingNotes(selectedMeetingId!, { signal }),
    enabled: selectedMeetingId !== null,
  });

  const { data: exportData } = useQuery({
    queryKey: getExportMeetingNotesQueryKey(selectedMeetingId ?? 0),
    queryFn: ({ signal }) => exportMeetingNotes(selectedMeetingId!, { signal }),
    enabled: exportOpen && selectedMeetingId !== null,
  });

  const createNote = useMutation({
    mutationFn: (payload: { content: string; noteType: NoteType }) =>
      createMeetingNote(selectedMeetingId!, { content: payload.content, noteType: payload.noteType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListMeetingNotesQueryKey(selectedMeetingId!) });
      setNoteContent("");
      toast({ title: "Note added" });
    },
    onError: () => toast({ title: "Failed to add note", variant: "destructive" }),
  });

  const updateNote = useMutation({
    mutationFn: () =>
      updateMeetingNote(selectedMeetingId!, editingNote!.id, {
        content: editContent.trim(),
        noteType: editType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListMeetingNotesQueryKey(selectedMeetingId!) });
      setEditingNote(null);
      toast({ title: "Note updated" });
    },
    onError: () => toast({ title: "Failed to update note", variant: "destructive" }),
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: number) => deleteMeetingNote(selectedMeetingId!, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListMeetingNotesQueryKey(selectedMeetingId!) });
      setDeleteNoteId(null);
      toast({ title: "Note deleted" });
    },
    onError: () => toast({ title: "Failed to delete note", variant: "destructive" }),
  });

  function openEdit(note: MeetingNote) {
    setEditingNote(note);
    setEditContent(note.content);
    setEditType(note.noteType as NoteType);
  }

  function handleDictationInsert(text: string) {
    createNote.mutate({ content: text, noteType: dictationNoteType });
  }

  function openDictation(type: NoteType) {
    setDictationNoteType(type);
    setDictationOpen(true);
  }

  async function handleCopyExport() {
    if (!exportData?.markdown) return;
    await navigator.clipboard.writeText(exportData.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadExport() {
    if (!exportData?.markdown || !selectedMeeting) return;
    const blob = new Blob([exportData.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedMeeting.title.replace(/\s+/g, "-")}-notes.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const filteredMeetings = (meetings ?? []).filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const notesByType = (notes ?? []).reduce<Record<string, MeetingNote[]>>((acc, n) => {
    if (!acc[n.noteType]) acc[n.noteType] = [];
    acc[n.noteType].push(n);
    return acc;
  }, {});

  const typeOrder: NoteType[] = ["highlight", "decision", "action", "note"];

  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden">
        {/* Left Panel — Meeting List */}
        <div className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <NotebookPen className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-semibold text-gray-900">Meeting Notes</h2>
            </div>
            <input
              type="text"
              placeholder="Search meetings…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:bg-white transition"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {meetingsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredMeetings.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No meetings found</p>
              </div>
            ) : (
              filteredMeetings.map((m) => (
                <MeetingListItem
                  key={m.id}
                  meeting={m}
                  selected={selectedMeetingId === m.id}
                  noteCount={selectedMeetingId === m.id ? notes?.length : undefined}
                  onClick={() => {
                    setSelectedMeetingId(m.id);
                    setShowSummary(false);
                    setNoteContent("");
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Panel — Notes */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          {!selectedMeetingId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <NotebookPen className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Select a Meeting</h3>
              <p className="text-sm text-gray-500 max-w-xs">
                Choose a meeting from the list to view, add, and manage its notes and AI summaries.
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {selectedMeeting?.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedMeeting?.createdAt &&
                        format(new Date(selectedMeeting.createdAt), "MMMM d, yyyy")}
                      {selectedMeeting?.hostName && ` · Host: ${selectedMeeting.hostName}`}
                      {notes !== undefined &&
                        ` · ${notes.length} note${notes.length !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant={showSummary ? "default" : "outline"}
                      onClick={() => setShowSummary(!showSummary)}
                      className="gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Summary
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExportOpen(true)}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Save
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* AI Summary Panel */}
                {showSummary && (
                  <SummaryPanel meetingId={selectedMeetingId} isHost={!!isHost} />
                )}

                {/* Add Note Form */}
                <Card>
                  <CardContent className="pt-4 pb-4">
                    {/* Type selector */}
                    <div className="flex gap-2 flex-wrap mb-3">
                      {(
                        Object.entries(NOTE_TYPE_CONFIG) as [
                          NoteType,
                          (typeof NOTE_TYPE_CONFIG)[NoteType],
                        ][]
                      ).map(([type, cfg]) => (
                        <button
                          key={type}
                          onClick={() => setNoteType(type)}
                          className={cn(
                            "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors",
                            noteType === type
                              ? cfg.badgeClass + " border-current"
                              : "border-gray-200 text-gray-500 hover:bg-gray-50"
                          )}
                        >
                          <cfg.icon className="h-3.5 w-3.5" />
                          {cfg.label}
                        </button>
                      ))}
                    </div>

                    {/* Text input */}
                    <SmartTextarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder={`Add a ${NOTE_TYPE_CONFIG[noteType].label.toLowerCase()}…`}
                      className="min-h-[72px] resize-none text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          if (noteContent.trim())
                            createNote.mutate({ content: noteContent.trim(), noteType });
                        }
                      }}
                      context="meeting note"
                    />

                    {/* Actions row */}
                    <div className="flex items-center justify-between mt-3 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 hidden sm:block">Ctrl+Enter to save</span>
                        {/* Voice dictation shortcuts per type */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                            >
                              <Mic className="h-3.5 w-3.5" />
                              Dictate
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48">
                            {(
                              Object.entries(NOTE_TYPE_CONFIG) as [
                                NoteType,
                                (typeof NOTE_TYPE_CONFIG)[NoteType],
                              ][]
                            ).map(([type, cfg]) => (
                              <DropdownMenuItem
                                key={type}
                                onClick={() => openDictation(type)}
                                className="gap-2"
                              >
                                <cfg.icon className={cn("h-4 w-4", cfg.color)} />
                                Dictate {cfg.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          createNote.mutate({ content: noteContent.trim(), noteType })
                        }
                        disabled={!noteContent.trim() || createNote.isPending}
                        className="gap-1.5"
                      >
                        {createNote.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Add Note
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes List */}
                {notesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-lg" />
                    ))}
                  </div>
                ) : !notes?.length ? (
                  <div className="text-center py-12">
                    <FileText className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">No notes yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Type above or click{" "}
                      <span className="font-medium text-red-500">Dictate</span> to speak your note.
                    </p>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="pt-4 pb-0">
                      {typeOrder.map((type) => {
                        const group = notesByType[type];
                        if (!group?.length) return null;
                        const cfg = NOTE_TYPE_CONFIG[type];
                        return (
                          <div key={type} className="mb-4 last:mb-2">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <cfg.icon className={cn("h-3.5 w-3.5", cfg.color)} />
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                  {cfg.label}s ({group.length})
                                </span>
                              </div>
                              <button
                                onClick={() => openDictation(type)}
                                className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors opacity-60 hover:opacity-100"
                                title={`Dictate a ${cfg.label}`}
                              >
                                <Mic className="h-3 w-3" />
                                Dictate
                              </button>
                            </div>
                            {group.map((note) => (
                              <NoteCard
                                key={note.id}
                                note={note}
                                isOwner={note.authorClerkId === user?.id}
                                isHostUser={!!isHost}
                                onEdit={openEdit}
                                onDelete={setDeleteNoteId}
                              />
                            ))}
                            <Separator className="my-3 last:hidden" />
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Voice Dictation Dialog */}
      <Dialog
        open={dictationOpen}
        onOpenChange={(o) => {
          if (!o) setDictationOpen(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-red-500" />
              Voice Dictation
            </DialogTitle>
          </DialogHeader>
          <DictationPanel
            noteType={dictationNoteType}
            onInsert={handleDictationInsert}
            onClose={() => setDictationOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Note Dialog */}
      <Dialog open={!!editingNote} onOpenChange={(o) => !o && setEditingNote(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex gap-2 flex-wrap">
              {(
                Object.entries(NOTE_TYPE_CONFIG) as [
                  NoteType,
                  (typeof NOTE_TYPE_CONFIG)[NoteType],
                ][]
              ).map(([type, cfg]) => (
                <button
                  key={type}
                  onClick={() => setEditType(type)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors",
                    editType === type
                      ? cfg.badgeClass + " border-current"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  )}
                >
                  <cfg.icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </button>
              ))}
            </div>
            <SmartTextarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[100px] resize-none text-sm"
              autoFocus
              context="meeting note"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingNote(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => updateNote.mutate()}
                disabled={!editContent.trim() || updateNote.isPending}
              >
                {updateNote.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog
        open={deleteNoteId !== null}
        onOpenChange={(o) => !o && setDeleteNoteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteNoteId !== null && deleteNote.mutate(deleteNoteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Save Notes — {selectedMeeting?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-3 mt-2">
            {!exportData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyExport}
                    className="gap-2"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "Copied!" : "Copy Markdown"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadExport}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download .md
                  </Button>
                </div>
                <pre className="flex-1 overflow-y-auto text-xs bg-gray-50 rounded-lg p-4 border whitespace-pre-wrap font-mono text-gray-700 min-h-[300px]">
                  {exportData.markdown}
                </pre>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
