import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClerk, useUser, UserProfile } from "@clerk/react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Bell, Video, Shield, Palette, ExternalLink, Trash2 } from "lucide-react";

async function apiFetch(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

export default function SettingsPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const [showClerkProfile, setShowClerkProfile] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [prefs, setPrefs] = useState({
    defaultWaitingRoom: false,
    defaultMuteOnEntry: false,
    defaultVideoOffOnEntry: false,
    defaultAllowScreenShare: true,
    defaultAllowChat: true,
    emailNotifications: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const set = (k: keyof typeof prefs) => (v: boolean | string) =>
    setPrefs((p) => ({ ...p, [k]: v }));

  const save = () => toast({ title: "Settings saved" });

  const deleteAccount = async () => {
    if (!window.confirm("Permanently delete your TanCom account and associated data? This cannot be undone.")) return;
    if (!window.confirm("Final confirmation: delete your account forever?")) return;
    setDeleting(true);
    try {
      await apiFetch("/api/account", { method: "DELETE" });
      await signOut({ redirectUrl: import.meta.env.BASE_URL || "/" });
    } catch (error: any) {
      toast({ title: "Account deletion failed", description: error?.message ?? "Please try again.", variant: "destructive" });
      setDeleting(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Manage your account and preferences</p>
        </div>

        {/* Account */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {(user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "U").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{user?.fullName ?? "—"}</p>
                <p className="text-sm text-gray-500">{user?.primaryEmailAddress?.emailAddress}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowClerkProfile(true)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Edit Profile
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                Free Plan
              </Badge>
              <span className="text-gray-500">· Unlimited meetings</span>
            </div>
          </CardContent>
        </Card>

        {/* Meeting defaults */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-4 w-4" />
              Meeting Defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable waiting room</Label>
                <p className="text-xs text-gray-500">Require host approval before joining</p>
              </div>
              <Switch checked={prefs.defaultWaitingRoom} onCheckedChange={set("defaultWaitingRoom")} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Mute participants on entry</Label>
                <p className="text-xs text-gray-500">All new joiners start muted</p>
              </div>
              <Switch checked={prefs.defaultMuteOnEntry} onCheckedChange={set("defaultMuteOnEntry")} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Turn off video on entry</Label>
                <p className="text-xs text-gray-500">All new joiners start with video off</p>
              </div>
              <Switch checked={prefs.defaultVideoOffOnEntry} onCheckedChange={set("defaultVideoOffOnEntry")} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Allow screen sharing</Label>
              <Switch checked={prefs.defaultAllowScreenShare} onCheckedChange={set("defaultAllowScreenShare")} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Enable in-meeting chat</Label>
              <Switch checked={prefs.defaultAllowChat} onCheckedChange={set("defaultAllowChat")} />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Email notifications</Label>
                <p className="text-xs text-gray-500">Get notified about upcoming meetings</p>
              </div>
              <Switch checked={prefs.emailNotifications} onCheckedChange={set("emailNotifications")} />
            </div>
          </CardContent>
        </Card>

        {/* General */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" />
              General
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={prefs.timezone} onValueChange={set("timezone")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "America/New_York",
                    "America/Chicago",
                    "America/Denver",
                    "America/Los_Angeles",
                    "America/Anchorage",
                    "Pacific/Honolulu",
                    "Europe/London",
                    "Europe/Paris",
                    "Europe/Berlin",
                    "Asia/Dubai",
                    "Asia/Kolkata",
                    "Asia/Singapore",
                    "Asia/Tokyo",
                    "Australia/Sydney",
                    "Pacific/Auckland",
                  ].map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={save}>Save Settings</Button>
        </div>

        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-red-700 flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Delete Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Permanently deletes your TanCom account, private data, and resources you own. This cannot be undone.
            </p>
            <Button variant="destructive" onClick={deleteAccount} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Account Permanently"}
            </Button>
          </CardContent>
        </Card>

        {/* Clerk profile modal */}
        {showClerkProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowClerkProfile(false)}>
            <div className="bg-white rounded-2xl p-2 max-w-lg w-full max-h-screen overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <UserProfile routing="hash" />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
