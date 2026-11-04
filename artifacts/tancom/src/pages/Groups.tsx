import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SmartTextarea } from "@/components/SmartField";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users, Plus, Trash2, Mail, Phone, UserPlus, ChevronRight, ChevronDown,
  Copy, RefreshCw, Circle, Bell, BellOff, Check, X, Link2, Shield, Crown,
  LogOut, MessageSquare, Send, Share2, ArrowUpRight, Eye, MoreHorizontal,
  MessageCircle, Newspaper, Search, Loader2, Paperclip, Download, FileText,
  Pin, PinOff, Pencil, Video, Clock, ChevronUp,
} from "lucide-react";
import {
  listGroups, getListGroupsQueryKey,
  listGroupMembers, getListGroupMembersQueryKey,
  getGroupPresence, getGetGroupPresenceQueryKey,
  listGroupInvitations, getListGroupInvitationsQueryKey,
  listContacts, getListContactsQueryKey,
  getGroupInviteToken,
  useCreateGroup, useDeleteGroup, useAddGroupMember, useDeleteGroupMember,
  useRespondToGroupInvitation, useLeaveGroup, useSetGroupMemberRole,
  listGroupPosts, getListGroupPostsQueryKey,
  useCreateGroupPost, useDeleteGroupPost, useToggleGroupPostReaction,
  listGroupPostReplies, getListGroupPostRepliesQueryKey,
  useCreateGroupPostReply, useDeleteGroupPostReply,
  getGroupPostSeenBy, markGroupPostSeen,
  usePatchGroupMember,
  usePatchGroup,
  useMuteGroup, useUnmuteGroup,
  listGroupJoinRequests, getListGroupJoinRequestsQueryKey,
  useApproveGroupJoinRequest, useRejectGroupJoinRequest,
  listPinnedGroupPosts, getListPinnedGroupPostsQueryKey,
  usePinGroupPost, useUnpinGroupPost,
  regenerateGroupInviteToken,
  useCreateMeeting, getListMeetingsQueryKey,
  requestUploadUrl,
} from "@workspace/api-client-react";
import type {
  Group, GroupMember, GroupMemberPresence, GroupInvitation,
  GroupPost, GroupPostReply, Contact, GroupJoinRequest,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function avatarColor(seed: string): string {
  const colors = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500", "bg-pink-500", "bg-indigo-500"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function initials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function ProtectedAttachment({
  objectPath,
  fileName,
  fileMimeType,
  fileSizeBytes,
}: {
  objectPath: string;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileSizeBytes?: number | null;
}) {
  const { data: fileUrl, isLoading } = useQuery({
    queryKey: ["attachment-download-url", objectPath],
    queryFn: async () => {
      const response = await fetch("/api/storage/download-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath }),
      });
      if (!response.ok) throw new Error("Could not load attachment");
      return (await response.json() as { downloadURL: string }).downloadURL;
    },
    staleTime: 4 * 60 * 1000,
  });
  if (isLoading) {
    return <div className="px-3 pb-2 flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Loading attachment…</div>;
  }
  if (!fileUrl) {
    return <div className="px-3 pb-2 text-sm text-red-500">This attachment is unavailable.</div>;
  }
  const isImage = fileMimeType?.startsWith("image/");
  const isVideo = fileMimeType?.startsWith("video/");
  const isAudio = fileMimeType?.startsWith("audio/");
  return (
    <div className="px-3 pb-2">
      {isImage && <a href={fileUrl} target="_blank" rel="noopener noreferrer"><img src={fileUrl} alt={fileName ?? "image"} className="max-w-full max-h-72 rounded-xl object-cover border border-gray-100" /></a>}
      {isVideo && <video src={fileUrl} controls className="max-w-full max-h-72 rounded-xl border border-gray-100" />}
      {isAudio && <audio src={fileUrl} controls className="w-full" />}
      {!isImage && !isVideo && !isAudio && (
        <a href={fileUrl} download={fileName ?? "file"} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 p-3 transition-colors">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100"><FileText className="h-5 w-5 text-blue-600" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-800 truncate">{fileName ?? "File"}</p>
            {fileSizeBytes && <p className="text-xs text-gray-400">{fileSizeBytes > 1024 * 1024 ? `${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : `${(fileSizeBytes / 1024).toFixed(0)} KB`}</p>}
          </div>
          <Download className="h-4 w-4 shrink-0 text-gray-400" />
        </a>
      )}
    </div>
  );
}

/** Render post text with @mentions highlighted */
function renderWithMentions(text: string, members: GroupMember[]): React.ReactNode {
  if (!members.length) return text;
  const names = members.map(m => m.name).filter(Boolean);
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`@(${escaped.join("|")})`, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <span key={match.index} className="text-blue-600 font-semibold">@{match[1]}</span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? <>{parts}</> : text;
}

// ── Invitation card ────────────────────────────────────────────────────────────
function InvitationCard({ invitation }: { invitation: GroupInvitation }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const respondMutation = useRespondToGroupInvitation({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListGroupInvitationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({
          title: data.status === "accepted"
            ? `Joined "${data.groupName}"`
            : `Declined invitation to "${data.groupName}"`,
        });
      },
      onError: () => toast({ title: "Failed to respond", variant: "destructive" }),
    },
  });
  return (
    <Card className="border-blue-100 bg-blue-50/40">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">{invitation.groupName}</p>
            <p className="text-xs text-gray-500">
              {invitation.memberCount} {invitation.memberCount === 1 ? "member" : "members"}
              {" · "}Invited {new Date(invitation.invitedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline"
              className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate({ memberId: invitation.memberId, data: { action: "decline" } })}
            >
              <X className="h-3.5 w-3.5" />Decline
            </Button>
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate({ memberId: invitation.memberId, data: { action: "accept" } })}
            >
              <Check className="h-3.5 w-3.5" />Accept
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Member row ─────────────────────────────────────────────────────────────────
function MemberRow({
  member, presence, groupId, groupOwnerClerkId, callerRole,
  onDelete, onInviteEmail, onInvitePhone, onToggleAdmin,
}: {
  member: GroupMember;
  presence?: GroupMemberPresence;
  groupId: number;
  groupOwnerClerkId: string;
  callerRole: "owner" | "admin" | "member";
  onDelete: (id: number) => void;
  onInviteEmail: (m: GroupMember) => void;
  onInvitePhone: (m: GroupMember) => void;
  onToggleAdmin: (m: GroupMember) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inits = initials(member.name);
  const color = avatarColor(member.name + member.id);
  const inMeeting = presence?.status === "in_meeting";
  const isOwnerMember = member.invitedClerkId === groupOwnerClerkId || member.memberRole === "owner";
  const isAdmin = member.memberRole === "admin";
  const canManage = callerRole === "owner" || callerRole === "admin";
  const isOwnerCaller = callerRole === "owner";

  const patchMemberMutation = usePatchGroupMember({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListGroupMembersQueryKey(groupId) }),
      onError: () => toast({ title: "Failed to update member", variant: "destructive" }),
    },
  });

  const togglePerm = (field: "canPost" | "canDeleteAnyPost" | "canAddMembers" | "canEditGroupInfo", value: boolean) => {
    patchMemberMutation.mutate({ groupId, memberId: member.id, data: { [field]: value } });
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-2.5">
      <div className="flex items-center gap-3">
        <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${color} text-white text-xs font-bold`}>
          {inits}
          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${inMeeting ? "bg-yellow-400" : "bg-green-400"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
            {isOwnerMember && (
              <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700 bg-yellow-50 shrink-0 gap-1">
                <Crown className="h-2.5 w-2.5" />Owner
              </Badge>
            )}
            {!isOwnerMember && isAdmin && (
              <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50 shrink-0 gap-1">
                <Shield className="h-2.5 w-2.5" />Admin
              </Badge>
            )}
            {member.invitationStatus === "pending" && (
              <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700 bg-yellow-50 shrink-0">
                Invite sent
              </Badge>
            )}
            {!isOwnerMember && !member.canPost && (
              <Badge variant="outline" className="text-xs border-gray-300 text-gray-500 bg-gray-50 shrink-0">
                View only
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{member.email}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onInviteEmail(member)} title="Invite to meeting via email"
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <Mail className="h-3.5 w-3.5" />
          </button>
          {member.phone && (
            <button onClick={() => onInvitePhone(member)} title="Invite via SMS"
              className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors">
              <Phone className="h-3.5 w-3.5" />
            </button>
          )}
          {isOwnerCaller && !isOwnerMember && (
            <button onClick={() => onToggleAdmin(member)} title={isAdmin ? "Remove admin" : "Make admin"}
              className={`p-1.5 rounded-lg transition-colors ${isAdmin ? "text-blue-600 hover:text-gray-500 hover:bg-gray-100" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"}`}>
              <Shield className="h-3.5 w-3.5" />
            </button>
          )}
          {canManage && !isOwnerMember && (
            <button onClick={() => onDelete(member.id)} title="Remove member"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Permission toggles — owner-only (server enforces this) */}
      {isOwnerCaller && !isOwnerMember && member.invitationStatus === "accepted" && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-12 text-xs text-gray-600">
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span>Can post</span>
            <Switch
              checked={member.canPost ?? true}
              onCheckedChange={v => togglePerm("canPost", v)}
              disabled={patchMemberMutation.isPending}
              className="scale-75"
            />
          </label>
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span>Can delete posts</span>
            <Switch
              checked={member.canDeleteAnyPost ?? false}
              onCheckedChange={v => togglePerm("canDeleteAnyPost", v)}
              disabled={patchMemberMutation.isPending}
              className="scale-75"
            />
          </label>
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span>Can add members</span>
            <Switch
              checked={member.canAddMembers ?? false}
              onCheckedChange={v => togglePerm("canAddMembers", v)}
              disabled={patchMemberMutation.isPending}
              className="scale-75"
            />
          </label>
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span>Can edit group info</span>
            <Switch
              checked={member.canEditGroupInfo ?? false}
              onCheckedChange={v => togglePerm("canEditGroupInfo", v)}
              disabled={patchMemberMutation.isPending}
              className="scale-75"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Join request row ───────────────────────────────────────────────────────────
function JoinRequestRow({
  request, groupId,
}: {
  request: GroupJoinRequest;
  groupId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const approveMutation = useApproveGroupJoinRequest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupJoinRequestsQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getListGroupMembersQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({ title: `${request.requesterName} approved` });
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Failed to approve", variant: "destructive" }),
    },
  });

  const rejectMutation = useRejectGroupJoinRequest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupJoinRequestsQueryKey(groupId) });
        toast({ title: `${request.requesterName}'s request rejected` });
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Failed to reject", variant: "destructive" }),
    },
  });

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${avatarColor(request.requesterName)} text-white text-xs font-bold`}>
        {initials(request.requesterName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{request.requesterName}</p>
        <p className="text-xs text-gray-500 truncate">{request.requesterEmail} · {timeAgo(request.requestedAt)}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="outline" className="h-7 gap-1 border-red-200 text-red-600 hover:bg-red-50 text-xs"
          disabled={isPending}
          onClick={() => rejectMutation.mutate({ groupId, requestId: request.id })}>
          <X className="h-3 w-3" />Reject
        </Button>
        <Button size="sm" className="h-7 gap-1 bg-green-600 hover:bg-green-700 text-xs"
          disabled={isPending}
          onClick={() => approveMutation.mutate({ groupId, requestId: request.id })}>
          <Check className="h-3 w-3" />Approve
        </Button>
      </div>
    </div>
  );
}

// ── Single post card ───────────────────────────────────────────────────────────
function GroupPostCard({
  post, groupId, callerRole, allGroups, members, onShare,
}: {
  post: GroupPost;
  groupId: number;
  callerRole: "owner" | "admin" | "member";
  allGroups: Group[];
  members: GroupMember[];
  onShare: (post: GroupPost) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showSeenBy, setShowSeenBy] = useState(false);
  const [seenBy, setSeenBy] = useState<{ viewerName: string; seenAt: string }[]>([]);
  const [seenLoading, setSeenLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardGroupId, setForwardGroupId] = useState<number | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const { data: replies, isLoading: repliesLoading } = useQuery({
    queryKey: getListGroupPostRepliesQueryKey(groupId, post.id),
    queryFn: () => listGroupPostReplies(groupId, post.id),
    enabled: showReplies,
  });

  const deletePost = useDeleteGroupPost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(groupId) });
        toast({ title: "Post deleted" });
      },
      onError: () => toast({ title: "Failed to delete post", variant: "destructive" }),
    },
  });

  const toggleReaction = useToggleGroupPostReaction({
    mutation: {
      onSuccess: (updated) => {
        queryClient.setQueryData(
          getListGroupPostsQueryKey(groupId),
          (old: GroupPost[] | undefined) =>
            old ? old.map(p => (p.id === updated.id ? updated : p)) : old,
        );
      },
    },
  });

  const createReply = useCreateGroupPostReply({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupPostRepliesQueryKey(groupId, post.id) });
        queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(groupId) });
        setReplyText("");
        toast({ title: "Reply sent" });
      },
      onError: () => toast({ title: "Failed to send reply", variant: "destructive" }),
    },
  });

  const deleteReply = useDeleteGroupPostReply({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupPostRepliesQueryKey(groupId, post.id) });
        queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(groupId) });
      },
      onError: () => toast({ title: "Failed to delete reply", variant: "destructive" }),
    },
  });

  const forwardMutation = useCreateGroupPost({
    mutation: {
      onSuccess: () => {
        const target = allGroups.find(g => g.id === forwardGroupId);
        toast({ title: `Post forwarded to "${target?.name ?? "group"}"` });
        setForwardOpen(false);
        setForwardGroupId(null);
        if (forwardGroupId) queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(forwardGroupId) });
      },
      onError: () => toast({ title: "Failed to forward post", variant: "destructive" }),
    },
  });

  const pinMutation = usePinGroupPost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getListPinnedGroupPostsQueryKey(groupId) });
        toast({ title: "Post pinned" });
      },
      onError: () => toast({ title: "Failed to pin post", variant: "destructive" }),
    },
  });

  const unpinMutation = useUnpinGroupPost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getListPinnedGroupPostsQueryKey(groupId) });
        toast({ title: "Post unpinned" });
      },
      onError: () => toast({ title: "Failed to unpin post", variant: "destructive" }),
    },
  });

  const canPin = callerRole === "owner" || callerRole === "admin";

  const handleReact = (emoji: string) => toggleReaction.mutate({ groupId, postId: post.id, data: { emoji } });

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    createReply.mutate({ groupId, postId: post.id, data: { content: replyText.trim() } });
  };

  const handleShowSeenBy = async () => {
    if (showSeenBy) { setShowSeenBy(false); return; }
    setSeenLoading(true);
    try {
      const data = await getGroupPostSeenBy(groupId, post.id);
      setSeenBy(data);
      setShowSeenBy(true);
    } catch {
      toast({ title: "Cannot load seen-by list", variant: "destructive" });
    } finally {
      setSeenLoading(false);
    }
  };

  const handleForward = () => {
    if (!forwardGroupId) return;
    const forwarded = `📨 Forwarded from ${allGroups.find(g => g.id === groupId)?.name ?? "a group"}:\n\n${post.content}`;
    forwardMutation.mutate({ groupId: forwardGroupId, data: { content: forwarded } });
  };

  useEffect(() => {
    if (!showMore) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMore]);

  const color = avatarColor(post.authorClerkId);
  const inits = initials(post.authorName);
  const canSeeViewers = post.isOwn || callerRole === "owner" || callerRole === "admin";
  const otherGroups = allGroups.filter(g => g.id !== groupId);

  return (
    <div className={`rounded-xl border bg-white hover:border-gray-200 transition-colors ${post.pinned ? "border-amber-200 bg-amber-50/30" : "border-gray-100"}`}>
      {post.pinned && (
        <div className="flex items-center gap-1.5 px-3 pt-2 text-xs text-amber-600 font-medium">
          <Pin className="h-3 w-3" />Pinned
        </div>
      )}
      {/* Post header */}
      <div className="flex items-start gap-2.5 px-3 pt-2.5 pb-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color} text-white text-xs font-bold`}>
          {inits}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-900 truncate">{post.authorName}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">{timeAgo(post.createdAt)}</span>
          </div>
        </div>
        <div className="relative shrink-0" ref={moreRef}>
          <button
            onClick={() => setShowMore(v => !v)}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {showMore && (
            <div className="absolute right-0 top-6 z-20 min-w-[155px] rounded-xl border border-gray-200 bg-white shadow-lg py-1">
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => { onShare(post); setShowMore(false); }}>
                <Share2 className="h-3.5 w-3.5 text-blue-500" />Share to group
              </button>
              {otherGroups.length > 0 && (
                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { setForwardOpen(true); setShowMore(false); }}>
                  <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />Forward to…
                </button>
              )}
              {canPin && !post.pinned && (
                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { pinMutation.mutate({ groupId, postId: post.id }); setShowMore(false); }}
                  disabled={pinMutation.isPending}>
                  <Pin className="h-3.5 w-3.5 text-amber-500" />Pin post
                </button>
              )}
              {canPin && post.pinned && (
                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { unpinMutation.mutate({ groupId, postId: post.id }); setShowMore(false); }}
                  disabled={unpinMutation.isPending}>
                  <PinOff className="h-3.5 w-3.5 text-gray-400" />Unpin post
                </button>
              )}
              {post.canDelete && (
                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => { deletePost.mutate({ groupId, postId: post.id }); setShowMore(false); }}
                  disabled={deletePost.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />Delete post
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Shared post preview */}
      {post.sharedFromPostId && (
        <div className="mx-3 mb-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
          <p className="text-xs text-blue-600 font-medium mb-0.5 flex items-center gap-1">
            <Share2 className="h-3 w-3" />
            {post.sharedFromAuthorName ?? "Someone"} originally posted
          </p>
          <p className="text-sm text-gray-700 line-clamp-3">{post.sharedFromContent ?? "This post has been deleted."}</p>
        </div>
      )}

      {/* Content */}
      {post.content && (
        <div className="px-3 pb-2">
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {renderWithMentions(post.content, members)}
          </p>
        </div>
      )}

      {/* Attachment */}
      {post.fileObjectPath && <ProtectedAttachment objectPath={post.fileObjectPath} fileName={post.fileName} fileMimeType={post.fileMimeType} fileSizeBytes={post.fileSizeBytes} />}

      {/* Reactions */}
      <div className="px-3 pb-2 flex items-center gap-1 flex-wrap">
        {EMOJIS.map(emoji => {
          const reaction = post.reactions.find(r => r.emoji === emoji);
          const count = reaction?.count ?? 0;
          const isActive = post.myReaction === emoji;
          return (
            <button key={emoji} onClick={() => handleReact(emoji)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors border ${
                isActive ? "bg-blue-100 border-blue-300 text-blue-700 font-medium"
                  : count > 0 ? "bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200"
                    : "bg-transparent border-transparent text-gray-400 hover:bg-gray-100 hover:border-gray-200"
              }`}
              disabled={toggleReaction.isPending}>
              <span>{emoji}</span>
              {count > 0 && <span>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="px-3 pb-2.5 flex items-center gap-3 text-xs text-gray-500 border-t border-gray-50 pt-2">
        <button onClick={() => setShowReplies(v => !v)}
          className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
          <MessageCircle className="h-3.5 w-3.5" />
          {post.replyCount > 0 ? `${post.replyCount} ${post.replyCount === 1 ? "reply" : "replies"}` : "Reply"}
        </button>
        {canSeeViewers && (
          <button onClick={handleShowSeenBy} disabled={seenLoading}
            className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors">
            <Eye className="h-3.5 w-3.5" />
            {post.viewCount > 0 ? `Seen by ${post.viewCount}` : "0 seen"}
          </button>
        )}
        <div className="flex-1" />
        <button onClick={() => onShare(post)} className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
          <Share2 className="h-3 w-3" />Share
        </button>
        {otherGroups.length > 0 && (
          <button onClick={() => setForwardOpen(true)} className="flex items-center gap-1.5 hover:text-green-600 transition-colors">
            <ArrowUpRight className="h-3.5 w-3.5" />Forward
          </button>
        )}
      </div>

      {/* Seen-by list */}
      {showSeenBy && (
        <div className="mx-3 mb-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1">
            <Eye className="h-3 w-3" /> Seen by
          </p>
          {seenBy.length === 0 ? (
            <p className="text-xs text-gray-400">No one has seen this post yet</p>
          ) : (
            <div className="space-y-1">
              {seenBy.map((v, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-gray-700">{v.viewerName}</span>
                  <span className="text-xs text-gray-400">{timeAgo(v.seenAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Replies */}
      {showReplies && (
        <div className="border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
          <div className="px-3 py-2 space-y-2">
            {repliesLoading ? (
              <div className="space-y-1.5">
                {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
              </div>
            ) : replies && replies.length > 0 ? (
              replies.map((reply: GroupPostReply) => (
                <div key={reply.id} className="flex items-start gap-2">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${avatarColor(reply.authorClerkId)} text-white text-xs font-bold`}>
                    {initials(reply.authorName)}
                  </div>
                  <div className="flex-1 min-w-0 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-xs font-semibold text-gray-800">{reply.authorName}</span>
                      <span className="text-xs text-gray-400">· {timeAgo(reply.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">
                      {renderWithMentions(reply.content, members)}
                    </p>
                  </div>
                  {reply.isOwn && (
                    <button onClick={() => deleteReply.mutate({ groupId, postId: post.id, replyId: reply.id })}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400 text-center py-1">No replies yet</p>
            )}
            <form onSubmit={handleSubmitReply} className="flex gap-2 pt-1">
              <Input placeholder="Write a reply…" value={replyText} onChange={e => setReplyText(e.target.value)} className="h-7 text-xs" />
              <Button type="submit" size="sm" className="h-7 px-2.5" disabled={!replyText.trim() || createReply.isPending}>
                <Send className="h-3 w-3" />
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Forward dialog */}
      <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-green-500" />Forward post to another group
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600 line-clamp-3">{post.content}</div>
            <div className="space-y-1.5">
              {otherGroups.length === 0 ? (
                <p className="text-sm text-gray-500">You're not in any other groups.</p>
              ) : (
                otherGroups.map(g => (
                  <label key={g.id} className="flex items-center gap-2.5 rounded-lg border border-gray-200 p-2.5 cursor-pointer hover:bg-gray-50 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50">
                    <input type="radio" name="forward-group" value={g.id}
                      checked={forwardGroupId === g.id} onChange={() => setForwardGroupId(g.id)} className="accent-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{g.name}</p>
                      <p className="text-xs text-gray-500">{g.memberCount} {g.memberCount === 1 ? "member" : "members"}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForwardOpen(false)}>Cancel</Button>
            <Button onClick={handleForward} disabled={!forwardGroupId || forwardMutation.isPending} className="gap-2">
              <ArrowUpRight className="h-4 w-4" />
              {forwardMutation.isPending ? "Forwarding…" : "Forward"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Group feed ─────────────────────────────────────────────────────────────────
function GroupFeed({
  group, callerRole, canPost, allGroups, members,
}: {
  group: Group;
  callerRole: "owner" | "admin" | "member";
  canPost: boolean;
  allGroups: Group[];
  members: GroupMember[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [postText, setPostText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [shareTarget, setShareTarget] = useState<GroupPost | null>(null);
  const [shareComment, setShareComment] = useState("");
  const [pinnedOpen, setPinnedOpen] = useState(true);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);

  const { data: posts, isLoading } = useQuery({
    queryKey: getListGroupPostsQueryKey(group.id),
    queryFn: () => listGroupPosts(group.id),
    refetchInterval: 5_000,
  });

  const { data: pinnedPosts } = useQuery({
    queryKey: getListPinnedGroupPostsQueryKey(group.id),
    queryFn: () => listPinnedGroupPosts(group.id),
  });

  // Mark visible posts as seen
  useEffect(() => {
    if (!posts?.length) return;
    posts.forEach(p => { if (!p.isOwn) markGroupPostSeen(group.id, p.id).catch(() => {}); });
  }, [posts?.length, group.id]);

  const createPost = useCreateGroupPost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(group.id) });
        setPostText("");
        toast({ title: "Post published" });
      },
      onError: () => toast({ title: "Failed to publish post", variant: "destructive" }),
    },
  });

  const sharePost = useCreateGroupPost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(group.id) });
        setShareTarget(null);
        setShareComment("");
        toast({ title: "Post shared" });
      },
      onError: () => toast({ title: "Failed to share post", variant: "destructive" }),
    },
  });

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPostText(text);
    const cursor = e.target.selectionStart ?? text.length;
    const beforeCursor = text.slice(0, cursor);
    const atMatch = beforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(cursor - atMatch[0].length);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = useCallback((name: string) => {
    const cursor = composerRef.current?.selectionStart ?? postText.length;
    const before = postText.slice(0, mentionStart);
    const after = postText.slice(cursor);
    setPostText(`${before}@${name} ${after}`);
    setMentionQuery(null);
    setTimeout(() => {
      composerRef.current?.focus();
      const pos = mentionStart + name.length + 2;
      composerRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }, [postText, mentionStart]);

  const filteredMentionMembers = mentionQuery !== null
    ? members.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase()) && m.invitationStatus === "accepted").slice(0, 6)
    : [];

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postText.trim() && !pendingFile) return;
    if (pendingFile) {
      setIsUploading(true);
      try {
        const urlRes = await requestUploadUrl({ name: pendingFile.name, size: pendingFile.size, contentType: pendingFile.type || "application/octet-stream" });
        await fetch(urlRes.uploadURL, { method: "PUT", headers: { "Content-Type": pendingFile.type || "application/octet-stream" }, body: pendingFile });
        createPost.mutate({ groupId: group.id, data: { content: postText.trim(), fileObjectPath: urlRes.objectPath, fileName: pendingFile.name, fileMimeType: pendingFile.type, fileSizeBytes: pendingFile.size } });
        setPendingFile(null);
      } catch { toast({ title: "Upload failed", variant: "destructive" }); }
      finally { setIsUploading(false); }
    } else {
      createPost.mutate({ groupId: group.id, data: { content: postText.trim() } });
    }
  };

  const handleShare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareTarget) return;
    sharePost.mutate({ groupId: group.id, data: { content: shareComment.trim() || "Shared this post", sharedFromPostId: shareTarget.id } });
  };

  const hasPinned = pinnedPosts && pinnedPosts.length > 0;

  return (
    <div className="space-y-3 p-3">
      {/* Pinned posts strip */}
      {hasPinned && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
          <button
            onClick={() => setPinnedOpen(v => !v)}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100/60 transition-colors"
          >
            <Pin className="h-3.5 w-3.5" />
            {pinnedPosts.length} pinned {pinnedPosts.length === 1 ? "post" : "posts"}
            {pinnedOpen ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
          </button>
          {pinnedOpen && (
            <div className="border-t border-amber-200 divide-y divide-amber-100">
              {pinnedPosts.slice(0, 3).map((p: GroupPost) => (
                <div key={p.id} className="flex items-start gap-2.5 px-3 py-2">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${avatarColor(p.authorClerkId)} text-white text-xs font-bold`}>
                    {initials(p.authorName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-gray-800">{p.authorName}</span>
                      <span className="text-xs text-gray-400">· {timeAgo(p.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-700 line-clamp-2 whitespace-pre-wrap">
                      {renderWithMentions(p.content ?? "", members)}
                    </p>
                  </div>
                </div>
              ))}
              {pinnedPosts.length > 3 && (
                <div className="px-3 py-1.5 text-xs text-amber-600">
                  +{pinnedPosts.length - 3} more pinned posts (visible in feed below)
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Composer */}
      {canPost && (
        <form onSubmit={handlePost} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
          <div className="relative">
            <Textarea
              ref={composerRef}
              placeholder="Write something to the group… Use @ to mention members"
              value={postText}
              onChange={handleTextChange}
              onKeyDown={e => {
                if (mentionQuery !== null && filteredMentionMembers.length > 0 && e.key === "Escape") {
                  setMentionQuery(null);
                }
              }}
              rows={2}
              className="resize-none text-sm bg-white"
            />
            {/* @mention dropdown */}
            {mentionQuery !== null && filteredMentionMembers.length > 0 && (
              <div className="absolute left-0 bottom-full mb-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[180px] overflow-hidden">
                {filteredMentionMembers.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 transition-colors"
                    onMouseDown={e => { e.preventDefault(); insertMention(m.name); }}
                  >
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${avatarColor(m.name + m.id)} text-white text-xs font-bold`}>
                      {initials(m.name)[0]}
                    </div>
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* File preview */}
          {pendingFile && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
              {pendingFile.type.startsWith("image/") ? (
                <img src={URL.createObjectURL(pendingFile)} alt={pendingFile.name} className="h-10 w-10 rounded object-cover shrink-0" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-800 truncate">{pendingFile.name}</p>
                <p className="text-xs text-gray-400">{pendingFile.size > 1024 * 1024 ? `${(pendingFile.size / 1024 / 1024).toFixed(1)} MB` : `${(pendingFile.size / 1024).toFixed(0)} KB`}</p>
              </div>
              <button type="button" onClick={() => setPendingFile(null)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }} />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-200 transition-colors">
              <Paperclip className="h-3.5 w-3.5" />Attach
            </button>
            <div className="flex-1" />
            <Button type="submit" size="sm" className="gap-1.5"
              disabled={(!postText.trim() && !pendingFile) || createPost.isPending || isUploading}>
              {isUploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</>
                : createPost.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Posting…</>
                  : <><Send className="h-3.5 w-3.5" />Post</>}
            </Button>
          </div>
        </form>
      )}
      {!canPost && (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-center text-xs text-gray-400">
          You have view-only access to this group's feed
        </div>
      )}

      {/* Share dialog */}
      <Dialog open={shareTarget !== null} onOpenChange={open => { if (!open) { setShareTarget(null); setShareComment(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Share2 className="h-4 w-4 text-blue-500" />Share post to this group</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleShare} className="space-y-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-gray-700 line-clamp-3">
              <p className="text-xs text-blue-500 font-medium mb-0.5">{shareTarget?.authorName}</p>
              {shareTarget?.content}
            </div>
            <div className="space-y-1.5">
              <Label>Add a comment (optional)</Label>
              <SmartTextarea placeholder="Say something…" value={shareComment} onChange={e => setShareComment(e.target.value)} rows={2} className="resize-none text-sm" autoFocus context="comment on a shared post" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShareTarget(null); setShareComment(""); }}>Cancel</Button>
              <Button type="submit" className="gap-2" disabled={sharePost.isPending}>
                <Share2 className="h-3.5 w-3.5" />{sharePost.isPending ? "Sharing…" : "Share"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Posts list */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : posts && posts.length > 0 ? (
        <div className="space-y-2">
          {posts.map(post => (
            <GroupPostCard
              key={post.id}
              post={post}
              groupId={group.id}
              callerRole={callerRole}
              allGroups={allGroups}
              members={members}
              onShare={setShareTarget}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 mx-auto mb-3">
            <Newspaper className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">No posts yet</p>
          {canPost && <p className="text-xs text-gray-400 mt-1">Be the first to post something</p>}
        </div>
      )}
    </div>
  );
}

// ── Group card ─────────────────────────────────────────────────────────────────
function GroupCard({ group, onDelete, allGroups }: { group: Group; onDelete: (id: number) => void; allGroups: Group[] }) {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const isOwner = group.role === "owner";
  const isAdmin = group.role === "admin";
  const callerRole = group.role as "owner" | "admin" | "member";
  const canManage = isOwner || isAdmin;

  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"members" | "feed">("members");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<number | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<GroupMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<{ member: GroupMember; channel: "email" | "phone" } | null>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [memberForm, setMemberForm] = useState({ name: "", email: "", phone: "" });
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [loadingShareLink, setLoadingShareLink] = useState(false);
  const [shareContactSearch, setShareContactSearch] = useState("");
  const [addMemberContactSearch, setAddMemberContactSearch] = useState("");
  const [showRequests, setShowRequests] = useState(true);

  // Edit group state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: group.name, description: group.description ?? "", requireApproval: group.requireApproval ?? false });

  // Start meeting state
  const [startMeetingOpen, setStartMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState(group.name);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: getListGroupMembersQueryKey(group.id),
    queryFn: () => listGroupMembers(group.id),
    enabled: expanded,
  });

  const { data: presence, refetch: refetchPresence } = useQuery({
    queryKey: getGetGroupPresenceQueryKey(group.id),
    queryFn: () => getGroupPresence(group.id),
    enabled: expanded && tab === "members",
    refetchInterval: 10_000,
  });

  const { data: joinRequests } = useQuery({
    queryKey: getListGroupJoinRequestsQueryKey(group.id),
    queryFn: () => listGroupJoinRequests(group.id),
    enabled: expanded && tab === "members" && canManage,
    refetchInterval: 15_000,
  });

  // Fetch contacts for share-link and add-member pickers
  const { data: shareContacts } = useQuery({
    queryKey: getListContactsQueryKey(),
    queryFn: listContacts,
    enabled: shareLinkOpen || addMemberOpen,
    staleTime: 60_000,
  });

  const pendingRequests = joinRequests?.filter((r: GroupJoinRequest) => r.status === "pending") ?? [];

  const myMembership = members?.find(m => m.invitedClerkId === user?.id);
  const callerCanPost = isOwner || isAdmin || (myMembership?.canPost ?? true);
  const callerCanEditGroup = isOwner || (myMembership?.canEditGroupInfo ?? false);

  const addMemberMutation = useAddGroupMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupMembersQueryKey(group.id) });
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({ title: "Member added" });
        setAddMemberOpen(false);
        setMemberForm({ name: "", email: "", phone: "" });
      },
      onError: () => toast({ title: "Failed to add member", variant: "destructive" }),
    },
  });

  const deleteMemberMutation = useDeleteGroupMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupMembersQueryKey(group.id) });
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({ title: "Member removed" });
        setMemberToDelete(null);
      },
      onError: (err: any) => {
        toast({ title: err?.response?.data?.error ?? "Failed to remove member", variant: "destructive" });
        setMemberToDelete(null);
      },
    },
  });

  const leaveMutation = useLeaveGroup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({ title: `Left "${group.name}"` });
        setLeaveConfirmOpen(false);
      },
      onError: () => toast({ title: "Failed to leave group", variant: "destructive" }),
    },
  });

  const setRoleMutation = useSetGroupMemberRole({
    mutation: {
      onSuccess: (updated) => {
        queryClient.invalidateQueries({ queryKey: getListGroupMembersQueryKey(group.id) });
        toast({ title: `${updated.name} is now ${updated.memberRole === "admin" ? "Admin" : "Member"}` });
        setRoleTarget(null);
      },
      onError: () => toast({ title: "Failed to update role", variant: "destructive" }),
    },
  });

  const patchGroupMutation = usePatchGroup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({ title: "Group updated" });
        setEditOpen(false);
      },
      onError: () => toast({ title: "Failed to update group", variant: "destructive" }),
    },
  });

  const muteMutation = useMuteGroup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({ title: `"${group.name}" notifications muted` });
      },
      onError: () => toast({ title: "Failed to mute", variant: "destructive" }),
    },
  });

  const unmuteMutation = useUnmuteGroup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({ title: `"${group.name}" notifications unmuted` });
      },
      onError: () => toast({ title: "Failed to unmute", variant: "destructive" }),
    },
  });

  const createMeetingMutation = useCreateMeeting({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
        toast({ title: "Meeting started!" });
        setStartMeetingOpen(false);
        if (data.status === "active") setLocation(`/room/${data.meetingCode}`);
        else setLocation(`/meetings/${data.id}`);
      },
      onError: () => toast({ title: "Failed to start meeting", variant: "destructive" }),
    },
  });

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberForm.name.trim() || !memberForm.email.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    addMemberMutation.mutate({ groupId: group.id, data: { name: memberForm.name.trim(), email: memberForm.email.trim(), phone: memberForm.phone.trim() || undefined } });
  };

  const handleShareLink = async () => {
    setLoadingShareLink(true);
    try {
      const result = await getGroupInviteToken(group.id);
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const link = `${window.location.origin}${basePath}/join-group/${result.token}`;
      setShareLink(link);
      setShareLinkOpen(true);
    } catch { toast({ title: "Failed to generate invite link", variant: "destructive" }); }
    finally { setLoadingShareLink(false); }
  };

  const handleRegenerateLink = async () => {
    try {
      const result = await regenerateGroupInviteToken(group.id);
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const link = `${window.location.origin}${basePath}/join-group/${result.token}`;
      setShareLink(link);
      toast({ title: "Invite link regenerated" });
    } catch { toast({ title: "Failed to regenerate link", variant: "destructive" }); }
  };

  const handleStartMeeting = () => {
    createMeetingMutation.mutate({
      data: {
        title: meetingTitle.trim() || group.name,
        type: "instant",
        ...(({ groupId: group.id }) as any),
      },
    });
  };

  const openInviteEmail = (member: GroupMember) => { setInviteTarget({ member, channel: "email" }); setInviteLink(""); setInviteOpen(true); };
  const openInvitePhone = (member: GroupMember) => { setInviteTarget({ member, channel: "phone" }); setInviteLink(""); setInviteOpen(true); };

  const [sendingSms, setSendingSms] = useState(false);

  const sendInvite = async () => {
    if (!inviteTarget || !inviteLink.trim()) return;
    const { member, channel } = inviteTarget;
    const msg = `Hi ${member.name}! You're invited to join a TanCom meeting. Join here: ${inviteLink.trim()}`;
    if (channel === "email") {
      const a = document.createElement("a");
      a.href = `mailto:${member.email}?subject=${encodeURIComponent("You're invited to a TanCom meeting")}&body=${encodeURIComponent(msg)}`;
      a.style.display = "none"; document.body.appendChild(a); a.click();
      setTimeout(() => document.body.removeChild(a), 100);
      setInviteOpen(false); toast({ title: "Email client opened" }); return;
    }
    if (!member.phone) return;
    setSendingSms(true);
    try {
      const res = await fetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: member.phone, body: msg }) });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "SMS failed");
      setInviteOpen(false); toast({ title: `SMS sent to ${member.name}!` });
    } catch (err) {
      toast({ title: "SMS failed", description: err instanceof Error ? err.message : "Could not send SMS", variant: "destructive" });
    } finally { setSendingSms(false); }
  };

  const copyInviteMessage = () => {
    if (!inviteTarget || !inviteLink.trim()) return;
    const msg = `Hi ${inviteTarget.member.name}! You're invited to join a TanCom meeting. Join here: ${inviteLink.trim()}`;
    navigator.clipboard.writeText(msg).then(() => toast({ title: "Message copied to clipboard" }));
  };

  const presenceMap = new Map<number, GroupMemberPresence>(
    presence?.map((p: GroupMemberPresence) => [p.memberId, p] as [number, GroupMemberPresence]) ?? [],
  );
  const availableCount = presence?.filter((p: GroupMemberPresence) => p.status === "available").length ?? 0;
  const iconBg = isOwner ? "bg-blue-600" : isAdmin ? "bg-indigo-500" : "bg-purple-500";
  const isMuted = group.isMuted ?? false;

  return (
    <Card className={`overflow-hidden ${isMuted ? "opacity-80" : ""}`}>
      <CardContent className="p-0">
        {/* Group header */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${iconBg}`}>
            <Users className="h-5 w-5" />
            {isMuted && (
              <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-500 border border-white">
                <BellOff className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900">{group.name}</p>
              {isOwner && (
                <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700 bg-yellow-50 shrink-0 gap-1">
                  <Crown className="h-2.5 w-2.5" />Owner
                </Badge>
              )}
              {!isOwner && isAdmin && (
                <Badge variant="outline" className="text-xs border-indigo-200 text-indigo-700 bg-indigo-50 shrink-0 gap-1">
                  <Shield className="h-2.5 w-2.5" />Admin
                </Badge>
              )}
              {!isOwner && !isAdmin && (
                <Badge variant="outline" className="text-xs border-purple-200 text-purple-700 bg-purple-50 shrink-0">Member</Badge>
              )}
              {group.requireApproval && (
                <Badge variant="outline" className="text-xs border-amber-200 text-amber-700 bg-amber-50 shrink-0 gap-1">
                  <Clock className="h-2.5 w-2.5" />Approval required
                </Badge>
              )}
              {pendingRequests.length > 0 && (
                <Badge className="text-xs bg-amber-500 text-white h-4 px-1.5 shrink-0">{pendingRequests.length}</Badge>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
              {expanded && tab === "members" && presence && (
                <span className="ml-2 text-green-600 font-medium">· {availableCount} available</span>
              )}
              {group.description && <span className="ml-2 text-gray-400 truncate">· {group.description}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {/* Start Meeting */}
            <button
              title="Start a meeting for this group"
              onClick={() => { setMeetingTitle(group.name); setStartMeetingOpen(true); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Video className="h-3.5 w-3.5" />
            </button>
            {/* Mute/unmute */}
            <button
              title={isMuted ? "Unmute notifications" : "Mute notifications"}
              onClick={() => isMuted ? unmuteMutation.mutate({ groupId: group.id }) : muteMutation.mutate({ groupId: group.id })}
              className={`p-1.5 rounded-lg transition-colors ${isMuted ? "text-gray-400 hover:text-gray-600" : "text-gray-400 hover:text-amber-600 hover:bg-amber-50"}`}
            >
              {isMuted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            </button>
            {callerCanEditGroup && (
              <button title="Edit group" onClick={() => { setEditForm({ name: group.name, description: group.description ?? "", requireApproval: group.requireApproval ?? false }); setEditOpen(true); }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canManage && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-gray-600"
                onClick={() => { setExpanded(true); setTab("members"); setAddMemberOpen(true); }}>
                <UserPlus className="h-3.5 w-3.5" />Add
              </Button>
            )}
            {canManage && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                onClick={handleShareLink} disabled={loadingShareLink} title="Get shareable invite link">
                <Link2 className="h-3.5 w-3.5" />Link
              </Button>
            )}
            {isOwner && (
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 h-8 w-8 p-0"
                onClick={() => onDelete(group.id)} title="Delete group">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isOwner && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => setLeaveConfirmOpen(true)} title="Leave group">
                <LogOut className="h-3.5 w-3.5" />Leave
              </Button>
            )}
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-gray-100">
            {/* Tab switcher */}
            <div className="flex border-b border-gray-100 bg-gray-50/80">
              <button
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${tab === "members" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                onClick={() => setTab("members")}
              >
                <Users className="h-3.5 w-3.5" />Members
                {pendingRequests.length > 0 && <Badge className="text-xs bg-amber-500 text-white h-4 px-1.5 ml-1">{pendingRequests.length}</Badge>}
              </button>
              <button
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${tab === "feed" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                onClick={() => setTab("feed")}
              >
                <MessageSquare className="h-3.5 w-3.5" />Feed
              </button>
            </div>

            {/* Members tab */}
            {tab === "members" && (
              <>
                {/* Pending join requests (owner/admin only) */}
                {canManage && pendingRequests.length > 0 && (
                  <div className="border-b border-gray-100">
                    <button
                      className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100/60 transition-colors"
                      onClick={() => setShowRequests(v => !v)}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {pendingRequests.length} pending {pendingRequests.length === 1 ? "request" : "requests"}
                      {showRequests ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                    </button>
                    {showRequests && (
                      <div className="p-2 space-y-1.5">
                        {pendingRequests.map((r: GroupJoinRequest) => (
                          <JoinRequestRow key={r.id} request={r} groupId={group.id} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs text-gray-500 font-medium">Members &amp; Availability</span>
                  <button onClick={() => refetchPresence()} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                    <RefreshCw className="h-3 w-3" />Refresh
                  </button>
                </div>
                {membersLoading ? (
                  <div className="p-3 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
                ) : members && members.length > 0 ? (
                  <div className="p-2 space-y-1.5">
                    {members.map((m: GroupMember) => (
                      <MemberRow
                        key={m.id}
                        member={m}
                        presence={presenceMap.get(m.id)}
                        groupId={group.id}
                        groupOwnerClerkId={group.ownerClerkId}
                        callerRole={callerRole}
                        onDelete={id => setMemberToDelete(id)}
                        onInviteEmail={openInviteEmail}
                        onInvitePhone={openInvitePhone}
                        onToggleAdmin={m => setRoleTarget(m)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-gray-500">No members yet</p>
                    {canManage && (
                      <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setAddMemberOpen(true)}>
                        <UserPlus className="h-3.5 w-3.5" />Add first member
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Feed tab */}
            {tab === "feed" && (
              <GroupFeed
                group={group}
                callerRole={callerRole}
                canPost={callerCanPost}
                allGroups={allGroups}
                members={members ?? []}
              />
            )}
          </div>
        )}
      </CardContent>

      {/* ── Dialogs ── */}

      {/* Add member */}
      {canManage && (
        <Dialog open={addMemberOpen} onOpenChange={(o) => { setAddMemberOpen(o); if (!o) { setAddMemberContactSearch(""); setMemberForm({ name: "", email: "", phone: "" }); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Member to "{group.name}"</DialogTitle></DialogHeader>
            <form onSubmit={handleAddMember} className="space-y-4">

              {/* Contact picker */}
              {shareContacts && shareContacts.length > 0 && (
                <div className="space-y-2">
                  <Label>Pick from contacts</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300"
                      placeholder="Search your contacts…"
                      value={addMemberContactSearch}
                      onChange={e => setAddMemberContactSearch(e.target.value)}
                    />
                  </div>
                  <div className="overflow-y-auto max-h-44 space-y-0.5 rounded-xl border border-gray-100 bg-gray-50 p-1">
                    {shareContacts
                      .filter(c =>
                        (c.email || c.name) &&
                        (c.name.toLowerCase().includes(addMemberContactSearch.toLowerCase()) ||
                         (c.email ?? "").toLowerCase().includes(addMemberContactSearch.toLowerCase()))
                      )
                      .slice(0, 30)
                      .map(c => {
                        const alreadyMember = members?.some(m => m.email === c.email);
                        const selected = memberForm.email === c.email;
                        const color = avatarColor(c.contactClerkId ?? c.email ?? c.name);
                        const inits = initials(c.name);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={alreadyMember || !c.email}
                            onClick={() => setMemberForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "" })}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors
                              ${selected ? "bg-blue-100 ring-1 ring-blue-300"
                                : alreadyMember ? "opacity-40 cursor-not-allowed"
                                : !c.email ? "opacity-40 cursor-not-allowed"
                                : "hover:bg-white"}`}
                          >
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${color}`}>
                              {inits}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                              <p className="text-xs text-gray-400 truncate">{c.email ?? "No email"}</p>
                            </div>
                            {selected && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                            {alreadyMember && <span className="text-xs text-gray-400 shrink-0">Already in group</span>}
                            {!c.contactClerkId && c.email && !alreadyMember && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">Invite</span>}
                          </button>
                        );
                      })}
                    {shareContacts.filter(c => c.email).length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">No contacts with an email address</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">Select a contact above to auto-fill, or type details below for someone not in your contacts.</p>
                </div>
              )}

              {/* Manual fields */}
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input placeholder="Full name" value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" placeholder="email@example.com" value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} />
                <p className="text-xs text-gray-500">If this email belongs to a TanCom account, they'll receive an invitation.</p>
              </div>
              <div className="space-y-2">
                <Label>Phone (optional)</Label>
                <Input type="tel" placeholder="+1 (555) 000-0000" value={memberForm.phone} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={addMemberMutation.isPending}>{addMemberMutation.isPending ? "Adding…" : "Add Member"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit group */}
      {callerCanEditGroup && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" />Edit "{group.name}"</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Group name</Label>
                <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Group name" />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this group about?" rows={2} className="resize-none" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Require approval to join</p>
                  <p className="text-xs text-gray-500 mt-0.5">New members joining via invite link must be approved first</p>
                </div>
                <Switch checked={editForm.requireApproval} onCheckedChange={v => setEditForm(f => ({ ...f, requireApproval: v }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button
                disabled={patchGroupMutation.isPending || !editForm.name.trim()}
                onClick={() => patchGroupMutation.mutate({ groupId: group.id, data: { name: editForm.name.trim(), description: editForm.description.trim() || undefined, requireApproval: editForm.requireApproval } })}
              >
                {patchGroupMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Start meeting */}
      <Dialog open={startMeetingOpen} onOpenChange={setStartMeetingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Video className="h-4 w-4 text-blue-600" />Start a meeting for "{group.name}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Meeting topic</Label>
              <Input value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} placeholder={group.name} />
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
              All accepted group members will be invited automatically.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartMeetingOpen(false)}>Cancel</Button>
            <Button onClick={handleStartMeeting} disabled={createMeetingMutation.isPending} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Video className="h-4 w-4" />
              {createMeetingMutation.isPending ? "Starting…" : "Start Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite to meeting */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Video className="h-5 w-5 text-blue-600" />Invite {inviteTarget?.member.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Paste your meeting invite link, then send it via {inviteTarget?.channel === "email" ? "email" : "SMS"}.</p>
            <div className="space-y-2">
              <Label>Meeting invite link</Label>
              <div className="flex gap-2">
                <Input placeholder="https://…" value={inviteLink} onChange={e => setInviteLink(e.target.value)} />
                <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(inviteLink); toast({ title: "Copied" }); }} disabled={!inviteLink.trim()}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
              <p className="font-medium text-gray-700">Preview:</p>
              <p>Hi {inviteTarget?.member.name}! You're invited to join a TanCom meeting. Join here: {inviteLink.trim() || "[invite link]"}</p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={copyInviteMessage} disabled={!inviteLink.trim()} className="gap-2"><Copy className="h-4 w-4" />Copy message</Button>
            <Button onClick={sendInvite} disabled={!inviteLink.trim() || sendingSms} className="gap-2">
              {sendingSms ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
                : inviteTarget?.channel === "email" ? <><Mail className="h-4 w-4" />Open Email</>
                  : <><Phone className="h-4 w-4" />Send SMS</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share invite link */}
      <Dialog open={shareLinkOpen} onOpenChange={(o) => { setShareLinkOpen(o); if (!o) setShareContactSearch(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-blue-600" />Invite link for "{group.name}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Share this link with anyone.
              {group.requireApproval ? " They'll submit a join request that you can approve." : " They'll join automatically after signing in."}
            </p>
            <div className="flex gap-2">
              <Input value={shareLink} readOnly className="text-xs font-mono bg-gray-50" onClick={e => (e.target as HTMLInputElement).select()} />
              <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(shareLink); toast({ title: "Link copied!" }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {canManage && (
              <Button variant="outline" size="sm" className="gap-1.5 w-full text-amber-700 border-amber-200 hover:bg-amber-50"
                onClick={handleRegenerateLink}>
                <RefreshCw className="h-3.5 w-3.5" />Regenerate link (revokes old link)
              </Button>
            )}

            {/* Send to a contact */}
            {shareContacts && shareContacts.length > 0 && (
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Send to a contact</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300"
                    placeholder="Search contacts…"
                    value={shareContactSearch}
                    onChange={e => setShareContactSearch(e.target.value)}
                  />
                </div>
                <div className="overflow-y-auto max-h-48 space-y-1">
                  {shareContacts
                    .filter(c =>
                      (c.name.toLowerCase().includes(shareContactSearch.toLowerCase()) || (c.email ?? "").toLowerCase().includes(shareContactSearch.toLowerCase())) &&
                      (c.email || c.phone)
                    )
                    .slice(0, 20)
                    .map(c => {
                      const color = avatarColor(c.contactClerkId ?? c.email ?? c.name);
                      const inits = initials(c.name);
                      const inviteMsg = `Hi ${c.name}! You've been invited to join the "${group.name}" group on TanCom. Click here to join: ${shareLink}`;
                      return (
                        <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${color}`}>
                            {inits}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                            <p className="text-xs text-gray-400 truncate">{c.email ?? c.phone}</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            {c.email && (
                              <a
                                href={`mailto:${c.email}?subject=${encodeURIComponent(`Join "${group.name}" on TanCom`)}&body=${encodeURIComponent(inviteMsg)}`}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                onClick={() => toast({ title: `Email client opened for ${c.name}` })}
                              >
                                <Mail className="h-3 w-3" />Email
                              </a>
                            )}
                            {c.phone && (
                              <a
                                href={`sms:${c.phone}?&body=${encodeURIComponent(inviteMsg)}`}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                                onClick={() => toast({ title: `SMS opened for ${c.name}` })}
                              >
                                <Phone className="h-3 w-3" />SMS
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {shareContacts.filter(c => c.email || c.phone).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No contacts with email or phone to send to</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareLinkOpen(false)}>Close</Button>
            <Button onClick={() => { navigator.clipboard.writeText(shareLink); toast({ title: "Link copied!" }); }} className="gap-2">
              <Copy className="h-4 w-4" />Copy Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle admin */}
      <AlertDialog open={roleTarget !== null} onOpenChange={() => setRoleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{roleTarget?.memberRole === "admin" ? `Remove admin from ${roleTarget?.name}?` : `Make ${roleTarget?.name} an admin?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {roleTarget?.memberRole === "admin"
                ? "They will lose the ability to add or remove members."
                : "Admins can add and remove members, but cannot delete the group or remove the owner."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={roleTarget?.memberRole === "admin" ? "bg-gray-600 hover:bg-gray-700" : "bg-blue-600 hover:bg-blue-700"}
              onClick={() => roleTarget && setRoleMutation.mutate({ groupId: group.id, memberId: roleTarget.id, data: { role: roleTarget.memberRole === "admin" ? "member" : "admin" } })}>
              {roleTarget?.memberRole === "admin" ? "Remove Admin" : "Make Admin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave group */}
      <AlertDialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave "{group.name}"?</AlertDialogTitle>
            <AlertDialogDescription>You will be removed from this group. The group owner can invite you again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => leaveMutation.mutate({ groupId: group.id })}>Leave Group</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove member */}
      <AlertDialog open={memberToDelete !== null} onOpenChange={() => setMemberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>They will be removed from this group but not from your contacts.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => memberToDelete !== null && deleteMemberMutation.mutate({ groupId: group.id, memberId: memberToDelete })}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function GroupsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<number | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [createContactSearch, setCreateContactSearch] = useState("");
  const [createSelectedContacts, setCreateSelectedContacts] = useState<Contact[]>([]);
  const [creating, setCreating] = useState(false);
  const [joinLinkOpen, setJoinLinkOpen] = useState(false);
  const [joinLinkInput, setJoinLinkInput] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: groups, isLoading } = useQuery({
    queryKey: getListGroupsQueryKey(),
    queryFn: listGroups,
  });

  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: getListGroupInvitationsQueryKey(),
    queryFn: listGroupInvitations,
  });

  const { data: contacts } = useQuery({
    queryKey: getListContactsQueryKey(),
    queryFn: listContacts,
    enabled: createOpen || joinLinkOpen,
    staleTime: 60_000,
  });

  const pendingInvitations = invitations?.filter(i => i.status === "pending") ?? [];

  const createMutation = useCreateGroup();
  const addMemberForCreate = useAddGroupMember();

  const deleteMutation = useDeleteGroup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({ title: "Group deleted" });
        setGroupToDelete(null);
      },
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) { toast({ title: "Group name is required", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const newGroup = await createMutation.mutateAsync({
        data: {
          name: groupName.trim(),
          description: groupDescription.trim() || undefined,
          requireApproval: requireApproval || undefined,
        },
      });
      if (createSelectedContacts.length > 0) {
        const results = await Promise.allSettled(
          createSelectedContacts.map(c => addMemberForCreate.mutateAsync({ groupId: newGroup.id, data: { name: c.name, email: c.email } })),
        );
        const added = results.filter(r => r.status === "fulfilled").length;
        toast({ title: `Group created · ${added} member${added !== 1 ? "s" : ""} added` });
      } else {
        toast({ title: "Group created" });
      }
      queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
      setCreateOpen(false);
      setGroupName("");
      setGroupDescription("");
      setRequireApproval(false);
      setCreateSelectedContacts([]);
      setCreateContactSearch("");
    } catch {
      toast({ title: "Failed to create group", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const toggleCreateContact = (c: Contact) => {
    setCreateSelectedContacts(prev =>
      prev.some(s => s.id === c.id) ? prev.filter(s => s.id !== c.id) : [...prev, c],
    );
  };

  const handleJoinViaLink = () => {
    const input = joinLinkInput.trim();
    if (!input) return;
    // Accept a full URL (…/join-group/TOKEN) or a bare token
    const tokenMatch = input.match(/join-group\/([^/?#\s]+)/);
    const token = tokenMatch ? tokenMatch[1] : input;
    setJoinLinkOpen(false);
    setJoinLinkInput("");
    setLocation(`/join-group/${token}`);
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
            <p className="text-gray-500 mt-1">Organize contacts into groups, share posts, and invite them to meetings</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setJoinLinkOpen(true)}>
              <Link2 className="h-4 w-4" />Join Group
            </Button>
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />New Group
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-blue-600" />Owner — full control</div>
          <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-indigo-500" />Admin — can add &amp; remove members</div>
          <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-purple-500" />Member — can view &amp; post</div>
        </div>

        {!invitationsLoading && pendingInvitations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900">Pending Invitations</h2>
              <Badge className="bg-blue-600 text-white text-xs h-5 px-1.5">{pendingInvitations.length}</Badge>
            </div>
            <div className="space-y-2">
              {pendingInvitations.map(inv => <InvitationCard key={inv.memberId} invitation={inv} />)}
            </div>
          </div>
        )}

        <div className="flex items-center gap-6 text-xs text-gray-500">
          <div className="flex items-center gap-1.5"><Circle className="h-2.5 w-2.5 fill-green-400 text-green-400" />Available</div>
          <div className="flex items-center gap-1.5"><Circle className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />In a meeting</div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : groups && groups.length > 0 ? (
          <div className="space-y-3">
            {groups.map((g: Group) => (
              <GroupCard key={g.id} group={g} onDelete={setGroupToDelete} allGroups={groups} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 mx-auto mb-4">
              <Users className="h-8 w-8 text-blue-500" />
            </div>
            <h3 className="text-gray-900 font-semibold mb-2">No groups yet</h3>
            <p className="text-gray-500 text-sm mb-4">Create a group to quickly see who's available and share posts with your team</p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />Create your first group
            </Button>
          </div>
        )}
      </div>

      {/* Create group dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) { setGroupName(""); setGroupDescription(""); setRequireApproval(false); setCreateSelectedContacts([]); setCreateContactSearch(""); }
      }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="px-5 pb-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="group-name">Group name *</Label>
                <Input id="group-name" placeholder="e.g. Engineering Team, Family, Project X"
                  value={groupName} onChange={e => setGroupName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-desc">Description (optional)</Label>
                <Textarea id="group-desc" placeholder="What is this group about?" rows={2}
                  value={groupDescription} onChange={e => setGroupDescription(e.target.value)} className="resize-none text-sm" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Require approval to join</p>
                  <p className="text-xs text-gray-500 mt-0.5">Members joining via link need your approval</p>
                </div>
                <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
              </div>
            </div>

            {/* Contact picker */}
            <div className="border-t border-gray-100">
              <div className="px-5 py-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Add members from contacts <span className="normal-case font-normal text-gray-400">(optional)</span>
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none placeholder:text-gray-400 focus:border-blue-300"
                    placeholder="Search contacts…" value={createContactSearch} onChange={e => setCreateContactSearch(e.target.value)} />
                </div>
              </div>

              {createSelectedContacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-5 pb-2">
                  {createSelectedContacts.map(c => (
                    <span key={c.id} className="flex items-center gap-1 pl-2.5 pr-1 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {c.name}
                      <button type="button" onClick={() => toggleCreateContact(c)} className="p-0.5 hover:bg-blue-200 rounded-full">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="overflow-y-auto max-h-48 px-2 pb-2">
                {!contacts || contacts.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">No contacts yet — add some from the Contacts page</p>
                ) : (
                  contacts
                    .filter(c => c.name.toLowerCase().includes(createContactSearch.toLowerCase()) || (c.email ?? "").toLowerCase().includes(createContactSearch.toLowerCase()))
                    .map(c => {
                      const isSelected = createSelectedContacts.some(s => s.id === c.id);
                      const hasEmail = !!c.email;
                      const onTanCom = !!c.contactClerkId;
                      const color = avatarColor(c.contactClerkId ?? c.email ?? c.name);
                      const inits = initials(c.name);
                      return (
                        <button key={c.id} type="button" onClick={() => hasEmail && toggleCreateContact(c)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isSelected ? "bg-blue-50" : hasEmail ? "hover:bg-gray-50" : "opacity-40 cursor-not-allowed"}`}>
                          <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${color}`}>
                            {inits}
                            {isSelected && <div className="absolute inset-0 flex items-center justify-center rounded-full bg-blue-600/90"><Check className="h-4 w-4 text-white" /></div>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                            <p className="text-xs text-gray-400 truncate">{c.email ?? "No email on file"}</p>
                          </div>
                          {onTanCom && <span className="text-xs text-green-600 shrink-0 bg-green-50 px-1.5 py-0.5 rounded-full font-medium">On TanCom</span>}
                          {!onTanCom && hasEmail && <span className="text-xs text-amber-600 shrink-0 bg-amber-50 px-1.5 py-0.5 rounded-full">Invite</span>}
                          {!hasEmail && <span className="text-xs text-gray-400 shrink-0">No email</span>}
                        </button>
                      );
                    })
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating || !groupName.trim()} className="gap-1.5">
                <Users className="h-4 w-4" />
                {creating ? "Creating…"
                  : createSelectedContacts.length > 0
                    ? `Create with ${createSelectedContacts.length} member${createSelectedContacts.length !== 1 ? "s" : ""}`
                    : "Create Group"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join Group via invite link */}
      <Dialog open={joinLinkOpen} onOpenChange={(o) => { setJoinLinkOpen(o); if (!o) setJoinLinkInput(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-blue-600" />Join a Group
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-gray-600">
              Paste an invite link or code shared with you. If the group requires approval, your request will be sent to the owner.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="join-link-input">Invite link or code</Label>
              <Input
                id="join-link-input"
                value={joinLinkInput}
                onChange={e => setJoinLinkInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleJoinViaLink()}
                placeholder="https://… or paste the invite code"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setJoinLinkOpen(false); setJoinLinkInput(""); }}>Cancel</Button>
            <Button onClick={handleJoinViaLink} disabled={!joinLinkInput.trim()} className="gap-1.5">
              <ArrowUpRight className="h-4 w-4" />Join Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete group */}
      <AlertDialog open={groupToDelete !== null} onOpenChange={() => setGroupToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the group and all its members. Your contacts are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => groupToDelete !== null && deleteMutation.mutate({ groupId: groupToDelete })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
