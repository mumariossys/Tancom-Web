import { useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, LogIn, UserPlus, CheckCircle2, Loader2, AlertCircle, Clock } from "lucide-react";
import { getGroupJoinInfo, joinGroupViaToken } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function JoinGroupPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const { isLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const autoJoinTriggered = useRef(false);

  const { data: groupInfo, isLoading: infoLoading, isError: infoError } = useQuery({
    queryKey: ["group-join-info", token],
    queryFn: () => getGroupJoinInfo(token),
    enabled: !!token,
    retry: false,
  });

  const joinMutation = useMutation({
    mutationFn: () => joinGroupViaToken(token),
    onSuccess: (data) => {
      if (data.status === "pending") {
        // requireApproval is on — request submitted, don't redirect yet
        toast({
          title: `Request submitted for "${data.groupName}"`,
          description: "The group admin will review your request.",
        });
        // Stay on page to show the pending state
      } else if (data.alreadyMember) {
        toast({ title: `You're already in "${data.groupName}"` });
        setLocation("/groups");
      } else {
        toast({ title: `You joined "${data.groupName}"!` });
        setLocation("/groups");
      }
    },
    onError: () => {
      toast({ title: "Could not join the group. The link may be invalid.", variant: "destructive" });
    },
  });

  const isPending = joinMutation.isSuccess && joinMutation.data?.status === "pending";

  // Auto-join as soon as we know the user is signed in and group info is loaded
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !groupInfo || autoJoinTriggered.current) return;
    if (joinMutation.isPending || joinMutation.isSuccess || joinMutation.isError) return;
    autoJoinTriggered.current = true;
    joinMutation.mutate();
  }, [isLoaded, isSignedIn, groupInfo, joinMutation.isPending, joinMutation.isSuccess, joinMutation.isError]);

  // Build a full absolute redirect URL so Clerk sign-in/sign-up redirects back here correctly
  const fullJoinUrl = `${window.location.origin}${basePath}/join-group/${token}`;
  const redirectParam = encodeURIComponent(fullJoinUrl);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* TanCom branding */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Users className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold text-gray-900">TanCom</span>
          </div>
          <p className="text-gray-500 text-sm">You've been invited to join a group</p>
        </div>

        <Card className="shadow-lg border-0">
          <CardContent className="p-6 space-y-5">
            {infoLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-4 w-1/2 rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : infoError ? (
              <div className="text-center py-4 space-y-3">
                <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
                <p className="font-semibold text-gray-900">Link not found</p>
                <p className="text-sm text-gray-500">
                  This invite link is invalid or has been removed by the group owner.
                </p>
              </div>
            ) : groupInfo ? (
              <>
                {/* Group info */}
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
                    <Users className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{groupInfo.groupName}</h2>
                    <p className="text-sm text-gray-500">
                      {groupInfo.memberCount} {groupInfo.memberCount === 1 ? "member" : "members"}
                    </p>
                    {groupInfo.requireApproval && (
                      <p className="text-xs text-amber-600 font-medium mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Approval required
                      </p>
                    )}
                  </div>
                </div>

                {groupInfo.description && (
                  <p className="text-sm text-gray-600 border-t border-gray-100 pt-3">
                    {groupInfo.description}
                  </p>
                )}

                <div className="border-t border-gray-100 pt-4 space-y-3">
                  {!isLoaded ? (
                    /* Clerk still initializing */
                    <div className="flex items-center justify-center gap-2 py-3 text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  ) : isSignedIn ? (
                    /* Signed in — auto-join in progress */
                    <div className="flex flex-col items-center gap-2 py-3">
                      {isPending ? (
                        <>
                          <Clock className="h-8 w-8 text-amber-500" />
                          <p className="text-sm font-medium text-gray-800">Request submitted</p>
                          <p className="text-xs text-gray-500 text-center">
                            The group admin will review your request. You'll be notified when it's approved.
                          </p>
                          <Button
                            variant="outline"
                            className="mt-2"
                            onClick={() => setLocation("/groups")}
                          >
                            Back to Groups
                          </Button>
                        </>
                      ) : joinMutation.isSuccess ? (
                        <>
                          <CheckCircle2 className="h-8 w-8 text-green-500" />
                          <p className="text-sm font-medium text-gray-700">Joined! Redirecting…</p>
                        </>
                      ) : joinMutation.isError ? (
                        <>
                          <AlertCircle className="h-8 w-8 text-red-400" />
                          <p className="text-sm text-red-600">Could not join group. Try again.</p>
                          <Button
                            className="mt-2 gap-2 bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              autoJoinTriggered.current = false;
                              joinMutation.reset();
                            }}
                          >
                            Retry
                          </Button>
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                          <p className="text-sm text-gray-600">
                            {groupInfo.requireApproval
                              ? `Sending request to join ${groupInfo.groupName}…`
                              : `Joining ${groupInfo.groupName}…`}
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    /* Not signed in — show auth options */
                    <>
                      <p className="text-sm text-gray-600 text-center">
                        Sign in or create a free account to join this group.
                      </p>
                      <Button
                        className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                        onClick={() =>
                          setLocation(`/sign-in?redirect_url=${redirectParam}`)
                        }
                      >
                        <LogIn className="h-4 w-4" />
                        Sign in to join
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() =>
                          setLocation(`/sign-up?redirect_url=${redirectParam}`)
                        }
                      >
                        <UserPlus className="h-4 w-4" />
                        Create account &amp; join
                      </Button>
                    </>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400">
          TanCom · Video conferencing for everyone
        </p>
      </div>
    </div>
  );
}
