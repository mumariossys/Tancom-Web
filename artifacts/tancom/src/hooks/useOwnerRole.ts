import { useUser, useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";

interface UserProfile {
  clerkId: string;
  role: string;
  email: string;
  name: string;
}

export function useOwnerRole() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const { data: profile, isLoading } = useQuery<UserProfile | null>({
    queryKey: ["user-profile-role", user?.id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  return {
    isProductOwner: profile?.role === "product_owner",
    role: profile?.role ?? null,
    isLoading,
  };
}
