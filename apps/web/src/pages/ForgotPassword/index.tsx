import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input } from "@researchmind/ui";
import { useAuthContext } from "@/contexts/AuthContext";

export default function ForgotPasswordPage() {
  const { requestPasswordReset, provider } = useAuthContext();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-50">Reset password</h1>
      <p className="mt-1 text-sm text-slate-400">
        We&apos;ll email a reset code via {provider === "clerk" ? "Clerk" : "Firebase"}.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError("");
          try {
            await requestPasswordReset(email.trim());
            setDone(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Reset failed");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        {done ? (
          <p className="text-sm text-emerald-400">
            If an account exists, check your inbox for the reset email.
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        <Button type="submit" className="w-full" loading={loading} disabled={!email.trim()}>
          Send reset email
        </Button>
      </form>
      <Link to="/login" className="mt-4 inline-block text-sm text-sky-400 hover:text-sky-300">
        Back to sign in
      </Link>
    </div>
  );
}
