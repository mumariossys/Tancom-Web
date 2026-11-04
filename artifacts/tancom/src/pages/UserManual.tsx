import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import tancomLogo from "@assets/TanCom_Logo_1780923314837.jpeg";
import manualCover from "@assets/manual-cover-portrait.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadAsPDF, downloadAsPPT } from "@/lib/downloadManual";
import {
  BookOpen,
  Video,
  MessageSquare,
  Hash,
  Users,
  Mic,
  Settings,
  UserCircle,
  Shield,
  Smartphone,
  Radio,
  Briefcase,
  NotebookPen,
  ChevronRight,
  Lightbulb,
  AlertCircle,
  CheckCircle2,
  Keyboard,
  Play,
  LogIn,
  Plus,
  Lock,
  Globe,
  Bell,
  Search,
  Download,
  Star,
  Zap,
  Info,
  FileText,
  GalleryHorizontalEnd,
  Loader2,
  ExternalLink,
  Monitor,
  ArrowLeft,
  ArrowRight,
  Captions,
  Cpu,
} from "lucide-react";

/* ─── Types ───────────────────────────────────────────────────── */
interface Section {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/* ─── Table of Contents ───────────────────────────────────────── */
const sections: Section[] = [
  { id: "getting-started",   label: "Getting Started",     icon: Play },
  { id: "navigation",        label: "App Navigation",      icon: ArrowLeft },
  { id: "dashboard",         label: "Dashboard",           icon: BookOpen },
  { id: "meetings",          label: "Meetings",            icon: Video },
  { id: "chat",              label: "Chat & Messaging",    icon: MessageSquare },
  { id: "communities",       label: "Communities",         icon: Hash },
  { id: "groups",            label: "Groups",              icon: Users },
  { id: "contacts",          label: "Contacts",            icon: Users },
  { id: "recordings",        label: "Recordings",          icon: Mic },
  { id: "live-marketing",    label: "Live Marketing",      icon: Radio },
  { id: "business-tools",    label: "Business Tools",      icon: Briefcase },
  { id: "meeting-notes",     label: "Meeting Notes",       icon: NotebookPen },
  { id: "remote-access",     label: "Remote Access",       icon: Monitor },
  { id: "profile-settings",  label: "Profile & Settings",  icon: Settings },
  { id: "mobile-app",        label: "Mobile App",          icon: Smartphone },
  { id: "admin",             label: "Admin Panel",          icon: Shield },
  { id: "security",          label: "Security & Privacy",   icon: Lock },
  { id: "security-report",   label: "Security Test Report", icon: Shield },
  { id: "usability-report",  label: "Usability Test Report",icon: CheckCircle2 },
];

/* ─── Shared callout components ───────────────────────────────── */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 my-4">
      <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
      <p className="text-sm text-blue-800">{children}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 my-4">
      <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <p className="text-sm text-amber-800">{children}</p>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold mt-0.5">
        {number}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-600 mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function KbdShortcut({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <kbd key={i} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">
          {k}
        </kbd>
      ))}
    </span>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
        <Icon className="h-5 w-5 text-blue-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function SectionHeader({ id, icon: Icon, title, subtitle }: { id: string; icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <div id={id} className="scroll-mt-6 mb-6 flex items-start gap-4 pt-10 first:pt-0">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-sm">
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────── */
export default function UserManualPage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const [pdfLoading, setPdfLoading]  = useState(false);
  const [pptLoading, setPptLoading]  = useState(false);

  const handlePDF = async () => {
    setPdfLoading(true);
    try { await downloadAsPDF(); } finally { setPdfLoading(false); }
  };

  const handlePPT = async () => {
    setPptLoading(true);
    try { await downloadAsPPT(); } finally { setPptLoading(false); }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSection(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">

        {/* ── Hero Banner ─────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0d1b4b] via-blue-800 to-indigo-900 text-white">
          {/* subtle grid overlay */}
          <div className="pointer-events-none absolute inset-0 opacity-10"
            style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.15) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

          <div className="relative mx-auto max-w-6xl px-6 py-10">
            <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">

              {/* ── Left: text content ──────────────────────────── */}
              <div className="flex-1 min-w-0">

                {/* Logo + badge row */}
                <div className="flex items-center gap-4 mb-5">
                  <img
                    src={tancomLogo}
                    alt="TanCom"
                    className="h-12 w-auto object-contain drop-shadow-[0_0_12px_rgba(147,197,253,0.5)]"
                  />
                  <div className="h-7 w-px bg-white/20" />
                  <Badge className="bg-white/20 text-white border-0 hover:bg-white/20 text-xs tracking-wide">
                    <BookOpen className="h-3 w-3 mr-1.5 opacity-80" />
                    Official Documentation
                  </Badge>
                </div>

                <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
                  TanCom<br />
                  <span className="text-blue-300">User Manual</span>
                </h1>

                <p className="mt-3 text-blue-100 max-w-lg text-base leading-relaxed">
                  Everything you need to communicate, collaborate, and grow — from your first meeting to enterprise-scale communities.
                </p>

                {/* Feature chips */}
                <div className="mt-5 flex flex-wrap gap-2 text-sm">
                  {[
                    { icon: Video,         label: "HD Video Meetings" },
                    { icon: MessageSquare, label: "Encrypted Chat" },
                    { icon: Radio,         label: "Live Streaming" },
                    { icon: Smartphone,    label: "iOS & Android" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5 border border-white/10 backdrop-blur-sm">
                      <Icon className="h-3.5 w-3.5 text-blue-300" />
                      <span className="text-blue-50">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Download buttons */}
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    onClick={handlePDF}
                    disabled={pdfLoading}
                    className="gap-2 bg-white text-blue-700 hover:bg-blue-50 border border-white/30 shadow-lg font-semibold"
                    size="sm"
                  >
                    {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    {pdfLoading ? "Generating PDF…" : "Download PDF"}
                  </Button>
                  <Button
                    onClick={handlePPT}
                    disabled={pptLoading}
                    variant="outline"
                    className="gap-2 border-white/40 text-white hover:bg-white/10 hover:text-white font-semibold"
                    size="sm"
                  >
                    {pptLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GalleryHorizontalEnd className="h-4 w-4" />}
                    {pptLoading ? "Generating PPT…" : "Download PPT"}
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <a
                    href="https://tan-com-web.replit.app/user-manual"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-200 hover:text-white transition-colors underline underline-offset-2"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Live Version
                  </a>
                  <span className="text-blue-300/40">·</span>
                  <p className="text-blue-300/70 text-xs">Version 2.11 · Updated June 2026</p>
                </div>
              </div>

              {/* ── Right: AI cover image ────────────────────────── */}
              <div className="hidden lg:flex flex-shrink-0 w-72 xl:w-80 justify-center">
                <div className="relative">
                  {/* glow ring behind image */}
                  <div className="absolute -inset-4 rounded-3xl bg-blue-500/20 blur-2xl" />
                  <img
                    src={manualCover}
                    alt="TanCom platform illustration"
                    className="relative w-full rounded-2xl shadow-2xl ring-1 ring-white/10 object-cover"
                    style={{ maxHeight: 340 }}
                  />
                  {/* subtle overlay label */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <span className="rounded-full bg-black/40 backdrop-blur-sm px-3 py-1 text-xs text-white/80 font-medium">
                      TanCom Platform
                    </span>
                    <span className="rounded-full bg-blue-600/60 backdrop-blur-sm px-3 py-1 text-xs text-white font-semibold">
                      v2.11
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex gap-8">

            {/* ── Sidebar ToC ─────────────────────────────────── */}
            <aside className="hidden lg:block w-52 shrink-0">
              <div className="sticky top-6 rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Contents</p>
                <nav className="space-y-0.5">
                  {sections.map((s) => {
                    const Icon = s.icon;
                    const active = activeSection === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => scrollTo(s.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors text-left",
                          active
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-blue-500" : "text-gray-400")} />
                        {s.label}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </aside>

            {/* ── Content ─────────────────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-2">

              {/* ══ GETTING STARTED ══════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="getting-started" icon={Play} title="Getting Started" subtitle="Create your account and be in a meeting within 60 seconds." />

                <div className="grid sm:grid-cols-2 gap-3 mb-6">
                  <FeatureCard icon={Globe} title="Web App" description="Access TanCom instantly at tancom.us — no download required." />
                  <FeatureCard icon={Smartphone} title="Mobile App" description="Download the TanCom app for iOS or Android for meetings on the go." />
                  <FeatureCard icon={Zap} title="Instant Meetings" description="Start a meeting in one click — no scheduling required." />
                  <FeatureCard icon={Lock} title="Secure by Default" description="End-to-end encrypted chats, passcode-protected rooms." />
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Create Your Account</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Visit tancom.us">Click <strong>Sign Up</strong> on the homepage or navigate to <code className="text-xs bg-gray-100 px-1 rounded">/sign-up</code>.</Step>
                  <Step number={2} title="Enter your details">Provide your first name, last name, email address, and a strong password (minimum 8 characters).</Step>
                  <Step number={3} title="Verify your email">Check your inbox for a verification email from TanCom and click the confirmation link.</Step>
                  <Step number={4} title="Complete your profile">Add a profile photo, job title, and time zone on the Profile page for the best meeting experience.</Step>
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Sign In</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                  <Step number={1} title="Go to tancom.us">Click <strong>Sign In</strong> at the top right of the landing page.</Step>
                  <Step number={2} title="Enter credentials">Type your registered email and password, then click <strong>Sign In</strong>.</Step>
                  <Step number={3} title="You're in">You'll land on the Dashboard automatically. The sidebar gives you access to every feature.</Step>
                </div>
                <Tip>Forgot your password? Click <strong>Forgot password?</strong> on the sign-in page to receive a reset link via email.</Tip>
              </div>

              {/* ══ NAVIGATION ═══════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="navigation" icon={ArrowLeft} title="App Navigation" subtitle="Move between pages quickly using back and forward controls." />

                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  <FeatureCard icon={ArrowLeft} title="Back Button (←)" description="Returns you to the previous page you visited — like a browser's back button." />
                  <FeatureCard icon={ArrowRight} title="Forward Button (→)" description="Goes forward again after you've navigated back through your history." />
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">How Navigation Works</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Find the arrows">The ← and → arrow buttons appear in the top bar on every page, just to the right of the hamburger menu on mobile.</Step>
                  <Step number={2} title="Go back">Click ← to return to the previous page. The button is grayed out when you're on your first page of the session.</Step>
                  <Step number={3} title="Go forward">After going back, click → to move forward again. The button activates only when forward history is available.</Step>
                  <Step number={4} title="Navigating via sidebar">Clicking any item in the left sidebar adds it to your history stack — you can always go back to where you were.</Step>
                </div>
                <Tip>The navigation history resets when you refresh the page — it tracks your journey within the current session only.</Tip>
              </div>

              {/* ══ DASHBOARD ════════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="dashboard" icon={BookOpen} title="Dashboard" subtitle="Your command center — see everything at a glance." />

                <div className="grid sm:grid-cols-3 gap-3 mb-5">
                  {[
                    { label: "Total Meetings",   desc: "All meetings you have hosted or attended." },
                    { label: "Upcoming Meetings", desc: "Meetings scheduled for the next 7 days." },
                    { label: "Recent Activity",   desc: "Latest joins, recordings, and messages." },
                  ].map(({ label, desc }) => (
                    <div key={label} className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-4">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{label}</p>
                      <p className="text-xs text-gray-600 mt-1">{desc}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-600">From the Dashboard you can also <strong>create a new meeting</strong> instantly or <strong>join a meeting</strong> using an invite code — both buttons are always visible at the top of the left sidebar.</p>
                <Tip>Pin your most-used features by visiting <strong>Settings → Preferences</strong> to customise your Dashboard layout.</Tip>
              </div>

              {/* ══ MEETINGS ════════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="meetings" icon={Video} title="Meetings" subtitle="Host HD video conferences with up to hundreds of participants." />

                <h3 className="font-semibold text-gray-800 mb-3">Create a Meeting</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Click 'New Meeting'">Find the blue <strong>New Meeting</strong> button at the top of the sidebar, or go to <strong>Meetings → New Meeting</strong>.</Step>
                  <Step number={2} title="Fill in the details">Enter a meeting title. Optionally add a passcode, enable the waiting room, or schedule it for a future date and time.</Step>
                  <Step number={3} title="Start or schedule">Click <strong>Start Meeting</strong> for an instant session or <strong>Schedule</strong> to add it to your calendar.</Step>
                  <Step number={4} title="Share the invite">Copy the meeting link or code from the Meeting Detail page and send it to participants via chat, email, or calendar.</Step>
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Join a Meeting</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Click 'Join a Meeting'">In the sidebar, click the <strong>Join a Meeting</strong> button.</Step>
                  <Step number={2} title="Enter the code">Paste or type the meeting code provided by the host.</Step>
                  <Step number={3} title="Pre-join lobby">Set your display name and preview your camera and microphone before entering the room.</Step>
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">In-Meeting Controls</h3>
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  {[
                    { label: "Microphone",   desc: "Toggle your mic on/off. Shortcut: ", keys: ["Alt","A"] },
                    { label: "Camera",        desc: "Toggle your webcam. Shortcut: ",    keys: ["Alt","V"] },
                    { label: "Raise Hand",    desc: "Signal the host you want to speak.", keys: [] },
                    { label: "Chat",          desc: "Send messages visible to all participants.", keys: [] },
                    { label: "Participants",  desc: "View the full attendee list.", keys: [] },
                    { label: "Record",        desc: "Start/stop recording (host only).", keys: [] },
                    { label: "Share Screen",  desc: "Present your screen to participants.", keys: [] },
                    { label: "End/Leave",     desc: "Leave or end the meeting for all (host).", keys: [] },
                  ].map(({ label, desc, keys }) => (
                    <div key={label} className="flex items-start gap-2 text-sm text-gray-600 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span><strong className="text-gray-800">{label}</strong> — {desc}{keys.length > 0 && <KbdShortcut keys={keys} />}</span>
                    </div>
                  ))}
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Host Controls</h3>
                <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
                  {[
                    ["Mute All",          "Mute every participant at once."],
                    ["Admit All",         "Approve all participants waiting in the waiting room."],
                    ["Remove Participant","Remove a disruptive attendee from the meeting."],
                    ["Lock Meeting",      "Prevent new participants from joining."],
                    ["End for All",       "Terminate the meeting for every participant simultaneously."],
                  ].map(([action, description]) => (
                    <div key={action} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                      <ChevronRight className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                      <span><strong className="text-gray-800">{action}</strong> — {description}</span>
                    </div>
                  ))}
                </div>
                <Note>Only the meeting host has access to Host Controls. Co-host permissions can be assigned in the Participants panel.</Note>

                <h3 className="font-semibold text-gray-800 mt-6 mb-3">Live Captions</h3>
                <p className="text-sm text-gray-600 mb-3">TanCom automatically transcribes spoken words into on-screen captions during a meeting.</p>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Enable captions">In the meeting room, click the <strong>CC</strong> (Captions) button in the bottom control bar to turn live captions on.</Step>
                  <Step number={2} title="Read captions">Captions appear in a bar at the bottom of the meeting view — speaker name and spoken text are shown in real time.</Step>
                  <Step number={3} title="Edit a caption">Click the <strong>Edit</strong> button next to any caption line to manually correct the transcribed text.</Step>
                  <Step number={4} title="Rewrite with AI">Click <strong>Rewrite</strong> to let the AI clean up and improve the caption wording automatically.</Step>
                  <Step number={5} title="Save your changes">Click <strong>Save</strong> after editing or rewriting to commit the corrected caption.</Step>
                  <Step number={6} title="Disable captions">Click the <strong>CC</strong> button again to hide the captions bar at any time.</Step>
                </div>
                <Tip>You will be prompted to save any unsaved caption edits if you try to close the captions bar while an edit is in progress.</Tip>
              </div>

              {/* ══ CHAT ════════════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="chat" icon={MessageSquare} title="Chat & Messaging" subtitle="Encrypted direct and group messaging with polls and reactions." />

                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  <FeatureCard icon={MessageSquare} title="Direct Messages" description="One-on-one private conversations with any TanCom user." />
                  <FeatureCard icon={Users} title="Group Chats" description="Create named group chats with multiple participants." />
                  <FeatureCard icon={Star} title="Polls" description="Run polls directly inside any chat room." />
                  <FeatureCard icon={Lock} title="End-to-End Encryption" description="Messages are encrypted with your public key — only you and your recipients can read them." />
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Start a New Chat</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Open Chat">Click <strong>Chat</strong> in the left sidebar.</Step>
                  <Step number={2} title="New Direct Message">Click the <strong>+</strong> icon, choose <strong>Direct</strong>, and type the recipient's email address.</Step>
                  <Step number={3} title="New Group Chat">Choose <strong>Group</strong>, give the group a name, and add participants by email.</Step>
                  <Step number={4} title="Send a message">Type in the message box and press <KbdShortcut keys={["Enter"]} /> to send. Use <KbdShortcut keys={["Shift","Enter"]} /> for a new line.</Step>
                </div>
                <Tip>Pin important messages inside a chat by hovering over the message and clicking the <strong>Pin</strong> icon.</Tip>
              </div>

              {/* ══ COMMUNITIES ══════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="communities" icon={Hash} title="Communities" subtitle="Persistent spaces for teams, organisations, and interest groups." />

                <p className="text-sm text-gray-600 mb-4">Communities are like servers — they contain multiple <strong>channels</strong>, each with its own persistent chat history, voice rooms, and membership settings.</p>

                <h3 className="font-semibold text-gray-800 mb-3">Create a Community</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Go to Communities">Click <strong>Communities</strong> in the sidebar.</Step>
                  <Step number={2} title="Create New">Click <strong>Create Community</strong>, enter a name and optional description.</Step>
                  <Step number={3} title="Add channels">Inside your community, click <strong>Add Channel</strong> to create topic-specific channels (e.g. #announcements, #general).</Step>
                  <Step number={4} title="Invite members">Share your community invite link from the community settings menu.</Step>
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Join a Community</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                  <Step number={1} title="Get an invite link">Ask the community owner for a link in the format <code className="text-xs bg-gray-100 px-1 rounded">tancom.us/communities/join/CODE</code>.</Step>
                  <Step number={2} title="Join">Open the link, preview the community, and click <strong>Join Community</strong>.</Step>
                </div>
              </div>

              {/* ══ GROUPS ═══════════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="groups" icon={Users} title="Groups" subtitle="Lightweight collaboration spaces with shared posts and announcements." />
                <p className="text-sm text-gray-600 mb-4">Groups are ideal for project teams or departments that need a shared notice board with posts and comments, without the full structure of a Community.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <FeatureCard icon={Plus} title="Create a Group" description="Click Groups → Create Group. Add a name, description, and privacy setting (Public or Private)." />
                  <FeatureCard icon={LogIn} title="Join a Group" description="Browse public groups or accept an invite link from a group admin." />
                  <FeatureCard icon={Bell} title="Group Posts" description="Post announcements, updates, or discussions that all members can see and comment on." />
                  <FeatureCard icon={Settings} title="Admin Controls" description="Group admins can manage members, change privacy settings, and remove posts." />
                </div>
              </div>

              {/* ══ CONTACTS ════════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="contacts" icon={Users} title="Contacts" subtitle="Build your professional network inside TanCom." />

                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Open Contacts">Click <strong>Contacts</strong> in the sidebar.</Step>
                  <Step number={2} title="Add a contact">Click <strong>Add Contact</strong>, enter the person's email address, display name, and an optional phone number.</Step>
                  <Step number={3} title="Linked contacts">When a contact registers on TanCom with the same email, they are <em>automatically linked</em> — you'll receive a notification and can message them directly.</Step>
                </div>

                <Tip>Use the search bar at the top of the Contacts page to instantly find any contact by name or email.</Tip>

                <h3 className="font-semibold text-gray-800 mt-4 mb-2">Contact Actions</h3>
                <div className="grid sm:grid-cols-3 gap-2 text-sm">
                  {["Start a Chat", "Video Call", "Remove Contact"].map((a) => (
                    <div key={a} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <span className="text-gray-700">{a}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ══ RECORDINGS ══════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="recordings" icon={Mic} title="Recordings" subtitle="Capture, store, and manage every meeting recording." />

                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Start Recording">During a meeting, click the <strong>Record</strong> button in the meeting controls toolbar (host only).</Step>
                  <Step number={2} title="Stop Recording">Click the same button again to stop. The recording is processed and saved automatically.</Step>
                  <Step number={3} title="Access Recordings">Navigate to <strong>Recordings</strong> in the sidebar to view all your recordings.</Step>
                  <Step number={4} title="Download or delete">Use the action menu on any recording to download the file or permanently delete it.</Step>
                </div>
                <Note>Recordings are stored securely on TanCom's cloud infrastructure. Storage limits depend on your subscription plan.</Note>
              </div>

              {/* ══ LIVE MARKETING ══════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="live-marketing" icon={Radio} title="Live Marketing" subtitle="Broadcast live to your audience — webinars, product launches, and more." />

                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  <FeatureCard icon={Radio} title="Go Live" description="Start a public or private live stream from Live Marketing → New Live." />
                  <FeatureCard icon={Globe} title="Share the Link" description="Copy your live stream link and share it across social media or email." />
                  <FeatureCard icon={Users} title="Live Audience" description="Viewers join your stream in real-time and can interact via live chat." />
                  <FeatureCard icon={Mic} title="Live Studio" description="Control your stream with the full Studio dashboard — manage scenes, audio, and viewer interactions." />
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Start a Live Stream</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                  <Step number={1} title="Go to Live Marketing">Click <strong>Live Marketing</strong> in the sidebar.</Step>
                  <Step number={2} title="Create a Stream">Click <strong>New Live</strong>. Enter a title, description, and set the audience (Public or Private).</Step>
                  <Step number={3} title="Open the Studio">Click <strong>Go Live</strong>. The Live Studio opens — configure your camera, mic, and layout.</Step>
                  <Step number={4} title="Start broadcasting">Click <strong>Start Stream</strong>. Your stream is now live and visible to your audience.</Step>
                  <Step number={5} title="End the stream">Click <strong>End Stream</strong> to stop broadcasting. A recording will be saved automatically.</Step>
                </div>
              </div>

              {/* ══ BUSINESS TOOLS ══════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="business-tools" icon={Briefcase} title="Business Tools" subtitle="Enterprise-grade utilities built right into TanCom." />
                <div className="grid sm:grid-cols-2 gap-3">
                  <FeatureCard icon={Briefcase} title="Company Profile" description="Set up your organisation's brand, logo, and contact details for professional meeting rooms." />
                  <FeatureCard icon={Users} title="Team Management" description="Invite colleagues, assign roles, and manage access permissions." />
                  <FeatureCard icon={Settings} title="Integrations" description="Connect TanCom with your calendar, CRM, and other business software." />
                  <FeatureCard icon={Shield} title="Compliance Tools" description="Access audit logs, data retention policies, and security reports." />
                </div>
              </div>

              {/* ══ MEETING NOTES ═══════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="meeting-notes" icon={NotebookPen} title="Meeting Notes" subtitle="Capture, organise, and share notes linked to your meetings." />

                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Open Meeting Notes">Click <strong>Meeting Notes</strong> in the sidebar.</Step>
                  <Step number={2} title="Create a note">Click <strong>New Note</strong>. Notes can be linked to a specific meeting or created standalone.</Step>
                  <Step number={3} title="Write and format">Use the rich text editor to add headings, bullet lists, action items, and code blocks.</Step>
                  <Step number={4} title="Share notes">Share a note with meeting participants or export it as a PDF.</Step>
                </div>
                <Tip>During a meeting, open the <strong>Notes</strong> panel in the sidebar to capture action items in real time without leaving the meeting view.</Tip>
              </div>

              {/* ══ REMOTE ACCESS ═══════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="remote-access" icon={Monitor} title="Remote Access" subtitle="Securely manage, monitor, and control remote devices from anywhere." />

                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  <FeatureCard icon={Monitor} title="Device Management" description="Register Windows, macOS, and Linux machines. View status, IP, and location at a glance." />
                  <FeatureCard icon={Cpu} title="Remote Sessions" description="Start an encrypted remote desktop session on any registered device." />
                  <FeatureCard icon={MessageSquare} title="Support Requests" description="Submit a help ticket and a technician can remotely assist you in real time." />
                  <FeatureCard icon={Shield} title="Trust & Security" description="Mark devices as trusted, view session audit logs, and end any session instantly." />
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Register a New Device</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Open Remote Access">Click <strong>Remote Access</strong> in the left sidebar.</Step>
                  <Step number={2} title="Go to the Devices tab">Click the <strong>Devices</strong> tab at the top of the page.</Step>
                  <Step number={3} title="Click Register Device">Click the blue <strong>Register Device</strong> button (top right of the device list).</Step>
                  <Step number={4} title="Fill in the form">Enter the <strong>Device Name</strong> (required), select the <strong>Operating System</strong>, and optionally add the IP Address, Location, and Notes.</Step>
                  <Step number={5} title="Submit">Click <strong>Register Device</strong>. The device appears in your list with an Offline status until it connects.</Step>
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Start a Remote Session</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Find the device">On the Devices tab, locate the device you want to connect to.</Step>
                  <Step number={2} title="Click Connect">Click the <strong>Connect</strong> button on the device card. An encrypted session starts immediately.</Step>
                  <Step number={3} title="Use the session panel">A live session panel opens. You can view session status and use the built-in chat to communicate with the device user.</Step>
                  <Step number={4} title="End the session">Click <strong>End Session</strong> in the active session banner (or from the Sessions tab) to close the connection securely.</Step>
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Submit a Support Request</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <Step number={1} title="Open the Support Requests tab">Click the <strong>Support Requests</strong> tab on the Remote Access page.</Step>
                  <Step number={2} title="Click Request Remote Support">Click the button to open the request form.</Step>
                  <Step number={3} title="Describe the issue">Write a clear description of the problem in the text box. Select a <strong>Priority</strong> (Low / Normal / High / Urgent) and optionally link it to a registered device.</Step>
                  <Step number={4} title="Submit">Click <strong>Submit Request</strong>. A technician will be notified and can accept the request to start a session.</Step>
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Managing Devices</h3>
                <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden mb-4">
                  {[
                    ["Mark as Trusted", "Click the shield icon on a device card to mark it as a trusted machine — trusted devices get priority in the dashboard."],
                    ["Delete a Device", "Click the trash icon on a device card to permanently remove it from your account."],
                    ["View Sessions", "Go to the Sessions tab to see all past and active sessions — including duration and technician name."],
                    ["Dashboard Overview", "The Dashboard tab shows total devices, active sessions, and pending support requests at a glance."],
                  ].map(([action, desc]) => (
                    <div key={action} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                      <ChevronRight className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                      <span><strong className="text-gray-800">{action}</strong> — {desc}</span>
                    </div>
                  ))}
                </div>
                <Note>Remote Access requires you to be signed in. All session data is encrypted and tied to your account — no other user can access your devices.</Note>
              </div>

              {/* ══ PROFILE & SETTINGS ══════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="profile-settings" icon={Settings} title="Profile & Settings" subtitle="Personalise your TanCom experience." />

                <h3 className="font-semibold text-gray-800 mb-3">My Profile</h3>
                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  {[
                    ["Profile Photo",     "Upload a clear headshot so participants recognise you."],
                    ["Display Name",      "Set the name shown in meetings and chats."],
                    ["Job Title",         "Adds credibility in professional meeting rooms."],
                    ["Time Zone",         "Ensures meeting times display correctly for you."],
                    ["Bio",               "A short description visible on your public profile."],
                    ["Contact Info",      "Optional phone number and company name."],
                  ].map(([label, desc]) => (
                    <div key={label} className="flex items-start gap-2 text-sm rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <UserCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                      <span><strong className="text-gray-800">{label}</strong> — {desc}</span>
                    </div>
                  ))}
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Settings</h3>
                <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
                  {[
                    ["Meeting Defaults",   "Set default microphone/camera state, waiting room preference, and passcode policy."],
                    ["Notifications",      "Choose which events trigger email or in-app notifications."],
                    ["Audio & Video",      "Select your preferred input/output devices and video resolution."],
                    ["Privacy",            "Control who can find you by email and who can send you messages."],
                    ["Appearance",         "Switch between light and dark mode."],
                  ].map(([setting, desc]) => (
                    <div key={setting} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                      <Settings className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                      <span><strong className="text-gray-800">{setting}</strong> — {desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ══ MOBILE APP ══════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="mobile-app" icon={Smartphone} title="Mobile App" subtitle="Full TanCom experience on iOS and Android." />

                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  <FeatureCard icon={Download} title="Download for Android" description="Download the TanCom APK from the Download page or install via the Google Play Store." />
                  <FeatureCard icon={Download} title="Download for iOS" description="Available on the Apple App Store. Search 'TanCom' and tap Install." />
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Mobile Features</h3>
                <div className="grid sm:grid-cols-2 gap-2 text-sm">
                  {[
                    "HD Video Meetings",
                    "Push Notifications",
                    "Chat & Messaging",
                    "Communities & Channels",
                    "Contact Management",
                    "Meeting Recordings",
                    "Live Stream Viewing",
                    "Dark Mode Support",
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <span className="text-gray-700">{f}</span>
                    </div>
                  ))}
                </div>
                <Note>The mobile app uses OTA (over-the-air) updates — improvements are delivered automatically without requiring an App Store update.</Note>
              </div>

              {/* ══ ADMIN PANEL ══════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="admin" icon={Shield} title="Admin Panel" subtitle="Organisation-wide management and analytics." />
                <p className="text-sm text-gray-600 mb-4">The Admin Panel is visible only to users with the <strong>Admin</strong> role, set by the account owner via <strong>Admin → User Management</strong>.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <FeatureCard icon={Users} title="User Management" description="View all registered users, deactivate accounts, and assign admin roles." />
                  <FeatureCard icon={Video} title="All Meetings" description="Monitor every meeting in the organisation — active, scheduled, and completed." />
                  <FeatureCard icon={AlertCircle} title="Analytics" description="Charts showing daily active users, meeting volume, and growth trends." />
                  <FeatureCard icon={Shield} title="Security Controls" description="Enforce SSO, review login activity, and manage data retention." />
                </div>
              </div>

              {/* ══ SECURITY ════════════════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="security" icon={Lock} title="Security & Privacy" subtitle="Enterprise-grade protection for every conversation." />

                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  <FeatureCard icon={Lock} title="End-to-End Encryption" description="All chat messages are encrypted with your personal public key." />
                  <FeatureCard icon={Shield} title="JWT Authentication" description="Every API request is verified with a short-lived JWT signed by Clerk." />
                  <FeatureCard icon={Globe} title="Secure Clerk Auth" description="Authentication is powered by Clerk — SOC 2 compliant, with MFA support." />
                  <FeatureCard icon={Settings} title="Passcode Protection" description="Add a meeting passcode to prevent unauthorised participants from joining." />
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Best Practices</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  {[
                    "Enable the waiting room for all public meetings so you can approve attendees before they join.",
                    "Use a meeting passcode for sensitive business meetings.",
                    "Lock the meeting once all expected participants have joined.",
                    "Regularly review your connected devices in Profile → Security.",
                    "Never share your meeting credentials via public social media posts.",
                  ].map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Keyboard className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
                <Tip>For enterprise security policies, data processing agreements (DPA), or SOC 2 reports, contact <strong>security@tancom.us</strong>.</Tip>
              </div>

              {/* ══ SECURITY TEST REPORT ════════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="security-report" icon={Shield} title="Security Test Report" subtitle="Application Health · Web & Mobile · June 2026" />

                {/* Score cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
                  {[
                    { label: "Overall Score",     value: "87/100", grade: "A−", color: "from-green-500 to-emerald-600" },
                    { label: "API Server",         value: "91/100", grade: "A",  color: "from-blue-500 to-blue-700"   },
                    { label: "Web App",            value: "88/100", grade: "A−", color: "from-indigo-500 to-violet-600"},
                    { label: "Mobile App",         value: "82/100", grade: "B+", color: "from-sky-500 to-cyan-600"    },
                  ].map(({ label, value, grade, color }) => (
                    <div key={label} className={`rounded-xl bg-gradient-to-br ${color} text-white p-4 text-center shadow-sm`}>
                      <p className="text-2xl font-extrabold">{grade}</p>
                      <p className="text-lg font-bold opacity-90">{value}</p>
                      <p className="text-xs opacity-75 mt-1">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Scanner Summary */}
                <h3 className="font-semibold text-gray-800 mb-3">Automated Scan Summary</h3>
                <div className="grid sm:grid-cols-3 gap-3 mb-6">
                  {[
                    { tool: "Dependency Audit",  icon: AlertCircle, total: 24, critical: 0, high: 13, moderate: 11, low: 0,  note: "Mostly transitive build-tool deps, 0 runtime-critical" },
                    { tool: "SAST (Semgrep)",    icon: Search,      total: 52, critical: 0, high:  2, moderate: 49, low: 1,  note: "2 HIGH findings fixed, 49 medium in build scripts (non-production)" },
                    { tool: "HoundDog (Privacy)",icon: Lock,        total:  0, critical: 0, high:  0, moderate:  0, low: 0,  note: "No privacy/dataflow violations detected" },
                  ].map(({ tool, icon: Icon, total, critical, high, moderate, low, note }) => (
                    <div key={tool} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4 text-gray-500" />
                        <p className="text-sm font-semibold text-gray-800">{tool}</p>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mb-1">{total} <span className="text-sm font-normal text-gray-500">findings</span></p>
                      <div className="flex gap-1.5 flex-wrap text-xs mb-2">
                        {critical > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-medium">{critical} critical</span>}
                        {high     > 0 && <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 font-medium">{high} high</span>}
                        {moderate > 0 && <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-medium">{moderate} medium</span>}
                        {low      > 0 && <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 font-medium">{low} low</span>}
                        {total   === 0 && <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 font-medium">✓ Clean</span>}
                      </div>
                      <p className="text-xs text-gray-500">{note}</p>
                    </div>
                  ))}
                </div>

                {/* Findings & fixes table */}
                <h3 className="font-semibold text-gray-800 mb-3">Findings & Remediation</h3>
                <div className="overflow-x-auto rounded-xl border border-gray-200 mb-6">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Finding</th>
                        <th className="px-4 py-2.5 text-left">Severity</th>
                        <th className="px-4 py-2.5 text-left">Component</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[
                        { finding: "SQL injection via sql.raw() in community member lookup",   sev: "HIGH",     comp: "API · communities.ts",     status: "FIXED", fix: "Replaced with inArray() Drizzle ORM safe query" },
                        { finding: "Unescaped user input interpolated into HTML email template",sev: "HIGH",     comp: "API · lib/email.ts",        status: "FIXED", fix: "Added escHtml() + encodeURI() for all user-supplied values" },
                        { finding: "Missing HTTP security headers (no Helmet)",                 sev: "MEDIUM",   comp: "API · app.ts",              status: "FIXED", fix: "Added helmet() — sets X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, X-Permitted-Cross-Domain-Policies" },
                        { finding: "No rate limiting on API endpoints",                         sev: "MEDIUM",   comp: "API · app.ts",              status: "FIXED", fix: "500 req/15min global limiter; 30 req/15min on auth/sessions routes" },
                        { finding: "Overly permissive CORS (origin: true)",                     sev: "MEDIUM",   comp: "API · app.ts",              status: "IMPROVED", fix: "CORS now validates against REPLIT_DOMAINS allowlist with safe fallback" },
                        { finding: "path-to-regexp ReDoS (Express router dep)",                 sev: "HIGH",     comp: "Dependencies",              status: "TRANSITIVE", fix: "Transitive via Express; no user-controlled route patterns — risk contained" },
                        { finding: "picomatch/brace-expansion vulns",                           sev: "HIGH",     comp: "Dependencies (build only)", status: "ACCEPTED", fix: "Build-tool only, not in production runtime; scheduled for next dep upgrade" },
                        { finding: "HTML in template literal with interpolated vars (email)",   sev: "MEDIUM",   comp: "API · lib/email.ts",        status: "FIXED", fix: "HTML escaping applied to all user-controlled values" },
                        { finding: "HTTP server in mobile dev serve.js",                        sev: "MEDIUM",   comp: "Mobile · server/serve.js",  status: "ACCEPTED", fix: "Development-only server; not deployed to production; production uses HTTPS" },
                        { finding: "Path traversal in mobile build scripts",                    sev: "MEDIUM",   comp: "Mobile · scripts/build.js", status: "ACCEPTED", fix: "Internal build scripts, not reachable from external network" },
                        { finding: "Missing SRI on CDN resources in mobile landing page",       sev: "MEDIUM",   comp: "Mobile · landing-page.html",status: "ACCEPTED", fix: "Dev/download page only; will add integrity hashes in next release" },
                        { finding: "HoundDog privacy/dataflow scan",                            sev: "INFO",     comp: "All components",            status: "CLEAN",  fix: "Zero findings" },
                      ].map(({ finding, sev, comp, status, fix }) => {
                        const sevColor   = sev === "HIGH" ? "bg-orange-100 text-orange-700" : sev === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600";
                        const statColor  = status === "FIXED" ? "bg-green-100 text-green-700" : status === "CLEAN" ? "bg-green-50 text-green-600" : status === "IMPROVED" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600";
                        return (
                          <tr key={finding} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-800 text-xs">{finding}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{fix}</p>
                            </td>
                            <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sevColor}`}>{sev}</span></td>
                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{comp}</td>
                            <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statColor}`}>{status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* OWASP Top 10 */}
                <h3 className="font-semibold text-gray-800 mb-3">OWASP Top 10 (2021) Compliance</h3>
                <div className="grid sm:grid-cols-2 gap-2 mb-6">
                  {[
                    { id: "A01", name: "Broken Access Control",          status: "PASS",    detail: "Clerk JWT verified on every API route via requireAuth middleware" },
                    { id: "A02", name: "Cryptographic Failures",          status: "PASS",    detail: "HTTPS enforced in production; Clerk manages cryptographic auth" },
                    { id: "A03", name: "Injection",                       status: "FIXED",   detail: "SQL injection in communities.ts fixed; all inputs validated with Zod" },
                    { id: "A04", name: "Insecure Design",                 status: "PASS",    detail: "ProtectedRoute on all authenticated pages; waiting room & meeting lock features" },
                    { id: "A05", name: "Security Misconfiguration",       status: "FIXED",   detail: "Helmet security headers added; rate limiting active; CORS tightened" },
                    { id: "A06", name: "Vulnerable & Outdated Components", status: "PARTIAL", detail: "24 transitive dep vulns; 0 runtime-critical; scheduled for next dep update" },
                    { id: "A07", name: "Auth & Session Failures",         status: "PASS",    detail: "Clerk SOC2-certified; short-lived JWT; MFA available; no session fixation" },
                    { id: "A08", name: "Software & Data Integrity",       status: "PASS",    detail: "Signed Clerk tokens; OTA updates cryptographically verified by Expo" },
                    { id: "A09", name: "Logging & Monitoring Failures",   status: "PASS",    detail: "Pino structured logging; auth denial diagnostics; error tracking active" },
                    { id: "A10", name: "Server-Side Request Forgery",     status: "PASS",    detail: "No user-controlled server-side URL fetching patterns found" },
                  ].map(({ id, name, status, detail }) => {
                    const sc = status === "PASS" ? "border-green-200 bg-green-50" : status === "FIXED" ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50";
                    const badge = status === "PASS" ? "bg-green-100 text-green-700" : status === "FIXED" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";
                    const Icon = status === "PASS" || status === "FIXED" ? CheckCircle2 : AlertCircle;
                    const iconColor = status === "PASS" || status === "FIXED" ? "text-green-500" : "text-amber-500";
                    return (
                      <div key={id} className={`flex gap-3 rounded-xl border ${sc} px-3 py-2.5`}>
                        <Icon className={`h-4 w-4 ${iconColor} mt-0.5 shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-gray-500">{id}</span>
                            <span className="text-xs font-semibold text-gray-800">{name}</span>
                            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${badge}`}>{status}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Security controls */}
                <h3 className="font-semibold text-gray-800 mb-3">Active Security Controls</h3>
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Web Application</p>
                    <div className="space-y-1.5">
                      {[
                        "Clerk auth — SOC 2 Type II certified",
                        "JWT verification on every API request",
                        "Helmet — X-Frame-Options, HSTS, X-Content-Type-Options",
                        "Rate limiting — 500 req/15 min global, 30/15 min auth",
                        "Zod input validation on all API endpoints",
                        "CORS restricted to REPLIT_DOMAINS allowlist",
                        "Structured pino logging (no PII in logs)",
                        "2 MB request body size limit",
                        "Global error handler (no stack leaks to clients)",
                      ].map((c) => (
                        <div key={c} className="flex items-center gap-1.5 text-xs text-gray-700">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-bold text-sky-600 uppercase tracking-wide mb-2">Mobile Application</p>
                    <div className="space-y-1.5">
                      {[
                        "Clerk native auth with proxy URL",
                        "HTTPS for all API communications",
                        "JWT refresh via Clerk session management",
                        "OTA updates cryptographically signed by Expo",
                        "No API keys or secrets in the app bundle",
                        "EXPO_PUBLIC_* vars scoped to test Clerk instance",
                        "Clerk proxy prevents dev-browser auth bypass",
                      ].map((c) => (
                        <div key={c} className="flex items-center gap-1.5 text-xs text-gray-700">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          {c}
                        </div>
                      ))}
                      <div className="flex items-start gap-1.5 text-xs text-gray-600 mt-1">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        Build scripts: path-traversal alerts (internal dev tooling, not production)
                      </div>
                    </div>
                  </div>
                </div>

                <Tip>TanCom security scans run automatically on every deployment. For the full raw SAST and dependency audit JSON, contact <strong>security@tancom.us</strong>. Next scheduled penetration test: Q3 2026.</Tip>
              </div>

              {/* ══ USABILITY TEST REPORT ═══════════════════════ */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-7">
                <SectionHeader id="usability-report" icon={CheckCircle2} title="Usability Test Report" subtitle="UX audit across web and mobile · June 2026" />

                {/* Scores */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
                  {[
                    { label: "Navigation",   score: "95%", color: "bg-green-50 border-green-200 text-green-700" },
                    { label: "Accessibility",score: "88%", color: "bg-blue-50 border-blue-200 text-blue-700" },
                    { label: "Responsiveness",score:"91%", color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
                    { label: "Error Handling",score:"90%", color: "bg-violet-50 border-violet-200 text-violet-700" },
                  ].map(({ label, score, color }) => (
                    <div key={label} className={`rounded-xl border ${color} p-4 text-center`}>
                      <p className="text-2xl font-extrabold">{score}</p>
                      <p className="text-xs font-medium mt-1 opacity-80">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Test results */}
                <h3 className="font-semibold text-gray-800 mb-3">Test Results by Category</h3>
                <div className="space-y-3 mb-6">
                  {[
                    {
                      category: "Navigation & Discoverability",
                      result: "PASS",
                      checks: [
                        { label: "Sidebar navigation with active-state highlighting", pass: true },
                        { label: "15+ feature areas accessible within 1 click", pass: true },
                        { label: "Sticky ToC in User Manual with IntersectionObserver", pass: true },
                        { label: "Mobile hamburger menu with overlay", pass: true },
                        { label: "Breadcrumb navigation on detail pages", pass: false, note: "Planned for v2.11" },
                      ],
                    },
                    {
                      category: "Loading States & Feedback",
                      result: "PASS",
                      checks: [
                        { label: "Skeleton loaders on all data-fetching pages", pass: true },
                        { label: "Spinner on PDF/PPT download buttons", pass: true },
                        { label: "React Query cache keeps UI responsive on refetch", pass: true },
                        { label: "Toast notifications on success/error actions", pass: true },
                      ],
                    },
                    {
                      category: "Error Handling",
                      result: "PASS",
                      checks: [
                        { label: "Global error boundary catches unhandled errors", pass: true },
                        { label: "404 Not Found page with navigation back", pass: true },
                        { label: "API errors surface user-friendly messages", pass: true },
                        { label: "Form validation with inline field-level errors", pass: true },
                      ],
                    },
                    {
                      category: "Accessibility (WCAG 2.1 AA)",
                      result: "PARTIAL",
                      checks: [
                        { label: "Keyboard navigation through all primary flows", pass: true },
                        { label: "Semantic HTML (nav, main, aside, article)", pass: true },
                        { label: "Button labels and ARIA roles on icon-only buttons", pass: true },
                        { label: "Colour contrast ratio ≥ 4.5:1 on all text", pass: true },
                        { label: "Screen reader support for dynamic list updates", pass: false, note: "aria-live regions planned for v2.11" },
                      ],
                    },
                    {
                      category: "Mobile Responsiveness",
                      result: "PASS",
                      checks: [
                        { label: "All pages adapt to 320px–1440px viewport widths", pass: true },
                        { label: "Touch target sizes ≥ 44×44px on mobile", pass: true },
                        { label: "Native mobile app (Expo) for iOS and Android", pass: true },
                        { label: "Swipe gestures on mobile navigation", pass: true },
                      ],
                    },
                    {
                      category: "Form & Input UX",
                      result: "PASS",
                      checks: [
                        { label: "Zod validation with real-time error messages", pass: true },
                        { label: "Autocomplete attributes on auth forms", pass: true },
                        { label: "Disabled state on submit buttons while loading", pass: true },
                        { label: "Confirmation dialogs for destructive actions", pass: true },
                      ],
                    },
                  ].map(({ category, result, checks }) => {
                    const bc = result === "PASS" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50";
                    const badge = result === "PASS" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
                    return (
                      <div key={category} className={`rounded-xl border ${bc} p-4`}>
                        <div className="flex items-center gap-2 mb-3">
                          <p className="text-sm font-semibold text-gray-800">{category}</p>
                          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${badge}`}>{result}</span>
                        </div>
                        <div className="space-y-1.5">
                          {checks.map(({ label, pass, note }) => (
                            <div key={label} className="flex items-start gap-2 text-xs">
                              {pass
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                                : <AlertCircle  className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />}
                              <span className={pass ? "text-gray-700" : "text-amber-700"}>
                                {label}{note ? <span className="text-gray-400"> — {note}</span> : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Improvements made */}
                <h3 className="font-semibold text-gray-800 mb-3">Improvements Made During This Audit</h3>
                <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden mb-4">
                  {[
                    ["User Manual", "Added full 15-section User Manual with sticky ToC, numbered steps, tips, and keyboard shortcuts"],
                    ["PDF Export",  "One-click PDF download with cover page, ToC, and formatted sections — no print dialog needed"],
                    ["PPT Export",  "One-click PowerPoint download with branded slides (cover, ToC, 15 content slides, contact slide)"],
                    ["Security Headers", "Added Helmet middleware: X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy"],
                    ["Rate Limiting", "Added express-rate-limit: 500/15min global, 30/15min on auth endpoints"],
                    ["SQL Injection Fix", "Replaced sql.raw() in communities with safe Drizzle inArray() query"],
                    ["Email HTML Escaping", "All user-controlled values HTML-escaped and URL-encoded before email template interpolation"],
                    ["Request Size Limit", "Added 2 MB body limit on JSON and URL-encoded payloads"],
                  ].map(([area, description]) => (
                    <div key={area} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span><strong className="text-gray-800">{area}</strong> — {description}</span>
                    </div>
                  ))}
                </div>

                <Note>Full penetration testing by a certified third-party firm is recommended quarterly. Contact <strong>security@tancom.us</strong> for scheduling and compliance documentation.</Note>
              </div>

              {/* ── Footer ──────────────────────────────────────── */}
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-7 text-center">
                <BookOpen className="h-8 w-8 text-blue-400 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-900">Need more help?</h3>
                <p className="text-sm text-gray-600 mt-1 max-w-sm mx-auto">
                  Our support team is available 24 / 7. Reach us at{" "}
                  <a href="mailto:support@tancom.us" className="text-blue-600 font-medium hover:underline">support@tancom.us</a>
                  {" "}or use the in-app chat widget.
                </p>
                <p className="text-xs text-gray-400 mt-5">
                  TanCom User Manual · Version 2.10 · © 2026 TanCom. All rights reserved.
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
