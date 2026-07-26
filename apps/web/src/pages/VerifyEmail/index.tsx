import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@researchmind/ui";

export default function VerifyEmailPage() {
  return (
    <div className="text-center">
      <h1 className="font-display text-2xl font-bold">Verify your email</h1>
      <p className="mt-2 text-sm text-slate-400">Check your inbox for the Firebase verification link, then sign in.</p>
      <Link to="/login" className="mt-6 inline-block">
        <Button>Back to sign in</Button>
      </Link>
    </div>
  );
}
