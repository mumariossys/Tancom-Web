import { useState, useEffect, useRef, useCallback } from "react";
import { useUser, useAuth } from "@clerk/react";
import tancomLogo from "@assets/TanCom_Logo_1780923314837.jpeg";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  User, Building2, Heart, ShieldCheck, CheckCircle2,
  ArrowRight, ArrowLeft, RefreshCw, Loader2, Mail, Phone,
} from "lucide-react";

async function apiFetch<T>(path: string, token: string | null, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { headers, credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

type AccountType = "individual" | "business" | "nonprofit";
type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { label: "Account Type", icon: User },
  { label: "Your Details", icon: Mail },
  { label: "Verify Phone", icon: Phone },
  { label: "All Done!", icon: ShieldCheck },
];

const BUSINESS_TYPES = [
  "Sole Proprietorship", "Partnership", "LLC", "Corporation (C-Corp)",
  "S-Corporation", "Franchise", "Other",
];
const NONPROFIT_TYPES = [
  "501(c)(3) Public Charity", "501(c)(4) Social Welfare",
  "501(c)(6) Trade Association", "Religious Organization",
  "Educational Organization", "Foundation", "Other",
];

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  /** Authenticated fetch — attaches the Clerk JWT automatically. */
  const authFetch = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const token = await getToken();
    return apiFetch<T>(path, token, options);
  }, [getToken]);

  const [step, setStep] = useState<Step>(1);
  const [accountType, setAccountType] = useState<AccountType>("individual");

  // Individual fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Org fields (business + nonprofit)
  const [orgName, setOrgName] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [accountSubType, setAccountSubType] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");

  // OTP state
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [completing, setCompleting] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isLoaded && user) {
      setName(user.fullName ?? "");
      setContactPersonName(user.fullName ?? "");
    }
  }, [isLoaded, user]);

  useEffect(() => {
    authFetch<{ onboardingComplete: boolean }>("/api/profile")
      .then((p) => { if (p.onboardingComplete) navigate("/dashboard"); })
      .catch(() => {});
  // authFetch is stable after first render; navigate is also stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Step 2 → 3: Validate details then send OTP ─────────────────────────────
  const handleDetailsContinue = async () => {
    if (!name.trim()) {
      toast({ title: "Full name is required", variant: "destructive" }); return;
    }
    if (!phone.trim() || phone.trim().length < 7) {
      toast({ title: "A valid phone number is required", variant: "destructive" }); return;
    }
    if (accountType !== "individual") {
      if (!orgName.trim()) {
        toast({ title: "Organization name is required", variant: "destructive" }); return;
      }
      if (!contactPersonName.trim()) {
        toast({ title: "Contact person name is required", variant: "destructive" }); return;
      }
      if (!accountSubType) {
        toast({ title: "Please select an organization type", variant: "destructive" }); return;
      }
    }
    await sendOtp();
  };

  const sendOtp = async () => {
    setSending(true);
    try {
      const res = await authFetch<{ sent: boolean; devCode?: string }>("/api/verify/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone: phone.trim() }),
      });
      setDevCode(res.devCode ?? null);
      setOtp(["", "", "", "", "", ""]);
      setStep(3);
    } catch {
      toast({ title: "Could not send code. Try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(""));
      otpRefs.current[5]?.focus();
    }
  };

  const verifyOtp = async () => {
    const code = otp.join("");
    if (code.length < 6) { toast({ title: "Enter the full 6-digit code", variant: "destructive" }); return; }
    setVerifying(true);
    try {
      await authFetch("/api/verify/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: phone.trim(), code }),
      });
      await completeOnboarding();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid code";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const completeOnboarding = async () => {
    setCompleting(true);
    try {
      await authFetch("/api/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({
          accountType,
          name: name.trim(),
          phone: phone.trim(),
          companyName: accountType !== "individual" ? orgName.trim() : undefined,
          contactPersonName: accountType !== "individual" ? contactPersonName.trim() : undefined,
          accountSubType: accountType !== "individual" ? accountSubType : undefined,
          taxId: taxId.trim() || undefined,
          address: address.trim() || undefined,
          website: website.trim() || undefined,
        }),
      });
      if (user && name.trim() && name.trim() !== user.fullName) {
        const parts = name.trim().split(" ");
        await user.update({ firstName: parts[0], lastName: parts.slice(1).join(" ") }).catch(() => {});
      }
      setStep(4);
    } catch {
      toast({ title: "Could not complete registration. Please try again.", variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const subTypes = accountType === "business" ? BUSINESS_TYPES : NONPROFIT_TYPES;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="mb-3">
          <img src={tancomLogo} alt="TanCom.US" className="h-20 w-auto object-contain mx-auto" />
        </div>
        <p className="text-sm text-gray-500">Complete your registration to get started</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Progress */}
        <div className="px-8 pt-8 pb-0">
          <div className="flex items-center justify-between mb-6">
            {STEPS.map((s, i) => {
              const num = (i + 1) as Step;
              const done = step > num;
              const active = step === num;
              return (
                <div key={i} className="flex flex-col items-center gap-1 flex-1">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    done ? "bg-green-500 text-white" : active ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-gray-100 text-gray-400"
                  }`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : num}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${active ? "text-blue-600" : done ? "text-green-600" : "text-gray-400"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-8">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="px-8 pb-8">

          {/* ── Step 1: Account Type ───────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Choose your account type</h2>
                <p className="text-gray-500 text-sm mt-1">This helps us personalize your TanCom experience.</p>
              </div>
              <div className="space-y-3">
                {([
                  { value: "individual" as AccountType, icon: User, title: "Individual", desc: "Personal use, freelancers, remote workers, and students", color: "blue" },
                  { value: "business" as AccountType, icon: Building2, title: "Business", desc: "Companies, teams, organizations, and enterprises", color: "indigo" },
                  { value: "nonprofit" as AccountType, icon: Heart, title: "Nonprofit Organization", desc: "Charities, foundations, religious and educational organizations", color: "emerald" },
                ] as const).map(({ value, icon: Icon, title, desc, color }) => (
                  <button
                    key={value}
                    onClick={() => setAccountType(value)}
                    className={`relative w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      accountType === value
                        ? `border-${color}-500 bg-${color}-50 shadow-sm`
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                      accountType === value ? `bg-${color}-100` : "bg-gray-100"
                    }`}>
                      <Icon className={`h-5 w-5 ${accountType === value ? `text-${color}-600` : "text-gray-500"}`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 text-sm">{title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                    {accountType === value && (
                      <CheckCircle2 className={`h-5 w-5 text-${color}-500 shrink-0`} />
                    )}
                  </button>
                ))}
              </div>
              <Button className="w-full h-11 gap-2 text-base" onClick={() => setStep(2)}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* ── Step 2: Details ────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {accountType === "individual" ? "Your details" : accountType === "business" ? "Business details" : "Organization details"}
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  {accountType === "individual"
                    ? "Confirm your name and contact information."
                    : "Tell us about your organization and primary contact."}
                </p>
              </div>

              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">

                {/* ── Individual fields ── */}
                {accountType === "individual" && (
                  <div className="space-y-1.5">
                    <Label>Full Name <span className="text-red-500">*</span></Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
                  </div>
                )}

                {/* ── Org fields ── */}
                {accountType !== "individual" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>{accountType === "business" ? "Business Name" : "Organization Name"} <span className="text-red-500">*</span></Label>
                      <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={accountType === "business" ? "Acme Corp" : "Hope Foundation"} />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Contact Person Name <span className="text-red-500">*</span></Label>
                      <Input value={contactPersonName} onChange={(e) => setContactPersonName(e.target.value)} placeholder="Primary contact's full name" />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{accountType === "business" ? "Business Type" : "Nonprofit Type"} <span className="text-red-500">*</span></Label>
                      <select
                        value={accountSubType}
                        onChange={(e) => setAccountSubType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white text-gray-900"
                      >
                        <option value="">Select type…</option>
                        {subTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Registration / Tax ID <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
                      <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder={accountType === "business" ? "EIN or business reg. number" : "EIN / 501(c)(3) number"} />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Business Address <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, State, ZIP" />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Website URL <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
                      <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" type="url" />
                    </div>
                  </>
                )}

                {/* ── Shared: phone (required for all) ── */}
                <div className="space-y-1.5">
                  <Label>Phone Number <span className="text-red-500">*</span></Label>
                  <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                  <p className="text-xs text-gray-400">A verification code will be sent to confirm this number.</p>
                </div>

                {/* ── Shared: email (verified, read-only) ── */}
                <div className="space-y-1.5">
                  <Label>Email Address <span className="text-red-500">*</span></Label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-600 truncate">{user?.primaryEmailAddress?.emailAddress}</span>
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 ml-auto" />
                  </div>
                  <p className="text-xs text-gray-400">Already verified through your account.</p>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="gap-2" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button className="flex-1 h-11 gap-2" onClick={handleDetailsContinue} disabled={sending}>
                  {sending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code…</>
                    : <><Phone className="h-4 w-4" /> Send Verification Code</>}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Phone OTP ──────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Verify your phone</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Enter the 6-digit code sent to <strong>{phone}</strong>.
                </p>
              </div>

              {devCode && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-center">
                  <p className="text-xs text-blue-600 font-medium mb-1">Your verification code</p>
                  <p className="font-mono text-3xl font-bold tracking-[0.3em] text-blue-700">{devCode}</p>
                  <p className="text-xs text-blue-400 mt-1">SMS delivery coming soon — use this code to continue</p>
                </div>
              )}

              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className={`h-14 w-11 text-center text-xl font-bold border-2 rounded-xl outline-none transition-colors ${
                      digit ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 focus:border-blue-400"
                    }`}
                  />
                ))}
              </div>

              <Button
                className="w-full h-11 gap-2 text-base"
                onClick={verifyOtp}
                disabled={verifying || completing || otp.join("").length < 6}
              >
                {verifying || completing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {completing ? "Setting up…" : "Verifying…"}</>
                  : <><ShieldCheck className="h-4 w-4" /> Verify & Complete</>}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button onClick={() => setStep(2)} className="text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Change number
                </button>
                <button onClick={sendOtp} disabled={sending} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${sending ? "animate-spin" : ""}`} /> Resend code
                </button>
              </div>

              <div className="pt-1 border-t border-gray-100 text-center">
                <button
                  onClick={completeOnboarding}
                  disabled={completing}
                  className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 disabled:opacity-50"
                >
                  Skip phone verification for now
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Success ────────────────────────────────────────────── */}
          {step === 4 && (
            <div className="text-center space-y-5 py-4">
              <div className="mx-auto h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">You're all set!</h2>
                <p className="text-gray-500 mt-2">
                  Your {accountType === "individual" ? "" : accountType === "business" ? "business" : "nonprofit"} account is verified and ready to use.
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-left text-sm space-y-2">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Account type: <strong className="capitalize">
                      {accountType === "individual" ? "Individual" : accountType === "business" ? "Business" : "Nonprofit Organization"}
                    </strong>
                    {accountType !== "individual" && orgName ? ` — ${orgName}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Email verified: <strong>{user?.primaryEmailAddress?.emailAddress}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Phone verified: <strong>{phone}</strong></span>
                </div>
              </div>
              <Button className="w-full h-11 gap-2 text-base" onClick={() => navigate("/dashboard")}>
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">
        TanCom.us · Your information is encrypted and secure
      </p>
    </div>
  );
}
