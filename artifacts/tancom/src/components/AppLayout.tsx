import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useUser, UserButton, useClerk } from "@clerk/react";
import { useOwnerRole } from "@/hooks/useOwnerRole";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Video,
  Mic,
  Users,
  Settings,
  Shield,
  Menu,
  X,
  Plus,
  LogIn,
  LogOut,
  UsersRound,
  MessageSquare,
  Hash,
  UserCircle,
  Briefcase,
  Radio,
  NotebookPen,
  Crown,
  BookOpen,
  Monitor,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import tancomLogo from "@assets/TanCom_Logo_1780923314837.jpeg";
import JoinMeetingModal from "@/components/JoinMeetingModal";
import NotificationBell from "@/components/NotificationBell";
import IncomingCallBanner from "@/components/IncomingCallBanner";
import Footer from "@/components/Footer";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/meeting-notes", label: "Meeting Notes", icon: NotebookPen },
  { href: "/recordings", label: "Recordings", icon: Mic },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/groups", label: "Groups", icon: UsersRound },
  { href: "/communities", label: "Communities", icon: Hash },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/live", label: "Live Marketing", icon: Radio },
  { href: "/business-tools", label: "Business Tools", icon: Briefcase },
  { href: "/profile", label: "My Profile", icon: UserCircle },
  { href: "/settings",     label: "Settings",     icon: Settings  },
  { href: "/user-manual",  label: "User Manual",  icon: BookOpen  },
  { href: "/remote-access", label: "Remote Access", icon: Monitor },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  // ── Back / Forward history stack ───────────────────────────────────────────
  const stackRef = useRef<string[]>([location]);
  const ptrRef = useRef<number>(0);
  const skipRef = useRef(false);
  const [navState, setNavState] = useState({ ptr: 0, len: 1 });

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    // New navigation: truncate forward entries, push current location
    stackRef.current = [...stackRef.current.slice(0, ptrRef.current + 1), location];
    ptrRef.current = stackRef.current.length - 1;
    setNavState({ ptr: ptrRef.current, len: stackRef.current.length });
  }, [location]);

  // ── Presence heartbeat: keep last-seen fresh while the app is open ──────────
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "visible") {
        fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
      }
    };
    ping();
    const timer = setInterval(ping, 30_000);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", ping); };
  }, []);

  const canGoBack = navState.ptr > 0;
  const canGoForward = navState.ptr < navState.len - 1;

  const goBack = () => {
    if (!canGoBack) return;
    skipRef.current = true;
    ptrRef.current--;
    setNavState({ ptr: ptrRef.current, len: stackRef.current.length });
    navigate(stackRef.current[ptrRef.current]);
  };

  const goForward = () => {
    if (!canGoForward) return;
    skipRef.current = true;
    ptrRef.current++;
    setNavState({ ptr: ptrRef.current, len: stackRef.current.length });
    navigate(stackRef.current[ptrRef.current]);
  };
  // ──────────────────────────────────────────────────────────────────────────

  const isAdmin = user?.publicMetadata?.role === "admin";
  const { isProductOwner } = useOwnerRole();

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out",
          "lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center px-6 border-b border-gray-200">
          <Link href="/dashboard" className="flex items-center">
            <img src={tancomLogo} alt="TanCom.US" className="h-11 w-auto object-contain" />
          </Link>
          <button
            className="ml-auto lg:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="px-4 py-4 space-y-2">
          <Link href="/meetings/new">
            <Button className="w-full gap-2" size="sm">
              <Plus className="h-4 w-4" />
              New Meeting
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-gray-700"
            onClick={() => setJoinOpen(true)}
          >
            <LogIn className="h-4 w-4" />
            Join a Meeting
          </Button>
        </div>

        <Separator />

        {/* Nav */}
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active ? "text-blue-600" : "text-gray-500")} />
                    {item.label}
                  </div>
                </Link>
              );
            })}
            {isAdmin && (
              <Link href="/admin">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                    location === "/admin"
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <Shield className={cn("h-4 w-4", location === "/admin" ? "text-blue-600" : "text-gray-500")} />
                  Admin
                </div>
              </Link>
            )}
            {isProductOwner && (
              <Link href="/owner">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                    location === "/owner"
                      ? "bg-amber-50 text-amber-800"
                      : "text-gray-600 hover:bg-amber-50/60 hover:text-amber-800"
                  )}
                >
                  <Crown className={cn("h-4 w-4", location === "/owner" ? "text-amber-600" : "text-gray-500")} />
                  Owner Panel
                </div>
              </Link>
            )}
          </nav>
        </ScrollArea>

        {/* User */}
        <div className="border-t border-gray-200 p-4 space-y-2">
          <div className="flex items-center gap-3">
            <UserButton />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "User"}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.primaryEmailAddress?.emailAddress}
              </p>
            </div>
            <NotificationBell />
          </div>
          <button
            onClick={() => signOut({ redirectUrl: "/sign-in" })}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <JoinMeetingModal open={joinOpen} onClose={() => setJoinOpen(false)} />
      <IncomingCallBanner />

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 items-center gap-2 border-b border-gray-200 bg-white px-3">
          {/* Hamburger — mobile only */}
          <button
            className="lg:hidden text-gray-500 hover:text-gray-700 p-1"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Logo — mobile only */}
          <img src={tancomLogo} alt="TanCom.US" className="h-7 w-auto object-contain lg:hidden" />

          {/* Back / Forward */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              title="Go back"
              className={cn(
                "rounded-md p-1.5 transition-colors",
                canGoBack
                  ? "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  : "text-gray-300 cursor-default"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              title="Go forward"
              className={cn(
                "rounded-md p-1.5 transition-colors",
                canGoForward
                  ? "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  : "text-gray-300 cursor-default"
              )}
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="ml-auto lg:hidden">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
