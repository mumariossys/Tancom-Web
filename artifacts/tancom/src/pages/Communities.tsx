import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Hash, Volume2, Plus, Settings, Users, Copy, Check, Trash2, UserMinus,
  Crown, Shield, ChevronDown, Megaphone, Send, Paperclip, Download,
  Search, MoreVertical, LogOut, Link2, Phone, Video, RefreshCw,
  File, FileImage, FileVideo, FileAudio, FileText, Pin, Reply,
  Smile, Pencil, X, ChevronUp, ChevronRight, Mail, Bell, BellOff,
  MessageSquare, Info, Calendar, Clock, MapPin, Tag, CheckCircle2,
  HelpCircle, XCircle, FolderOpen, UserPlus, UserX,
} from "lucide-react";
import CallModal from "@/components/CallModal";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isYesterday, isPast } from "date-fns";
import { requestUploadUrl, listContacts, getListContactsQueryKey } from "@workspace/api-client-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface CommunityItem {
  id: number; name: string; description: string | null; iconUrl: string | null;
  ownerId: string; inviteCode: string; isPublic: boolean; memberCount: number;
  role: "owner" | "admin" | "member"; createdAt: string;
}
interface Channel {
  id: number; communityId: number; chatRoomId: number | null;
  name: string; type: "text" | "voice" | "announcement";
  description: string | null; position: number; isDefault: boolean; createdAt: string;
}
interface CommunityMemberItem {
  id: number; clerkId: string; name: string; email: string;
  role: "owner" | "admin" | "member"; joinedAt: string;
  customTags: string[];
}
interface CommunityEvent {
  id: number; communityId: number; title: string;
  description: string | null; location: string | null;
  startsAt: string; endsAt: string | null;
  createdBy: string; createdAt: string;
  attendingCount: number; maybeCount: number; notGoingCount: number;
  myRsvp: "attending" | "maybe" | "not_attending" | null;
}
interface MessageItem {
  id: number; roomId: number; senderClerkId: string; senderName: string;
  content: string | null; messageType: string; pollId: number | null; pinned: boolean;
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
type RoomReactions = Record<number, Record<string, { count: number; reacted: boolean }>>;
interface CommunityGroup {
  id: number; communityId: number; name: string; description: string | null;
  createdBy: string; createdAt: string; memberCount: number;
}
interface CommunityGroupMember {
  id: number; clerkId: string; name: string; email: string; addedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}
const avatarColors = ["bg-blue-500","bg-purple-500","bg-green-500","bg-orange-500","bg-pink-500","bg-teal-500","bg-indigo-500"];
function avatarColor(id: string) {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return avatarColors[h % avatarColors.length];
}
function formatTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday " + format(d, "h:mm a");
  return format(d, "MMM d, h:mm a");
}
function formatEventDate(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "Today at " + format(d, "h:mm a");
  return format(d, "EEE, MMM d · h:mm a");
}
function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}
function FileIcon({ mime }: { mime: string | null | undefined }) {
  if (!mime) return <File className="h-4 w-4" />;
  if (mime.startsWith("image/")) return <FileImage className="h-4 w-4 text-blue-500" />;
  if (mime.startsWith("video/")) return <FileVideo className="h-4 w-4 text-purple-500" />;
  if (mime.startsWith("audio/")) return <FileAudio className="h-4 w-4 text-green-500" />;
  if (mime.includes("pdf") || mime.includes("text")) return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-gray-500" />;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "✅", "👀", "🎉"];

// ── Reaction Picker ────────────────────────────────────────────────────────────
function ReactionPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (ev: MouseEvent) => { if (!ref.current?.contains(ev.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute bottom-full mb-1 right-0 z-50 flex gap-0.5 bg-white border border-gray-200 rounded-2xl shadow-xl p-1.5">
      {QUICK_EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => { onSelect(e); onClose(); }}
          className="text-lg hover:bg-gray-100 rounded-xl p-1 transition-colors leading-none">
          {e}
        </button>
      ))}
    </div>
  );
}

// ── Poll Component ─────────────────────────────────────────────────────────────
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
  if (isLoading || !poll) return <div className="text-xs text-gray-400 animate-pulse">Loading poll…</div>;
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
              <span className="relative text-xs font-medium">{opt}</span>
              <span className="relative float-right text-xs text-gray-500">{poll.voteCounts[i] ?? 0} ({pct}%)</span>
            </div>
          </button>
        );
      })}
      <p className="text-xs text-gray-400">{poll.totalVotes} vote{poll.totalVotes !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────────────────
function MsgBubble({
  msg, isOwn, canPin, canDelete, roomId, myClerkId, onReply,
  reactions, onReact,
}: {
  msg: MessageItem; isOwn: boolean; canPin: boolean; canDelete: boolean;
  roomId: number; myClerkId: string;
  onReply: (msg: MessageItem) => void;
  reactions: Record<string, { count: number; reacted: boolean }>;
  onReact: (msgId: number, emoji: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isImage = msg.fileMimeType?.startsWith("image/");
  const isVideo = msg.fileMimeType?.startsWith("video/");
  const isAudio = msg.fileMimeType?.startsWith("audio/");

  const deleteMut = useMutation({
    mutationFn: () => apiFetch(`/api/chat/rooms/${roomId}/messages/${msg.id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comm-messages", roomId] }),
    onError: () => toast({ title: "Could not delete message", variant: "destructive" }),
  });
  const pinMut = useMutation({
    mutationFn: () => apiFetch(`/api/chat/rooms/${roomId}/messages/${msg.id}/pin`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comm-messages", roomId] }),
  });

  const reactionEntries = Object.entries(reactions ?? {});

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-1 hover:bg-gray-50/80 transition-colors ${msg.pinned ? "bg-yellow-50/50 border-l-2 border-yellow-400" : ""}`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setShowReactionPicker(false); }}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold mt-0.5 ${avatarColor(msg.senderClerkId)}`}>
        {getInitials(msg.senderName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm text-gray-900">{msg.senderName}</span>
          <span className="text-xs text-gray-400">{formatTime(msg.createdAt)}</span>
          {msg.pinned && <Pin className="h-3 w-3 text-yellow-500" />}
        </div>

        {/* Reply quote */}
        {msg.replyToContent && (
          <div className="mt-1 mb-1 pl-3 border-l-2 border-blue-300 bg-blue-50/50 rounded-r-lg py-1 pr-2">
            <p className="text-xs font-semibold text-blue-700">{msg.replyToSenderName}</p>
            <p className="text-xs text-gray-500 truncate">{msg.replyToContent}</p>
          </div>
        )}

        {msg.messageType === "poll" && msg.pollId ? (
          <PollView pollId={msg.pollId} />
        ) : (
          <>
            {msg.fileObjectPath && (
              <div className="mt-1 max-w-xs">
                {isImage ? (
                  <div className="relative group/img">
                    <img src={`/api/storage${msg.fileObjectPath}`} alt={msg.fileName ?? "image"}
                      className="max-w-xs max-h-48 rounded-xl object-cover border border-gray-100" />
                    <a href={`/api/storage${msg.fileObjectPath}`} download={msg.fileName ?? "file"}
                      className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white opacity-0 group-hover/img:opacity-100 transition-opacity">
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ) : isVideo ? (
                  <video src={`/api/storage${msg.fileObjectPath}`} controls
                    className="max-w-xs max-h-48 rounded-xl border border-gray-100" />
                ) : isAudio ? (
                  <audio src={`/api/storage${msg.fileObjectPath}`} controls className="max-w-xs" />
                ) : (
                  <a href={`/api/storage${msg.fileObjectPath}`} download={msg.fileName ?? "file"}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors max-w-xs">
                    <FileIcon mime={msg.fileMimeType} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{msg.fileName ?? "File"}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(msg.fileSizeBytes)}</p>
                    </div>
                    <Download className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  </a>
                )}
              </div>
            )}
            {msg.content && <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mt-0.5">{msg.content}</p>}
          </>
        )}

        {/* Reactions display */}
        {reactionEntries.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {reactionEntries.map(([emoji, { count, reacted }]) => (
              <button key={emoji} type="button"
                onClick={() => onReact(msg.id, emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${reacted ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200"}`}>
                <span>{emoji}</span>
                <span className="font-medium">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover action bar */}
      {hover && (
        <div className="relative flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => onReply(msg)} title="Reply"
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
            <Reply className="h-3.5 w-3.5" />
          </button>
          <div className="relative">
            <button type="button" onClick={() => setShowReactionPicker((v) => !v)} title="React"
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
              <Smile className="h-3.5 w-3.5" />
            </button>
            {showReactionPicker && (
              <ReactionPicker onSelect={(e) => onReact(msg.id, e)} onClose={() => setShowReactionPicker(false)} />
            )}
          </div>
          {canPin && (
            <button type="button" onClick={() => pinMut.mutate()} title={msg.pinned ? "Unpin" : "Pin"}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
              <Pin className="h-3.5 w-3.5" />
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={() => deleteMut.mutate()} title="Delete"
              className="p-1.5 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Text Channel View ──────────────────────────────────────────────────────────
function TextChannelView({
  channel, community, myClerkId,
}: { channel: Channel; community: CommunityItem; myClerkId: string }) {
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [msgSearch, setMsgSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();

  const roomId = channel.chatRoomId!;
  const isAdmin = community.role === "owner" || community.role === "admin";
  const isAnnouncementChannel = channel.type === "announcement";
  const canPost = !isAnnouncementChannel || isAdmin;

  const { data: messages, isLoading } = useQuery({
    queryKey: ["comm-messages", roomId],
    queryFn: () => apiFetch<MessageItem[]>(`/api/chat/rooms/${roomId}/messages`),
    refetchInterval: 3000,
    enabled: !!roomId,
  });

  const { data: reactions } = useQuery({
    queryKey: ["comm-reactions", roomId],
    queryFn: () => apiFetch<RoomReactions>(`/api/chat/rooms/${roomId}/reactions`),
    refetchInterval: 5000,
    enabled: !!roomId,
  });

  useEffect(() => {
    if (!showPinned && !showSearch) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showPinned, showSearch]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const sendMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/api/chat/rooms/${roomId}/messages`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comm-messages", roomId] });
      setText(""); setPendingFile(null); setReplyTo(null);
    },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const reactMut = useMutation({
    mutationFn: ({ msgId, emoji }: { msgId: number; emoji: string }) =>
      apiFetch(`/api/chat/rooms/${roomId}/messages/${msgId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comm-reactions", roomId] }),
  });

  const createPoll = useMutation({
    mutationFn: () => apiFetch("/api/polls", {
      method: "POST",
      body: JSON.stringify({
        chatRoomId: roomId, question: pollQuestion,
        options: pollOptions.filter((o) => o.trim()), allowMultiple: pollAllowMultiple,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comm-messages", roomId] });
      setShowPollDialog(false); setPollQuestion(""); setPollOptions(["", ""]); setPollAllowMultiple(false);
    },
    onError: () => toast({ title: "Failed to create poll", variant: "destructive" }),
  });

  const handleSend = useCallback(async () => {
    if (!text.trim() && !pendingFile) return;
    const payload: Record<string, unknown> = {};
    if (replyTo) {
      payload.replyToId = replyTo.id;
      payload.replyToContent = replyTo.content ?? "[file]";
      payload.replyToSenderName = replyTo.senderName;
    }
    if (pendingFile) {
      setIsUploading(true);
      try {
        const urlRes = await requestUploadUrl({ name: pendingFile.name, size: pendingFile.size, contentType: pendingFile.type || "application/octet-stream" });
        await fetch(urlRes.uploadURL, { method: "PUT", headers: { "Content-Type": pendingFile.type || "application/octet-stream" }, body: pendingFile });
        sendMut.mutate({ ...payload, content: text.trim() || undefined, fileObjectPath: urlRes.objectPath, fileName: pendingFile.name, fileMimeType: pendingFile.type, fileSizeBytes: pendingFile.size });
      } catch { toast({ title: "Upload failed", variant: "destructive" }); }
      finally { setIsUploading(false); }
    } else {
      sendMut.mutate({ ...payload, content: text.trim() });
    }
  }, [text, pendingFile, replyTo, sendMut, toast]);

  const startCall = async (callType: "audio" | "video") => {
    try {
      const res = await apiFetch<CallState>("/api/calls/start", { method: "POST", body: JSON.stringify({ roomId, callType }) });
      setCallState({ ...res, callType });
    } catch { toast({ title: "Could not start call", variant: "destructive" }); }
  };

  const orderedMessages = messages ? [...messages].reverse() : [];
  const pinnedMessages = orderedMessages.filter((m) => m.pinned);
  const filteredMessages = msgSearch
    ? orderedMessages.filter((m) => m.content?.toLowerCase().includes(msgSearch.toLowerCase()))
    : orderedMessages;

  return (
    <div className="flex flex-col h-full">
      {/* Channel header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        {isAnnouncementChannel ? <Megaphone className="h-5 w-5 text-yellow-500" /> : <Hash className="h-5 w-5 text-gray-400" />}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{channel.name}</span>
            {isAnnouncementChannel && (
              <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                {isAdmin ? "Admin posts only" : "Read only"}
              </span>
            )}
          </div>
          {channel.description && <p className="text-xs text-gray-500">{channel.description}</p>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {pinnedMessages.length > 0 && (
            <button type="button" onClick={() => { setShowPinned((v) => !v); setShowSearch(false); }} title="Pinned messages"
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${showPinned ? "bg-yellow-100 text-yellow-700" : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"}`}>
              <Pin className="h-3.5 w-3.5" />
              {pinnedMessages.length}
            </button>
          )}
          <button type="button" onClick={() => { setShowSearch((v) => !v); setShowPinned(false); }} title="Search messages"
            className={`p-2 rounded-lg transition-colors ${showSearch ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"}`}>
            <Search className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => startCall("audio")} title="Voice call"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
            <Phone className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => startCall("video")} title="Video call"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
            <Video className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input autoFocus
              className="w-full pl-8 pr-8 py-1.5 text-sm bg-white border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300"
              placeholder={`Search in #${channel.name}…`}
              value={msgSearch}
              onChange={(e) => setMsgSearch(e.target.value)}
            />
            {msgSearch && (
              <button type="button" onClick={() => setMsgSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {msgSearch && <p className="text-xs text-gray-400 mt-1">{filteredMessages.length} result{filteredMessages.length !== 1 ? "s" : ""}</p>}
        </div>
      )}

      {/* Pinned messages panel */}
      {showPinned && pinnedMessages.length > 0 && (
        <div className="border-b border-yellow-200 bg-yellow-50/60 px-4 py-3 space-y-2 max-h-48 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-yellow-800 uppercase tracking-wider flex items-center gap-1.5">
              <Pin className="h-3 w-3" /> Pinned Messages ({pinnedMessages.length})
            </p>
            <button type="button" onClick={() => setShowPinned(false)} className="text-yellow-600 hover:text-yellow-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {pinnedMessages.map((m) => (
            <div key={m.id} className="flex items-start gap-2 bg-white/70 rounded-xl px-3 py-2 border border-yellow-100">
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${avatarColor(m.senderClerkId)}`}>
                {getInitials(m.senderName)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-gray-700">{m.senderName}</span>
                <p className="text-xs text-gray-600 truncate">{m.content ?? (m.fileName ?? "[attachment]")}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{formatTime(m.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
        {isLoading && <p className="text-center text-sm text-gray-400 py-8">Loading…</p>}
        {!isLoading && orderedMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 py-16">
            <div className="h-12 w-12 flex items-center justify-center rounded-full bg-gray-100">
              {isAnnouncementChannel ? <Megaphone className="h-6 w-6 text-yellow-500" /> : <Hash className="h-6 w-6 text-gray-400" />}
            </div>
            <div>
              <p className="font-semibold text-gray-700">Welcome to #{channel.name}</p>
              <p className="text-sm text-gray-400 mt-0.5">
                {isAnnouncementChannel ? "Admins post announcements here." : "This is the beginning of this channel."}
              </p>
            </div>
          </div>
        )}
        {filteredMessages.map((msg) => (
          <MsgBubble key={msg.id} msg={msg}
            isOwn={msg.senderClerkId === myClerkId}
            canPin={isAdmin}
            canDelete={msg.senderClerkId === myClerkId || isAdmin}
            roomId={roomId}
            myClerkId={myClerkId}
            onReply={(m) => setReplyTo(m)}
            reactions={reactions?.[msg.id] ?? {}}
            onReact={(msgId, emoji) => reactMut.mutate({ msgId, emoji })}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply indicator */}
      {replyTo && (
        <div className="mx-4 mb-0 flex items-start gap-2 px-3 py-2 bg-blue-50 rounded-t-xl border border-b-0 border-blue-200">
          <Reply className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-700">{replyTo.senderName}</p>
            <p className="text-xs text-gray-500 truncate">{replyTo.content ?? "[attachment]"}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className={`px-4 pb-4 pt-2 shrink-0 bg-white border-t border-gray-100 ${replyTo ? "pt-0" : ""}`}>
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl text-sm">
            <FileIcon mime={pendingFile.type} />
            <span className="flex-1 truncate text-gray-700">{pendingFile.name}</span>
            <button type="button" onClick={() => setPendingFile(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}
        {canPost ? (
          <div className={`flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 ${replyTo ? "rounded-tl-none" : ""}`}>
            <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach file"
              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
              <Paperclip className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setShowPollDialog(true)} title="Create poll"
              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
              <MoreVertical className="h-4 w-4" />
            </button>
            <input ref={textareaRef}
              className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:text-gray-400"
              placeholder={`Message #${channel.name}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <button type="button"
              onClick={handleSend}
              disabled={(!text.trim() && !pendingFile) || sendMut.isPending || isUploading}
              className="p-1.5 text-blue-600 hover:text-blue-700 disabled:opacity-40 transition-colors shrink-0">
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-yellow-50 border border-yellow-200 text-yellow-800">
            <Megaphone className="h-4 w-4 shrink-0" />
            <p className="text-sm">Only admins can post in announcement channels.</p>
          </div>
        )}
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }} />
      </div>

      {/* Poll dialog */}
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
                  <Input value={opt} onChange={(e) => { const opts = [...pollOptions]; opts[i] = e.target.value; setPollOptions(opts); }}
                    placeholder={`Option ${i + 1}`} />
                  {pollOptions.length > 2 && (
                    <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button type="button" onClick={() => setPollOptions([...pollOptions, ""])} className="text-sm text-blue-600 hover:text-blue-700">+ Add option</button>
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

      {callState && (
        <CallModal
          callRoomName={callState.callRoomName} token={callState.token}
          livekitUrl={callState.livekitUrl} callType={callState.callType}
          displayName={user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Me"}
          onEnd={() => setCallState(null)} />
      )}
    </div>
  );
}

// ── Voice Channel View ─────────────────────────────────────────────────────────
function VoiceChannelView({ channel, displayName }: { channel: Channel; displayName: string }) {
  const [callState, setCallState] = useState<CallState | null>(null);
  const { toast } = useToast();

  const joinVoice = async () => {
    try {
      const res = await apiFetch<{ callRoomName: string; token: string; livekitUrl: string }>(
        "/api/calls/voice-channel", { method: "POST", body: JSON.stringify({ channelId: channel.id }) }
      );
      setCallState({ ...res, callType: "video" });
    } catch { toast({ title: "Could not join voice channel", variant: "destructive" }); }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
      <div className="h-20 w-20 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
        <Volume2 className="h-10 w-10" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900">{channel.name}</h2>
        {channel.description && <p className="text-sm text-gray-500 mt-1">{channel.description}</p>}
        <p className="text-sm text-gray-400 mt-2">Voice channel — click to join</p>
      </div>
      {!callState ? (
        <Button onClick={joinVoice} className="gap-2"><Phone className="h-4 w-4" /> Join Voice Channel</Button>
      ) : (
        <Button variant="destructive" onClick={() => setCallState(null)} className="gap-2"><Phone className="h-4 w-4" /> Leave Channel</Button>
      )}
      {callState && (
        <CallModal callRoomName={callState.callRoomName} token={callState.token}
          livekitUrl={callState.livekitUrl} callType="video"
          displayName={displayName} onEnd={() => setCallState(null)} />
      )}
    </div>
  );
}

// ── Events View ────────────────────────────────────────────────────────────────
function EventsView({ community, myClerkId }: { community: CommunityItem; myClerkId: string }) {
  const isAdmin = community.role === "owner" || community.role === "admin";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editEvent, setEditEvent] = useState<CommunityEvent | null>(null);
  const [deleteEventId, setDeleteEventId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", desc: "", location: "", date: "", time: "", endDate: "", endTime: "" });

  function openCreate() {
    setForm({ title: "", desc: "", location: "", date: "", time: "", endDate: "", endTime: "" });
    setEditEvent(null);
    setShowCreateDialog(true);
  }
  function openEdit(ev: CommunityEvent) {
    const s = new Date(ev.startsAt);
    const e = ev.endsAt ? new Date(ev.endsAt) : null;
    setForm({
      title: ev.title,
      desc: ev.description ?? "",
      location: ev.location ?? "",
      date: format(s, "yyyy-MM-dd"),
      time: format(s, "HH:mm"),
      endDate: e ? format(e, "yyyy-MM-dd") : "",
      endTime: e ? format(e, "HH:mm") : "",
    });
    setEditEvent(ev);
    setShowCreateDialog(true);
  }

  const { data: events, isLoading } = useQuery({
    queryKey: ["community-events", community.id],
    queryFn: () => apiFetch<CommunityEvent[]>(`/api/communities/${community.id}/events`),
    refetchInterval: 30000,
  });

  const createEvent = useMutation({
    mutationFn: () => {
      const startsAt = new Date(`${form.date}T${form.time || "00:00"}`).toISOString();
      const endsAt = form.endDate ? new Date(`${form.endDate}T${form.endTime || "00:00"}`).toISOString() : undefined;
      if (editEvent) {
        return apiFetch(`/api/communities/${community.id}/events/${editEvent.id}`, {
          method: "PATCH", body: JSON.stringify({ title: form.title.trim(), description: form.desc || null, location: form.location || null, startsAt, endsAt: endsAt ?? null }),
        });
      }
      return apiFetch(`/api/communities/${community.id}/events`, {
        method: "POST", body: JSON.stringify({ title: form.title.trim(), description: form.desc || null, location: form.location || null, startsAt, endsAt }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-events", community.id] });
      setShowCreateDialog(false);
      toast({ title: editEvent ? "Event updated" : "Event created" });
    },
    onError: () => toast({ title: "Failed to save event", variant: "destructive" }),
  });

  const deleteEvent = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/communities/${community.id}/events/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-events", community.id] });
      setDeleteEventId(null);
      toast({ title: "Event deleted" });
    },
  });

  const rsvpMut = useMutation({
    mutationFn: ({ eventId, status }: { eventId: number; status: string }) =>
      apiFetch(`/api/communities/${community.id}/events/${eventId}/rsvp`, {
        method: "POST", body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community-events", community.id] }),
    onError: () => toast({ title: "Could not update RSVP", variant: "destructive" }),
  });

  const upcomingEvents = (events ?? []).filter((e) => !isPast(new Date(e.startsAt)));
  const pastEvents = (events ?? []).filter((e) => isPast(new Date(e.startsAt)));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <Calendar className="h-5 w-5 text-blue-500" />
        <div>
          <span className="font-semibold text-gray-900">Events</span>
          <p className="text-xs text-gray-500">Community events & RSVPs</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openCreate} className="ml-auto gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Event
          </Button>
        )}
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {isLoading && <p className="text-center text-sm text-gray-400 py-8">Loading events…</p>}

        {!isLoading && (events ?? []).length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-20">
            <div className="h-16 w-16 flex items-center justify-center rounded-2xl bg-blue-50 text-blue-400">
              <Calendar className="h-8 w-8" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">No events yet</p>
              <p className="text-sm text-gray-400 mt-1">
                {isAdmin ? "Create the first event for your community." : "Check back soon for upcoming events."}
              </p>
            </div>
            {isAdmin && <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Create Event</Button>}
          </div>
        )}

        {upcomingEvents.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Upcoming</p>
            {upcomingEvents.map((ev) => (
              <EventCard key={ev.id} event={ev} isAdmin={isAdmin} myClerkId={myClerkId}
                onEdit={() => openEdit(ev)}
                onDelete={() => setDeleteEventId(ev.id)}
                onRsvp={(status) => rsvpMut.mutate({ eventId: ev.id, status })}
              />
            ))}
          </div>
        )}

        {pastEvents.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Past Events</p>
            {pastEvents.map((ev) => (
              <EventCard key={ev.id} event={ev} isAdmin={isAdmin} myClerkId={myClerkId} past
                onEdit={() => openEdit(ev)}
                onDelete={() => setDeleteEventId(ev.id)}
                onRsvp={(status) => rsvpMut.mutate({ eventId: ev.id, status })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Event dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(o) => { if (!o) { setShowCreateDialog(false); setEditEvent(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              {editEvent ? "Edit Event" : "Create Event"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Event Title *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Weekly Prayer Meeting" className="mt-1" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>End Date <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Location <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Main Hall, Room 201, or Zoom link" className="mt-1" />
            </div>
            <div>
              <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))}
                placeholder="More details about this event…" className="mt-1 resize-none" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditEvent(null); }}>Cancel</Button>
            <Button onClick={() => createEvent.mutate()}
              disabled={!form.title.trim() || !form.date || createEvent.isPending}>
              {createEvent.isPending ? "Saving…" : editEvent ? "Save Changes" : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete event alert */}
      <AlertDialog open={deleteEventId !== null} onOpenChange={(o) => { if (!o) setDeleteEventId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>All RSVPs for this event will also be deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteEventId !== null && deleteEvent.mutate(deleteEventId)}>
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Event Card ─────────────────────────────────────────────────────────────────
function EventCard({ event, isAdmin, myClerkId, past, onEdit, onDelete, onRsvp }: {
  event: CommunityEvent; isAdmin: boolean; myClerkId: string; past?: boolean;
  onEdit: () => void; onDelete: () => void; onRsvp: (status: string) => void;
}) {
  const rsvpOptions: { status: "attending" | "maybe" | "not_attending"; label: string; icon: React.ReactNode; color: string }[] = [
    { status: "attending", label: "Going", icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "text-green-700 bg-green-50 border-green-200 hover:bg-green-100" },
    { status: "maybe", label: "Maybe", icon: <HelpCircle className="h-3.5 w-3.5" />, color: "text-yellow-700 bg-yellow-50 border-yellow-200 hover:bg-yellow-100" },
    { status: "not_attending", label: "Can't go", icon: <XCircle className="h-3.5 w-3.5" />, color: "text-gray-500 bg-gray-50 border-gray-200 hover:bg-gray-100" },
  ];

  return (
    <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${past ? "opacity-70" : ""}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm">{event.title}</h3>
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Calendar className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>{formatEventDate(event.startsAt)}</span>
                {event.endsAt && <span className="text-gray-400">→ {format(new Date(event.endsAt), "h:mm a")}</span>}
              </div>
              {event.location && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <MapPin className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </div>
              )}
            </div>
            {event.description && (
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">{event.description}</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button type="button" onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* RSVP counts */}
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1 text-green-600 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> {event.attendingCount} going
          </span>
          <span className="flex items-center gap-1 text-yellow-600">
            <HelpCircle className="h-3.5 w-3.5" /> {event.maybeCount} maybe
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5" /> {event.notGoingCount} can't go
          </span>
        </div>

        {/* RSVP buttons */}
        {!past && (
          <div className="mt-3 flex gap-2">
            {rsvpOptions.map((opt) => (
              <button key={opt.status} type="button"
                onClick={() => onRsvp(opt.status)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  event.myRsvp === opt.status
                    ? opt.color.replace("hover:", "") + " ring-1 ring-offset-0 " + opt.color.split(" ")[2].replace("border-", "ring-")
                    : opt.color
                }`}>
                {opt.icon}
                {opt.label}
                {event.myRsvp === opt.status && <Check className="h-3 w-3 ml-0.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Group View ─────────────────────────────────────────────────────────────────
function GroupView({
  group, community, myClerkId, isAdmin, onManage,
}: {
  group: CommunityGroup;
  community: CommunityItem;
  myClerkId: string;
  isAdmin: boolean;
  onManage: () => void;
}) {
  const { data: members, isLoading } = useQuery({
    queryKey: ["community-group-members", group.id],
    queryFn: () => apiFetch<CommunityGroupMember[]>(`/api/communities/${community.id}/groups/${group.id}/members`),
  });

  function getInitialsLocal(name: string) {
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }
  const colors = [
    "bg-blue-500","bg-indigo-500","bg-purple-500","bg-pink-500",
    "bg-rose-500","bg-orange-500","bg-teal-500","bg-green-500",
  ];
  function avatarColorLocal(id: string) {
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xff;
    return colors[h % colors.length];
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center">
            <FolderOpen className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{group.name}</h2>
            {group.description && <p className="text-xs text-gray-500">{group.description}</p>}
          </div>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={onManage} className="gap-2">
            <Settings className="h-3.5 w-3.5" /> Manage Members
          </Button>
        )}
      </div>

      {/* Members */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && <p className="text-sm text-gray-400">Loading members…</p>}
        {!isLoading && members?.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <Users className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-400">No members in this group yet.</p>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={onManage} className="gap-2">
                <UserPlus className="h-3.5 w-3.5" /> Add Members
              </Button>
            )}
          </div>
        )}
        {members && members.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white shadow-sm">
                <div className={`h-10 w-10 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-sm ${avatarColorLocal(m.clerkId)}`}>
                  {getInitialsLocal(m.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{m.name}</p>
                  <p className="text-xs text-gray-400 truncate">{m.email}</p>
                </div>
                {m.clerkId === myClerkId && (
                  <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0">You</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Communities Page ──────────────────────────────────────────────────────
export default function CommunitiesPage() {
  const { user } = useUser();
  const myClerkId = user?.id ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedCommunity, setSelectedCommunity] = useState<CommunityItem | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [showEventsView, setShowEventsView] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [showAddChannelDialog, setShowAddChannelDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [showManageGroupDialog, setShowManageGroupDialog] = useState(false);
  const [managingGroup, setManagingGroup] = useState<CommunityGroup | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<CommunityGroup | null>(null);

  // Create community form
  const [newCommName, setNewCommName] = useState("");
  const [newCommDesc, setNewCommDesc] = useState("");
  // Edit community form
  const [editCommName, setEditCommName] = useState("");
  const [editCommDesc, setEditCommDesc] = useState("");
  // Join
  const [joinCode, setJoinCode] = useState("");
  // Add channel
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice" | "announcement">("text");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  // Invite
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [inviteContactSearch, setInviteContactSearch] = useState("");
  const [inviteTab, setInviteTab] = useState<"contacts" | "new" | "groups">("contacts");
  const [newPersonEmail, setNewPersonEmail] = useState("");
  const [addedClerkIds, setAddedClerkIds] = useState<Set<string>>(new Set());
  // Members search
  const [memberSearch, setMemberSearch] = useState("");
  // Member tags
  const [managingTagsMember, setManagingTagsMember] = useState<CommunityMemberItem | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  // Groups form state
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [groupMemberSearch, setGroupMemberSearch] = useState("");

  // Communities list
  const { data: communities, isLoading: commLoading } = useQuery({
    queryKey: ["communities"],
    queryFn: () => apiFetch<CommunityItem[]>("/api/communities"),
    refetchInterval: 15000,
  });

  // Channels for selected community
  const { data: channels } = useQuery({
    queryKey: ["community-channels", selectedCommunity?.id],
    queryFn: () => apiFetch<Channel[]>(`/api/communities/${selectedCommunity!.id}/channels`),
    enabled: !!selectedCommunity,
  });

  // Members for selected community
  const { data: members } = useQuery({
    queryKey: ["community-members", selectedCommunity?.id],
    queryFn: () => apiFetch<CommunityMemberItem[]>(`/api/communities/${selectedCommunity!.id}/members`),
    enabled: !!selectedCommunity && showMembersDialog,
  });

  // Groups for selected community
  const { data: groups } = useQuery({
    queryKey: ["community-groups", selectedCommunity?.id],
    queryFn: () => apiFetch<CommunityGroup[]>(`/api/communities/${selectedCommunity!.id}/groups`),
    enabled: !!selectedCommunity,
  });

  // Group members for managing group
  const { data: groupMembers } = useQuery({
    queryKey: ["community-group-members", managingGroup?.id],
    queryFn: () => apiFetch<CommunityGroupMember[]>(`/api/communities/${selectedCommunity!.id}/groups/${managingGroup!.id}/members`),
    enabled: !!managingGroup && showManageGroupDialog,
  });

  // All community members (for adding to groups — reuse without dialog gate)
  const { data: allMembers } = useQuery({
    queryKey: ["community-members-all", selectedCommunity?.id],
    queryFn: () => apiFetch<CommunityMemberItem[]>(`/api/communities/${selectedCommunity!.id}/members`),
    enabled: !!selectedCommunity && showManageGroupDialog,
  });

  // Contacts for invite dialog
  const { data: contactsData } = useQuery({
    queryKey: getListContactsQueryKey(),
    queryFn: listContacts,
    enabled: showInviteDialog,
    staleTime: 60_000,
  });

  // User's standalone groups (for bulk-add tab)
  interface StandaloneGroup { id: number; name: string; memberCount: number; role: string; }
  const { data: myStandaloneGroups } = useQuery({
    queryKey: ["my-groups-admin"],
    queryFn: () => apiFetch<StandaloneGroup[]>("/api/groups"),
    enabled: showInviteDialog && inviteTab === "groups",
    staleTime: 30_000,
  });

  // Auto-select default channel when community changes
  useEffect(() => {
    if (channels && channels.length > 0) {
      const def = channels.find((c) => c.isDefault) ?? channels[0];
      setSelectedChannel(def);
      setShowEventsView(false);
    }
  }, [channels, selectedCommunity?.id]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createComm = useMutation({
    mutationFn: () => apiFetch<CommunityItem>("/api/communities", {
      method: "POST", body: JSON.stringify({ name: newCommName.trim(), description: newCommDesc.trim() || undefined }),
    }),
    onSuccess: (comm) => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      setShowCreateDialog(false); setNewCommName(""); setNewCommDesc("");
      setSelectedCommunity(comm);
      toast({ title: `"${comm.name}" created!` });
    },
    onError: (err: Error) => toast({ title: err.message.includes("name") ? "Name is required" : "Failed to create community", variant: "destructive" }),
  });

  const editComm = useMutation({
    mutationFn: () => apiFetch(`/api/communities/${selectedCommunity!.id}`, {
      method: "PATCH", body: JSON.stringify({ name: editCommName.trim(), description: editCommDesc.trim() || null }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      if (selectedCommunity) setSelectedCommunity({ ...selectedCommunity, name: editCommName, description: editCommDesc || null });
      setShowEditDialog(false);
      toast({ title: "Community updated" });
    },
    onError: () => toast({ title: "Failed to update community", variant: "destructive" }),
  });

  const deleteComm = useMutation({
    mutationFn: () => apiFetch(`/api/communities/${selectedCommunity!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      setSelectedCommunity(null); setSelectedChannel(null); setShowDeleteDialog(false);
      toast({ title: "Community deleted" });
    },
    onError: () => toast({ title: "Failed to delete community", variant: "destructive" }),
  });

  const joinComm = useMutation({
    mutationFn: (code: string) => apiFetch<{ id: number; alreadyMember: boolean }>(`/api/communities/join/${code}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      setShowJoinDialog(false); setJoinCode("");
      toast({ title: "Joined community!" });
    },
    onError: () => toast({ title: "Invalid invite code", variant: "destructive" }),
  });

  const addChannel = useMutation({
    mutationFn: () => apiFetch<Channel>(`/api/communities/${selectedCommunity!.id}/channels`, {
      method: "POST", body: JSON.stringify({ name: newChannelName.trim(), type: newChannelType, description: newChannelDesc.trim() || undefined }),
    }),
    onSuccess: (ch) => {
      queryClient.invalidateQueries({ queryKey: ["community-channels", selectedCommunity!.id] });
      setShowAddChannelDialog(false); setNewChannelName(""); setNewChannelType("text"); setNewChannelDesc("");
      setSelectedChannel(ch); setShowEventsView(false);
    },
    onError: () => toast({ title: "Failed to add channel", variant: "destructive" }),
  });

  const deleteChannel = useMutation({
    mutationFn: (channelId: number) => apiFetch(`/api/communities/${selectedCommunity!.id}/channels/${channelId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-channels", selectedCommunity!.id] });
      setSelectedChannel(null);
    },
    onError: (e: Error) => toast({ title: e.message.includes("default") ? "Cannot delete default channel" : "Failed", variant: "destructive" }),
  });

  const kickMember = useMutation({
    mutationFn: (clerkId: string) => apiFetch(`/api/communities/${selectedCommunity!.id}/members/${clerkId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-members", selectedCommunity!.id] });
      toast({ title: "Member removed" });
    },
  });

  const promoteMember = useMutation({
    mutationFn: ({ clerkId, role }: { clerkId: string; role: string }) =>
      apiFetch(`/api/communities/${selectedCommunity!.id}/members/${clerkId}/role`, {
        method: "PATCH", body: JSON.stringify({ role }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community-members", selectedCommunity!.id] }),
  });

  const updateMemberTags = useMutation({
    mutationFn: ({ clerkId, tags }: { clerkId: string; tags: string[] }) =>
      apiFetch(`/api/communities/${selectedCommunity!.id}/members/${clerkId}/tags`, {
        method: "PATCH", body: JSON.stringify({ tags }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-members", selectedCommunity!.id] });
      setManagingTagsMember(null);
      toast({ title: "Tags updated" });
    },
    onError: () => toast({ title: "Failed to update tags", variant: "destructive" }),
  });

  const regenInvite = useMutation({
    mutationFn: () => apiFetch<{ inviteCode: string }>(`/api/communities/${selectedCommunity!.id}/invite/regenerate`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      if (selectedCommunity) setSelectedCommunity({ ...selectedCommunity, inviteCode: data.inviteCode });
      toast({ title: "Invite link regenerated" });
    },
  });

  const directAdd = useMutation({
    mutationFn: ({ clerkId, email }: { clerkId?: string; email?: string }) =>
      apiFetch<{ ok: boolean; alreadyMember: boolean }>(`/api/communities/${selectedCommunity!.id}/members/direct`, {
        method: "POST", body: JSON.stringify({ clerkId, email }),
      }),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      if (vars.clerkId) setAddedClerkIds((s) => new Set([...s, vars.clerkId!]));
      toast({ title: data.alreadyMember ? "Already a member" : "Member added!" });
    },
    onError: (err: Error) => toast({ title: err.message.includes("No TanCom") ? "No TanCom account found with that email" : "Failed to add member", variant: "destructive" }),
  });

  const bulkFromGroup = useMutation({
    mutationFn: (groupId: number) =>
      apiFetch<{ added: number; skipped: number }>(`/api/communities/${selectedCommunity!.id}/members/bulk-from-group`, {
        method: "POST", body: JSON.stringify({ groupId }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      toast({ title: `Added ${data.added} member${data.added !== 1 ? "s" : ""}${data.skipped ? ` (${data.skipped} already in community)` : ""}` });
    },
    onError: (err: Error) => toast({ title: err.message.includes("owner or admin") ? "You must be an admin of that group" : "Failed to add group members", variant: "destructive" }),
  });

  const leaveComm = useMutation({
    mutationFn: () => apiFetch(`/api/communities/${selectedCommunity!.id}/members/${myClerkId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      setSelectedCommunity(null); setSelectedChannel(null);
      toast({ title: "Left community" });
    },
  });

  const createGroup = useMutation({
    mutationFn: () => apiFetch<CommunityGroup>(`/api/communities/${selectedCommunity!.id}/groups`, {
      method: "POST", body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined }),
    }),
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ["community-groups", selectedCommunity!.id] });
      setShowCreateGroupDialog(false); setNewGroupName(""); setNewGroupDesc("");
      toast({ title: `Group "${group.name}" created!` });
    },
    onError: () => toast({ title: "Failed to create group", variant: "destructive" }),
  });

  const deleteGroup = useMutation({
    mutationFn: (groupId: number) => apiFetch(`/api/communities/${selectedCommunity!.id}/groups/${groupId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-groups", selectedCommunity!.id] });
      if (selectedGroup?.id === deleteGroupTarget?.id) setSelectedGroup(null);
      setDeleteGroupTarget(null);
      toast({ title: "Group deleted" });
    },
    onError: () => toast({ title: "Failed to delete group", variant: "destructive" }),
  });

  const addGroupMember = useMutation({
    mutationFn: (clerkId: string) => apiFetch(`/api/communities/${selectedCommunity!.id}/groups/${managingGroup!.id}/members`, {
      method: "POST", body: JSON.stringify({ clerkId }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-group-members", managingGroup!.id] });
      queryClient.invalidateQueries({ queryKey: ["community-groups", selectedCommunity!.id] });
      toast({ title: "Member added to group" });
    },
    onError: () => toast({ title: "Failed to add member", variant: "destructive" }),
  });

  const removeGroupMember = useMutation({
    mutationFn: (clerkId: string) => apiFetch(`/api/communities/${selectedCommunity!.id}/groups/${managingGroup!.id}/members/${clerkId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-group-members", managingGroup!.id] });
      queryClient.invalidateQueries({ queryKey: ["community-groups", selectedCommunity!.id] });
      toast({ title: "Member removed from group" });
    },
    onError: () => toast({ title: "Failed to remove member", variant: "destructive" }),
  });

  const isAdmin = selectedCommunity?.role === "owner" || selectedCommunity?.role === "admin";
  const isOwner = selectedCommunity?.role === "owner";
  const inviteUrl = selectedCommunity ? `${window.location.origin}/communities/join/${selectedCommunity.inviteCode}` : "";

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  }

  function openEdit() {
    setEditCommName(selectedCommunity?.name ?? "");
    setEditCommDesc(selectedCommunity?.description ?? "");
    setShowEditDialog(true);
  }

  function handleJoin() {
    const code = joinCode.trim().split("/").pop() ?? joinCode.trim();
    if (!code) return;
    joinComm.mutate(code);
  }

  function openManageTags(m: CommunityMemberItem) {
    setManagingTagsMember(m);
    setTagDraft([...m.customTags]);
    setNewTagInput("");
  }

  function addTag() {
    const t = newTagInput.trim();
    if (!t || tagDraft.includes(t) || tagDraft.length >= 10) return;
    setTagDraft((d) => [...d, t]);
    setNewTagInput("");
  }

  const textChannels = channels?.filter((c) => c.type === "text" || c.type === "announcement") ?? [];
  const voiceChannels = channels?.filter((c) => c.type === "voice") ?? [];

  const filteredMembers = members?.filter((m) =>
    !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase()) || m.email.toLowerCase().includes(memberSearch.toLowerCase())
  ) ?? [];

  const TAG_COLORS = [
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
    "bg-green-100 text-green-700",
    "bg-orange-100 text-orange-700",
    "bg-pink-100 text-pink-700",
    "bg-teal-100 text-teal-700",
    "bg-yellow-100 text-yellow-700",
  ];
  function tagColor(tag: string) {
    let h = 0; for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xff;
    return TAG_COLORS[h % TAG_COLORS.length];
  }

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* ── Community list sidebar ── */}
        <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
          <div className="p-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 mb-2">Communities</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCreateDialog(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors">
                <Plus className="h-3.5 w-3.5" /> New
              </button>
              <button type="button" onClick={() => setShowJoinDialog(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-100 transition-colors">
                <Link2 className="h-3.5 w-3.5" /> Join
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {commLoading && <p className="text-xs text-gray-400 px-2 py-4 text-center">Loading…</p>}
            {!commLoading && communities?.length === 0 && (
              <p className="text-xs text-gray-400 px-2 py-4 text-center">No communities yet</p>
            )}
            {communities?.map((c) => (
              <button type="button" key={c.id} onClick={() => setSelectedCommunity(c)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${selectedCommunity?.id === c.id ? "bg-blue-600 text-white" : "hover:bg-gray-100 text-gray-800"}`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white font-bold text-sm ${selectedCommunity?.id === c.id ? "bg-white/20" : avatarColor(String(c.id))}`}>
                  {getInitials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm truncate ${selectedCommunity?.id === c.id ? "text-white" : "text-gray-900"}`}>{c.name}</p>
                  <p className={`text-xs truncate ${selectedCommunity?.id === c.id ? "text-white/70" : "text-gray-400"}`}>{c.memberCount} members</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Channel sidebar ── */}
        {selectedCommunity && (
          <div className="w-52 border-r border-gray-200 bg-gray-50/50 flex flex-col">
            {/* Community header with dropdown */}
            <div className="p-3 border-b border-gray-200">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <span className="font-semibold text-sm text-gray-900 truncate">{selectedCommunity.name}</span>
                    <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem onClick={() => setShowInfoPanel((v) => !v)}>
                    <Info className="h-4 w-4 mr-2" /> Community Info
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowInviteDialog(true)}>
                    <Link2 className="h-4 w-4 mr-2" /> Invite People
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowMembersDialog(true)}>
                    <Users className="h-4 w-4 mr-2" /> Members ({selectedCommunity.memberCount})
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuItem onClick={() => setShowAddChannelDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Add Channel
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={openEdit}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit Community
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  {selectedCommunity.role !== "owner" && (
                    <DropdownMenuItem onClick={() => leaveComm.mutate()} className="text-red-600">
                      <LogOut className="h-4 w-4 mr-2" /> Leave Community
                    </DropdownMenuItem>
                  )}
                  {isOwner && (
                    <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-red-600">
                      <Trash2 className="h-4 w-4 mr-2" /> Delete Community
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Info panel */}
            {showInfoPanel && (
              <div className="mx-2 mt-2 p-3 bg-white rounded-xl border border-gray-200 text-xs text-gray-600 space-y-1.5">
                <button type="button" onClick={() => setShowInfoPanel(false)} className="float-right text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
                <p className="font-semibold text-gray-800 text-sm">{selectedCommunity.name}</p>
                {selectedCommunity.description && <p className="text-gray-500">{selectedCommunity.description}</p>}
                <p className="text-gray-400">{selectedCommunity.memberCount} members · {selectedCommunity.role}</p>
              </div>
            )}

            {/* Sidebar nav */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {/* Events button */}
              <button type="button"
                onClick={() => { setShowEventsView(true); setSelectedChannel(null); setSelectedGroup(null); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${showEventsView ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}>
                <Calendar className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                <span className="text-sm font-medium">Events</span>
              </button>

              {textChannels.length > 0 && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 pt-3 pb-1">Text Channels</p>
              )}
              {textChannels.map((ch) => (
                <div key={ch.id} className="group flex items-center">
                  <button type="button" onClick={() => { setSelectedChannel(ch); setShowEventsView(false); setSelectedGroup(null); }}
                    className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${selectedChannel?.id === ch.id && !showEventsView && !selectedGroup ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}>
                    {ch.type === "announcement" ? <Megaphone className="h-3.5 w-3.5 shrink-0 text-yellow-500" /> : <Hash className="h-3.5 w-3.5 shrink-0" />}
                    <span className="text-sm truncate">{ch.name}</span>
                  </button>
                  {isAdmin && !ch.isDefault && (
                    <button type="button" onClick={() => deleteChannel.mutate(ch.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}

              {voiceChannels.length > 0 && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 pt-3 pb-1">Voice Channels</p>
              )}
              {voiceChannels.map((ch) => (
                <div key={ch.id} className="group flex items-center">
                  <button type="button" onClick={() => { setSelectedChannel(ch); setShowEventsView(false); setSelectedGroup(null); }}
                    className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${selectedChannel?.id === ch.id && !showEventsView && !selectedGroup ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}>
                    <Volume2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-sm truncate">{ch.name}</span>
                  </button>
                  {isAdmin && !ch.isDefault && (
                    <button type="button" onClick={() => deleteChannel.mutate(ch.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}

              {/* Groups section */}
              <div className="flex items-center justify-between px-2 pt-3 pb-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Groups</p>
                {isAdmin && (
                  <button type="button" onClick={() => setShowCreateGroupDialog(true)}
                    className="text-gray-400 hover:text-gray-600 transition-colors">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {(!groups || groups.length === 0) && (
                <p className="text-xs text-gray-400 px-2 pb-1 italic">No groups yet</p>
              )}
              {groups?.map((g) => (
                <div key={g.id} className="group/grp flex items-center">
                  <button type="button"
                    onClick={() => { setSelectedGroup(g); setSelectedChannel(null); setShowEventsView(false); }}
                    className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${selectedGroup?.id === g.id ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}>
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span className="text-sm truncate">{g.name}</span>
                    <span className="ml-auto text-xs text-gray-400 shrink-0">{g.memberCount}</span>
                  </button>
                  {isAdmin && (
                    <button type="button"
                      onClick={() => { setManagingGroup(g); setGroupMemberSearch(""); setShowManageGroupDialog(true); }}
                      className="opacity-0 group-hover/grp:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-all">
                      <Settings className="h-3 w-3" />
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button"
                      onClick={() => setDeleteGroupTarget(g)}
                      className="opacity-0 group-hover/grp:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {!selectedCommunity ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
              <div className="h-20 w-20 flex items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                <Users className="h-10 w-10" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Welcome to Communities</h2>
                <p className="text-sm text-gray-500 mt-2 max-w-sm">
                  Communities bring people together. Create channels, share announcements, start voice calls, run polls, schedule events, and more.
                </p>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => setShowCreateDialog(true)} className="gap-2"><Plus className="h-4 w-4" />Create Community</Button>
                <Button variant="outline" onClick={() => setShowJoinDialog(true)} className="gap-2"><Link2 className="h-4 w-4" />Join with Invite</Button>
              </div>
            </div>
          ) : showEventsView ? (
            <EventsView community={selectedCommunity} myClerkId={myClerkId} />
          ) : selectedGroup ? (
            <GroupView
              group={selectedGroup}
              community={selectedCommunity}
              myClerkId={myClerkId}
              isAdmin={isAdmin}
              onManage={() => { setManagingGroup(selectedGroup); setGroupMemberSearch(""); setShowManageGroupDialog(true); }}
            />
          ) : !selectedChannel ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Select a channel or group to start
            </div>
          ) : selectedChannel.type === "voice" ? (
            <VoiceChannelView channel={selectedChannel}
              displayName={user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Me"} />
          ) : selectedChannel.chatRoomId ? (
            <TextChannelView channel={selectedChannel} community={selectedCommunity} myClerkId={myClerkId} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Channel not available</div>
          )}
        </div>
      </div>

      {/* ── Create Community Dialog ── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-blue-600" />Create a Community</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Community Name *</Label>
              <Input value={newCommName} onChange={(e) => setNewCommName(e.target.value)}
                placeholder="e.g. Engineering Team, Book Club…" className="mt-1"
                onKeyDown={(e) => e.key === "Enter" && newCommName.trim() && createComm.mutate()} autoFocus />
            </div>
            <div>
              <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea value={newCommDesc} onChange={(e) => setNewCommDesc(e.target.value)}
                placeholder="What's this community about?" className="mt-1 resize-none" rows={3} />
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              A <strong>#general</strong> text channel will be created automatically. You can add more channels after.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setNewCommName(""); setNewCommDesc(""); }}>Cancel</Button>
            <Button onClick={() => createComm.mutate()} disabled={!newCommName.trim() || createComm.isPending} className="gap-1.5">
              {createComm.isPending ? "Creating…" : "Create Community"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Community Dialog ── */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" />Edit Community</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Community Name *</Label>
              <Input value={editCommName} onChange={(e) => setEditCommName(e.target.value)} placeholder="Community name" className="mt-1" />
            </div>
            <div>
              <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea value={editCommDesc} onChange={(e) => setEditCommDesc(e.target.value)}
                placeholder="What's this community about?" className="mt-1 resize-none" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={() => editComm.mutate()} disabled={!editCommName.trim() || editComm.isPending}>
              {editComm.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Community Alert ── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{selectedCommunity?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the community, all channels, and all messages. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteComm.mutate()}>
              {deleteComm.isPending ? "Deleting…" : "Delete Community"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Join Community Dialog ── */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-blue-600" />Join a Community</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Invite Link or Code</Label>
            <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="Paste invite link or code…" autoFocus />
            <p className="text-xs text-gray-500">Paste the full invite link, or just the code at the end of it.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowJoinDialog(false); setJoinCode(""); }}>Cancel</Button>
            <Button onClick={handleJoin} disabled={!joinCode.trim() || joinComm.isPending}>
              {joinComm.isPending ? "Joining…" : "Join"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Channel Dialog ── */}
      <Dialog open={showAddChannelDialog} onOpenChange={setShowAddChannelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Channel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Channel Type</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["text", "announcement", "voice"] as const).map((t) => (
                  <button type="button" key={t} onClick={() => setNewChannelType(t)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-colors ${newChannelType === t ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 text-gray-600"}`}>
                    {t === "text" ? <Hash className="h-4 w-4" /> : t === "voice" ? <Volume2 className="h-4 w-4" /> : <Megaphone className="h-4 w-4 text-yellow-500" />}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              {newChannelType === "announcement" && (
                <p className="mt-2 text-xs text-yellow-700 bg-yellow-50 rounded-lg p-2">Only admins can post in announcement channels. Members can read and react.</p>
              )}
            </div>
            <div>
              <Label>Channel Name *</Label>
              <Input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="e.g. general, announcements…" className="mt-1" />
            </div>
            <div>
              <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input value={newChannelDesc} onChange={(e) => setNewChannelDesc(e.target.value)} placeholder="What's this channel for?" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddChannelDialog(false)}>Cancel</Button>
            <Button onClick={() => addChannel.mutate()} disabled={!newChannelName.trim() || addChannel.isPending}>Add Channel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite / Add Members Dialog ── */}
      <Dialog open={showInviteDialog} onOpenChange={(o) => {
        setShowInviteDialog(o);
        if (!o) { setInviteContactSearch(""); setInviteTab("contacts"); setNewPersonEmail(""); setAddedClerkIds(new Set()); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-blue-600" />Add Members — {selectedCommunity?.name}</DialogTitle>
          </DialogHeader>

          {/* Tab bar */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {(["contacts", "new", "groups"] as const).map((tab) => (
              <button key={tab} type="button"
                onClick={() => setInviteTab(tab)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${inviteTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {tab === "contacts" ? "My Contacts" : tab === "new" ? "New Person" : "My Groups"}
              </button>
            ))}
          </div>

          {/* ── Tab: My Contacts ── */}
          {inviteTab === "contacts" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  className="pl-8"
                  placeholder="Search contacts…"
                  value={inviteContactSearch}
                  onChange={(e) => setInviteContactSearch(e.target.value)}
                />
              </div>
              <div className="overflow-y-auto max-h-72 space-y-0.5 rounded-xl border border-gray-100 p-1">
                {!contactsData && <p className="text-xs text-gray-400 text-center py-6">Loading contacts…</p>}
                {contactsData?.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No contacts yet</p>}
                {contactsData
                  ?.filter(c =>
                    !inviteContactSearch ||
                    c.name.toLowerCase().includes(inviteContactSearch.toLowerCase()) ||
                    (c.email ?? "").toLowerCase().includes(inviteContactSearch.toLowerCase())
                  )
                  .slice(0, 30)
                  .map(c => {
                    const isAdded = addedClerkIds.has(c.contactClerkId ?? "");
                    const inviteMsg = `Hi ${c.name}! You're invited to join the "${selectedCommunity?.name}" community on TanCom. Click here: ${inviteUrl}`;
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${avatarColor(c.contactClerkId ?? c.email ?? c.name)}`}>
                          {getInitials(c.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                          <p className="text-xs text-gray-400 truncate">{c.email ?? c.phone ?? "—"}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {/* Direct add if they have a TanCom account */}
                          {c.contactClerkId ? (
                            <Button size="sm" variant={isAdded ? "outline" : "default"} disabled={isAdded || directAdd.isPending}
                              className="h-7 text-xs gap-1"
                              onClick={() => directAdd.mutate({ clerkId: c.contactClerkId! })}>
                              {isAdded ? <><Check className="h-3 w-3" />Added</> : <><UserPlus className="h-3 w-3" />Add</>}
                            </Button>
                          ) : (
                            /* Fallback: send invite via email/SMS */
                            <div className="flex gap-1">
                              {c.email && (
                                <a href={`mailto:${c.email}?subject=${encodeURIComponent(`Join ${selectedCommunity?.name} on TanCom`)}&body=${encodeURIComponent(inviteMsg)}`}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                  onClick={() => toast({ title: `Invite email opened for ${c.name}` })}>
                                  <Mail className="h-3 w-3" />Email
                                </a>
                              )}
                              {c.phone && (
                                <a href={`sms:${c.phone}?&body=${encodeURIComponent(inviteMsg)}`}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                                  onClick={() => toast({ title: `Invite SMS opened for ${c.name}` })}>
                                  <Phone className="h-3 w-3" />SMS
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Invite link fallback */}
              <div className="border-t border-gray-100 pt-3 space-y-1.5">
                <p className="text-xs text-gray-500">Or share the invite link directly:</p>
                <div className="flex gap-2">
                  <Input readOnly value={inviteUrl} className="text-xs bg-gray-50 font-mono" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <Button variant="outline" size="icon" onClick={copyInvite} title="Copy">
                    {copiedInvite ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => regenInvite.mutate()} disabled={regenInvite.isPending} className="gap-1.5 text-xs text-amber-700 hover:bg-amber-50 px-2">
                    <RefreshCw className="h-3 w-3" /> Regenerate link
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: New Person ── */}
          {inviteTab === "new" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Add someone to this community by their TanCom email address. They'll be added instantly and notified.</p>
              <div className="space-y-2">
                <Label>Email address</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={newPersonEmail}
                    onChange={(e) => setNewPersonEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newPersonEmail.trim()) {
                        directAdd.mutate({ email: newPersonEmail.trim() });
                        setNewPersonEmail("");
                      }
                    }}
                  />
                  <Button
                    onClick={() => { directAdd.mutate({ email: newPersonEmail.trim() }); setNewPersonEmail(""); }}
                    disabled={!newPersonEmail.trim() || directAdd.isPending}
                    className="gap-1.5 shrink-0">
                    <UserPlus className="h-4 w-4" /> Add
                  </Button>
                </div>
                <p className="text-xs text-gray-400">The person must already have a TanCom account. If they don't, share the invite link from the Contacts tab.</p>
              </div>
            </div>
          )}

          {/* ── Tab: My Groups ── */}
          {inviteTab === "groups" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Add all members of a group you manage. Members already in this community will be skipped automatically.</p>
              {!myStandaloneGroups && <p className="text-xs text-gray-400 text-center py-6">Loading groups…</p>}
              {myStandaloneGroups?.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">You're not an admin or owner of any groups.</p>
              )}
              <div className="overflow-y-auto max-h-64 space-y-1.5 rounded-xl border border-gray-100 p-2">
                {myStandaloneGroups
                  ?.filter(g => g.role === "owner" || g.role === "admin")
                  .map(g => (
                    <div key={g.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-gray-200 transition-colors">
                      <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{g.name}</p>
                        <p className="text-xs text-gray-400">{g.memberCount} member{g.memberCount !== 1 ? "s" : ""} · {g.role}</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={bulkFromGroup.isPending}
                        className="gap-1.5 shrink-0 h-8 text-xs"
                        onClick={() => bulkFromGroup.mutate(g.id)}>
                        <UserPlus className="h-3.5 w-3.5" /> Add All
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}

        </DialogContent>
      </Dialog>

      {/* ── Members Dialog ── */}
      <Dialog open={showMembersDialog} onOpenChange={(o) => { setShowMembersDialog(o); if (!o) setMemberSearch(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />Members — {selectedCommunity?.name}
            </DialogTitle>
          </DialogHeader>

          {/* Member search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input className="pl-8" placeholder="Search members…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1">
            {!members && <p className="text-sm text-gray-400 text-center py-4">Loading…</p>}
            {filteredMembers.length === 0 && members && memberSearch && (
              <p className="text-sm text-gray-400 text-center py-4">No members match "{memberSearch}"</p>
            )}
            {filteredMembers.map((m) => (
              <div key={m.clerkId} className="px-2 py-2 rounded-xl hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-bold shrink-0 ${avatarColor(m.clerkId)}`}>
                    {getInitials(m.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                    <p className="text-xs text-gray-400 truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.role === "owner" && <span title="Owner"><Crown className="h-3.5 w-3.5 text-yellow-500" /></span>}
                    {m.role === "admin" && <span title="Admin"><Shield className="h-3.5 w-3.5 text-blue-500" /></span>}
                    {m.role === "member" && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Member</span>}
                    {isAdmin && m.clerkId !== myClerkId && (
                      <button type="button" onClick={() => openManageTags(m)} title="Manage tags"
                        className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-blue-500 transition-colors">
                        <Tag className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isAdmin && m.clerkId !== myClerkId && m.role !== "owner" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {m.role === "member" && (
                            <DropdownMenuItem onClick={() => promoteMember.mutate({ clerkId: m.clerkId, role: "admin" })}>
                              <Shield className="h-4 w-4 mr-2 text-blue-500" /> Make Admin
                            </DropdownMenuItem>
                          )}
                          {m.role === "admin" && (
                            <DropdownMenuItem onClick={() => promoteMember.mutate({ clerkId: m.clerkId, role: "member" })}>
                              <UserMinus className="h-4 w-4 mr-2" /> Remove Admin
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => kickMember.mutate(m.clerkId)} className="text-red-600">
                            <UserMinus className="h-4 w-4 mr-2" /> Remove from Community
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                {/* Tags row */}
                {m.customTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 ml-11">
                    {m.customTags.map((tag) => (
                      <span key={tag} className={`text-xs px-2 py-0.5 rounded-full font-medium ${tagColor(tag)}`}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMembersDialog(false)}>Close</Button>
            <Button onClick={() => { setShowMembersDialog(false); setShowInviteDialog(true); }} className="gap-2">
              <Plus className="h-4 w-4" />Add Members
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage Tags Dialog ── */}
      <Dialog open={!!managingTagsMember} onOpenChange={(o) => { if (!o) setManagingTagsMember(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-blue-600" /> Tags for {managingTagsMember?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Add custom role labels visible to everyone in the community (e.g. "Volunteer", "Board Member", "Youth Coordinator").</p>

            {/* Current tags */}
            <div className="flex flex-wrap gap-1.5 min-h-8">
              {tagDraft.length === 0 && <p className="text-xs text-gray-400">No tags yet</p>}
              {tagDraft.map((tag) => (
                <span key={tag} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${tagColor(tag)}`}>
                  {tag}
                  <button type="button" onClick={() => setTagDraft((d) => d.filter((t) => t !== tag))}
                    className="ml-0.5 hover:opacity-70 transition-opacity">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>

            {/* Add tag input */}
            {tagDraft.length < 10 && (
              <div className="flex gap-2">
                <Input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Add a tag…"
                  maxLength={30}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={addTag} disabled={!newTagInput.trim()}>
                  Add
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-400">{tagDraft.length}/10 tags</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagingTagsMember(null)}>Cancel</Button>
            <Button onClick={() => managingTagsMember && updateMemberTags.mutate({ clerkId: managingTagsMember.clerkId, tags: tagDraft })}
              disabled={updateMemberTags.isPending}>
              {updateMemberTags.isPending ? "Saving…" : "Save Tags"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Create Group Dialog ── */}
      <Dialog open={showCreateGroupDialog} onOpenChange={(o) => { if (!o) { setShowCreateGroupDialog(false); setNewGroupName(""); setNewGroupDesc(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-amber-500" /> Create a Group
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Group Name *</Label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Design Team, Volunteers…"
                maxLength={60}
                className="mt-1"
                onKeyDown={(e) => { if (e.key === "Enter" && newGroupName.trim()) createGroup.mutate(); }}
              />
            </div>
            <div>
              <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="What is this group for?"
                maxLength={200}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateGroupDialog(false); setNewGroupName(""); setNewGroupDesc(""); }}>Cancel</Button>
            <Button onClick={() => createGroup.mutate()} disabled={!newGroupName.trim() || createGroup.isPending}>
              {createGroup.isPending ? "Creating…" : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage Group Members Dialog ── */}
      <Dialog open={showManageGroupDialog} onOpenChange={(o) => { if (!o) { setShowManageGroupDialog(false); setManagingGroup(null); setGroupMemberSearch(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-amber-500" /> {managingGroup?.name} — Members
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current group members */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">In this group ({groupMembers?.length ?? 0})</p>
              {(!groupMembers || groupMembers.length === 0) && (
                <p className="text-sm text-gray-400 italic">No members yet.</p>
              )}
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {groupMembers?.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-blue-700">{m.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}</span>
                      </div>
                      <span className="text-sm text-gray-800 truncate">{m.name}</span>
                    </div>
                    {isAdmin && (
                      <button type="button" onClick={() => removeGroupMember.mutate(m.clerkId)}
                        className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
                        <UserX className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Add members from community */}
            {isAdmin && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Add from community</p>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    value={groupMemberSearch}
                    onChange={(e) => setGroupMemberSearch(e.target.value)}
                    placeholder="Search members…"
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {allMembers
                    ?.filter((m) => !groupMembers?.some((gm) => gm.clerkId === m.clerkId))
                    .filter((m) => !groupMemberSearch || m.name.toLowerCase().includes(groupMemberSearch.toLowerCase()) || m.email.toLowerCase().includes(groupMemberSearch.toLowerCase()))
                    .map((m) => (
                      <div key={m.clerkId} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-gray-600">{m.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 truncate">{m.name}</p>
                            <p className="text-xs text-gray-400 truncate">{m.email}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => addGroupMember.mutate(m.clerkId)}
                          disabled={addGroupMember.isPending}
                          className="text-gray-400 hover:text-blue-500 transition-colors shrink-0">
                          <UserPlus className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowManageGroupDialog(false); setManagingGroup(null); setGroupMemberSearch(""); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Group Confirmation ── */}
      <AlertDialog open={!!deleteGroupTarget} onOpenChange={(o) => { if (!o) setDeleteGroupTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteGroupTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This group and its member list will be permanently deleted. Community members themselves won't be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteGroupTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroupTarget && deleteGroup.mutate(deleteGroupTarget.id)}
              className="bg-red-600 hover:bg-red-700">
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppLayout>
  );
}
