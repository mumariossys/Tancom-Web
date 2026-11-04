import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmartInput, SmartTextarea } from "@/components/SmartField";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Video,
  Zap,
  Calendar,
  ArrowLeft,
  RefreshCw,
  Clock,
  Globe,
  Shield,
  Settings2,
} from "lucide-react";
import VerificationGate from "@/components/VerificationGate";
import {
  useCreateMeeting,
  getListMeetingsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import type { CreateMeetingBody } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type MeetingMode = "instant" | "scheduled" | "recurring";
type RecurrencePattern = "daily" | "weekly" | "monthly";
type RecurrenceEnd = "never" | "date" | "count";

const WEEKDAYS = [
  { label: "S", full: "Sunday", value: 0 },
  { label: "M", full: "Monday", value: 1 },
  { label: "T", full: "Tuesday", value: 2 },
  { label: "W", full: "Wednesday", value: 3 },
  { label: "T", full: "Thursday", value: 4 },
  { label: "F", full: "Friday", value: 5 },
  { label: "S", full: "Saturday", value: 6 },
];

const DURATION_OPTIONS = [
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "45 minutes", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "1 hour 30 minutes", value: 90 },
  { label: "2 hours", value: 120 },
  { label: "2 hours 30 minutes", value: 150 },
  { label: "3 hours", value: 180 },
  { label: "4 hours", value: 240 },
];

const TIMEZONE_GROUPS = [
  {
    group: "Americas",
    zones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Anchorage",
      "America/Honolulu",
      "America/Toronto",
      "America/Vancouver",
      "America/Sao_Paulo",
      "America/Mexico_City",
    ],
  },
  {
    group: "Europe",
    zones: [
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Stockholm",
      "Europe/Zurich",
      "Europe/Warsaw",
      "Europe/Istanbul",
    ],
  },
  {
    group: "Asia / Pacific",
    zones: [
      "Asia/Dubai",
      "Asia/Kolkata",
      "Asia/Dhaka",
      "Asia/Bangkok",
      "Asia/Singapore",
      "Asia/Shanghai",
      "Asia/Tokyo",
      "Asia/Seoul",
      "Australia/Sydney",
      "Pacific/Auckland",
    ],
  },
  {
    group: "Africa / Middle East",
    zones: [
      "Africa/Cairo",
      "Africa/Nairobi",
      "Africa/Lagos",
      "Africa/Johannesburg",
    ],
  },
];

function formatTz(tz: string) {
  try {
    const offset = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "short",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? "";
    return `(${offset}) ${tz.replace(/_/g, " ")}`;
  } catch {
    return tz;
  }
}

function todayDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toTimeString().slice(0, 5);
}

export default function NewMeetingPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<MeetingMode>("instant");

  const [form, setForm] = useState({
    title: "",
    description: "",
    date: todayDate(),
    time: nowTime(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    plannedDuration: 60,
    passcode: "",
    waitingRoomEnabled: false,
    muteOnEntry: false,
    videoOffOnEntry: false,
    allowScreenShare: true,
    allowChat: true,
    maxParticipants: "",
  });

  const [recurrence, setRecurrence] = useState({
    pattern: "weekly" as RecurrencePattern,
    interval: 1,
    days: [new Date().getDay()],
    endType: "never" as RecurrenceEnd,
    endDate: "",
    count: 10,
  });

  const mutation = useCreateMeeting({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetDashboardSummaryQueryKey(),
        });
        toast({ title: "Meeting created!" });
        if (data.status === "active") {
          setLocation(`/room/${data.meetingCode}`);
        } else {
          setLocation(`/meetings/${data.id}`);
        }
      },
      onError: (err: any) => {
        toast({
          title: "Failed to create meeting",
          description: err?.message,
          variant: "destructive",
        });
      },
    },
  });

  const setF = (k: keyof typeof form) => (v: string | boolean | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setR = (k: keyof typeof recurrence) => (v: any) =>
    setRecurrence((r) => ({ ...r, [k]: v }));

  const toggleWeekday = (day: number) => {
    setRecurrence((r) => {
      const days = r.days.includes(day)
        ? r.days.filter((d) => d !== day)
        : [...r.days, day];
      return { ...r, days: days.length === 0 ? [day] : days };
    });
  };

  const buildScheduledAt = () => {
    if (!form.date || !form.time) return undefined;
    return new Date(`${form.date}T${form.time}:00`).toISOString();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Meeting title is required", variant: "destructive" });
      return;
    }
    if (mode !== "instant" && !form.date) {
      toast({ title: "Please select a date", variant: "destructive" });
      return;
    }
    if (
      mode === "recurring" &&
      recurrence.pattern === "weekly" &&
      recurrence.days.length === 0
    ) {
      toast({
        title: "Select at least one day for weekly recurrence",
        variant: "destructive",
      });
      return;
    }

    const body: CreateMeetingBody = {
      title: form.title.trim(),
      type: mode,
      description: form.description || undefined,
      scheduledAt: mode !== "instant" ? buildScheduledAt() : undefined,
      plannedDuration:
        mode !== "instant" ? form.plannedDuration : undefined,
      timezone: form.timezone,
      passcode: form.passcode || undefined,
      waitingRoomEnabled: form.waitingRoomEnabled,
      muteOnEntry: form.muteOnEntry,
      videoOffOnEntry: form.videoOffOnEntry,
      allowScreenShare: form.allowScreenShare,
      allowChat: form.allowChat,
      maxParticipants: form.maxParticipants
        ? parseInt(form.maxParticipants, 10)
        : undefined,
      ...(mode === "recurring"
        ? {
            recurrencePattern: recurrence.pattern,
            recurrenceInterval: recurrence.interval,
            recurrenceDays:
              recurrence.pattern === "weekly"
                ? JSON.stringify(recurrence.days.sort((a, b) => a - b))
                : undefined,
            recurrenceEndDate:
              recurrence.endType === "date" && recurrence.endDate
                ? new Date(recurrence.endDate).toISOString()
                : undefined,
            recurrenceCount:
              recurrence.endType === "count"
                ? recurrence.count
                : undefined,
          }
        : {}),
    };

    mutation.mutate({ data: body });
  };

  const patternLabel = {
    daily: "day",
    weekly: "week",
    monthly: "month",
  }[recurrence.pattern];

  return (
    <VerificationGate>
      <AppLayout>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="mb-6">
            <Link href="/meetings">
              <Button variant="ghost" size="sm" className="gap-2 -ml-2 mb-4">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">New Meeting</h1>
            <p className="text-gray-500 mt-1">
              Start instantly, schedule for later, or set up a recurring series
            </p>
          </div>

          {/* Mode selector */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {(
              [
                {
                  id: "instant",
                  icon: Zap,
                  label: "Instant",
                  desc: "Start right now",
                },
                {
                  id: "scheduled",
                  icon: Calendar,
                  label: "Schedule",
                  desc: "One-time future meeting",
                },
                {
                  id: "recurring",
                  icon: RefreshCw,
                  label: "Recurring",
                  desc: "Repeating series",
                },
              ] as const
            ).map(({ id, icon: Icon, label, desc }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  mode === id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon
                    className={`h-4 w-4 ${mode === id ? "text-blue-600" : "text-gray-400"}`}
                  />
                  <span
                    className={`font-semibold text-sm ${mode === id ? "text-blue-700" : "text-gray-700"}`}
                  >
                    {label}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{desc}</p>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Basic info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Video className="h-4 w-4 text-gray-500" />
                  Meeting Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Topic *</Label>
                  <SmartInput
                    id="title"
                    placeholder="My Meeting"
                    value={form.title}
                    onChange={(e) => setF("title")(e.target.value)}
                    required
                    context="meeting title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <SmartTextarea
                    id="description"
                    placeholder="What's this meeting about?"
                    rows={2}
                    value={form.description}
                    onChange={(e) => setF("description")(e.target.value)}
                    context="meeting description"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Date / Time / Duration — shown for scheduled + recurring */}
            {mode !== "instant" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    When
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Date + Time row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={form.date}
                        min={todayDate()}
                        onChange={(e) => setF("date")(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="time">Time</Label>
                      <Input
                        id="time"
                        type="time"
                        value={form.time}
                        onChange={(e) => setF("time")(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select
                      value={String(form.plannedDuration)}
                      onValueChange={(v) =>
                        setF("plannedDuration")(parseInt(v, 10))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Timezone */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-gray-400" />
                      Time Zone
                    </Label>
                    <Select
                      value={form.timezone}
                      onValueChange={(v) => setF("timezone")(v)}
                    >
                      <SelectTrigger>
                        <SelectValue>{formatTz(form.timezone)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {TIMEZONE_GROUPS.map((group) => (
                          <div key={group.group}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              {group.group}
                            </div>
                            {group.zones.map((tz) => (
                              <SelectItem key={tz} value={tz}>
                                {formatTz(tz)}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recurrence settings */}
            {mode === "recurring" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-gray-500" />
                    Recurrence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Pattern */}
                  <div className="space-y-2">
                    <Label>Repeat</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { value: "daily", label: "Daily" },
                          { value: "weekly", label: "Weekly" },
                          { value: "monthly", label: "Monthly" },
                        ] as { value: RecurrencePattern; label: string }[]
                      ).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setR("pattern")(value)}
                          className={`rounded-lg border py-2 text-sm font-medium transition-all ${
                            recurrence.pattern === value
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interval */}
                  <div className="space-y-2">
                    <Label>
                      Repeat every
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={recurrence.interval}
                        onChange={(e) =>
                          setR("interval")(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        className="w-20"
                      />
                      <span className="text-sm text-gray-600">
                        {patternLabel}
                        {recurrence.interval > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Weekly day picker */}
                  {recurrence.pattern === "weekly" && (
                    <div className="space-y-2">
                      <Label>Occurs on</Label>
                      <div className="flex gap-2">
                        {WEEKDAYS.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            title={day.full}
                            onClick={() => toggleWeekday(day.value)}
                            className={`h-9 w-9 rounded-full text-xs font-semibold transition-all ${
                              recurrence.days.includes(day.value)
                                ? "bg-blue-600 text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">
                        {recurrence.days.length === 0
                          ? "Select at least one day"
                          : recurrence.days
                              .sort((a, b) => a - b)
                              .map((d) => WEEKDAYS[d].full)
                              .join(", ")}
                      </p>
                    </div>
                  )}

                  {/* End */}
                  <div className="space-y-3">
                    <Label>End</Label>
                    <div className="space-y-2">
                      {(
                        [
                          { value: "never", label: "Never" },
                          { value: "date", label: "On" },
                          { value: "count", label: "After" },
                        ] as { value: RecurrenceEnd; label: string }[]
                      ).map(({ value, label }) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="endType"
                            checked={recurrence.endType === value}
                            onChange={() => setR("endType")(value)}
                            className="accent-blue-600"
                          />
                          <span className="text-sm text-gray-700 w-12">
                            {label}
                          </span>
                          {value === "date" && recurrence.endType === "date" && (
                            <Input
                              type="date"
                              value={recurrence.endDate}
                              min={form.date || todayDate()}
                              onChange={(e) =>
                                setR("endDate")(e.target.value)
                              }
                              className="w-40"
                            />
                          )}
                          {value === "count" &&
                            recurrence.endType === "count" && (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={1}
                                  max={365}
                                  value={recurrence.count}
                                  onChange={(e) =>
                                    setR("count")(
                                      Math.max(
                                        1,
                                        parseInt(e.target.value, 10) || 1
                                      )
                                    )
                                  }
                                  className="w-20"
                                />
                                <span className="text-sm text-gray-600">
                                  occurrence{recurrence.count !== 1 ? "s" : ""}
                                </span>
                              </div>
                            )}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 leading-relaxed">
                    <strong>Schedule summary: </strong>
                    Every{" "}
                    {recurrence.interval > 1
                      ? `${recurrence.interval} `
                      : ""}
                    {patternLabel}
                    {recurrence.interval > 1 ? "s" : ""}
                    {recurrence.pattern === "weekly" &&
                    recurrence.days.length > 0
                      ? ` on ${recurrence.days
                          .sort((a, b) => a - b)
                          .map((d) => WEEKDAYS[d].full.slice(0, 3))
                          .join(", ")}`
                      : ""}
                    {recurrence.endType === "date" && recurrence.endDate
                      ? `, until ${new Date(recurrence.endDate).toLocaleDateString()}`
                      : recurrence.endType === "count"
                        ? `, ${recurrence.count} time${recurrence.count !== 1 ? "s" : ""}`
                        : ""}
                    {form.date && form.time
                      ? ` starting ${new Date(`${form.date}T${form.time}:00`).toLocaleDateString()} at ${form.time}`
                      : ""}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Security */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-gray-500" />
                  Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="passcode">Passcode (optional)</Label>
                  <Input
                    id="passcode"
                    type="text"
                    placeholder="Leave empty for no passcode"
                    value={form.passcode}
                    onChange={(e) => setF("passcode")(e.target.value)}
                    autoComplete="off"
                  />
                  {form.passcode && (
                    <p className="text-xs text-gray-500">
                      Participants will need to enter this code to join.
                    </p>
                  )}
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Waiting Room</Label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Admit participants one at a time
                    </p>
                  </div>
                  <Switch
                    checked={form.waitingRoomEnabled}
                    onCheckedChange={setF("waitingRoomEnabled")}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Meeting options */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-gray-500" />
                  Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Mute participants on entry</Label>
                  <Switch
                    checked={form.muteOnEntry}
                    onCheckedChange={setF("muteOnEntry")}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label>Turn off video on entry</Label>
                  <Switch
                    checked={form.videoOffOnEntry}
                    onCheckedChange={setF("videoOffOnEntry")}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label>Allow screen sharing</Label>
                  <Switch
                    checked={form.allowScreenShare}
                    onCheckedChange={setF("allowScreenShare")}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label>Enable chat</Label>
                  <Switch
                    checked={form.allowChat}
                    onCheckedChange={setF("allowChat")}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="maxParticipants">
                    Max participants (optional)
                  </Label>
                  <Input
                    id="maxParticipants"
                    type="number"
                    placeholder="Unlimited"
                    min={2}
                    max={1000}
                    value={form.maxParticipants}
                    onChange={(e) => setF("maxParticipants")(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex gap-3 pb-4">
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="flex-1 gap-2"
              >
                {mode === "instant" ? (
                  <Zap className="h-4 w-4" />
                ) : mode === "recurring" ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <Calendar className="h-4 w-4" />
                )}
                {mutation.isPending
                  ? "Creating..."
                  : mode === "instant"
                    ? "Start Meeting Now"
                    : mode === "recurring"
                      ? "Save Recurring Meeting"
                      : "Schedule Meeting"}
              </Button>
              <Link href="/meetings">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </div>
      </AppLayout>
    </VerificationGate>
  );
}
