// hint: Structural and logic conflict. Both design and behavior differ.
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users, Plus, Trash2, Mail, Phone, PhoneCall, Video, Search, UserPlus,
  Upload, CheckCircle2, AlertCircle, MessageSquare, Copy, Sparkles,
  FileUp, X, Loader2, UserCheck, UserX, Star, Pin, Ban, BellOff,
  QrCode, MoreVertical, Pencil, User as UserIcon, Tag, AtSign,
  History, PhoneOff, PhoneMissed, Clock,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QRCodeSVG } from "qrcode.react";
import {
  listContacts, getListContactsQueryKey, useCreateContact, useDeleteContact,
  useUpdateContact, useGetContactProfile,
} from "@workspace/api-client-react";
import type { Contact, UpdateContactBody } from "@workspace/api-client-react";

// ── Categories ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "family", label: "Family", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  { value: "friend", label: "Friend", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "work", label: "Work", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "client", label: "Client", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "vendor", label: "Vendor", cls: "bg-orange-50 text-orange-700 border-orange-200" },
] as const;
const categoryMeta = (v?: string | null) => CATEGORIES.find((c) => c.value === v);
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import CallModal from "@/components/CallModal";
import PhoneCallModal from "@/components/PhoneCallModal";
import { useUser } from "@clerk/react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ActiveCall {
  callRoomName: string;
  token: string;
  livekitUrl: string;
  callType: "audio" | "video";
}

interface CallLogEntry {
  id: number;
  ownerClerkId: string;
  contactId: number | null;
  phoneNumber: string;
  callSid: string;
  durationSeconds: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}
interface ImportRow {
  name: string;
  email?: string;
  phone?: string;
}
interface ImportResult {
  imported: number;
  skipped: number;
  onTanCom: number;
}

// ── CSV / XLSX Parser ──────────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += c; }
  }
  result.push(current.trim());
  return result;
}

function rowsFromTable(headers: string[], dataRows: string[][]): ImportRow[] {
  const h = (aliases: string[]) => headers.findIndex((hd) => aliases.includes(hd));
  const nameIdx  = h(["name", "full name", "fullname", "display name"]);
  const firstIdx = h(["first name", "firstname", "first", "given name"]);
  const lastIdx  = h(["last name", "lastname", "last", "surname", "family name"]);
  const emailIdx = h(["email", "email address", "e-mail", "email_address"]);
  const phoneIdx = h(["phone", "phone number", "mobile", "cell", "telephone"]);

  const results: ImportRow[] = [];
  for (const cols of dataRows) {
    const rawName  = nameIdx  >= 0 ? cols[nameIdx]?.replace(/['"]/g, "").trim()  : "";
    const rawFirst = firstIdx >= 0 ? cols[firstIdx]?.replace(/['"]/g, "").trim() : "";
    const rawLast  = lastIdx  >= 0 ? cols[lastIdx]?.replace(/['"]/g, "").trim()  : "";
    const rawEmail = emailIdx >= 0 ? cols[emailIdx]?.replace(/['"]/g, "").trim() : "";
    const rawPhone = phoneIdx >= 0 ? cols[phoneIdx]?.replace(/['"]/g, "").trim() : "";

    let name = rawName || `${rawFirst} ${rawLast}`.trim();
    const email = rawEmail && rawEmail.includes("@") ? rawEmail : undefined;
    const phone = rawPhone || undefined;

    if (!name) {
      if (email) name = email.split("@")[0];
      else continue; // nothing useful
    }
    results.push({ name, email, phone });
  }
  return results;
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, "").trim());
  const dataRows = lines.slice(1).map((l) => parseCSVLine(l));
  return rowsFromTable(headers, dataRows);
}

async function parseXLSX(file: File): Promise<ImportRow[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];
  if (raw.length < 2) return [];
  const toStrArr = (row: unknown[]): string[] => row.map((v) => (v == null ? "" : String(v)));
  const headers = toStrArr(raw[0]).map((h) => h.toLowerCase().trim());
  return rowsFromTable(headers, raw.slice(1).map(toStrArr));
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

const AVATAR_COLORS = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500", "bg-pink-500", "bg-teal-500", "bg-indigo-500"];

// ── ContactCard ────────────────────────────────────────────────────────────────
function ContactCard({
  contact,
  onDelete,
  onCall,
  onMessage,
  onInvite,
  onToggle,
  onEdit,
  onProfile,
  onQr,
  onPhoneCall,
}: {
  contact: Contact;
  onDelete: (id: number) => void;
  onCall: (contact: Contact, callType: "audio" | "video") => void;
  onMessage: (contact: Contact) => void;
  onInvite: (contact: Contact) => void;
  onToggle: (contact: Contact, field: "isFavorite" | "isPinned" | "isBlocked" | "isMuted") => void;
  onEdit: (contact: Contact) => void;
  onProfile: (contact: Contact) => void;
  onQr: (contact: Contact) => void;
  onPhoneCall: (contact: Contact) => void;
}) {
  const initials = contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const color = AVATAR_COLORS[contact.id % AVATAR_COLORS.length];
  const isRegistered = !!contact.contactClerkId;
  const blocked = !!contact.isBlocked;

  return (
    <Card className={`transition-shadow hover:shadow-md ${blocked ? "opacity-60" : ""} ${isRegistered && !blocked ? "border-l-4 border-l-green-400" : ""} ${contact.isPinned ? "ring-1 ring-blue-200 bg-blue-50/30" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative shrink-0 cursor-pointer" onClick={() => onProfile(contact)}>
            <div className={`flex h-11 w-11 items-center justify-center rounded-full ${color} text-white font-bold text-sm`}>
              {initials}
            </div>
            {isRegistered && !blocked && (
              <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                <CheckCircle2 className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onProfile(contact)}>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-gray-900">{contact.name}</p>
              {contact.isPinned && <Pin className="h-3.5 w-3.5 text-blue-500 fill-blue-500" />}
              {contact.isFavorite && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />}
              {contact.isMuted && <BellOff className="h-3.5 w-3.5 text-gray-400" />}
              {blocked ? (
                <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-xs px-1.5 py-0 gap-1">
                  <Ban className="h-2.5 w-2.5" /> Blocked
                </Badge>
              ) : isRegistered ? (
                <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50 text-xs px-1.5 py-0 gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5" /> On TanCom
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs px-1.5 py-0">
                  Not registered
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-1.5 truncate mt-0.5">
              <Mail className="h-3 w-3 shrink-0" /> {contact.email}
            </p>
            {contact.phone && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                <Phone className="h-3 w-3 shrink-0" /> {contact.phone}
              </p>
            )}
            {(categoryMeta(contact.category) || (contact.labels?.length ?? 0) > 0) && (
              <div className="flex items-center gap-1 flex-wrap mt-1">
                {categoryMeta(contact.category) && (
                  <Badge variant="outline" className={`text-xs px-1.5 py-0 ${categoryMeta(contact.category)!.cls}`}>
                    {categoryMeta(contact.category)!.label}
                  </Badge>
                )}
                {(contact.labels ?? []).map((l) => (
                  <Badge key={l} variant="outline" className="text-xs px-1.5 py-0 text-gray-600 bg-gray-50 border-gray-200 gap-0.5">
                    <Tag className="h-2.5 w-2.5" /> {l}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-0.5">Added {format(new Date(contact.createdAt), "MMM d, yyyy")}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {!blocked && (isRegistered ? (
              <>
                <Button size="sm" variant="ghost"
                  className="text-blue-600 hover:bg-blue-50 h-8 w-8 p-0" title="Send message"
                  onClick={() => onMessage(contact)}>
                  <MessageSquare className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost"
                  className="text-green-600 hover:bg-green-50 h-8 w-8 p-0" title="Voice call"
                  onClick={() => onCall(contact, "audio")}>
                  <PhoneCall className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost"
                  className="text-purple-600 hover:bg-purple-50 h-8 w-8 p-0" title="Video call"
                  onClick={() => onCall(contact, "video")}>
                  <Video className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost"
                  className="text-amber-600 hover:bg-amber-50 h-8 w-8 p-0" title="Invite to TanCom"
                  onClick={() => onInvite(contact)}>
                  <Mail className="h-4 w-4" />
                </Button>
                {contact.phone && (
                  <Button size="sm" variant="ghost"
                    className="text-green-600 hover:bg-green-50 h-8 w-8 p-0" title="Call phone via TanCom"
                    onClick={() => onPhoneCall(contact)}>
                    <Phone className="h-4 w-4" />
                  </Button>
                )}
              </>
            ))}
            <Button size="sm" variant="ghost"
              className={`h-8 w-8 p-0 ${contact.isFavorite ? "text-amber-400" : "text-gray-300 hover:text-amber-400"}`}
              title={contact.isFavorite ? "Remove from favorites" : "Add to favorites"}
              onClick={() => onToggle(contact, "isFavorite")}>
              <Star className={`h-4 w-4 ${contact.isFavorite ? "fill-amber-400" : ""}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="text-gray-500 h-8 w-8 p-0" title="More options">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onProfile(contact)}>
                  <UserIcon className="h-4 w-4 mr-2" /> View Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(contact)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit Contact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onQr(contact)}>
                  <QrCode className="h-4 w-4 mr-2" /> Share via QR
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onToggle(contact, "isPinned")}>
                  <Pin className="h-4 w-4 mr-2" /> {contact.isPinned ? "Unpin" : "Pin to top"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggle(contact, "isMuted")}>
                  <BellOff className="h-4 w-4 mr-2" /> {contact.isMuted ? "Unmute" : "Mute"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggle(contact, "isBlocked")}
                  className={blocked ? "" : "text-red-600 focus:text-red-600"}>
                  <Ban className="h-4 w-4 mr-2" /> {blocked ? "Unblock" : "Block"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(contact.id)} className="text-red-600 focus:text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDuration(secs: number | null): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
type FilterTab = "all" | "favorites" | "registered" | "unregistered" | "history";

export default function ContactsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [calling, setCalling] = useState(false);

  // Phone call (Twilio) state
  const [phoneCallContact, setPhoneCallContact] = useState<Contact | null>(null);

  // Bulk import state
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invite state
  const [inviteContact, setInviteContact] = useState<Contact | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Phase-1 feature state
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "" });
  // Phase-2: category + labels
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [editLabels, setEditLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [profileContact, setProfileContact] = useState<Contact | null>(null);
  const [qrContact, setQrContact] = useState<Contact | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();

  // Redial state — reuse PhoneCallModal for history entries
  const [redialEntry, setRedialEntry] = useState<{ name: string; phone: string } | null>(null);

  const { data: contacts, isLoading } = useQuery({
    queryKey: getListContactsQueryKey(),
    queryFn: listContacts,
  });

  // ── Call history query ───────────────────────────────────────────────────────
  const { data: callHistory, isLoading: historyLoading } = useQuery<CallLogEntry[]>({
    queryKey: ["call-history"],
    queryFn: () => apiFetch<CallLogEntry[]>("/api/calls/phone/history"),
    enabled: tab === "history",
    refetchInterval: tab === "history" ? 15_000 : false,
  });

  const createMutation = useCreateContact({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
        toast({ title: "Contact added" });
        setAddOpen(false);
        setForm({ name: "", email: "", phone: "" });
      },
      onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteContact({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
        toast({ title: "Contact removed" });
        setDeleteId(null);
      },
    },
  });

  // ── Update mutation (edit + favorite/pin/block/mute toggles) ────────────────
  const patchContact = useUpdateContact({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() }),
      onError: () => toast({ title: "Update failed", variant: "destructive" }),
    },
  });

  const handleToggle = (c: Contact, field: "isFavorite" | "isPinned" | "isBlocked" | "isMuted") => {
    const next = !c[field];
    patchContact.mutate({ id: c.id, data: { [field]: next } });
    if (field === "isBlocked") {
      toast({ title: next ? `${c.name} blocked` : `${c.name} unblocked`,
        description: next ? "They can no longer call you." : undefined });
    }
  };

  const openEdit = (c: Contact) => {
    setEditContact(c);
    setEditForm({ name: c.name, email: c.email, phone: c.phone ?? "" });
    setEditCategory(c.category ?? null);
    setEditLabels(c.labels ?? []);
    setLabelInput("");
  };

  const addLabel = () => {
    const l = labelInput.trim();
    if (!l) return;
    if (!editLabels.includes(l)) setEditLabels((prev) => [...prev, l]);
    setLabelInput("");
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // Allow +, digits, spaces, dashes, dots, parens — at least 7 digits total
  const PHONE_DIGIT_RE = /\d/g;

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContact) return;
    if (!editForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!editForm.email.trim()) {
      toast({ title: "Email address is required", variant: "destructive" });
      return;
    }
    if (!EMAIL_RE.test(editForm.email.trim())) {
      toast({ title: "Enter a valid email address", description: "e.g. name@example.com", variant: "destructive" });
      return;
    }
    const phoneTrimmed = editForm.phone.trim();
    if (phoneTrimmed) {
      const digitCount = (phoneTrimmed.match(PHONE_DIGIT_RE) ?? []).length;
      const validChars = /^[+\d\s\-().]+$/.test(phoneTrimmed);
      if (!validChars || digitCount < 7) {
        toast({ title: "Enter a valid phone number", description: "At least 7 digits. Only +, digits, spaces, dashes, and parentheses allowed.", variant: "destructive" });
        return;
      }
    }
    const pendingLabel = labelInput.trim();
    const labels = pendingLabel && !editLabels.includes(pendingLabel)
      ? [...editLabels, pendingLabel]
      : editLabels;
    patchContact.mutate(
      { id: editContact.id, data: {
        name: editForm.name.trim(), email: editForm.email.trim(), phone: phoneTrimmed || null,
        category: editCategory, labels,
      } satisfies UpdateContactBody },
      { onSuccess: () => { setEditContact(null); toast({ title: "Contact updated" }); } },
    );
  };

  // ── Contact profile query ────────────────────────────────────────────────────
  const { data: profileData, isLoading: profileLoading } = useGetContactProfile(
    profileContact?.id ?? 0,
    { query: { enabled: !!profileContact, queryKey: ["contact-profile", profileContact?.id] } },
  );

  // ── Derived lists ────────────────────────────────────────────────────────────
  const allContacts = (contacts ?? []) as Contact[];
  const registered = allContacts.filter((c) => !!c.contactClerkId);
  const unregistered = allContacts.filter((c) => !c.contactClerkId);
  const favorites = allContacts.filter((c) => c.isFavorite);

  const searchFilter = (c: Contact) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search) ||
    (c.labels ?? []).some((l) => l.toLowerCase().includes(search.toLowerCase()));

  const categoryFilterFn = (c: Contact) => !categoryFilter || c.category === categoryFilter;

  // Pinned first, then favorites, then alphabetical
  const sortContacts = (list: Contact[]) =>
    [...list].sort((a, b) =>
      Number(!!b.isPinned) - Number(!!a.isPinned) ||
      Number(!!b.isFavorite) - Number(!!a.isFavorite) ||
      a.name.localeCompare(b.name)
    );

  const displayList = sortContacts(
    (tab === "favorites" ? favorites : tab === "registered" ? registered : tab === "unregistered" ? unregistered : allContacts)
      .filter(searchFilter)
      .filter(categoryFilterFn)
  );

  // vCard payload for QR sharing (scannable by any phone's camera)
  const buildVCard = (c: Contact) =>
    `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\nEMAIL:${c.email}${c.phone ? `\nTEL:${c.phone}` : ""}\nNOTE:TanCom contact — join at ${window.location.origin}/sign-up\nEND:VCARD`;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleCall = async (contact: Contact, callType: "audio" | "video") => {
    if (!contact.contactClerkId) return;
    setCalling(true);
    try {
      const data = await apiFetch<ActiveCall>("/api/calls/direct", {
        method: "POST",
        body: JSON.stringify({ targetClerkId: contact.contactClerkId, callType }),
      });
      setActiveCall(data);
    } catch {
      toast({ title: "Could not start call", variant: "destructive" });
    } finally {
      setCalling(false);
    }
  };

  const handleMessage = (contact: Contact) => {
    if (!contact.contactClerkId) return;
    navigate("/chat");
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        name: form.name.trim(),
        email: form.email.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      },
    });
  };

  // ── CSV Import ───────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    setImportResult(null);
    const reader = new FileReader();
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");
    if (isXlsx) {
      parseXLSX(file).then((rows) => {
        if (rows.length === 0) {
          setImportError("Could not find contacts in this file. Make sure it has Name (and optionally Email, Phone) columns.");
          setImportRows([]);
        } else {
          setImportRows(rows);
        }
      }).catch(() => setImportError("Could not read this Excel file. Try saving it as CSV from Excel first."));
    } else {
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setImportError("Could not find contacts in this file. Make sure it has Name (and optionally Email, Phone) columns.");
          setImportRows([]);
        } else {
          setImportRows(rows);
        }
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportConfirm = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    try {
      const result = await apiFetch<ImportResult>("/api/contacts/import", {
        method: "POST",
        body: JSON.stringify({ contacts: importRows }),
      });
      setImportResult(result);
      setImportRows([]);
      queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
    } catch {
      toast({ title: "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportRows([]);
    setImportError("");
    setImportResult(null);
  };

  // ── Invite helpers ───────────────────────────────────────────────────────────
  const buildInviteMsg = (c: Contact) =>
    `Hi ${c.name}! I'd like to invite you to join me on TanCom for video calls and messaging.\n\nSign up here: ${window.location.origin}/sign-up\n\nSee you there!`;

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              {allContacts.length} total · {registered.length} on TanCom · {unregistered.length} not registered
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add Contact
            </Button>
          </div>
        </div>

        {/* "New on TanCom" banner */}
        {registered.length > 0 && (
          <div className="rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 px-4 py-3 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800">
                {registered.length === 1
                  ? `${registered[0].name} is on TanCom`
                  : `${registered.length} contacts are on TanCom`}
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                You can message and call them directly from TanCom.
              </p>
            </div>
            <Button size="sm" variant="ghost" className="text-green-700 hover:bg-green-100 shrink-0"
              onClick={() => setTab("registered")}>
              View
            </Button>
          </div>
        )}

        {/* Search + Tabs */}
        <div className="space-y-2">
          {tab !== "history" && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, or phone…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <div className="flex gap-1 flex-wrap">
            {([["all", "All", allContacts.length], ["favorites", "Favorites", favorites.length], ["registered", "On TanCom", registered.length], ["unregistered", "Not Registered", unregistered.length]] as const).map(
              ([value, label, count]) => (
                <button key={value} onClick={() => setTab(value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    tab === value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>
                  {value === "registered" && <UserCheck className="h-3.5 w-3.5" />}
                  {value === "unregistered" && <UserX className="h-3.5 w-3.5" />}
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${tab === value ? "bg-white/20" : "bg-gray-200"}`}>
                    {count}
                  </span>
                </button>
              )
            )}
            <button onClick={() => setTab("history")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                tab === "history" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              <History className="h-3.5 w-3.5" /> Call History
            </button>
          </div>
          {tab !== "history" && (
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map((cat) => {
                const count = allContacts.filter((c) => c.category === cat.value).length;
                const active = categoryFilter === cat.value;
                return (
                  <button key={cat.value}
                    onClick={() => setCategoryFilter(active ? null : cat.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active ? "bg-blue-600 text-white border-blue-600" : `${cat.cls} hover:opacity-80`
                    }`}>
                    {cat.label}{count > 0 && <span className="ml-1 opacity-70">{count}</span>}
                  </button>
                );
              })}
              {categoryFilter && (
                <button onClick={() => setCategoryFilter(null)}
                  className="px-2 py-1 rounded-full text-xs text-gray-500 hover:text-gray-700 flex items-center gap-0.5">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Call History list ────────────────────────────────────────────── */}
        {tab === "history" ? (
          historyLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : !callHistory || callHistory.length === 0 ? (
            <div className="text-center py-16">
              <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="font-medium text-gray-900 mb-1">No calls yet</h3>
              <p className="text-sm text-gray-500">Phone calls you make through TanCom will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {callHistory.map((entry) => {
                // Try to find a matching contact for the display name
                const matchedContact = (contacts as Contact[] | undefined)?.find(
                  (c) => c.phone && c.phone.replace(/\D/g, "") === entry.phoneNumber.replace(/\D/g, "")
                );
                const displayName = matchedContact?.name ?? entry.phoneNumber;
                const isUnknown   = !matchedContact;

                return (
                  <div key={entry.id}
                    className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group">
                    {/* Avatar */}
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm ${
                      isUnknown ? "bg-gray-400" : AVATAR_COLORS[((matchedContact?.id ?? 0) % AVATAR_COLORS.length)]
                    }`}>
                      {isUnknown ? <Phone className="h-4 w-4" /> : displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">{displayName}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {!isUnknown && (
                          <span className="text-xs text-gray-400">{entry.phoneNumber}</span>
                        )}
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {format(new Date(entry.createdAt), "MMM d, h:mm a")}
                        </span>
                        {entry.durationSeconds != null && (
                          <span className="text-xs text-gray-500">{formatDuration(entry.durationSeconds)}</span>
                        )}
                        <CallStatusBadge status={entry.status} />
                      </div>
                    </div>

                    {/* Redial button */}
                    <button
                      onClick={() => setRedialEntry({ name: displayName, phone: entry.phoneNumber })}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Redial"
                    >
                      <PhoneCall className="h-3.5 w-3.5" /> Redial
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ── Contact list ──────────────────────────────────────────────── */
          isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : displayList.length > 0 ? (
            <div className="space-y-3">
              {displayList.map((c) => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  onDelete={setDeleteId}
                  onCall={handleCall}
                  onMessage={handleMessage}
                  onInvite={setInviteContact}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  onProfile={setProfileContact}
                  onQr={setQrContact}
                  onPhoneCall={setPhoneCallContact}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="font-medium text-gray-900 mb-1">
                {search ? "No contacts found" : tab === "registered" ? "None of your contacts are on TanCom yet" : tab === "unregistered" ? "All contacts are registered!" : "No contacts yet"}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {search ? "Try a different search" : tab === "all" ? "Add people you frequently meet with" : ""}
              </p>
              {!search && tab === "all" && (
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
                    <Upload className="h-4 w-4" /> Import CSV
                  </Button>
                  <Button onClick={() => setAddOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> Add Contact
                  </Button>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* ── Add Contact Dialog ──────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Add someone individually. If they're registered on TanCom, you'll be able to message and call them right away.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" placeholder="Jane Smith" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input id="email" type="email" placeholder="jane@example.com" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input id="phone" type="tel" placeholder="+1 (555) 000-0000" value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding…" : "Add Contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Bulk CSV Import Dialog ──────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={(o) => !o && closeImport()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" /> Import Contacts
            </DialogTitle>
            <DialogDescription>
              Upload a <strong>CSV</strong> or <strong>Excel (.xlsx)</strong> file. The file needs a <strong>Name</strong> column — Email and Phone are optional. Duplicates are skipped automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* File drop area */}
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700">Click to select a CSV or Excel file</p>
              <p className="text-xs text-gray-400 mt-1">Supports .csv and .xlsx files from Gmail, Outlook, Apple Contacts, Excel, etc.</p>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={handleFileChange} />
            </div>

            {/* Error */}
            {importError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {importError}
              </div>
            )}

            {/* Preview */}
            {importRows.length > 0 && !importResult && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Found <strong>{importRows.length}</strong> contact{importRows.length !== 1 ? "s" : ""} — review before importing:
                </p>
                <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100 text-sm">
                  {importRows.slice(0, 50).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                        {r.name[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{r.name}</p>
                        <p className="text-gray-500 truncate">{r.email}{r.phone ? ` · ${r.phone}` : ""}</p>
                      </div>
                    </div>
                  ))}
                  {importRows.length > 50 && (
                    <div className="px-3 py-2 text-gray-400 text-center">…and {importRows.length - 50} more</div>
                  )}
                </div>
              </div>
            )}

            {/* Success result */}
            {importResult && (
              <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-1">
                <p className="font-medium text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Import complete!
                </p>
                <p className="text-sm text-green-700">{importResult.imported} contact{importResult.imported !== 1 ? "s" : ""} imported</p>
                {importResult.onTanCom > 0 && (
                  <p className="text-sm text-green-700">{importResult.onTanCom} already on TanCom — you can message them now</p>
                )}
                {importResult.skipped > 0 && (
                  <p className="text-sm text-green-600">{importResult.skipped} skipped (already in your contacts)</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeImport}>
              {importResult ? "Close" : "Cancel"}
            </Button>
            {importRows.length > 0 && !importResult && (
              <Button onClick={handleImportConfirm} disabled={importing}>
                {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</> : `Import ${importRows.length} Contact${importRows.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite Unregistered Dialog ──────────────────────────────────────── */}
      <Dialog open={!!inviteContact} onOpenChange={(o) => { if (!o) { setInviteContact(null); setInviteCopied(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite {inviteContact?.name} to TanCom</DialogTitle>
            <DialogDescription>
              {inviteContact?.name} is not registered on TanCom yet. Once they sign up, you'll be able to message and call them directly.
            </DialogDescription>
          </DialogHeader>
          {inviteContact && (
            <div className="space-y-4 pt-1">
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-line border border-gray-100 leading-relaxed">
                {buildInviteMsg(inviteContact)}
              </div>
              <div className="flex flex-col gap-2">
                {inviteContact.email && (
                  <a
                    href={`mailto:${inviteContact.email}?subject=${encodeURIComponent("Join me on TanCom")}&body=${encodeURIComponent(buildInviteMsg(inviteContact))}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                    onClick={() => setTimeout(() => { setInviteContact(null); setInviteCopied(false); }, 300)}
                  >
                    <Mail className="h-4 w-4" /> Send Email Invite
                  </a>
                )}
                {inviteContact.phone && (
                  <a
                    href={`sms:${inviteContact.phone}&body=${encodeURIComponent(buildInviteMsg(inviteContact))}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                    onClick={() => setTimeout(() => { setInviteContact(null); setInviteCopied(false); }, 300)}
                  >
                    <Phone className="h-4 w-4" /> Send SMS Invite
                  </a>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(buildInviteMsg(inviteContact));
                    setInviteCopied(true);
                    setTimeout(() => setInviteCopied(false), 2500);
                  }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
                >
                  {inviteCopied
                    ? <><CheckCircle2 className="h-4 w-4 text-green-500" /> Copied!</>
                    : <><Copy className="h-4 w-4" /> Copy Invite Message</>}
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

      {/* ── Edit Contact Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!editContact} onOpenChange={(o) => !o && setEditContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Update this contact's details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name *</Label>
              <Input id="edit-name" value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email Address *</Label>
              <Input id="edit-email" type="email" value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone Number <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input id="edit-phone" type="tel" value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Category <span className="text-gray-400 font-normal">(optional)</span></Label>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map((cat) => (
                  <button key={cat.value} type="button"
                    onClick={() => setEditCategory(editCategory === cat.value ? null : cat.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      editCategory === cat.value ? "bg-blue-600 text-white border-blue-600" : `${cat.cls} hover:opacity-80`
                    }`}>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-labels">Labels <span className="text-gray-400 font-normal">(optional)</span></Label>
              {editLabels.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {editLabels.map((l) => (
                    <Badge key={l} variant="outline" className="text-xs gap-1 text-gray-600 bg-gray-50">
                      <Tag className="h-2.5 w-2.5" /> {l}
                      <button type="button" onClick={() => setEditLabels((prev) => prev.filter((x) => x !== l))}
                        className="ml-0.5 hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input id="edit-labels" value={labelInput} placeholder="e.g. VIP, Neighbor…"
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }} />
                <Button type="button" variant="outline" onClick={addLabel} disabled={!labelInput.trim()}>Add</Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditContact(null)}>Cancel</Button>
              <Button type="submit" disabled={patchContact.isPending}>
                {patchContact.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Contact Profile Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!profileContact} onOpenChange={(o) => !o && setProfileContact(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Contact Profile</DialogTitle>
          </DialogHeader>
          {profileContact && (
            <div className="space-y-4 text-center pt-1">
              <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${AVATAR_COLORS[profileContact.id % AVATAR_COLORS.length]} text-white font-bold text-2xl`}>
                {profileContact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900 flex items-center justify-center gap-2">
                  {profileContact.name}
                  {profileContact.isFavorite && <Star className="h-4 w-4 text-amber-400 fill-amber-400" />}
                </p>
                {profileData?.profile?.username && (
                  <p className="text-sm text-blue-600 flex items-center justify-center gap-0.5">
                    <AtSign className="h-3.5 w-3.5" />{profileData.profile.username}
                  </p>
                )}
                <p className="text-sm text-gray-500">{profileContact.email}</p>
                {profileContact.phone && <p className="text-sm text-gray-500">{profileContact.phone}</p>}
                {profileData?.profile && (
                  profileData.online ? (
                    <p className="text-xs font-medium text-green-600 mt-1 flex items-center justify-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-green-500 inline-block" /> Online now
                    </p>
                  ) : profileData.profile.lastSeenAt ? (
                    <p className="text-xs text-gray-400 mt-1">
                      Last seen {format(new Date(profileData.profile.lastSeenAt), "MMM d, h:mm a")}
                    </p>
                  ) : null
                )}
              </div>
              {profileLoading ? (
                <Skeleton className="h-16 w-full rounded-lg" />
              ) : profileData?.profile ? (
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-left space-y-1.5">
                  {profileData.profile.bio && (
                    <p className="text-sm text-gray-700 whitespace-pre-line">{profileData.profile.bio}</p>
                  )}
                  {profileData.profile.lastLoginAt && (
                    <p className="text-xs text-gray-400">
                      Last active {format(new Date(profileData.profile.lastLoginAt), "MMM d, yyyy")}
                    </p>
                  )}
                  {!profileData.profile.bio && !profileData.profile.lastLoginAt && (
                    <p className="text-sm text-gray-400 text-center">No profile details yet</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Not on TanCom yet — invite them to see their profile.
                </p>
              )}
              {!!profileContact.contactClerkId && !profileContact.isBlocked && (
                <div className="flex gap-2 justify-center">
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => { handleMessage(profileContact); setProfileContact(null); }}>
                    <MessageSquare className="h-3.5 w-3.5" /> Message
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => { handleCall(profileContact, "audio"); setProfileContact(null); }}>
                    <PhoneCall className="h-3.5 w-3.5" /> Voice
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => { handleCall(profileContact, "video"); setProfileContact(null); }}>
                    <Video className="h-3.5 w-3.5" /> Video
                  </Button>
                </div>
              )}
              {/* Edit Contact — available for all contacts regardless of registration */}
              <div className="pt-1 border-t border-gray-100">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-gray-700"
                  onClick={() => { const c = profileContact; setProfileContact(null); openEdit(c); }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit Contact
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── QR Share Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!qrContact} onOpenChange={(o) => !o && setQrContact(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Share Contact</DialogTitle>
            <DialogDescription>
              Scan this code with any phone camera to save {qrContact?.name} as a contact.
            </DialogDescription>
          </DialogHeader>
          {qrContact && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <QRCodeSVG value={buildVCard(qrContact)} size={200} />
              </div>
              <p className="text-sm font-medium text-gray-900">{qrContact.name}</p>
              <p className="text-xs text-gray-500 -mt-2">{qrContact.email}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove contact?</AlertDialogTitle>
            <AlertDialogDescription>This will remove them from your contacts list.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Active Call ─────────────────────────────────────────────────────── */}
      {calling && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 text-center shadow-xl">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Starting call…</p>
          </div>
        </div>
      )}
      {activeCall && (
        <CallModal
          callRoomName={activeCall.callRoomName}
          token={activeCall.token}
          livekitUrl={activeCall.livekitUrl}
          callType={activeCall.callType}
          displayName={user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Me"}
          onEnd={() => setActiveCall(null)}
        />
      )}
      {/* ── Twilio Phone Call Modal ─────────────────────────────────────────── */}
      <PhoneCallModal
        open={!!phoneCallContact}
        contactName={phoneCallContact?.name ?? ""}
        phoneNumber={phoneCallContact?.phone ?? ""}
        onClose={() => setPhoneCallContact(null)}
      />
      {/* ── Redial from Call History ─────────────────────────────────────────── */}
      <PhoneCallModal
        open={!!redialEntry}
        contactName={redialEntry?.name ?? ""}
        phoneNumber={redialEntry?.phone ?? ""}
        onClose={() => setRedialEntry(null)}
      />
    </AppLayout>
  );
}

function CallStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
    completed:  { label: "Completed",  cls: "text-green-700 bg-green-50 border-green-200",  Icon: PhoneCall },
    "in-progress": { label: "In Progress", cls: "text-blue-700 bg-blue-50 border-blue-200",    Icon: PhoneCall },
    initiated:  { label: "Initiated",  cls: "text-gray-600 bg-gray-50 border-gray-200",   Icon: PhoneCall },
    ringing:    { label: "Ringing",    cls: "text-gray-600 bg-gray-50 border-gray-200",   Icon: PhoneCall },
    busy:       { label: "Busy",       cls: "text-amber-700 bg-amber-50 border-amber-200", Icon: PhoneOff },
    failed:     { label: "Failed",     cls: "text-red-700 bg-red-50 border-red-200",      Icon: PhoneOff },
    "no-answer":{ label: "No Answer",  cls: "text-orange-700 bg-orange-50 border-orange-200", Icon: PhoneMissed },
    canceled:   { label: "Canceled",   cls: "text-gray-600 bg-gray-50 border-gray-200",   Icon: PhoneOff },
  };
  const meta = map[status] ?? { label: status, cls: "text-gray-600 bg-gray-50 border-gray-200", Icon: PhoneCall };
  const { label, cls, Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}
