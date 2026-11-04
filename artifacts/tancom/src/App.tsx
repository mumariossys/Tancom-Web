import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { useSessionTracking } from "@/hooks/useSessionTracking";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Import Pages
import LandingPage from "@/pages/Landing";
import DashboardPage from "@/pages/Dashboard";
import MeetingsPage from "@/pages/Meetings";
import NewMeetingPage from "@/pages/NewMeeting";
import MeetingDetailPage from "@/pages/MeetingDetail";
import PreJoinLobbyPage from "@/pages/PreJoinLobby";
import MeetingRoomPage from "@/pages/MeetingRoom";
import RecordingsPage from "@/pages/Recordings";
import ContactsPage from "@/pages/Contacts";
import GroupsPage from "@/pages/Groups";
import ChatPage from "@/pages/Chat";
import CommunitiesPage from "@/pages/Communities";
import SettingsPage from "@/pages/Settings";
import ProfilePage from "@/pages/Profile";
import OnboardingPage from "@/pages/Onboarding";
import AdminPage from "@/pages/Admin";
import BusinessToolsPage from "@/pages/BusinessTools";
import DownloadPage from "@/pages/Download";
import JoinGroupPage from "@/pages/JoinGroup";
import PrivacyPolicyPage from "@/pages/PrivacyPolicy";
import TermsOfServicePage from "@/pages/TermsOfService";
import CookiePolicyPage from "@/pages/CookiePolicy";
import ContactUsPage from "@/pages/ContactUs";
import NotFound from "@/pages/not-found";
import LiveHubPage from "@/pages/LiveHub";
import LiveNewPage from "@/pages/LiveNew";
import LiveDashboardPage from "@/pages/LiveDashboard";
import LiveStudioPage from "@/pages/LiveStudio";
import LiveWatchPage from "@/pages/LiveWatch";
import MeetingNotesPage from "@/pages/MeetingNotes";
import ProductOwnerDashboard from "@/pages/ProductOwnerDashboard";
import UserManualPage from "@/pages/UserManual";
import RemoteAccessPage from "@/pages/RemoteAccess";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  layout: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/tancom-logo.jpeg`,
  },
  variables: {
    colorPrimary: "hsl(221.2 83.2% 53.3%)",
    colorForeground: "hsl(222.2 84% 4.9%)",
    colorMutedForeground: "hsl(215.4 16.3% 46.9%)",
    colorDanger: "hsl(0 84.2% 60.2%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(222.2 84% 4.9%)",
    colorNeutral: "hsl(214.3 31.8% 91.4%)",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden border shadow-sm",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary font-medium hover:underline",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-green-600",
    alertText: "text-destructive",
    logoBox: "h-8 mb-4",
    logoImage: "h-8",
    socialButtonsBlockButton: "border border-border hover:bg-muted/50 transition-colors",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
    formFieldInput: "border-border bg-transparent text-foreground focus:ring-2 focus:ring-ring",
    footerAction: "justify-center",
    dividerLine: "bg-border",
    alert: "bg-destructive/10 text-destructive border-destructive/20",
    otpCodeFieldInput: "border-border bg-transparent text-foreground",
    formFieldRow: "mb-4",
    main: "p-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function SessionTracker() {
  useSessionTracking();
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [location] = useLocation();
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to={`/sign-in?redirect_url=${encodeURIComponent(basePath + location)}`} />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <SessionTracker />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />

            {/* Protected Routes */}
            <Route path="/dashboard">
              <ProtectedRoute component={DashboardPage} />
            </Route>
            <Route path="/meetings">
              <ProtectedRoute component={MeetingsPage} />
            </Route>
            <Route path="/meetings/new">
              <ProtectedRoute component={NewMeetingPage} />
            </Route>
            <Route path="/meetings/:id">
              <ProtectedRoute component={MeetingDetailPage} />
            </Route>
            <Route path="/meetings/:meetingCode/join">
              <ProtectedRoute component={PreJoinLobbyPage} />
            </Route>
            <Route path="/room/:meetingCode">
              <ProtectedRoute component={MeetingRoomPage} />
            </Route>
            <Route path="/recordings">
              <ProtectedRoute component={RecordingsPage} />
            </Route>
            <Route path="/contacts">
              <ProtectedRoute component={ContactsPage} />
            </Route>
            <Route path="/groups">
              <ProtectedRoute component={GroupsPage} />
            </Route>
            <Route path="/chat">
              <ProtectedRoute component={ChatPage} />
            </Route>
            <Route path="/communities">
              <ProtectedRoute component={CommunitiesPage} />
            </Route>
            <Route path="/communities/join/:code">
              <ProtectedRoute component={CommunitiesPage} />
            </Route>
            <Route path="/onboarding">
              <ProtectedRoute component={OnboardingPage} />
            </Route>
            <Route path="/business-tools">
              <ProtectedRoute component={BusinessToolsPage} />
            </Route>
            <Route path="/profile">
              <ProtectedRoute component={ProfilePage} />
            </Route>
            <Route path="/settings">
              <ProtectedRoute component={SettingsPage} />
            </Route>
            <Route path="/admin">
              <ProtectedRoute component={AdminPage} />
            </Route>
            <Route path="/download" component={DownloadPage} />
            {/* Legal & info pages — accessible without sign-in */}
            <Route path="/privacy" component={PrivacyPolicyPage} />
            <Route path="/privacy-policy" component={PrivacyPolicyPage} />
            <Route path="/terms-of-service" component={TermsOfServicePage} />
            <Route path="/cookie-policy" component={CookiePolicyPage} />
            <Route path="/contact" component={ContactUsPage} />
            <Route path="/join-group/:token" component={JoinGroupPage} />
            <Route path="/live">
              <ProtectedRoute component={LiveHubPage} />
            </Route>
            <Route path="/live/new">
              <ProtectedRoute component={LiveNewPage} />
            </Route>
            <Route path="/live/dashboard">
              <ProtectedRoute component={LiveDashboardPage} />
            </Route>
            <Route path="/live/stream/:streamKey/studio">
              <ProtectedRoute component={LiveStudioPage} />
            </Route>
            <Route path="/live/watch/:streamKey">
              <ProtectedRoute component={LiveWatchPage} />
            </Route>
            <Route path="/meeting-notes">
              <ProtectedRoute component={MeetingNotesPage} />
            </Route>
            <Route path="/owner">
              <ProtectedRoute component={ProductOwnerDashboard} />
            </Route>
            <Route path="/user-manual">
              <ProtectedRoute component={UserManualPage} />
            </Route>
            <Route path="/remote-access">
              <ProtectedRoute component={RemoteAccessPage} />
            </Route>

            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
