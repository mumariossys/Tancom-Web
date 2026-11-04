import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmartTextarea, SmartInput } from "@/components/SmartField";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { listMeetings, getListMeetingsQueryKey, listContacts, getListContactsQueryKey } from "@workspace/api-client-react";
import {
  Briefcase, Zap, Tag, MessageSquareDot, BarChart3, Link2,
  Plus, Trash2, Edit2, Save, X, Check, Copy, Building2,
  Globe, Phone, Clock, ChevronRight, Sparkles, BookOpen,
  TrendingUp, Users, Video, MessageSquare, Star, Package,
  Moon, GraduationCap, Heart, ShoppingBag, CheckCircle2,
  CalendarDays, CreditCard, BadgeCheck, ArrowRight,
  UserCircle, FileText, Handshake, Bell, FolderOpen,
  ClipboardList, MessageCircle, Banknote, BookMarked,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface QuickReply {
  id: string;
  shortcut: string;
  message: string;
  category: string;
}

interface ContactLabel {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface AutoMessage {
  greeting: { enabled: boolean; message: string };
  away: { enabled: boolean; message: string; schedule: string };
}

type BusinessType = "mosque_islamic" | "small_business" | "school_tutoring" | "community_org" | "";
type PlanType = "free" | "";

interface BusinessProfile {
  businessName: string;
  industry: string;
  description: string;
  website: string;
  phone: string;
  hours: string;
  email: string;
  businessType: BusinessType;
  plan: PlanType;
}

const STORAGE_KEYS = {
  quickReplies: "tancom-biz-quick-replies",
  labels: "tancom-biz-labels",
  autoMessages: "tancom-biz-auto-messages",
  businessProfile: "tancom-biz-profile",
};

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

const INDUSTRIES = [
  "Technology", "Healthcare", "Finance", "Education", "Retail",
  "Manufacturing", "Consulting", "Real Estate", "Legal", "Other",
];

// ── Organization types + included services ─────────────────────────────────────
const ORG_TYPES: {
  id: BusinessType;
  label: string;
  tagline: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  services: { icon: React.ElementType; label: string }[];
}[] = [
  {
    id: "mosque_islamic",
    label: "Mosques & Islamic Organizations",
    tagline: "Faith-based community management",
    icon: Moon,
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    services: [
      { icon: Video,          label: "Video meetings" },
      { icon: Bell,           label: "Community announcements" },
      { icon: CalendarDays,   label: "Events" },
      { icon: Banknote,       label: "Donations" },
      { icon: BookMarked,     label: "Member directory" },
      { icon: MessageCircle,  label: "Group communication" },
    ],
  },
  {
    id: "small_business",
    label: "Small Businesses",
    tagline: "Tools to grow your business",
    icon: ShoppingBag,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    services: [
      { icon: MessageSquare,  label: "Team chat" },
      { icon: Video,          label: "Meetings" },
      { icon: FolderOpen,     label: "File sharing" },
      { icon: Handshake,      label: "Customer communication" },
    ],
  },
  {
    id: "school_tutoring",
    label: "Schools & Tutoring Centers",
    tagline: "Education tools for every classroom",
    icon: GraduationCap,
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    services: [
      { icon: Video,          label: "Online classes" },
      { icon: ClipboardList,  label: "Attendance" },
      { icon: FileText,       label: "Assignments" },
      { icon: MessageCircle,  label: "Parent communication" },
    ],
  },
  {
    id: "community_org",
    label: "Community Organizations",
    tagline: "Connect and engage your community",
    icon: Heart,
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    services: [
      { icon: UserCircle,     label: "Member management" },
      { icon: CalendarDays,   label: "Events" },
      { icon: Users,          label: "Group discussions" },
    ],
  },
];

const PLANS: {
  id: PlanType;
  label: string;
  price: string;
  period: string;
  badge?: string;
  perMonth: string;
  savings?: string;
}[] = [
  {
    id: "free",
    label: "Free",
    price: "$0",
    period: "",
    perMonth: "No purchases",
  },
];

const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { id: "1", shortcut: "/hello", message: "Hello! Thanks for reaching out. How can I help you today?", category: "Greeting" },
  { id: "2", shortcut: "/meeting", message: "I'd love to schedule a meeting. Here's my meeting link: [your-link]", category: "Meeting" },
  { id: "3", shortcut: "/thanks", message: "Thank you for your message! I'll get back to you shortly.", category: "General" },
  { id: "4", shortcut: "/busy", message: "I'm currently in a meeting. I'll respond as soon as I'm available.", category: "Away" },
];

const DEFAULT_LABELS: ContactLabel[] = [
  { id: "1", name: "VIP Client", color: "#eab308", count: 0 },
  { id: "2", name: "Lead", color: "#22c55e", count: 0 },
  { id: "3", name: "Partner", color: "#3b82f6", count: 0 },
  { id: "4", name: "Follow Up", color: "#ef4444", count: 0 },
];

const DEFAULT_AUTO: AutoMessage = {
  greeting: { enabled: false, message: "Hi! Thanks for contacting us. A team member will be with you shortly." },
  away: { enabled: false, message: "We're currently away. We'll respond during business hours.", schedule: "18:00-09:00" },
};

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── Sidebar tabs ───────────────────────────────────────────────────────────────

type Tab = "profile" | "quickreplies" | "labels" | "automessages" | "analytics" | "catalog";

const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "profile",       label: "Business Profile",   icon: Building2,        desc: "Your public business info" },
  { id: "quickreplies",  label: "Quick Replies",       icon: Zap,              desc: "Saved message shortcuts" },
  { id: "labels",        label: "Labels",              icon: Tag,              desc: "Organize your contacts" },
  { id: "automessages",  label: "Automated Messages",  icon: MessageSquareDot, desc: "Greeting & away messages" },
  { id: "analytics",     label: "Statistics",          icon: BarChart3,        desc: "Your activity overview" },
  { id: "catalog",       label: "Service Catalog",     icon: Package,          desc: "Showcase your services" },
];

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BusinessTools() {
  const [tab, setTab] = useState<Tab>("profile");
  const { user } = useUser();

  return (
    <AppLayout>
      <div className="flex h-full bg-gray-50">
        {/* Left panel — tab list */}
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="px-5 py-5 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                <Briefcase className="h-4.5 w-4.5 text-white h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Business Tools</p>
                <p className="text-xs text-gray-500">Manage your business presence</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.label}</p>
                    <p className={`text-xs truncate ${active ? "text-blue-500" : "text-gray-400"}`}>{t.desc}</p>
                  </div>
                  {active && <ChevronRight className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-100">
            <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700">Pro Tip</span>
              </div>
              <p className="text-xs text-blue-600 leading-relaxed">
                Use Quick Replies to respond 3× faster in chat with keyboard shortcuts.
              </p>
            </div>
          </div>
        </aside>

        {/* Right panel — content */}
        <main className="flex-1 overflow-y-auto">
          {tab === "profile"      && <ProfileTab user={user} />}
          {tab === "quickreplies" && <QuickRepliesTab />}
          {tab === "labels"       && <LabelsTab />}
          {tab === "automessages" && <AutoMessagesTab />}
          {tab === "analytics"    && <AnalyticsTab />}
          {tab === "catalog"      && <CatalogTab user={user} />}
        </main>
      </div>
    </AppLayout>
  );
}

// ── Business Profile tab ───────────────────────────────────────────────────────

const EMPTY_PROFILE: BusinessProfile = {
  businessName: "", industry: "", description: "", website: "",
  phone: "", hours: "Mon–Fri, 9:00 AM – 6:00 PM", email: "",
  businessType: "", plan: "",
};

function ProfileTab({ user }: { user: ReturnType<typeof useUser>["user"] }) {
  const { toast } = useToast();

  const [profile, setProfile] = useState<BusinessProfile>(() => {
    const stored = load<BusinessProfile>(STORAGE_KEYS.businessProfile, EMPTY_PROFILE);
    const defaultEmail = user?.primaryEmailAddress?.emailAddress ?? "";
    return { ...EMPTY_PROFILE, ...stored, email: stored.email || defaultEmail };
  });
  const [draft, setDraft] = useState<BusinessProfile>(profile);
  const [step, setStep] = useState<"type" | "plan" | "done">(
    !profile.businessType ? "type" : "done"
  );
  const [editing, setEditing] = useState(false);

  function persist(next: BusinessProfile) {
    setProfile(next);
    save(STORAGE_KEYS.businessProfile, next);
  }

  function handleSave() {
    persist(draft);
    setEditing(false);
    toast({ title: "Business profile saved" });
  }

  function handleTypeSelect(t: BusinessType) {
    const next = { ...profile, businessType: t, plan: "free" as const };
    persist(next);
    setDraft(next);
    setStep("done");
  }

  function handlePlanSelect(p: PlanType) {
    const next = { ...profile, plan: p };
    persist(next);
    setDraft(next);
    setStep("done");
    toast({ title: "Profile set up!", description: "You can edit your details below." });
  }

  const orgType = ORG_TYPES.find(o => o.id === profile.businessType);
  const plan = PLANS.find(p => p.id === profile.plan);

  // ── Step 1: choose organisation type ──────────────────────────────────────
  if (step === "type") {
    return (
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="text-center mb-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 mb-4">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">What type of organization are you?</h1>
          <p className="text-gray-500 mt-2 text-sm">Choose the option that best describes your organization so we can show you the right features.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ORG_TYPES.map((ot) => {
            const Icon = ot.icon;
            return (
              <button
                key={ot.id}
                onClick={() => handleTypeSelect(ot.id)}
                className={`group text-left p-5 rounded-2xl border-2 ${ot.border} ${ot.bg} hover:shadow-md transition-all hover:scale-[1.02] active:scale-[0.99]`}
              >
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white mb-3 shadow-sm`}>
                  <Icon className={`h-6 w-6 ${ot.color}`} />
                </div>
                <p className={`font-semibold text-gray-900 text-sm mb-1`}>{ot.label}</p>
                <p className="text-xs text-gray-500">{ot.tagline}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {ot.services.slice(0, 3).map(s => (
                    <span key={s.label} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/70 rounded-full text-xs text-gray-600 border border-white">
                      <s.icon className="h-3 w-3" /> {s.label}
                    </span>
                  ))}
                  {ot.services.length > 3 && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-white/70 rounded-full text-xs text-gray-400 border border-white">
                      +{ot.services.length - 3} more
                    </span>
                  )}
                </div>
                <div className={`mt-3 flex items-center gap-1 text-xs font-medium ${ot.color} opacity-0 group-hover:opacity-100 transition-opacity`}>
                  Select <ArrowRight className="h-3 w-3" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Step 2: choose plan ────────────────────────────────────────────────────
  if (step === "plan") {
    return (
      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="text-center mb-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 mb-4">
            <CreditCard className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Choose your plan</h1>
          <p className="text-gray-500 mt-2 text-sm">You can change or cancel anytime.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {PLANS.map((pl) => (
            <button
              key={pl.id}
              onClick={() => handlePlanSelect(pl.id)}
              className={`relative text-left p-6 rounded-2xl border-2 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.99] ${
                pl.id === "free"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              {pl.badge && (
                <span className="absolute top-4 right-4 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {pl.badge}
                </span>
              )}
              <p className="text-sm font-semibold text-gray-500 mb-2">{pl.label}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold text-gray-900">{pl.price}</span>
                <span className="text-gray-400 text-sm mb-1">{pl.period}</span>
              </div>
              <p className="text-xs text-gray-500 mb-4">{pl.perMonth}</p>
              {pl.savings && (
                <p className="text-xs font-medium text-blue-600 mb-4">✦ {pl.savings}</p>
              )}
              <div className="space-y-2">
                {["All features included", "Priority support", "Unlimited members", "Cancel anytime"].map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="text-xs text-gray-600">{f}</span>
                  </div>
                ))}
              </div>
              <div className={`mt-5 w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-colors ${
                pl.id === "free"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}>
                Choose {pl.label}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setStep("type")}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mx-auto"
        >
          ← Back to organization type
        </button>
      </div>
    );
  }

  // ── Full profile view ──────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Business Profile</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visible to contacts and meeting participants</p>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDraft(profile); setEditing(false); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => { setDraft(profile); setEditing(true); }}>
            <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>

      {/* Identity card */}
      <div className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className={`h-16 w-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shrink-0 ${orgType ? orgType.bg : "bg-blue-50"}`}>
          {orgType ? (
            <orgType.icon className={`h-8 w-8 ${orgType.color}`} />
          ) : (
            <Building2 className="h-8 w-8 text-blue-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-lg truncate">
            {profile.businessName || user?.fullName || "Your Organization"}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {orgType && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border ${orgType.bg} ${orgType.color} ${orgType.border}`}>
                <orgType.icon className="h-3 w-3" /> {orgType.label}
              </span>
            )}
            {plan && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                <BadgeCheck className="h-3 w-3 text-blue-500" />
                {plan.label} Plan · {plan.perMonth}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Plan card */}
      {plan && (
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider mb-1">Active Plan</p>
              <p className="text-2xl font-bold">{plan.price}<span className="text-sm font-normal text-blue-200">{plan.period}</span></p>
              <p className="text-sm text-blue-200 mt-0.5">{plan.perMonth}</p>
            </div>
            <CreditCard className="h-8 w-8 text-blue-300 shrink-0" />
          </div>
          <Separator className="my-4 bg-white/20" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm text-blue-100">Purchases disabled · Free access</span>
            </div>
          </div>
        </div>
      )}

      {/* Included services */}
      {orgType && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">Included with your plan</p>
          <div className="grid grid-cols-2 gap-2">
            {orgType.services.map(s => (
              <div key={s.label} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50">
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${orgType.bg} shrink-0`}>
                  <s.icon className={`h-3.5 w-3.5 ${orgType.color}`} />
                </div>
                <span className="text-sm text-gray-700">{s.label}</span>
              </div>
            ))}
          </div>
          {editing && (
            <button
              onClick={() => setStep("type")}
              className={`mt-4 text-xs font-medium ${orgType.color} hover:underline`}
            >
              Change organization type →
            </button>
          )}
        </div>
      )}

      {/* Contact details */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <p className="text-sm font-semibold text-gray-900">Organization Details</p>
        <Separator />
        {(
          [
            { label: "Organization Name", key: "businessName" as const, icon: Building2,     placeholder: "Your organization name" },
            { label: "Description",       key: "description"  as const, icon: BookOpen,      placeholder: "What does your organization do?", multiline: true },
            { label: "Website",           key: "website"      as const, icon: Globe,         placeholder: "https://yourwebsite.com",          type: "url" },
            { label: "Email",             key: "email"        as const, icon: MessageSquare, placeholder: "contact@yourorg.com",              type: "email" },
            { label: "Phone",             key: "phone"        as const, icon: Phone,         placeholder: "+1 (555) 000-0000",               type: "tel" },
            { label: "Hours",             key: "hours"        as const, icon: Clock,         placeholder: "Mon–Fri, 9:00 AM – 6:00 PM" },
          ] as { label: string; key: keyof BusinessProfile; icon: React.ElementType; placeholder: string; type?: string; multiline?: boolean }[]
        ).map(({ label, key, icon: Icon, placeholder, type, multiline }, i, arr) => (
          <div key={key}>
            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">{label}</Label>
            {editing ? (
              multiline ? (
                <SmartTextarea
                  rows={3}
                  value={String(draft[key] ?? "")}
                  onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  context={`business profile ${label.toLowerCase()}`}
                />
              ) : (
                <SmartInput
                  type={type ?? "text"}
                  value={String(draft[key] ?? "")}
                  onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                  placeholder={placeholder}
                  context={`business profile ${label.toLowerCase()}`}
                />
              )
            ) : (
              <div className="flex items-center gap-2 py-1">
                <Icon className="h-4 w-4 text-gray-300 shrink-0" />
                <span className="text-sm text-gray-800">
                  {profile[key] || <span className="italic text-gray-300">Not set</span>}
                </span>
              </div>
            )}
            {i < arr.length - 1 && <Separator className="mt-4" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quick Replies tab ──────────────────────────────────────────────────────────

function QuickRepliesTab() {
  const { toast } = useToast();
  const [replies, setReplies] = useState<QuickReply[]>(() =>
    load(STORAGE_KEYS.quickReplies, DEFAULT_QUICK_REPLIES)
  );
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [form, setForm] = useState({ shortcut: "", message: "", category: "General" });

  function persist(next: QuickReply[]) {
    setReplies(next);
    save(STORAGE_KEYS.quickReplies, next);
  }

  function handleSave() {
    if (!form.shortcut.trim() || !form.message.trim()) return;
    const shortcut = form.shortcut.startsWith("/") ? form.shortcut : `/${form.shortcut}`;
    if (editing) {
      persist(replies.map(r => r.id === editing.id ? { ...editing, ...form, shortcut } : r));
      toast({ title: "Quick reply updated" });
    } else {
      persist([...replies, { id: Date.now().toString(), ...form, shortcut }]);
      toast({ title: "Quick reply added" });
    }
    setForm({ shortcut: "", message: "", category: "General" });
    setShowForm(false);
    setEditing(null);
  }

  function handleEdit(r: QuickReply) {
    setEditing(r);
    setForm({ shortcut: r.shortcut, message: r.message, category: r.category });
    setShowForm(true);
  }

  function handleDelete(id: string) {
    persist(replies.filter(r => r.id !== id));
    toast({ title: "Quick reply deleted" });
  }

  const categories = [...new Set(replies.map(r => r.category))];

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quick Replies</h1>
          <p className="text-sm text-gray-500 mt-0.5">Type a shortcut in chat to instantly insert a saved reply</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setForm({ shortcut: "", message: "", category: "General" }); setShowForm(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Reply
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5 mb-5">
          <p className="font-semibold text-gray-900 mb-4 text-sm">{editing ? "Edit Quick Reply" : "New Quick Reply"}</p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Shortcut (starts with /)</Label>
              <Input
                value={form.shortcut}
                onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))}
                placeholder="/greeting"
                className="font-mono"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
              <Input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Greeting, Meeting, Support"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Message</Label>
              <textarea
                rows={3}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Type the full message that will be inserted..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
            <Button size="sm" onClick={handleSave}><Check className="h-3.5 w-3.5 mr-1" /> Save</Button>
          </div>
        </div>
      )}

      {categories.map(cat => (
        <div key={cat} className="mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">{cat}</p>
          <div className="space-y-2">
            {replies.filter(r => r.category === cat).map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4 flex gap-3 group hover:border-gray-200 transition-colors">
                <div className="shrink-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-mono font-semibold">{r.shortcut}</span>
                </div>
                <p className="text-sm text-gray-700 flex-1 leading-relaxed">{r.message}</p>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {replies.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No quick replies yet. Add your first one!</p>
        </div>
      )}
    </div>
  );
}

// ── Labels tab ─────────────────────────────────────────────────────────────────

function LabelsTab() {
  const { toast } = useToast();
  const [labels, setLabels] = useState<ContactLabel[]>(() =>
    load(STORAGE_KEYS.labels, DEFAULT_LABELS)
  );
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", color: LABEL_COLORS[0] });

  function persist(next: ContactLabel[]) {
    setLabels(next);
    save(STORAGE_KEYS.labels, next);
  }

  function handleAdd() {
    if (!form.name.trim()) return;
    persist([...labels, { id: Date.now().toString(), ...form, count: 0 }]);
    setForm({ name: "", color: LABEL_COLORS[0] });
    setShowForm(false);
    toast({ title: "Label created" });
  }

  function handleDelete(id: string) {
    persist(labels.filter(l => l.id !== id));
    toast({ title: "Label deleted" });
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Labels</h1>
          <p className="text-sm text-gray-500 mt-0.5">Color-code your contacts and conversations</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Label
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5 mb-5">
          <p className="font-semibold text-gray-900 mb-4 text-sm">Create Label</p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Label Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. VIP Client, Hot Lead..."
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-2 block">Color</Label>
              <div className="flex gap-2">
                {LABEL_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{ backgroundColor: c }}
                    className={`h-7 w-7 rounded-full transition-all ${form.color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd}><Check className="h-3.5 w-3.5 mr-1" /> Create</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {labels.map(l => (
          <div key={l.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 group hover:border-gray-200 transition-colors">
            <div style={{ backgroundColor: l.color }} className="h-4 w-4 rounded-full shrink-0" />
            <span className="flex-1 text-sm font-medium text-gray-800">{l.name}</span>
            <span className="text-xs text-gray-400">{l.count} contacts</span>
            <button
              onClick={() => handleDelete(l.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {labels.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Tag className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No labels yet. Create your first one!</p>
        </div>
      )}
    </div>
  );
}

// ── Automated Messages tab ─────────────────────────────────────────────────────

function AutoMessagesTab() {
  const { toast } = useToast();
  const [auto, setAuto] = useState<AutoMessage>(() =>
    load(STORAGE_KEYS.autoMessages, DEFAULT_AUTO)
  );

  function update(patch: Partial<AutoMessage>) {
    const next = { ...auto, ...patch };
    setAuto(next);
    save(STORAGE_KEYS.autoMessages, next);
    toast({ title: "Settings saved" });
  }

  function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">{desc}</p>
        </div>
        <button
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${value ? "bg-blue-600" : "bg-gray-200"}`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Automated Messages</h1>
        <p className="text-sm text-gray-500 mt-0.5">Set up automatic responses for chats and meeting invites</p>
      </div>

      {/* Greeting */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Greeting Message</p>
            <p className="text-xs text-gray-500">Sent when someone starts a new chat with you</p>
          </div>
        </div>
        <Separator className="mb-4" />
        <Toggle
          label="Enable greeting message"
          desc="Automatically greet new chat contacts"
          value={auto.greeting.enabled}
          onChange={enabled => update({ greeting: { ...auto.greeting, enabled } })}
        />
        <div className="mt-4">
          <Label className="text-xs text-gray-500 mb-1.5 block">Message</Label>
          <SmartTextarea
            rows={3}
            value={auto.greeting.message}
            onChange={e => setAuto(a => ({ ...a, greeting: { ...a.greeting, message: e.target.value } }))}
            onBlur={() => update({})}
            disabled={!auto.greeting.enabled}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-400"
            context="auto greeting message"
          />
        </div>
      </div>

      {/* Away */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center">
            <Clock className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Away Message</p>
            <p className="text-xs text-gray-500">Sent when you receive messages outside business hours</p>
          </div>
        </div>
        <Separator className="mb-4" />
        <Toggle
          label="Enable away message"
          desc="Auto-reply when you're unavailable"
          value={auto.away.enabled}
          onChange={enabled => update({ away: { ...auto.away, enabled } })}
        />
        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Away Hours (24h format, e.g. 18:00–09:00)</Label>
            <Input
              value={auto.away.schedule}
              onChange={e => setAuto(a => ({ ...a, away: { ...a.away, schedule: e.target.value } }))}
              onBlur={() => update({})}
              disabled={!auto.away.enabled}
              placeholder="18:00-09:00"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Message</Label>
            <SmartTextarea
              rows={3}
              value={auto.away.message}
              onChange={e => setAuto(a => ({ ...a, away: { ...a.away, message: e.target.value } }))}
              onBlur={() => update({})}
              disabled={!auto.away.enabled}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-400"
              context="auto away message"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Analytics tab ──────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const { data: meetings } = useQuery({
    queryKey: getListMeetingsQueryKey(),
    queryFn: () => listMeetings(),
  });
  const { data: contacts } = useQuery({
    queryKey: getListContactsQueryKey(),
    queryFn: () => listContacts(),
  });

  const now = new Date();
  const thisMonth = meetings?.filter(m => {
    const d = new Date(m.scheduledAt ?? m.createdAt ?? "");
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }) ?? [];

  const hosted = meetings?.filter(m => m.status === "ended") ?? [];
  const upcoming = meetings?.filter(m => m.status === "scheduled") ?? [];

  const stats = [
    { label: "Total Meetings", value: meetings?.length ?? 0, icon: Video, color: "blue", change: `${thisMonth.length} this month` },
    { label: "Meetings Hosted", value: hosted.length, icon: Star, color: "green", change: `${upcoming.length} upcoming` },
    { label: "Total Contacts", value: contacts?.length ?? 0, icon: Users, color: "purple", change: "in your network" },
    { label: "Quick Replies", value: load<QuickReply[]>(STORAGE_KEYS.quickReplies, []).length, icon: Zap, color: "orange", change: "saved templates" },
    { label: "Labels Created", value: load<ContactLabel[]>(STORAGE_KEYS.labels, []).length, icon: Tag, color: "pink", change: "contact tags" },
    { label: "Response Rate", value: "—", icon: TrendingUp, color: "teal", change: "chat response rate" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    pink: "bg-pink-50 text-pink-600",
    teal: "bg-teal-50 text-teal-600",
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Statistics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your activity overview at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className={`h-9 w-9 rounded-xl ${colorMap[s.color]} flex items-center justify-center mb-3`}>
                <Icon className="h-4.5 w-4.5 h-5 w-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs font-medium text-gray-600 mt-0.5">{s.label}</p>
              <p className="text-xs text-gray-400 mt-1">{s.change}</p>
            </div>
          );
        })}
      </div>

      {/* Recent meetings */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="font-semibold text-gray-900 text-sm mb-4">Recent Meetings</p>
        {(meetings ?? []).slice(0, 5).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No meetings yet</p>
        ) : (
          <div className="space-y-3">
            {(meetings ?? []).slice(0, 5).map(m => (
              <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Video className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.title ?? "Untitled Meeting"}</p>
                  <p className="text-xs text-gray-400">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString() : "No date"}</p>
                </div>
                <Badge
                  variant="secondary"
                  className={m.status === "cancelled" ? "bg-gray-100 text-gray-500" : m.status === "active" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}
                >
                  {m.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Service Catalog tab ────────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: string;
  duration: string;
  emoji: string;
}

const DEFAULT_CATALOG: CatalogItem[] = [];

function CatalogTab({ user }: { user: ReturnType<typeof useUser>["user"] }) {
  const { toast } = useToast();
  const [items, setItems] = useState<CatalogItem[]>(() =>
    load("tancom-biz-catalog", DEFAULT_CATALOG)
  );
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", duration: "", emoji: "💼" });
  const [copied, setCopied] = useState(false);
  const profile = load<BusinessProfile>(STORAGE_KEYS.businessProfile, EMPTY_PROFILE);

  const profileUrl = `${window.location.origin}/profile/${user?.id ?? "me"}`;

  function persist(next: CatalogItem[]) {
    setItems(next);
    save("tancom-biz-catalog", next);
  }

  function handleSave() {
    if (!form.name.trim()) return;
    if (editing) {
      persist(items.map(i => i.id === editing.id ? { ...editing, ...form } : i));
      toast({ title: "Service updated" });
    } else {
      persist([...items, { id: Date.now().toString(), ...form }]);
      toast({ title: "Service added to catalog" });
    }
    setForm({ name: "", description: "", price: "", duration: "", emoji: "💼" });
    setShowForm(false);
    setEditing(null);
  }

  function handleEdit(item: CatalogItem) {
    setEditing(item);
    setForm({ name: item.name, description: item.description, price: item.price, duration: item.duration, emoji: item.emoji });
    setShowForm(true);
  }

  function handleDelete(id: string) {
    persist(items.filter(i => i.id !== id));
    toast({ title: "Service removed" });
  }

  function handleCopy() {
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied to clipboard" });
  }

  const EMOJIS = ["💼", "📞", "🎯", "⚡", "🔧", "📊", "🎓", "💡", "🤝", "🚀", "✨", "🛡️"];

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Service Catalog</h1>
          <p className="text-sm text-gray-500 mt-0.5">Showcase your services and packages</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setForm({ name: "", description: "", price: "", duration: "", emoji: "💼" }); setShowForm(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Service
        </Button>
      </div>

      {/* Share link */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4 mb-5 flex items-center gap-3">
        <Link2 className="h-5 w-5 text-blue-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-700 mb-0.5">Your Business Link</p>
          <p className="text-xs text-blue-500 truncate">{profileUrl}</p>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5 mb-5">
          <p className="font-semibold text-gray-900 mb-4 text-sm">{editing ? "Edit Service" : "Add Service"}</p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 mb-2 block">Icon</Label>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => setForm(f => ({ ...f, emoji: e }))}
                    className={`h-9 w-9 rounded-lg text-lg flex items-center justify-center transition-all ${form.emoji === e ? "bg-blue-100 ring-2 ring-blue-400" : "bg-gray-50 hover:bg-gray-100"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Service Name</Label>
              <SmartInput value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Strategy Consultation" context="service name" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Description</Label>
              <SmartTextarea
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What's included in this service..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                context="service description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Price</Label>
                <Input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="e.g. $150/hr, Free" />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Duration</Label>
                <Input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="e.g. 60 min, Ongoing" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
            <Button size="sm" onClick={handleSave}><Check className="h-3.5 w-3.5 mr-1" /> Save</Button>
          </div>
        </div>
      )}

      {items.length === 0 && !showForm && (
        <div className="text-center py-16 text-gray-400">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No services yet. Add your first offering!</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex gap-4 group hover:border-gray-200 transition-colors">
            <div className="h-12 w-12 rounded-xl bg-gray-50 flex items-center justify-center text-2xl shrink-0">{item.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(item)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {item.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.description}</p>}
              <div className="flex items-center gap-3 mt-2">
                {item.price && <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">{item.price}</span>}
                {item.duration && <span className="text-xs text-gray-400">{item.duration}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
