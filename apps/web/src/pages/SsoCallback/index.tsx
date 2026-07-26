import React from "react";
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { Loading } from "@/components/common/Loading";

/** Completes Clerk Google OAuth redirect (same flow as Desktop /sso-callback). */
export default function SsoCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loading label="Finishing Google sign-in…" />
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/app"
        signUpFallbackRedirectUrl="/app"
      />
    </div>
  );
}
