import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartTextarea } from "@/components/SmartField";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare, Plus, Send, Paperclip, Download, X,
  Users, User, Search, File, FileText, FileImage, FileVideo, FileAudio,
  ChevronLeft, Phone, Video, Pin, Trash2, BarChart2, UserPlus, Info, UserMinus,
  Mail, Copy, CheckCircle2, Smile, Share2, CornerUpRight, Check, Reply, ExternalLink, Lock,
  PanelLeftClose, PanelLeftOpen, Star, Tag, Sparkles, LayoutGrid,
  Archive, ArchiveRestore, Contact as ContactIcon, AtSign,
} from "lucide-react";
import {
  listChatRooms, getListChatRoomsQueryKey,
  listChatMessages, getListChatMessagesQueryKey,
  useSendChatMessage,
  requestUploadUrl,
  listContacts, getListContactsQueryKey,
} from "@workspace/api-client-react";
import type { ChatRoomSummary, Contact, UserSearchResult } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isYesterday, isThisYear } from "date-fns";
import CallModal from "@/components/CallModal";
import {
  generateAndStoreKeyPair,
  loadPrivateKey,
  loadStoredPublicKeyJwk,
  importPublicKey,
  generateConversationKey,
  encryptConversationKeyForRecipient,
  decryptConversationKey,
  encryptMessage,
  decryptMessage,
} from "@/lib/e2ee";

// ── Types ──────────────────────────────────────────────────────────────────────
type ReactionMap = Record<number, Record<string, { count: number; reacted: boolean }>>;

// Phase-2 room fields (archived, otherOnline, otherLastSeenAt) are part of the
// generated ChatRoomSummary type since the API spec update.
type RoomEx = ChatRoomSummary;

interface ContactCardPayload {
  name: string; email: string; phone?: string | null;
  username?: string | null; contactClerkId?: string | null;
}
// Mirrors the ContactCardInput constraints from the API schema.
const CONTACT_CARD_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_CARD_PHONE_RE = /^[+\d\s().\/\-]{0,30}$/;
const CONTACT_CARD_USERNAME_RE = /^[\w.\-@]{1,50}$/;

function parseContactCard(content: string | null): ContactCardPayload | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") return null;
    // name: required, non-empty, max 100
    if (typeof parsed.name !== "string" || !parsed.name.trim() || parsed.name.length > 100) return null;
    // email: required, valid format, max 254
    if (typeof parsed.email !== "string" || parsed.email.length > 254) return null;
    if (!CONTACT_CARD_EMAIL_RE.test(parsed.email.trim())) return null;
    // phone: optional, max 30, allowed characters
    if (parsed.phone != null) {
      if (typeof parsed.phone !== "string" || parsed.phone.length > 30) return null;
      if (parsed.phone.trim() && !CONTACT_CARD_PHONE_RE.test(parsed.phone.trim())) return null;
    }
    // username: optional, max 50, alphanumeric/dots/dashes/@
    if (parsed.username != null) {
      if (typeof parsed.username !== "string" || parsed.username.length > 50) return null;
      if (parsed.username.trim() && !CONTACT_CARD_USERNAME_RE.test(parsed.username.trim())) return null;
    }
    // contactClerkId: optional, max 128
    if (parsed.contactClerkId != null && (typeof parsed.contactClerkId !== "string" || parsed.contactClerkId.length > 128)) return null;
    return {
      name: parsed.name.trim(),
      email: parsed.email.trim(),
      phone: typeof parsed.phone === "string" ? parsed.phone.trim() || null : null,
      username: typeof parsed.username === "string" ? parsed.username.trim() || null : null,
      contactClerkId: typeof parsed.contactClerkId === "string" ? parsed.contactClerkId || null : null,
    };
  } catch { /* not JSON */ }
  return null;
}


const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏", "🙏", "💯", "✅", "👎"];

interface MessageItem {
  id: number; roomId: number; senderClerkId: string; senderName: string;
  content: string | null; encryptedIv: string | null; messageType: string; pollId: number | null; pinned: boolean;
  fileObjectPath: string | null; fileName: string | null;
  fileMimeType: string | null; fileSizeBytes: number | null; createdAt: string;
  replyToId: number | null; replyToContent: string | null; replyToSenderName: string | null;
}
interface PollData {
  id: number; question: string; options: string[]; allowMultiple: boolean;
  endsAt: string | null; voteCounts: number[]; totalVotes: number; userVotes: number[];
}
interface CallState {
  callRoomName: string; token: string; livekitUrl: string; callType: "audio" | "video";
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
function formatTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  const time = format(d, "h:mm a");
  if (isToday(d)) return `Today · ${time}`;
  if (isYesterday(d)) return `Yesterday · ${time}`;
  if (isThisYear(d)) return `${format(d, "MMM d")} · ${time}`;
  return `${format(d, "MMM d, yyyy")} · ${time}`;
}
function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}
function FileIcon({ mime }: { mime: string | null | undefined }) {
  if (!mime) return <File className="h-5 w-5" />;
  if (mime.startsWith("image/")) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (mime.startsWith("video/")) return <FileVideo className="h-5 w-5 text-purple-500" />;
  if (mime.startsWith("audio/")) return <FileAudio className="h-5 w-5 text-green-500" />;
  if (mime.includes("pdf") || mime.includes("text")) return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-gray-500" />;
}

function ProtectedChatAttachment({ msg, isOwn }: { msg: MessageItem; isOwn: boolean }) {
  const { data: fileUrl, isLoading } = useQuery({
    queryKey: ["chat-attachment-download-url", msg.fileObjectPath],
    queryFn: async () => {
      const response = await fetch("/api/storage/download-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath: msg.fileObjectPath }),
      });
      if (!response.ok) throw new Error("Could not load attachment");
      return (await response.json() as { downloadURL: string }).downloadURL;
    },
    enabled: !!msg.fileObjectPath,
    staleTime: 4 * 60 * 1000,
  });
  if (isLoading) return <div className="py-2 text-xs text-gray-400">Loading attachment…</div>;
  if (!fileUrl) return <div className="py-2 text-xs text-red-300">Attachment unavailable.</div>;
  const isImage = msg.fileMimeType?.startsWith("image/");
  const isVideo = msg.fileMimeType?.startsWith("video/");
  const isAudio = msg.fileMimeType?.startsWith("audio/");
  return (
    <div className="mb-1">
      {isImage ? (
        <div className="relative group/img">
          <img src={fileUrl} alt={msg.fileName ?? "image"} className="max-w-xs max-h-48 rounded-xl object-cover" />
          <a href={fileUrl} download={msg.fileName ?? "file"} className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white opacity-0 group-hover/img:opacity-100 transition-opacity"><Download className="h-3.5 w-3.5" /></a>
        </div>
      ) : isVideo ? <video src={fileUrl} controls className="max-w-xs max-h-48 rounded-xl" /> : isAudio ? <audio src={fileUrl} controls className="max-w-xs" /> : (
        <a href={fileUrl} download={msg.fileName ?? "file"} className={`flex items-center gap-2.5 p-2.5 rounded-xl w-full text-left ${isOwn ? "bg-white/15 hover:bg-white/25" : "bg-gray-50 hover:bg-gray-100"} transition-colors`}>
          <FileIcon mime={msg.fileMimeType} />
          <div className="flex-1 min-w-0"><p className={`text-xs font-medium truncate ${isOwn ? "text-white" : "text-gray-800"}`}>{msg.fileName ?? "File"}</p><p className={`text-xs ${isOwn ? "text-white/60" : "text-gray-400"}`}>{formatFileSize(msg.fileSizeBytes)}</p></div>
          <Download className={`h-4 w-4 shrink-0 ${isOwn ? "text-white/70" : "text-gray-400"}`} />
        </a>
      )}
    </div>
  );
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}
const avatarColors = ["bg-blue-500","bg-purple-500","bg-green-500","bg-orange-500","bg-pink-500","bg-teal-500"];
function avatarColor(clerkId: string) {
  let h = 0; for (let i = 0; i < clerkId.length; i++) h = (h * 31 + clerkId.charCodeAt(i)) & 0xffff;
  return avatarColors[h % avatarColors.length];
}

// ── Poll View ──────────────────────────────────────────────────────────────────
function PollView({ pollId }: { pollId: number }) {
  const queryClient = useQueryClient();
  const { data: poll, isLoading } = useQuery({
    queryKey: ["poll", pollId],
    queryFn: () => apiFetch<PollData>(`/api/polls/${pollId}`),
    refetchInterval: 5000,
  });
  const voteMut = useMutation({
    mutationFn: (optionIndex: number) =>
      apiFetch<{ voteCounts: number[]; totalVotes: number; userVotes: number[] }>(`/api/polls/${pollId}/vote`, {
        method: "POST", body: JSON.stringify({ optionIndex }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["poll", pollId] }),
  });
  if (isLoading || !poll) return <div className="text-xs text-white/60 animate-pulse">Loading poll…</div>;
  const total = poll.totalVotes || 1;
  return (
    <div className="mt-1 space-y-2 max-w-xs">
      <p className="font-medium text-sm">{poll.question}</p>
      {poll.options.map((opt, i) => {
        const pct = Math.round((poll.voteCounts[i] ?? 0) / total * 100);
        const voted = poll.userVotes.includes(i);
        return (
          <button key={i} onClick={() => voteMut.mutate(i)}
            className={`w-full text-left rounded-lg overflow-hidden border transition-colors ${voted ? "border-blue-400" : "border-gray-200 hover:border-gray-300"}`}>
            <div className="relative px-3 py-2">
              <div className={`absolute inset-0 ${voted ? "bg-blue-100" : "bg-gray-50"}`} style={{ width: `${pct}%`, transition: "width 0.4s" }} />
              <span className="relative text-xs font-medium text-gray-800">{opt}</span>
              <span className="relative float-right text-xs text-gray-500">{poll.voteCounts[i] ?? 0} ({pct}%)</span>
            </div>
          </button>
        );
      })}
      <p className="text-xs text-gray-300">{poll.totalVotes} vote{poll.totalVotes !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ── Chat filter definitions ─────────────────────────────────────────────────────
type ChatFilter = "all" | "new" | "favorites" | "groups" | "tags" | "archived";
const CHAT_FILTERS: { id: ChatFilter; label: string; icon: React.ElementType }[] = [
  { id: "all",       label: "All Chats",  icon: LayoutGrid  },
  { id: "new",       label: "New",        icon: Sparkles    },
  { id: "favorites", label: "Favorites",  icon: Star        },
  { id: "groups",    label: "Groups",     icon: Users       },
  { id: "tags",      label: "Tags",       icon: Tag         },
  { id: "archived",  label: "Archived",   icon: Archive     },
];

// ── Room list item ─────────────────────────────────────────────────────────────
function RoomItem({
  room, active, onClick, collapsed, isFavorite, onToggleFavorite,
}: {
  room: ChatRoomSummary; active: boolean; onClick: () => void;
  collapsed: boolean; isFavorite?: boolean; onToggleFavorite?: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} title={collapsed ? room.name : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative w-full flex items-center rounded-xl text-left transition-all duration-200 ${collapsed ? "justify-center px-0 py-2.5 mx-auto" : "gap-3 px-3 py-2.5"} ${active ? "bg-blue-600 text-white" : "hover:bg-gray-100 text-gray-800"}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${active ? "bg-white/20" : (room.type === "group" ? "bg-indigo-500" : "bg-blue-500")}`}>
        {room.type === "group" ? <Users className="h-4 w-4" /> : getInitials(room.name)}
      </div>
      {!collapsed && (
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline">
            <p className={`font-medium text-sm truncate ${active ? "text-white" : "text-gray-900"}`}>{room.name}</p>
            {room.lastMessageAt && (
              <span className={`text-xs shrink-0 ml-2 ${active ? "text-white/70" : "text-gray-400"}`}>{formatTime(room.lastMessageAt)}</span>
            )}
          </div>
          {room.lastMessage && (
            <p className={`text-xs truncate ${active ? "text-white/80" : "text-gray-500"}`}>{room.lastMessage}</p>
          )}
        </div>
      )}
      {/* Favorite star — use div not button to avoid invalid nested <button> */}
      {!collapsed && onToggleFavorite && (hovered || isFavorite) && (
        <div
          role="button"
          tabIndex={0}
          onClick={onToggleFavorite}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleFavorite(e as unknown as React.MouseEvent); } }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors cursor-pointer ${active ? "hover:bg-white/20" : "hover:bg-gray-200"}`}
        >
          <Star className={`h-3.5 w-3.5 ${isFavorite ? (active ? "fill-yellow-300 text-yellow-300" : "fill-yellow-400 text-yellow-400") : (active ? "text-white/60" : "text-gray-400")}`} />
        </div>
      )}
    </button>
  );
}

// ── Contact card bubble ────────────────────────────────────────────────────────
function ContactCardBubble({ card, isOwn }: { card: ContactCardPayload; isOwn: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [added, setAdded] = useState(false);
  const addMut = useMutation({
    mutationFn: () =>
      apiFetch("/api/contacts", {
        method: "POST",
        body: JSON.stringify({
          name: card.name, email: card.email,
          phone: card.phone ?? undefined, contactClerkId: card.contactClerkId ?? undefined,
        }),
      }),
    onSuccess: () => {
      setAdded(true);
      queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
      toast({ title: `${card.name} added to contacts` });
    },
    onError: () => toast({ title: "Could not add contact", variant: "destructive" }),
  });
  return (
    <div className={`rounded-2xl border p-3 min-w-[220px] max-w-xs ${isOwn ? "bg-blue-600 border-blue-500 text-white rounded-br-sm" : "bg-white border-gray-200 text-gray-900 rounded-bl-sm"}`}>
      <div className="flex items-center gap-2.5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isOwn ? "bg-white/20" : avatarColor(card.email)} text-white font-bold text-sm`}>
          {getInitials(card.name)}
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-semibold truncate ${isOwn ? "text-white" : "text-gray-900"}`}>{card.name}</p>
          {card.username && (
            <p className={`text-xs flex items-center gap-0.5 ${isOwn ? "text-white/80" : "text-blue-600"}`}>
              <AtSign className="h-3 w-3" />{card.username}
            </p>
          )}
          <p className={`text-xs truncate ${isOwn ? "text-white/70" : "text-gray-500"}`}>{card.email}</p>
          {card.phone && <p className={`text-xs ${isOwn ? "text-white/70" : "text-gray-500"}`}>{card.phone}</p>}
        </div>
      </div>
      <div className={`mt-2 pt-2 border-t ${isOwn ? "border-white/20" : "border-gray-100"}`}>
        <button
          onClick={() => addMut.mutate()}
          disabled={addMut.isPending || added}
          className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${isOwn ? "bg-white/15 hover:bg-white/25 text-white" : "bg-blue-50 hover:bg-blue-100 text-blue-700"} disabled:opacity-60`}>
          {added ? <><Check className="h-3.5 w-3.5" /> Added to contacts</> : <><UserPlus className="h-3.5 w-3.5" /> Add to contacts</>}
        </button>
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  msg, isOwn, roomId, myClerkId,
  displayContent,
  reactions, onReact, onShare, onForward, onReply,
}: {
  msg: MessageItem; isOwn: boolean; roomId: number; myClerkId: string;
  displayContent?: string | null;
  reactions?: Record<string, { count: number; reacted: boolean }>;
  onReact?: (msgId: number, emoji: string) => void;
  onShare?: (msg: MessageItem) => void;
  onForward?: (msg: MessageItem) => void;
  onReply?: (msg: MessageItem) => void;
}) {
  const [hover, setHover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Close picker when clicking outside
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  const deleteMut = useMutation({
    mutationFn: () => apiFetch(`/api/chat/rooms/${roomId}/messages/${msg.id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey(roomId, {}) }),
  });
  const pinMut = useMutation({
    mutationFn: () => apiFetch(`/api/chat/rooms/${roomId}/messages/${msg.id}/pin`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey(roomId, {}) }),
  });

  const handleReact = (emoji: string) => {
    setPickerOpen(false);
    onReact?.(msg.id, emoji);
  };

  // Sorted reaction entries for display
  const reactionEntries = Object.entries(reactions ?? {}).sort((a, b) => b[1].count - a[1].count);

  // Shared action buttons (hover toolbar)
  const ActionBar = () => (
    <div className="flex items-center gap-0.5">
      {/* Emoji reaction button */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setPickerOpen((o) => !o)}
          title="Add reaction"
          className="p-1.5 rounded-lg text-gray-300 hover:text-yellow-500 hover:bg-gray-100 transition-colors"
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
        {pickerOpen && (
          <div className={`absolute bottom-full mb-1 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl p-2 w-52 ${isOwn ? "right-0" : "left-0"}`}>
            <p className="text-xs text-gray-400 px-1 pb-1.5 font-medium">React with an emoji</p>
            <div className="grid grid-cols-6 gap-0.5">
              {QUICK_EMOJIS.map((e) => {
                const alreadyReacted = reactions?.[e]?.reacted ?? false;
                return (
                  <button
                    key={e}
                    onClick={() => handleReact(e)}
                    className={`text-lg h-9 w-9 flex items-center justify-center rounded-xl transition-all hover:scale-125 ${alreadyReacted ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-gray-100"}`}
                    title={e}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {/* Reply */}
      {(msg.content || msg.fileObjectPath) && (
        <button onClick={() => onReply?.(msg)} title="Reply"
          className="p-1.5 rounded-lg text-gray-300 hover:text-green-500 hover:bg-gray-100 transition-colors">
          <Reply className="h-3.5 w-3.5" />
        </button>
      )}
      {/* Share */}
      {(msg.content || msg.fileObjectPath) && (
        <button onClick={() => onShare?.(msg)} title="Share"
          className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-gray-100 transition-colors">
          <Share2 className="h-3.5 w-3.5" />
        </button>
      )}
      {/* Forward */}
      {(msg.content || msg.fileObjectPath) && (
        <button onClick={() => onForward?.(msg)} title="Forward to..."
          className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-gray-100 transition-colors">
          <CornerUpRight className="h-3.5 w-3.5" />
        </button>
      )}
      <button onClick={() => pinMut.mutate()} title={msg.pinned ? "Unpin" : "Pin"}
        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors">
        <Pin className="h-3.5 w-3.5" />
      </button>
      {isOwn && (
        <button onClick={() => deleteMut.mutate()} title="Delete"
          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-gray-100 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  const contactCard = msg.messageType === "contact"
    ? parseContactCard(msg.encryptedIv ? (displayContent ?? null) : msg.content)
    : null;
  if (contactCard) {
    return (
      <div className={`flex items-end gap-1.5 ${isOwn ? "flex-row-reverse" : ""} px-2 py-0.5 group`}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => { if (!pickerOpen) setHover(false); }}>
        {!isOwn && (
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold mb-5 ${avatarColor(msg.senderClerkId)}`}>
            {getInitials(msg.senderName)}
          </div>
        )}
        <div className={`max-w-[70%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
          {!isOwn && <span className="text-xs text-gray-500 px-1 mb-0.5">{msg.senderName}</span>}
          <ContactCardBubble card={contactCard} isOwn={isOwn} />
          <span className="text-xs text-gray-400 px-1 mt-0.5">{formatDateTime(msg.createdAt)}</span>
        </div>
        {(hover || pickerOpen) && <div className="mb-6 shrink-0"><ActionBar /></div>}
      </div>
    );
  }

  if (msg.messageType === "system") {
    return (
      <div className="flex items-center justify-center py-2 px-4">
        <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1 italic">
          {msg.content}
        </span>
      </div>
    );
  }

  if (msg.messageType === "poll" && msg.pollId) {
    return (
      <div className="flex items-start gap-2 px-2 py-1"
        onMouseEnter={() => setHover(true)} onMouseLeave={() => { if (!pickerOpen) setHover(false); }}>
        {!isOwn && (
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${avatarColor(msg.senderClerkId)}`}>
            {getInitials(msg.senderName)}
          </div>
        )}
        <div className={`max-w-[70%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
          {!isOwn && <span className="text-xs text-gray-500 px-1 mb-0.5">{msg.senderName}</span>}
          <div className="rounded-2xl px-4 py-3 bg-white border border-gray-200 text-gray-900">
            <PollView pollId={msg.pollId} />
          </div>
          {/* Reactions */}
          {reactionEntries.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 px-1">
              {reactionEntries.map(([emoji, { count, reacted }]) => (
                <button key={emoji} onClick={() => handleReact(emoji)}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all hover:scale-105 ${reacted ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  <span>{emoji}</span><span className="font-medium">{count}</span>
                </button>
              ))}
            </div>
          )}
          <span className="text-xs text-gray-400 px-1 mt-0.5">{formatDateTime(msg.createdAt)}</span>
        </div>
        {(hover || pickerOpen) && <div className="mt-1"><ActionBar /></div>}
      </div>
    );
  }

  return (
    <div
      className={`flex items-end gap-1.5 ${isOwn ? "flex-row-reverse" : ""} px-2 py-0.5 group`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { if (!pickerOpen) setHover(false); }}
    >
      {/* Avatar */}
      {!isOwn && (
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold mb-5 ${avatarColor(msg.senderClerkId)}`}>
          {getInitials(msg.senderName)}
        </div>
      )}

      {/* Bubble + reactions */}
      <div className={`max-w-[70%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && <span className="text-xs text-gray-500 px-1 mb-0.5">{msg.senderName}</span>}

        <div className={`rounded-2xl px-4 py-2 text-sm ${isOwn ? "bg-blue-600 text-white rounded-br-sm" : "bg-white border border-gray-200 text-gray-900 rounded-bl-sm"} ${msg.pinned ? "ring-2 ring-yellow-400" : ""}`}>
          {/* Quoted reply bubble */}
          {msg.replyToId && (
            <div className={`mb-2 rounded-xl px-3 py-1.5 border-l-4 ${isOwn ? "bg-white/15 border-white/50" : "bg-gray-50 border-blue-400"}`}>
              <p className={`text-xs font-semibold mb-0.5 ${isOwn ? "text-white/80" : "text-blue-600"}`}>
                {msg.replyToSenderName ?? "Unknown"}
              </p>
              <p className={`text-xs line-clamp-2 ${isOwn ? "text-white/70" : "text-gray-500"}`}>
                {msg.replyToContent ?? "📎 Attachment"}
              </p>
            </div>
          )}
          {msg.fileObjectPath && <ProtectedChatAttachment msg={msg} isOwn={isOwn} />}
          {msg.encryptedIv
            ? displayContent
              ? <p className="leading-relaxed whitespace-pre-wrap">{displayContent}</p>
              : <p className="leading-relaxed whitespace-pre-wrap italic opacity-60">Decrypting…</p>
            : msg.content
              ? <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              : null}
        </div>

        {/* Reaction bubbles */}
        {reactionEntries.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 px-1 ${isOwn ? "justify-end" : "justify-start"}`}>
            {reactionEntries.map(([emoji, { count, reacted }]) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                title={reacted ? "Remove reaction" : "React"}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all hover:scale-105 active:scale-95 ${reacted ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                <span>{emoji}</span>
                <span className="font-medium">{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-1 mt-0.5">
          <span className="text-xs text-gray-400">{formatDateTime(msg.createdAt)}</span>
          {msg.pinned && <Pin className="h-3 w-3 text-yellow-500" />}
        </div>
      </div>

      {/* Hover action toolbar */}
      {(hover || pickerOpen) && (
        <div className="mb-6 shrink-0">
          <ActionBar />
        </div>
      )}
    </div>
  );
}

// ── Group info panel ───────────────────────────────────────────────────────────
interface GroupMember { clerkId: string; name: string; email: string }

function GroupInfoPanel({
  room, myClerkId, onClose, onCall,
}: {
  room: ChatRoomSummary; myClerkId: string;
  onClose: () => void;
  onCall: (callType: "audio" | "video") => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactPicker, setShowContactPicker] = useState(false);

  const { data: members, isLoading } = useQuery<GroupMember[]>({
    queryKey: ["group-members", room.id],
    queryFn: () => apiFetch<GroupMember[]>(`/api/chat/rooms/${room.id}/members`),
    refetchInterval: 10000,
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: getListContactsQueryKey(),
    queryFn: listContacts,
  });

  const memberClerkIds = new Set(members?.map((m) => m.clerkId) ?? []);

  const filteredContacts = (contacts ?? []).filter((c) => {
    if (!c.contactClerkId) return false;
    if (memberClerkIds.has(c.contactClerkId)) return false;
    if (!contactSearch.trim()) return true;
    const q = contactSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  const addMemberByClerkId = async (clerkId: string, name: string) => {
    setAdding(true);
    try {
      await apiFetch(`/api/chat/rooms/${room.id}/members`, {
        method: "POST",
        body: JSON.stringify({ clerkId }),
      });
      queryClient.invalidateQueries({ queryKey: ["group-members", room.id] });
      setContactSearch("");
      setShowContactPicker(false);
      toast({ title: `${name} added to the group` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add member";
      toast({ title: msg, variant: "destructive" });
    } finally { setAdding(false); }
  };

  const addMemberByEmail = async () => {
    if (!addEmail.trim()) return;
    setAdding(true);
    try {
      await apiFetch(`/api/chat/rooms/${room.id}/members`, {
        method: "POST",
        body: JSON.stringify({ email: addEmail.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: ["group-members", room.id] });
      setAddEmail("");
      toast({ title: "Member added" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add member";
      toast({ title: msg, variant: "destructive" });
    } finally { setAdding(false); }
  };

  const removeMember = async (clerkId: string) => {
    try {
      await apiFetch(`/api/chat/rooms/${room.id}/members/${clerkId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["group-members", room.id] });
      toast({ title: "Member removed" });
    } catch {
      toast({ title: "Failed to remove member", variant: "destructive" });
    }
  };

  return (
    <div className="w-72 border-l border-gray-200 bg-gray-50 flex flex-col h-full shrink-0">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white">
            <Users className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 truncate max-w-[140px]">{room.name}</p>
            <p className="text-xs text-gray-400">{members?.length ?? "…"} members</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Group call buttons */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex gap-2">
        <button
          onClick={() => onCall("audio")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium transition-colors"
        >
          <Phone className="h-3.5 w-3.5" /> Voice Call
        </button>
        <button
          onClick={() => onCall("video")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium transition-colors"
        >
          <Video className="h-3.5 w-3.5" /> Video Call
        </button>
      </div>

      {/* Add member */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add member</p>
          <button
            onClick={() => setShowContactPicker((v) => !v)}
            className={`text-xs font-medium px-2 py-0.5 rounded-lg transition-colors ${showContactPicker ? "bg-indigo-100 text-indigo-700" : "text-indigo-600 hover:bg-indigo-50"}`}
          >
            {showContactPicker ? "Hide contacts" : "From contacts"}
          </button>
        </div>

        {showContactPicker ? (
          <div>
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-indigo-300"
                placeholder="Search contacts…"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
              {filteredContacts.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3 px-2">
                  {contactSearch ? "No contacts match" : "All contacts already in group"}
                </p>
              ) : (
                filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    disabled={adding}
                    onClick={() => addMemberByClerkId(c.contactClerkId!, c.name)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-indigo-50 text-left transition-colors disabled:opacity-50"
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${avatarColor(c.contactClerkId ?? c.email)}`}>
                      {getInitials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                    </div>
                    <UserPlus className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300"
              placeholder="email@example.com"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addMemberByEmail(); }}
            />
            <button
              onClick={addMemberByEmail}
              disabled={adding || !addEmail.trim()}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2 pt-1">Members</p>
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
        {members?.map((m) => (
          <div key={m.clerkId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white transition-colors group">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${avatarColor(m.clerkId)}`}>
              {getInitials(m.name || m.email)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-medium text-gray-900 truncate">{m.name || "Unknown"}</p>
                {m.clerkId === myClerkId && (
                  <Badge variant="outline" className="text-xs border-gray-300 text-gray-500 bg-gray-50 shrink-0">
                    You
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate">{m.email}</p>
            </div>
            {m.clerkId !== myClerkId && (
              <button
                onClick={() => removeMember(m.clerkId)}
                title="Remove from group"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
              >
                <UserMinus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {!isLoading && members?.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No members yet</p>
        )}
      </div>
    </div>
  );
}

// ── Message thread ─────────────────────────────────────────────────────────────
function MessageThread({ room, myClerkId, onBack }: { room: ChatRoomSummary; myClerkId: string; onBack: () => void }) {
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [shareMsg, setShareMsg] = useState<MessageItem | null>(null);
  const [forwardMsg, setForwardMsg] = useState<MessageItem | null>(null);
  const [forwardRoomId, setForwardRoomId] = useState<number | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwarded, setForwarded] = useState(false);
  const [replyToMsg, setReplyToMsg] = useState<MessageItem | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [e2eeKey, setE2eeKey] = useState<CryptoKey | null>(null);
  const [e2eeReady, setE2eeReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useUser();

  const { data: rawMessages, isLoading } = useQuery({
    queryKey: getListChatMessagesQueryKey(room.id, {}),
    queryFn: () => listChatMessages(room.id, {}),
    refetchInterval: 3000,
  });

  // Cast to our richer type
  const messages = rawMessages as unknown as MessageItem[] | undefined;

  // ── Reactions ──────────────────────────────────────────────────────────────
  const reactionsQueryKey = ["chat-reactions", room.id];
  const { data: reactionMap = {} } = useQuery<ReactionMap>({
    queryKey: reactionsQueryKey,
    queryFn: () => apiFetch<ReactionMap>(`/api/chat/rooms/${room.id}/reactions`),
    refetchInterval: 5000,
  });

  const toggleReaction = useMutation({
    mutationFn: ({ msgId, emoji }: { msgId: number; emoji: string }) =>
      apiFetch(`/api/chat/rooms/${room.id}/messages/${msgId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reactionsQueryKey }),
  });

  // ── Forward ────────────────────────────────────────────────────────────────
  const { data: allRooms } = useQuery({
    queryKey: getListChatRoomsQueryKey(),
    queryFn: listChatRooms,
  });
  const forwardableRooms = (allRooms ?? []).filter((r) => r.id !== room.id);
  const filteredForwardRooms = forwardableRooms.filter((r) =>
    r.name.toLowerCase().includes(forwardSearch.toLowerCase())
  );

  const forwardMutation = useSendChatMessage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChatRoomsQueryKey() });
        setForwarded(true);
        setTimeout(() => {
          setForwardMsg(null);
          setForwardRoomId(null);
          setForwardSearch("");
          setForwarded(false);
        }, 1200);
      },
      onError: () => toast({ title: "Failed to forward message", variant: "destructive" }),
    },
  });

  const handleForwardSend = () => {
    if (!forwardMsg || !forwardRoomId) return;
    forwardMutation.mutate({
      roomId: forwardRoomId,
      data: {
        content: forwardMsg.content ?? undefined,
        fileObjectPath: forwardMsg.fileObjectPath ?? undefined,
        fileName: forwardMsg.fileName ?? undefined,
        fileMimeType: forwardMsg.fileMimeType ?? undefined,
        fileSizeBytes: forwardMsg.fileSizeBytes ?? undefined,
      },
    });
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = (msg: MessageItem) => {
    setShareMsg(msg);
  };

  const getShareText = (msg: MessageItem) =>
    msg.content ?? msg.fileName ?? "Shared from TanCom";

  const getShareUrl = (msg: MessageItem) =>
    msg.fileObjectPath
      ? `${window.location.origin}/api/storage${msg.fileObjectPath}`
      : window.location.href;

  const handleShareWhatsApp = () => {
    if (!shareMsg) return;
    const text = getShareText(shareMsg);
    const url = getShareUrl(shareMsg);
    const full = shareMsg.fileObjectPath ? `${text}\n${url}` : text;
    window.open(`https://wa.me/?text=${encodeURIComponent(full)}`, "_blank");
    setShareMsg(null);
  };

  const handleShareEmail = () => {
    if (!shareMsg) return;
    const text = getShareText(shareMsg);
    const url = getShareUrl(shareMsg);
    const body = shareMsg.fileObjectPath ? `${text}\n\n${url}` : text;
    window.open(
      `mailto:?subject=${encodeURIComponent("Shared from TanCom")}&body=${encodeURIComponent(body)}`,
      "_blank",
    );
    setShareMsg(null);
  };

  const handleShareCopy = async () => {
    if (!shareMsg) return;
    const text = shareMsg.fileObjectPath
      ? getShareUrl(shareMsg)
      : getShareText(shareMsg);
    await navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: "Copied to clipboard" });
    setShareMsg(null);
  };

  const createPoll = useMutation({
    mutationFn: () => apiFetch("/api/polls", {
      method: "POST",
      body: JSON.stringify({ chatRoomId: room.id, question: pollQuestion, options: pollOptions.filter((o) => o.trim()), allowMultiple: pollAllowMultiple }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey(room.id, {}) });
      setShowPollDialog(false); setPollQuestion(""); setPollOptions(["", ""]); setPollAllowMultiple(false);
    },
    onError: () => toast({ title: "Failed to create poll", variant: "destructive" }),
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── E2EE initialisation ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function initE2EE() {
      try {
        // 1. Ensure we have a local key pair; upload public key if new
        let privateKey = await loadPrivateKey();
        let storedJwk = await loadStoredPublicKeyJwk();
        if (!privateKey || !storedJwk) {
          const { publicKeyJwk } = await generateAndStoreKeyPair();
          storedJwk = publicKeyJwk;
          privateKey = await loadPrivateKey();
          await apiFetch("/api/profile/public-key", {
            method: "PUT",
            body: JSON.stringify({ publicKey: publicKeyJwk }),
          });
        } else {
          // Re-upload in case server lost it (e.g. DB reset)
          await apiFetch("/api/profile/public-key", {
            method: "PUT",
            body: JSON.stringify({ publicKey: storedJwk }),
          }).catch(() => {});
        }
        if (!privateKey || cancelled) return;

        // 2. Try to fetch our existing encrypted conversation key
        const existingKey = await apiFetch<{ encryptedKey: string; iv: string; ephemeralPublicKey: string }>(
          `/api/chat/rooms/${room.id}/e2e-key`,
        ).catch(() => null);

        if (existingKey) {
          const convKey = await decryptConversationKey(
            existingKey.encryptedKey,
            existingKey.iv,
            existingKey.ephemeralPublicKey,
            privateKey,
          );
          if (!cancelled) { setE2eeKey(convKey); setE2eeReady(true); }
          return;
        }

        // 3. No key yet → we are first. Generate one and distribute to all members.
        const memberKeys = await apiFetch<Array<{ clerkId: string; publicKey: string | null }>>(
          `/api/chat/rooms/${room.id}/member-keys`,
        );

        const convKey = await generateConversationKey();
        const bundles = await Promise.all(
          memberKeys
            .filter((m) => m.publicKey)
            .map(async (m) => {
              const recipientPubKey = await importPublicKey(m.publicKey!);
              const bundle = await encryptConversationKeyForRecipient(convKey, recipientPubKey);
              return { clerkId: m.clerkId, ...bundle };
            }),
        );

        await apiFetch(`/api/chat/rooms/${room.id}/e2e-key`, {
          method: "POST",
          body: JSON.stringify(bundles),
        });

        if (!cancelled) { setE2eeKey(convKey); setE2eeReady(true); }
      } catch (err) {
        if (!cancelled) console.warn("E2EE init failed, messages will be sent unencrypted", err);
      }
    }
    initE2EE();
    return () => { cancelled = true; };
  }, [room.id]);

  const handleSend = useCallback(async () => {
    if (!text.trim() && !pendingFile) return;
    const replyFields = replyToMsg ? {
      replyToId: replyToMsg.id,
      replyToContent: replyToMsg.content ?? replyToMsg.fileName ?? "Attachment",
      replyToSenderName: replyToMsg.senderName,
    } : {};

    const afterSend = () => {
      queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey(room.id, {}) });
      queryClient.invalidateQueries({ queryKey: getListChatRoomsQueryKey() });
      setText(""); setPendingFile(null); setReplyToMsg(null);
    };

    // Encrypt text content if E2EE is ready
    async function buildTextPayload(raw: string | undefined) {
      if (!raw || !e2eeKey) return { content: raw };
      const { ciphertext, iv } = await encryptMessage(raw, e2eeKey);
      return { content: ciphertext, encryptedIv: iv };
    }

    if (pendingFile) {
      setIsUploading(true);
      try {
        const urlRes = await requestUploadUrl({ name: pendingFile.name, size: pendingFile.size, contentType: pendingFile.type || "application/octet-stream" });
        await fetch(urlRes.uploadURL, { method: "PUT", headers: { "Content-Type": pendingFile.type || "application/octet-stream" }, body: pendingFile });
        const textPayload = await buildTextPayload(text.trim() || undefined);
        await apiFetch(`/api/chat/rooms/${room.id}/messages`, {
          method: "POST",
          body: JSON.stringify({ ...textPayload, fileObjectPath: urlRes.objectPath, fileName: pendingFile.name, fileMimeType: pendingFile.type, fileSizeBytes: pendingFile.size, ...replyFields }),
        });
        afterSend();
      } catch { toast({ title: "Upload failed", variant: "destructive" }); }
      finally { setIsUploading(false); }
    } else {
      setIsSending(true);
      const textPayload = await buildTextPayload(text.trim()).catch(() => ({ content: text.trim() }));
      await apiFetch(`/api/chat/rooms/${room.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ ...textPayload, ...replyFields }),
      }).then(afterSend).catch(() => toast({ title: "Failed to send message", variant: "destructive" }))
        .finally(() => setIsSending(false));
    }
  }, [text, pendingFile, room.id, replyToMsg, queryClient, toast, e2eeKey]);

  // ── Archive / unarchive ──────────────────────────────────────────────────────
  const archiveMut = useMutation({
    mutationFn: (archived: boolean) =>
      apiFetch<{ archived: boolean }>(`/api/chat/rooms/${room.id}/archive`, {
        method: "PATCH", body: JSON.stringify({ archived }),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: getListChatRoomsQueryKey() });
      toast({ title: r.archived ? "Chat archived" : "Chat unarchived" });
      if (r.archived) onBack();
    },
    onError: () => toast({ title: "Could not update chat", variant: "destructive" }),
  });

  // ── Share a contact card ─────────────────────────────────────────────────────
  const [showShareContact, setShowShareContact] = useState(false);
  const [shareContactSearch, setShareContactSearch] = useState("");
  const { data: myContacts } = useQuery({
    queryKey: getListContactsQueryKey(),
    queryFn: listContacts,
    enabled: showShareContact,
  });
  const shareContactMut = useMutation({
    mutationFn: async (c: Contact) => {
      const card: ContactCardPayload = {
        name: c.name, email: c.email, phone: c.phone ?? null,
        contactClerkId: c.contactClerkId ?? null,
      };
      // Honor E2EE: encrypt the card with the conversation key when available.
      let payload: Record<string, unknown>;
      if (e2eeKey) {
        const { ciphertext, iv } = await encryptMessage(JSON.stringify(card), e2eeKey);
        payload = { messageType: "contact", content: ciphertext, encryptedIv: iv };
      } else {
        payload = { messageType: "contact", contactCard: card };
      }
      return apiFetch(`/api/chat/rooms/${room.id}/messages`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setShowShareContact(false);
      setShareContactSearch("");
      queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey(room.id, {}) });
      queryClient.invalidateQueries({ queryKey: getListChatRoomsQueryKey() });
    },
    onError: () => toast({ title: "Could not share contact", variant: "destructive" }),
  });

  const startCall = async (callType: "audio" | "video") => {
    try {
      const res = await apiFetch<CallState>("/api/calls/start", { method: "POST", body: JSON.stringify({ roomId: room.id, callType }) });
      setCallState({ ...res, callType });
    } catch { toast({ title: "Could not start call", variant: "destructive" }); }
  };

  // ── Decrypt incoming messages ────────────────────────────────────────────────
  const [decryptedMap, setDecryptedMap] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (!e2eeKey || !messages) return;
    const encryptedMsgs = messages.filter((m) => m.encryptedIv && m.content && !decryptedMap.has(m.id));
    if (encryptedMsgs.length === 0) return;
    Promise.all(
      encryptedMsgs.map(async (m) => {
        try {
          const plain = await decryptMessage(m.content!, m.encryptedIv!, e2eeKey);
          return [m.id, plain] as [number, string];
        } catch {
          return [m.id, "🔒 (Unable to decrypt)"] as [number, string];
        }
      }),
    ).then((results) => {
      setDecryptedMap((prev) => {
        const next = new Map(prev);
        for (const [id, text] of results) next.set(id, text);
        return next;
      });
    });
  }, [messages, e2eeKey]);

  function getMessageText(msg: MessageItem): string | null {
    if (!msg.content) return null;
    if (msg.encryptedIv) return decryptedMap.get(msg.id) ?? null;
    return msg.content;
  }

  const orderedMessages = messages ? [...messages].reverse() : [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shrink-0">
        <button onClick={onBack} className="lg:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${room.type === "group" ? "bg-indigo-500" : "bg-blue-500"}`}>
          {room.type === "group" ? <Users className="h-4 w-4" /> : getInitials(room.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{room.name}</p>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            {room.type === "direct" ? (
              (room as RoomEx).otherOnline ? (
                <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" /> Online
                </span>
              ) : (room as RoomEx).otherLastSeenAt ? (
                <span>Last seen {formatTime((room as RoomEx).otherLastSeenAt!)}</span>
              ) : (
                "Direct Message"
              )
            ) : "Group Chat"}
            {e2eeReady && (
              <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium">
                <Lock className="h-2.5 w-2.5" /> End-to-end encrypted
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => startCall("audio")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold transition-colors border border-green-200"
          >
            <Phone className="h-3.5 w-3.5" /> Voice
          </button>
          <button
            onClick={() => startCall("video")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors border border-blue-200"
          >
            <Video className="h-3.5 w-3.5" /> Video
          </button>
          <button
            onClick={() => archiveMut.mutate(!(room as RoomEx).archived)}
            title={(room as RoomEx).archived ? "Unarchive chat" : "Archive chat"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-semibold transition-colors border border-gray-200"
          >
            {(room as RoomEx).archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </button>
          {room.type === "group" && (
            <button
              onClick={() => setShowInfo((v) => !v)}
              title="Group members"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${showInfo ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200"}`}
            >
              <Users className="h-3.5 w-3.5" /> Members
            </button>
          )}
        </div>
      </div>

      {/* Body: messages + optional group info panel */}
      <div className="flex flex-1 min-h-0">
        {/* Messages + input */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`flex gap-3 px-4 py-1 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}>
                <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? "w-2/5" : "w-1/3"}`} />
              </div>
            ))}
            {orderedMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isOwn={msg.senderClerkId === myClerkId}
                roomId={room.id}
                myClerkId={myClerkId}
                displayContent={getMessageText(msg)}
                reactions={reactionMap[msg.id]}
                onReact={(msgId, emoji) => toggleReaction.mutate({ msgId, emoji })}
                onShare={handleShare}
                onForward={(m) => { setForwardMsg(m); setForwardRoomId(null); setForwardSearch(""); setForwarded(false); }}
                onReply={(m) => { setReplyToMsg(m); }}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-100 shrink-0">
            {/* Reply preview bar */}
            {replyToMsg && (
              <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
                <Reply className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-green-700">{replyToMsg.senderName}</p>
                  <p className="text-xs text-green-600 truncate">
                    {replyToMsg.content ?? replyToMsg.fileName ?? "📎 Attachment"}
                  </p>
                </div>
                <button onClick={() => setReplyToMsg(null)} className="text-green-400 hover:text-green-600 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {pendingFile && (
              <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl text-sm">
                <FileIcon mime={pendingFile.type} />
                <span className="flex-1 truncate text-gray-700">{pendingFile.name}</span>
                <button onClick={() => setPendingFile(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
              <button onClick={() => fileInputRef.current?.click()} title="Attach file"
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                <Paperclip className="h-4 w-4" />
              </button>
              <button onClick={() => setShowPollDialog(true)} title="Create poll"
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                <BarChart2 className="h-4 w-4" />
              </button>
              <button onClick={() => setShowShareContact(true)} title="Share a contact"
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                <ContactIcon className="h-4 w-4" />
              </button>
              <SmartTextarea
                className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:text-gray-400 max-h-32 border-none shadow-none focus-visible:ring-0 p-0 min-h-0"
                placeholder="Type a message…"
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                context="chat message"
              />
              <button
                onClick={handleSend}
                disabled={(!text.trim() && !pendingFile) || isSending || isUploading}
                className="p-1.5 text-blue-600 hover:text-blue-700 disabled:opacity-40 transition-colors shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <input ref={fileInputRef} type="file" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }} />
          </div>
        </div>

        {/* Group info panel */}
        {room.type === "group" && showInfo && (
          <GroupInfoPanel
            room={room}
            myClerkId={myClerkId}
            onClose={() => setShowInfo(false)}
            onCall={startCall}
          />
        )}
      </div>

      {/* Share Contact Dialog */}
      <Dialog open={showShareContact} onOpenChange={(o) => { setShowShareContact(o); if (!o) setShareContactSearch(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ContactIcon className="h-4 w-4 text-blue-500" /> Share a contact
            </DialogTitle>
            <DialogDescription>Send a contact card into this chat.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input className="pl-9" placeholder="Search contacts…" value={shareContactSearch}
              onChange={(e) => setShareContactSearch(e.target.value)} />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
            {(myContacts ?? [])
              .filter((c) =>
                !shareContactSearch.trim() ||
                c.name.toLowerCase().includes(shareContactSearch.toLowerCase()) ||
                c.email.toLowerCase().includes(shareContactSearch.toLowerCase()))
              .map((c) => (
                <button key={c.id} disabled={shareContactMut.isPending}
                  onClick={() => shareContactMut.mutate(c)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors disabled:opacity-50">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${avatarColor(c.contactClerkId ?? c.email)}`}>
                    {getInitials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.email}</p>
                  </div>
                  <Send className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                </button>
              ))}
            {(myContacts ?? []).length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No contacts yet</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Poll Dialog */}
      <Dialog open={showPollDialog} onOpenChange={setShowPollDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Poll</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Question</Label>
              <Input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="Ask something…" className="mt-1" />
            </div>
            <div className="space-y-2">
              <Label>Options</Label>
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={opt} onChange={(e) => { const opts = [...pollOptions]; opts[i] = e.target.value; setPollOptions(opts); }} placeholder={`Option ${i + 1}`} />
                  {pollOptions.length > 2 && (
                    <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button onClick={() => setPollOptions([...pollOptions, ""])} className="text-sm text-blue-600 hover:text-blue-700">+ Add option</button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={pollAllowMultiple} onChange={(e) => setPollAllowMultiple(e.target.checked)} />
              Allow multiple votes
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPollDialog(false)}>Cancel</Button>
            <Button onClick={() => createPoll.mutate()} disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2 || createPoll.isPending}>
              Create Poll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={!!shareMsg} onOpenChange={(open) => { if (!open) setShareMsg(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-blue-500" />
              Share message
            </DialogTitle>
          </DialogHeader>
          {shareMsg && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 line-clamp-3 whitespace-pre-wrap mb-2">
              {shareMsg.content ?? shareMsg.fileName ?? "Attachment"}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={handleShareWhatsApp}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 hover:bg-green-50 hover:border-green-300 transition-colors group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white group-hover:bg-green-600 transition-colors">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <span className="text-xs font-medium text-gray-700">WhatsApp</span>
            </button>
            <button
              onClick={handleShareEmail}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 hover:bg-blue-50 hover:border-blue-300 transition-colors group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white group-hover:bg-blue-600 transition-colors">
                <Mail className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-gray-700">Email</span>
            </button>
            <button
              onClick={handleShareCopy}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 hover:bg-gray-100 hover:border-gray-300 transition-colors group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-500 text-white group-hover:bg-gray-600 transition-colors">
                <Copy className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-gray-700">Copy</span>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setShareMsg(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forward Dialog */}
      <Dialog open={!!forwardMsg} onOpenChange={(open) => { if (!open) { setForwardMsg(null); setForwardRoomId(null); setForwardSearch(""); setForwarded(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CornerUpRight className="h-4 w-4 text-indigo-500" />
              Forward message
            </DialogTitle>
            <DialogDescription>Choose a chat to forward this message to.</DialogDescription>
          </DialogHeader>

          {/* Message preview */}
          {forwardMsg && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700 max-h-20 overflow-hidden">
              {forwardMsg.fileName && !forwardMsg.content && (
                <span className="flex items-center gap-1.5 text-gray-500">
                  <FileIcon mime={forwardMsg.fileMimeType} />
                  <span className="truncate">{forwardMsg.fileName}</span>
                </span>
              )}
              {forwardMsg.content && <p className="line-clamp-3 whitespace-pre-wrap">{forwardMsg.content}</p>}
            </div>
          )}

          {/* Room search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300"
              placeholder="Search chats…"
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
            />
          </div>

          {/* Room list */}
          <div className="max-h-52 overflow-y-auto space-y-0.5 -mx-1 px-1">
            {filteredForwardRooms.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">No other chats found</p>
            )}
            {filteredForwardRooms.map((r) => (
              <button
                key={r.id}
                onClick={() => setForwardRoomId(r.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${forwardRoomId === r.id ? "bg-indigo-50 border border-indigo-200" : "hover:bg-gray-100 border border-transparent"}`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${r.type === "group" ? "bg-indigo-500" : "bg-blue-500"}`}>
                  {r.type === "group" ? <Users className="h-3.5 w-3.5" /> : getInitials(r.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                  <p className="text-xs text-gray-400">{r.type === "direct" ? "Direct" : "Group"}</p>
                </div>
                {forwardRoomId === r.id && <Check className="h-4 w-4 text-indigo-500 shrink-0" />}
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setForwardMsg(null); setForwardRoomId(null); }}>Cancel</Button>
            <Button
              onClick={handleForwardSend}
              disabled={!forwardRoomId || forwardMutation.isPending || forwarded}
              className={forwarded ? "bg-green-600 hover:bg-green-600" : ""}
            >
              {forwarded ? (
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Forwarded!</span>
              ) : forwardMutation.isPending ? "Forwarding…" : (
                <span className="flex items-center gap-1.5"><CornerUpRight className="h-3.5 w-3.5" /> Forward</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Modal */}
      {callState && (
        <CallModal
          callRoomName={callState.callRoomName}
          token={callState.token}
          livekitUrl={callState.livekitUrl}
          callType={callState.callType}
          displayName={user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Me"}
          onEnd={() => setCallState(null)}
        />
      )}
    </div>
  );
}

// ── Main Chat Page ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { user } = useUser();
  const myClerkId = user?.id ?? "";
  const [selectedRoom, setSelectedRoom] = useState<ChatRoomSummary | null>(null);
  const [search, setSearch] = useState("");
  const [msgSearch, setMsgSearch] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [navWidth, setNavWidth] = useState(60);
  const [navHovered, setNavHovered] = useState(false);
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [favorites, setFavorites] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem("tancom_chat_favorites");
      return stored ? new Set<number>(JSON.parse(stored) as number[]) : new Set<number>();
    } catch { return new Set<number>(); }
  });
  const toggleFavorite = (roomId: number) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
      try { localStorage.setItem("tancom_chat_favorites", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const navDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const NAV_COLLAPSE_THRESHOLD = 120;
  const isNavCollapsed = navWidth < NAV_COLLAPSE_THRESHOLD;
  const showNavLabels = navHovered || !isNavCollapsed;
  const effectiveNavWidth = navHovered && isNavCollapsed ? 240 : navWidth;

  const startNavResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    navDragRef.current = { startX: e.clientX, startWidth: navWidth };
    const onMove = (ev: globalThis.MouseEvent) => {
      if (!navDragRef.current) return;
      const newW = Math.max(60, Math.min(420, navDragRef.current.startWidth + ev.clientX - navDragRef.current.startX));
      setNavWidth(newW);
    };
    const onUp = () => {
      navDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const [showNewRoom, setShowNewRoom] = useState(false);
  const [dialogTab, setDialogTab] = useState<"people" | "groups">("people");
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [dialogGroupName, setDialogGroupName] = useState("");
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [extraEmailInput, setExtraEmailInput] = useState("");
  const [dialogCallState, setDialogCallState] = useState<CallState | null>(null);
  const [searchResults, setSearchResults] = useState<MessageItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Unified sidebar search
  const [unifiedSearch, setUnifiedSearch] = useState("");
  const [showUnifiedDropdown, setShowUnifiedDropdown] = useState(false);
  const [inviteContact, setInviteContact] = useState<Contact | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rooms, isLoading } = useQuery({
    queryKey: getListChatRoomsQueryKey(),
    queryFn: listChatRooms,
    refetchInterval: 5000,
  });

  const { data: contacts } = useQuery({
    queryKey: getListContactsQueryKey(),
    queryFn: listContacts,
  });

  const resetDialog = () => {
    setSelectedContacts([]); setContactSearch(""); setDialogGroupName(""); setDialogTab("people");
    setExtraEmails([]); setExtraEmailInput("");
  };

  const createRoom = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<ChatRoomSummary>("/api/chat/rooms", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: getListChatRoomsQueryKey() });
      setSelectedRoom(room);
      setShowNewRoom(false);
      resetDialog();
    },
    onError: () => toast({ title: "Could not open chat. Make sure the contact has a TanCom account.", variant: "destructive" }),
  });

  const startDM = (contact: Contact) => {
    if (!contact.contactClerkId) {
      toast({ title: "This contact doesn't have a TanCom account yet.", variant: "destructive" });
      return;
    }
    createRoom.mutate({ type: "direct", targetClerkId: contact.contactClerkId });
  };

  const startGroupChat = () => {
    const name = dialogGroupName.trim() ||
      selectedContacts.map((c) => c.name.split(" ")[0]).join(", ");
    const memberClerkIds = selectedContacts.map((c) => c.contactClerkId).filter(Boolean) as string[];
    createRoom.mutate({ type: "group", name, memberClerkIds, memberEmails: extraEmails });
  };

  const startGroupCall = async (callType: "audio" | "video") => {
    const name = dialogGroupName.trim() ||
      selectedContacts.map((c) => c.name.split(" ")[0]).join(", ");
    const memberClerkIds = selectedContacts.map((c) => c.contactClerkId).filter(Boolean) as string[];
    try {
      const room = await apiFetch<ChatRoomSummary>("/api/chat/rooms", {
        method: "POST", body: JSON.stringify({ type: "group", name, memberClerkIds, memberEmails: extraEmails }),
      });
      queryClient.invalidateQueries({ queryKey: getListChatRoomsQueryKey() });
      setSelectedRoom(room);
      setShowNewRoom(false);
      resetDialog();
      const callData = await apiFetch<CallState>("/api/calls/start", {
        method: "POST", body: JSON.stringify({ roomId: room.id, callType }),
      });
      setDialogCallState({ ...callData, callType });
    } catch {
      toast({ title: "Could not start group call", variant: "destructive" });
    }
  };

  const startDirectCall = async (contact: Contact, callType: "audio" | "video") => {
    if (!contact.contactClerkId) {
      toast({ title: "This contact doesn't have a TanCom account.", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/calls/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetClerkId: contact.contactClerkId, callType }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as CallState;
      setShowNewRoom(false);
      resetDialog();
      setDialogCallState({ ...data, callType });
    } catch {
      toast({ title: "Could not start call", variant: "destructive" });
    }
  };

  const toggleContact = (c: Contact) => {
    setSelectedContacts((prev) =>
      prev.find((p) => p.id === c.id) ? prev.filter((p) => p.id !== c.id) : [...prev, c]
    );
  };

  const handleSearch = useCallback(async () => {
    if (!msgSearch.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const results = await apiFetch<MessageItem[]>(`/api/chat/search?q=${encodeURIComponent(msgSearch.trim())}`);
      setSearchResults(results);
    } catch { toast({ title: "Search failed", variant: "destructive" }); }
    finally { setSearching(false); }
  }, [msgSearch, toast]);

  // Click-outside to close unified search dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowUnifiedDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Unified search: contacts + rooms
  const uq = unifiedSearch.toLowerCase().trim();
  const unifiedContactResults = uq
    ? (contacts ?? []).filter((c) =>
        c.name.toLowerCase().includes(uq) || c.email.toLowerCase().includes(uq)
      )
    : [];
  const unifiedRoomResults = uq
    ? (rooms ?? []).filter((r) => r.name.toLowerCase().includes(uq))
    : [];

  // Username search across all TanCom users (server-side)
  const usernameQuery = uq.replace(/^@/, "");
  const { data: usernameResults } = useQuery({
    queryKey: ["user-search-username", usernameQuery],
    queryFn: () => apiFetch<UserSearchResult[]>(`/api/users/search?username=${encodeURIComponent(usernameQuery)}`),
    enabled: usernameQuery.length >= 2 && !usernameQuery.includes("@"),
    staleTime: 10_000,
  });
  const contactClerkIds = new Set((contacts ?? []).map((c) => c.contactClerkId).filter(Boolean));
  const usernameOnly = (usernameResults ?? []).filter(
    (u) => u.clerkId !== myClerkId && !contactClerkIds.has(u.clerkId),
  );
  const hasUnifiedResults =
    unifiedContactResults.length > 0 || unifiedRoomResults.length > 0 || usernameOnly.length > 0;

  const openContactChat = (c: Contact) => {
    setShowUnifiedDropdown(false);
    setUnifiedSearch("");
    if (!c.contactClerkId) { setInviteContact(c); return; }
    createRoom.mutate({ type: "direct", targetClerkId: c.contactClerkId });
  };

  const openRoomFromSearch = (room: ChatRoomSummary) => {
    setShowUnifiedDropdown(false);
    setUnifiedSearch("");
    setSelectedRoom(room);
  };

  const buildInviteMessage = (c: Contact) => {
    const appUrl = `${window.location.origin}/sign-up`;
    return `Hi ${c.name}! I'd like to invite you to join me on TanCom for video calls and messaging.\n\nSign up here: ${appUrl}\n\nSee you there!`;
  };

  const NOW = Date.now();
  const filteredRooms = ((rooms ?? []) as RoomEx[]).filter((r) => {
    const matchesSearch = !uq || r.name.toLowerCase().includes(uq);
    if (!matchesSearch) return false;
    if (chatFilter === "archived") return !!r.archived;
    if (r.archived) return false; // archived rooms only in the Archived filter
    switch (chatFilter) {
      case "groups":    return r.type === "group";
      case "favorites": return favorites.has(r.id);
      case "new":       return !!r.lastMessageAt && NOW - new Date(r.lastMessageAt).getTime() < 86_400_000;
      case "tags":      return false; // tags not yet implemented
      default:          return true;
    }
  });

  const directRooms = filteredRooms.filter((r) => r.type === "direct");
  const groupRooms = filteredRooms.filter((r) => r.type === "group");

  return (
    <AppLayout>
      <div className="flex flex-col h-full">

        {/* ── Top search bar ── */}
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 h-14 shrink-0">
          {/* Sidebar toggle */}
          <button
            onClick={() => setShowSidebar((v) => !v)}
            title={showSidebar ? "Hide sidebar" : "Show sidebar"}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0 transition-colors"
          >
            {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>

          <h1 className="font-semibold text-gray-900 text-sm hidden sm:block shrink-0">Chat</h1>

          {/* People & groups search */}
          <div className="relative flex-1 max-w-xs" ref={searchContainerRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 z-10" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300 focus:bg-white transition-colors"
              placeholder="Search people & groups…"
              value={unifiedSearch}
              onChange={(e) => { setUnifiedSearch(e.target.value); setShowUnifiedDropdown(true); }}
              onFocus={() => setShowUnifiedDropdown(true)}
            />
            {showUnifiedDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-80 overflow-y-auto">
                {!uq ? (
                  <div className="px-4 py-3 text-xs text-gray-400 text-center">Type to search contacts and groups…</div>
                ) : !hasUnifiedResults ? (
                  <div className="px-4 py-3 text-xs text-gray-400 text-center">No results for "{unifiedSearch}"</div>
                ) : (
                  <>
                    {unifiedContactResults.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">People</div>
                        {unifiedContactResults.map((c) => (
                          <button key={c.id} onClick={() => openContactChat(c)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${avatarColor(c.contactClerkId ?? c.email)}`}>
                              {getInitials(c.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                              <p className="text-xs text-gray-400 truncate">{c.email}</p>
                            </div>
                            {!c.contactClerkId && <span className="text-xs text-amber-500 shrink-0 font-medium">Not registered</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {usernameOnly.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">On TanCom</div>
                        {usernameOnly.map((u) => (
                          <button key={u.clerkId}
                            onClick={() => {
                              setShowUnifiedDropdown(false);
                              setUnifiedSearch("");
                              createRoom.mutate({ type: "direct", targetClerkId: u.clerkId });
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${avatarColor(u.clerkId)}`}>
                              {getInitials(u.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                              <p className="text-xs text-blue-600 truncate flex items-center gap-0.5">
                                <AtSign className="h-3 w-3" />{u.username}
                              </p>
                            </div>
                            <MessageSquare className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                    {unifiedRoomResults.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 border-t border-gray-100">Groups</div>
                        {unifiedRoomResults.map((r) => (
                          <button key={r.id} onClick={() => openRoomFromSearch(r)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${r.type === "group" ? "bg-indigo-500" : "bg-blue-500"}`}>
                              {r.type === "group" ? <Users className="h-3.5 w-3.5" /> : getInitials(r.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                              <p className="text-xs text-gray-400 truncate">{r.type === "group" ? "Group chat" : "Direct message"}{r.lastMessage ? ` · ${r.lastMessage.slice(0, 30)}` : ""}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Message content search */}
          <div className="flex gap-1.5 flex-1 max-w-xs">
            <input
              className="flex-1 px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300 focus:bg-white transition-colors"
              placeholder="Search messages…"
              value={msgSearch}
              onChange={(e) => setMsgSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                  setShowSidebar(true);
                }
              }}
            />
            <button
              onClick={() => { handleSearch(); setShowSidebar(true); }}
              className="px-2.5 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors text-xs font-medium shrink-0"
            >
              {searching ? "…" : <Search className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="ml-auto shrink-0">
            <Button size="sm" onClick={() => setShowNewRoom(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Chat
            </Button>
          </div>
        </div>

        {/* ── Body row ── */}
        <div className="flex flex-1 min-h-0">

        {/* ── Left panel ── */}
        {(showSidebar || !selectedRoom) && (
          <div
            className={`relative flex flex-col border-r border-gray-200 bg-gray-50 shrink-0 transition-all duration-200 ease-in-out ${selectedRoom ? "hidden lg:flex" : "flex"}`}
            style={{ width: effectiveNavWidth }}
            onMouseEnter={() => setNavHovered(true)}
            onMouseLeave={() => setNavHovered(false)}
          >
            {/* Panel header */}
            <div className={`flex items-center border-b border-gray-200 bg-white shrink-0 ${showNavLabels ? "justify-between px-3 py-2" : "flex-col gap-1 px-0 py-2"}`}>
              {showNavLabels ? (
                <>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Conversations</span>
                  <button
                    onClick={() => setShowSidebar(false)}
                    title="Close panel"
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors lg:flex hidden"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 text-gray-400" />
                  <button
                    onClick={() => setShowNewRoom(true)}
                    title="New Chat"
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>

            {/* ── Filter bar ── */}
            {showNavLabels ? (
              <div className="flex gap-1 px-2 py-2 border-b border-gray-100 overflow-x-auto shrink-0" style={{ scrollbarWidth: "none" }}>
                {CHAT_FILTERS.map((f) => {
                  const Icon = f.icon;
                  const active = chatFilter === f.id;
                  return (
                    <button key={f.id} onClick={() => setChatFilter(f.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      <Icon className="h-3 w-3 shrink-0" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-0.5 py-2 border-b border-gray-100 shrink-0">
                {CHAT_FILTERS.map((f) => {
                  const Icon = f.icon;
                  const active = chatFilter === f.id;
                  return (
                    <button key={f.id} onClick={() => setChatFilter(f.id)} title={f.label}
                      className={`p-1.5 rounded-lg transition-colors ${active ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
            )}

          {/* Search results */}
          {searchResults !== null ? (
            <div className="flex-1 overflow-y-auto p-3">
              {showNavLabels && (
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Results ({searchResults.length})</p>
                  <button onClick={() => { setSearchResults(null); setMsgSearch(""); }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                </div>
              )}
              {searchResults.length === 0 && showNavLabels && <p className="text-sm text-gray-400 text-center py-8">No messages found</p>}
              {searchResults.map((msg) => (
                <button key={msg.id} onClick={() => { const r = rooms?.find((rm) => rm.id === msg.roomId); if (r) setSelectedRoom(r); setSearchResults(null); setMsgSearch(""); }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 mb-1 transition-colors">
                  {showNavLabels && <>
                    <p className="text-xs font-medium text-gray-700 truncate">{msg.senderName}</p>
                    <p className="text-xs text-gray-500 truncate">{msg.content}</p>
                    <p className="text-xs text-gray-400">{formatTime(msg.createdAt)}</p>
                  </>}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 py-2" style={{ padding: showNavLabels ? "0.75rem" : "0.5rem 0.25rem" }}>
              {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${!showNavLabels ? "justify-center px-1" : ""}`}>
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  {showNavLabels && <div className="flex-1 space-y-1"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-3 w-32" /></div>}
                </div>
              ))}
              {directRooms.length > 0 && (
                <div>
                  {showNavLabels && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">Direct Messages</p>}
                  {!showNavLabels && <div className="mx-2 mb-1 border-t border-gray-200" />}
                  <div className="space-y-1">
                    {directRooms.map((room) => (
                      <RoomItem key={room.id} room={room} active={selectedRoom?.id === room.id}
                        onClick={() => setSelectedRoom(room)} collapsed={!showNavLabels}
                        isFavorite={favorites.has(room.id)}
                        onToggleFavorite={(e) => { e.stopPropagation(); toggleFavorite(room.id); }} />
                    ))}
                  </div>
                </div>
              )}
              {groupRooms.length > 0 && (
                <div>
                  {showNavLabels && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">Group Chats</p>}
                  {!showNavLabels && directRooms.length > 0 && <div className="mx-2 mb-1 border-t border-gray-200" />}
                  <div className="space-y-1">
                    {groupRooms.map((room) => (
                      <RoomItem key={room.id} room={room} active={selectedRoom?.id === room.id}
                        onClick={() => setSelectedRoom(room)} collapsed={!showNavLabels}
                        isFavorite={favorites.has(room.id)}
                        onToggleFavorite={(e) => { e.stopPropagation(); toggleFavorite(room.id); }} />
                    ))}
                  </div>
                </div>
              )}
              {!isLoading && filteredRooms.length === 0 && (
                <div className={`flex flex-col items-center gap-3 py-12 text-center ${showNavLabels ? "px-4" : "px-1"}`}>
                  {chatFilter === "tags" ? <Tag className="h-10 w-10 text-gray-300" /> :
                   chatFilter === "favorites" ? <Star className="h-10 w-10 text-gray-300" /> :
                   chatFilter === "new" ? <Sparkles className="h-10 w-10 text-gray-300" /> :
                   <MessageSquare className="h-10 w-10 text-gray-300" />}
                  {showNavLabels && (
                    <div>
                      {chatFilter === "tags" && <p className="text-sm font-medium text-gray-600">Tags coming soon</p>}
                      {chatFilter === "favorites" && <p className="text-sm font-medium text-gray-600">No favorites yet</p>}
                      {chatFilter === "new" && <p className="text-sm font-medium text-gray-600">No new activity today</p>}
                      {(chatFilter === "all" || chatFilter === "groups") && <p className="text-sm font-medium text-gray-600">No chats yet</p>}
                      {chatFilter === "favorites" && <p className="text-xs text-gray-400 mt-1">Star a chat to pin it here</p>}
                      {chatFilter === "tags" && <p className="text-xs text-gray-400 mt-1">Tag support is on the roadmap</p>}
                    </div>
                  )}
                  {showNavLabels && (chatFilter === "all" || chatFilter === "groups") && <Button size="sm" onClick={() => setShowNewRoom(true)}>New Chat</Button>}
                  {!showNavLabels && (chatFilter === "all" || chatFilter === "groups") && (
                    <button onClick={() => setShowNewRoom(true)} title="New Chat" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Resize handle ── */}
          <div
            onMouseDown={startNavResize}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 group"
            title="Drag to resize"
          >
            <div className="h-full w-full bg-transparent group-hover:bg-blue-400/40 transition-colors" />
          </div>
          </div>
        )}

        {/* ── Right panel ── */}
        <div className={`flex-1 min-w-0 ${!selectedRoom ? "hidden lg:flex" : "flex"} flex-col`}>
          {selectedRoom ? (
            <MessageThread room={selectedRoom} myClerkId={myClerkId} onBack={() => setSelectedRoom(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
              <MessageSquare className="h-14 w-14 text-gray-300" />
              <div>
                <p className="text-lg font-semibold text-gray-700">Select a conversation</p>
                <p className="text-sm text-gray-400 mt-1">Pick a chat or start a new one</p>
              </div>
              <Button onClick={() => setShowNewRoom(true)}>Start a Chat</Button>
            </div>
          )}
        </div>
        </div>{/* end body row */}
      </div>{/* end flex-col h-full */}

      {/* New conversation dialog */}
      <Dialog open={showNewRoom} onOpenChange={(open) => { setShowNewRoom(open); if (!open) resetDialog(); }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>New Conversation</DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-5">
            {(["people", "groups"] as const).map((tab) => (
              <button key={tab} onClick={() => setDialogTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${dialogTab === tab ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab === "people" ? <User className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                {tab === "people" ? "People" : "Groups"}
              </button>
            ))}
          </div>

          {dialogTab === "people" ? (
            <div className="flex flex-col">
              {/* Search contacts */}
              <div className="px-4 pt-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300"
                    placeholder="Search contacts…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {/* Selected chips */}
              {selectedContacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                  {selectedContacts.map((c) => (
                    <span key={c.id} className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {c.name}
                      <button onClick={() => toggleContact(c)} className="p-0.5 hover:bg-blue-200 rounded-full">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Contact list */}
              <div className="overflow-y-auto max-h-64 px-2">
                {!contacts || contacts.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">No contacts yet — add some from the Contacts page</div>
                ) : (
                  contacts
                    .filter((c) => c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.email.toLowerCase().includes(contactSearch.toLowerCase()))
                    .map((c) => {
                      const isSelected = selectedContacts.some((s) => s.id === c.id);
                      const hasTanCom = !!c.contactClerkId;
                      return (
                        <button key={c.id} onClick={() => hasTanCom && toggleContact(c)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isSelected ? "bg-blue-50" : hasTanCom ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"}`}>
                          <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold ${avatarColor(c.contactClerkId ?? c.email)}`}>
                            {getInitials(c.name)}
                            {isSelected && (
                              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-blue-600/90">
                                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                            <p className="text-xs text-gray-400 truncate">{c.email}</p>
                          </div>
                          {!hasTanCom && <span className="text-xs text-gray-400 shrink-0">No TanCom account</span>}
                        </button>
                      );
                    })
                )}
              </div>

              {/* Add by email — for users not in contacts */}
              <div className="px-4 pt-3 pb-1 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Add by email</p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300"
                    placeholder="someone@example.com"
                    value={extraEmailInput}
                    onChange={(e) => setExtraEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && extraEmailInput.trim() && extraEmailInput.includes("@")) {
                        if (!extraEmails.includes(extraEmailInput.trim())) {
                          setExtraEmails((prev) => [...prev, extraEmailInput.trim()]);
                        }
                        setExtraEmailInput("");
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (extraEmailInput.trim() && extraEmailInput.includes("@")) {
                        if (!extraEmails.includes(extraEmailInput.trim())) {
                          setExtraEmails((prev) => [...prev, extraEmailInput.trim()]);
                        }
                        setExtraEmailInput("");
                      }
                    }}
                    disabled={!extraEmailInput.trim() || !extraEmailInput.includes("@")}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium disabled:opacity-40 transition-colors"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {extraEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {extraEmails.map((email) => (
                      <span key={email} className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                        {email}
                        <button onClick={() => setExtraEmails((prev) => prev.filter((e) => e !== email))} className="p-0.5 hover:bg-purple-200 rounded-full">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Group name field when multiple selected */}
              {(selectedContacts.length + extraEmails.length) >= 2 && (
                <div className="px-4 pt-2">
                  <Input
                    value={dialogGroupName}
                    onChange={(e) => setDialogGroupName(e.target.value)}
                    placeholder={`Group name (default: ${selectedContacts.map((c) => c.name.split(" ")[0]).join(", ")})`}
                    className="text-sm"
                  />
                </div>
              )}

              {/* Action buttons */}
              <div className="px-4 py-3 border-t border-gray-100 mt-2">
                {selectedContacts.length === 0 && extraEmails.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-1">Select contacts or add emails above to start a chat or group</p>
                )}
                {/* 1 contact selected → DM or call */}
                {selectedContacts.length === 1 && extraEmails.length === 0 && (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => startDM(selectedContacts[0])} disabled={createRoom.isPending}>
                      <MessageSquare className="h-4 w-4 mr-1.5" /> Message
                    </Button>
                    <Button variant="outline" className="flex-1 text-green-700 border-green-200 hover:bg-green-50" onClick={() => startDirectCall(selectedContacts[0], "audio")}>
                      <Phone className="h-4 w-4 mr-1.5" /> Voice
                    </Button>
                    <Button variant="outline" className="flex-1 text-blue-700 border-blue-200 hover:bg-blue-50" onClick={() => startDirectCall(selectedContacts[0], "video")}>
                      <Video className="h-4 w-4 mr-1.5" /> Video
                    </Button>
                  </div>
                )}
                {/* 1 email entered, no contacts → DM by email */}
                {selectedContacts.length === 0 && extraEmails.length === 1 && (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => createRoom.mutate({ type: "direct", targetEmail: extraEmails[0] })} disabled={createRoom.isPending}>
                      <MessageSquare className="h-4 w-4 mr-1.5" /> {createRoom.isPending ? "Opening…" : "Message"}
                    </Button>
                  </div>
                )}
                {/* 2+ members → group chat */}
                {(selectedContacts.length + extraEmails.length >= 2 || (selectedContacts.length >= 1 && extraEmails.length >= 1)) && (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={startGroupChat} disabled={createRoom.isPending}>
                      <Users className="h-4 w-4 mr-1.5" /> {createRoom.isPending ? "Creating…" : "Group Chat"}
                    </Button>
                    <Button variant="outline" className="flex-1 text-green-700 border-green-200 hover:bg-green-50" onClick={() => startGroupCall("audio")}>
                      <Phone className="h-4 w-4 mr-1.5" /> Call
                    </Button>
                    <Button variant="outline" className="flex-1 text-blue-700 border-blue-200 hover:bg-blue-50" onClick={() => startGroupCall("video")}>
                      <Video className="h-4 w-4 mr-1.5" /> Video
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Groups tab — existing group chat rooms */
            <div className="flex flex-col">
              <div className="px-4 pt-3 pb-2 flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300"
                    placeholder="Search groups…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => { setDialogTab("people"); setContactSearch(""); }}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shrink-0"
                  title="Create a new group"
                >
                  <Plus className="h-3.5 w-3.5" /> New Group
                </button>
              </div>
              <div className="overflow-y-auto max-h-80 px-2 pb-3">
                {(rooms?.filter((r) => r.type === "group" && r.name.toLowerCase().includes(contactSearch.toLowerCase())) ?? []).length === 0 ? (
                  <div className="py-8 text-center">
                    <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 font-medium">No group chats yet</p>
                    <p className="text-xs text-gray-400 mt-1 mb-3">Create one by selecting people in the People tab</p>
                    <button
                      onClick={() => { setDialogTab("people"); setContactSearch(""); }}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                    >
                      Go to People Tab
                    </button>
                  </div>
                ) : (
                  rooms?.filter((r) => r.type === "group" && r.name.toLowerCase().includes(contactSearch.toLowerCase())).map((room) => (
                    <button key={room.id} onClick={() => { setSelectedRoom(room); setShowNewRoom(false); resetDialog(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{room.name}</p>
                        <p className="text-xs text-gray-400 truncate">{room.lastMessage ?? "No messages yet"}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Invite unregistered contact dialog ── */}
      <Dialog open={!!inviteContact} onOpenChange={(open) => { if (!open) { setInviteContact(null); setInviteCopied(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">📬</span> Invite {inviteContact?.name}
            </DialogTitle>
            <DialogDescription>
              {inviteContact?.name} is not registered on TanCom yet. Send them an invitation to sign up and join your conversations.
            </DialogDescription>
          </DialogHeader>
          {inviteContact && (
            <div className="space-y-4 pt-2">
              {/* Invite preview */}
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-line border border-gray-200 leading-relaxed">
                {buildInviteMessage(inviteContact)}
              </div>
              <div className="flex flex-col gap-2">
                {/* Send email */}
                {inviteContact.email && (
                  <a
                    href={`mailto:${inviteContact.email}?subject=${encodeURIComponent("Join me on TanCom")}&body=${encodeURIComponent(buildInviteMessage(inviteContact))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                    onClick={() => { setTimeout(() => { setInviteContact(null); setInviteCopied(false); }, 300); }}
                  >
                    <Mail className="h-4 w-4" /> Send Email Invite to {inviteContact.email}
                  </a>
                )}
                {/* Copy for SMS */}
                {inviteContact.phone && (
                  <a
                    href={`sms:${inviteContact.phone}&body=${encodeURIComponent(buildInviteMessage(inviteContact))}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                    onClick={() => { setTimeout(() => { setInviteContact(null); setInviteCopied(false); }, 300); }}
                  >
                    <Phone className="h-4 w-4" /> Send SMS to {inviteContact.phone}
                  </a>
                )}
                {/* Copy message */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(buildInviteMessage(inviteContact));
                    setInviteCopied(true);
                    setTimeout(() => setInviteCopied(false), 2500);
                  }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
                >
                  {inviteCopied ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-500" /> Copied!</>
                  ) : (
                    <><Copy className="h-4 w-4" /> Copy Invite Message</>
                  )}
                </button>
                <button
                  onClick={() => { setInviteContact(null); setInviteCopied(false); }}
                  className="text-xs text-gray-400 hover:text-gray-600 text-center py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Group/direct call started from dialog */}
      {dialogCallState && (
        <CallModal
          callRoomName={dialogCallState.callRoomName}
          token={dialogCallState.token}
          livekitUrl={dialogCallState.livekitUrl}
          callType={dialogCallState.callType}
          displayName={user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Me"}
          onEnd={() => setDialogCallState(null)}
        />
      )}
    </AppLayout>
  );
}
