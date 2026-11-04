import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import tancomLogo from "@assets/TanCom_Logo_1780923314837.jpeg";

interface ProfileData {
  onboardingComplete: boolean;
  accountType: string | null;
}

export default function VerificationGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { setProfile(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || loading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </AppLayout>
    );
  }

  if (!profile || !profile.onboardingComplete) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center px-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto mb-2">
              <img src={tancomLogo} alt="TanCom.US" className="h-20 w-auto object-contain mx-auto" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Verify Your Account</h2>
              <p className="text-gray-500 mt-2 leading-relaxed">
                To create or join meetings, you must complete registration and verify your identity first.
                This keeps TanCom safe and secure for everyone.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 text-sm text-gray-600">
              <p className="font-medium text-gray-900 mb-2">Registration requires:</p>
              <div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">1</span> Choose account type (Individual or Business)</div>
              <div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">2</span> Verify your email address</div>
              <div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">3</span> Verify your phone number with a one-time code</div>
            </div>
            <Button className="w-full gap-2 h-11 text-base" onClick={() => navigate("/onboarding")}>
              Complete Registration <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return <>{children}</>;
}
