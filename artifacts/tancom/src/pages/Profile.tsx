import { useState, useRef, useEffect, useCallback } from "react";
import { useUser } from "@clerk/react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmartTextarea } from "@/components/SmartField";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, User, Mail, Phone, FileText, Shield, Calendar,
  CheckCircle2, Edit2, Save, X, Loader2, Building2, Heart,
  Globe, MapPin, Hash, Briefcase, AlertCircle,
} from "lucide-react";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";
import { format } from "date-fns";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

interface UserProfileData {
  id: number;
  clerkId: string;
  email: string;
  name: string;
  phone: string | null;
  username: string | null;
  bio: string | null;
  accountType: string | null;
  companyName: string | null;
  contactPersonName: string | null;
  accountSubType: string | null;
  taxId: string | null;
  address: string | null;
  website: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const BUSINESS_TYPES = [
  "Sole Proprietorship", "Partnership", "LLC", "Corporation (C-Corp)",
  "S-Corporation", "Franchise", "Other",
];
const NONPROFIT_TYPES = [
  "501(c)(3) Public Charity", "501(c)(4) Social Welfare",
  "501(c)(6) Trade Association", "Religious Organization",
  "Educational Organization", "Foundation", "Other",
];

function Field({ label, value, editing, children }: {
  label: string; value: string | null; editing: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500">{label}</Label>
      {editing ? children : (
        <p className="text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg min-h-[38px]">
          {value || <span className="text-gray-400">—</span>}
        </p>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, isLoaded } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

  // Username availability
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedUsername = useRef<string>("");
  const usernameAbortRef = useRef<AbortController | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [accountSubType, setAccountSubType] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    apiFetch<UserProfileData>("/api/profile")
      .then((p) => {
        setProfile(p);
        setPhone(p.phone ?? "");
        setUsername(p.username ?? "");
        setBio(p.bio ?? "");
        setCompanyName(p.companyName ?? "");
        setContactPersonName(p.contactPersonName ?? "");
        setAccountSubType(p.accountSubType ?? "");
        setTaxId(p.taxId ?? "");
        setAddress(p.address ?? "");
        setWebsite(p.website ?? "");
        savedUsername.current = p.username ?? "";
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, []);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
    }
  }, [user]);

  const syncFromProfile = (p: UserProfileData) => {
    setPhone(p.phone ?? "");
    setUsername(p.username ?? "");
    setBio(p.bio ?? "");
    setCompanyName(p.companyName ?? "");
    setContactPersonName(p.contactPersonName ?? "");
    setAccountSubType(p.accountSubType ?? "");
    setTaxId(p.taxId ?? "");
    setAddress(p.address ?? "");
    setWebsite(p.website ?? "");
    savedUsername.current = p.username ?? "";
  };

  const startEdit = () => {
    usernameAbortRef.current?.abort();
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    if (profile) syncFromProfile(profile);
    setUsernameStatus("idle");
    setEditing(true);
  };

  const cancelEdit = () => {
    usernameAbortRef.current?.abort();
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    if (profile) syncFromProfile(profile);
    setUsernameStatus("idle");
    setEditing(false);
  };

  // Debounced username availability check (abort-safe)
  const checkUsername = useCallback(async (value: string) => {
    // Abort any in-flight request before starting a new one
    usernameAbortRef.current?.abort();
    const normalized = value.trim().toLowerCase().replace(/^@/, "");
    if (normalized === "") { setUsernameStatus("idle"); return; }
    if (!/^[a-z0-9_.]{3,20}$/.test(normalized)) { setUsernameStatus("invalid"); return; }
    // If unchanged from what's already saved, it's always available to keep
    if (normalized === savedUsername.current) { setUsernameStatus("available"); return; }
    setUsernameStatus("checking");
    const controller = new AbortController();
    usernameAbortRef.current = controller;
    try {
      const res = await fetch(
        `/api/profile/username-available?username=${encodeURIComponent(normalized)}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { available: boolean; valid: boolean };
      setUsernameStatus(!data.valid ? "invalid" : data.available ? "available" : "taken");
    } catch (err) {
      // Ignore aborted requests — a newer check is already in flight
      if (err instanceof Error && err.name !== "AbortError") {
        setUsernameStatus("idle");
      }
    }
  }, []);

  useEffect(() => {
    if (!editing) return;
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    usernameTimerRef.current = setTimeout(() => checkUsername(username), 400);
    return () => {
      if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
      usernameAbortRef.current?.abort();
    };
  }, [username, editing, checkUsername]);

  const handleSave = async () => {
    if (!user) return;
    if (!firstName.trim()) {
      toast({ title: "First name is required", variant: "destructive" }); return;
    }
    if (!phone.trim()) {
      toast({ title: "Phone number is required", variant: "destructive" }); return;
    }
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");
    if (cleanUsername && !/^[a-z0-9_.]{3,20}$/.test(cleanUsername)) {
      toast({
        title: "Invalid username",
        description: "Use 3-20 characters: letters, numbers, dots or underscores.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      const updated = await apiFetch<UserProfileData>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          username: cleanUsername || null,
          phone: phone.trim() || null,
          bio: bio.trim() || null,
          companyName: companyName.trim() || null,
          contactPersonName: contactPersonName.trim() || null,
          accountSubType: accountSubType.trim() || null,
          taxId: taxId.trim() || null,
          address: address.trim() || null,
          website: website.trim() || null,
        }),
      });
      setProfile(updated);
      setEditing(false);
      toast({ title: "Profile saved", description: "Your profile has been updated." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast({
        title: msg.includes("taken") ? "That username is already taken" : "Failed to save profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      await user.setProfileImage({ file });
      toast({ title: "Profile picture updated" });
    } catch {
      toast({ title: "Failed to upload picture", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initials = ((user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "")).toUpperCase() ||
    (user?.primaryEmailAddress?.emailAddress?.[0] ?? "U").toUpperCase();
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "User";
  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";
  const joinedDate = profile?.createdAt ? format(new Date(profile.createdAt), "MMMM d, yyyy") : null;

  const accountType = profile?.accountType;
  const isOrg = accountType === "business" || accountType === "nonprofit";
  const subTypeOptions = accountType === "business" ? BUSINESS_TYPES : NONPROFIT_TYPES;

  const accountTypeLabel =
    accountType === "individual" ? "Individual"
    : accountType === "business" ? "Business"
    : accountType === "nonprofit" ? "Nonprofit Organization"
    : "—";

  const AccountIcon = accountType === "nonprofit" ? Heart : accountType === "business" ? Building2 : User;

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 mt-1">Manage your personal information and account details</p>
        </div>

        {/* Avatar + Name */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="relative shrink-0">
                <div className="h-24 w-24 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center ring-4 ring-white shadow-lg">
                  {user?.imageUrl ? (
                    <img src={user.imageUrl} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-white">{initials}</span>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md transition-colors disabled:opacity-60"
                >
                  {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{user?.primaryEmailAddress?.emailAddress}</p>
                <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                    {profile?.role === "admin" ? "Admin" : "Member"}
                  </Badge>
                  {accountType && (
                    <Badge className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50 gap-1">
                      <AccountIcon className="h-3 w-3" /> {accountTypeLabel}
                    </Badge>
                  )}
                  {emailVerified && (
                    <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Verified
                    </Badge>
                  )}
                  {profile?.isActive && (
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">Active</Badge>
                  )}
                </div>
                {joinedDate && (
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1 justify-center sm:justify-start">
                    <Calendar className="h-3 w-3" /> Member since {joinedDate}
                  </p>
                )}
              </div>

              <div className="shrink-0">
                {!editing ? (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={startEdit}>
                    <Edit2 className="h-3.5 w-3.5" /> Edit Profile
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal / Contact Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">First Name <span className="text-red-500">*</span></Label>
                {editing ? (
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                ) : (
                  <p className="text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg">
                    {user?.firstName || <span className="text-gray-400">—</span>}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Last Name</Label>
                {editing ? (
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                ) : (
                  <p className="text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg">
                    {user?.lastName || <span className="text-gray-400">—</span>}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 flex items-center gap-1"><Mail className="h-3 w-3" /> Email Address</Label>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>
                {emailVerified && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
              </div>
              <p className="text-xs text-gray-400">Email is managed through your account.</p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 flex items-center gap-1"><User className="h-3 w-3" /> Username</Label>
              {editing ? (
                <>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="yourname"
                      className={[
                        "pl-7 pr-8",
                        usernameStatus === "available" ? "border-green-400 focus-visible:ring-green-300" : "",
                        usernameStatus === "taken" || usernameStatus === "invalid" ? "border-red-400 focus-visible:ring-red-300" : "",
                      ].join(" ")}
                      maxLength={21}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {usernameStatus === "checking" && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                      {usernameStatus === "available" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                      {(usernameStatus === "taken" || usernameStatus === "invalid") && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                    </span>
                  </div>
                  {usernameStatus === "available" && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      @{username.trim().toLowerCase().replace(/^@/, "")} is available
                    </p>
                  )}
                  {usernameStatus === "taken" && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      @{username.trim().toLowerCase().replace(/^@/, "")} is already taken
                    </p>
                  )}
                  {usernameStatus === "invalid" && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Invalid — use 3-20 characters: letters, numbers, dots or underscores
                    </p>
                  )}
                  {(usernameStatus === "idle" || usernameStatus === "checking") && (
                    <p className="text-xs text-gray-400">3-20 characters: letters, numbers, dots or underscores. Others can find you by this handle.</p>
                  )}
                </>
              ) : (
                <p className="text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg">
                  {profile?.username ? `@${profile.username}` : <span className="text-gray-400">Not set</span>}
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 flex items-center gap-1">
                <Phone className="h-3 w-3" /> Phone Number <span className="text-red-500">*</span>
              </Label>
              {editing ? (
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" type="tel" />
              ) : (
                <p className="text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg">
                  {profile?.phone || <span className="text-gray-400">Not set</span>}
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 flex items-center gap-1"><FileText className="h-3 w-3" /> About / Bio</Label>
              {editing ? (
                <>
                  <SmartTextarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell others a little about yourself…"
                    maxLength={500}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none placeholder:text-gray-400 focus:border-blue-300 resize-none"
                    context="user profile bio"
                  />
                  <p className="text-xs text-gray-400 text-right">{bio.length}/500</p>
                </>
              ) : (
                <p className="text-sm text-gray-900 py-2 px-3 bg-gray-50 rounded-lg min-h-[60px] whitespace-pre-wrap">
                  {profile?.bio || <span className="text-gray-400">No bio yet</span>}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Organization Details — shown for business & nonprofit */}
        {(isOrg || (loadingProfile && !profile)) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {accountType === "nonprofit" ? <Heart className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                {accountType === "nonprofit" ? "Nonprofit Organization Details" : "Business Details"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingProfile ? (
                <div className="space-y-3">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <>
                  <Field
                    label={accountType === "nonprofit" ? "Organization Name *" : "Business Name *"}
                    value={profile?.companyName ?? null}
                    editing={editing}
                  >
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={accountType === "nonprofit" ? "Hope Foundation" : "Acme Corp"} />
                  </Field>

                  <Separator />

                  <Field label="Contact Person Name *" value={profile?.contactPersonName ?? null} editing={editing}>
                    <Input value={contactPersonName} onChange={(e) => setContactPersonName(e.target.value)} placeholder="Primary contact's full name" />
                  </Field>

                  <Separator />

                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 flex items-center gap-1">
                      <Briefcase className="h-3 w-3" /> {accountType === "nonprofit" ? "Nonprofit Type *" : "Business Type *"}
                    </Label>
                    {editing ? (
                      <select
                        value={accountSubType}
                        onChange={(e) => setAccountSubType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white text-gray-900"
                      >
                        <option value="">Select type…</option>
                        {subTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : (
                      <p className="text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg">
                        {profile?.accountSubType || <span className="text-gray-400">—</span>}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 flex items-center gap-1">
                      <Hash className="h-3 w-3" /> Registration / Tax ID
                    </Label>
                    {editing ? (
                      <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="EIN or registration number" />
                    ) : (
                      <p className="text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg">
                        {profile?.taxId || <span className="text-gray-400">—</span>}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Business Address
                    </Label>
                    {editing ? (
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, State, ZIP" />
                    ) : (
                      <p className="text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg">
                        {profile?.address || <span className="text-gray-400">—</span>}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 flex items-center gap-1">
                      <Globe className="h-3 w-3" /> Website URL
                    </Label>
                    {editing ? (
                      <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" type="url" />
                    ) : (
                      <p className="text-sm font-medium text-gray-900 py-2 px-3 bg-gray-50 rounded-lg">
                        {profile?.website
                          ? <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{profile.website}</a>
                          : <span className="text-gray-400">—</span>}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Account & Registration Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> Account & Registration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingProfile ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-5 w-40" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Account Type</p>
                    <p className="font-medium text-gray-900">{accountTypeLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Status</p>
                    <p className={`font-medium ${profile?.isActive ? "text-green-600" : "text-red-500"}`}>
                      {profile?.isActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Registered</p>
                    <p className="font-medium text-gray-900">{joinedDate ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Email Verified</p>
                    <p className={`font-medium ${emailVerified ? "text-green-600" : "text-amber-500"}`}>
                      {emailVerified ? "Yes" : "Pending"}
                    </p>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">User ID</p>
                  <p className="text-xs text-gray-500 font-mono break-all">{user?.id ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Last Profile Update</p>
                  <p className="text-xs text-gray-500">
                    {profile?.updatedAt ? format(new Date(profile.updatedAt), "MMM d, yyyy 'at' h:mm a") : "—"}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
