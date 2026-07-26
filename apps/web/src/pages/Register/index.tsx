import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input } from "@researchmind/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { validateRegister } from "@/utils/validation";
import { clerkConfigured } from "@/lib/clerk";
import { firebaseConfigured } from "@/lib/firebase";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 12.3 3 3 12.3 3 24s9.3 21 21 21 21-9.3 21-21c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 16.1 3 9.3 7.5 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36.3 26.7 37 24 37c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.2 40.5 16 45 24 45z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.5 5.5-6.5 6.9l.1.1 6.2 5.2C36.9 39 45 33 45 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export default function RegisterPage() {
  const { register, loginWithGoogle, provider } = useAuthContext();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");

  const authReady = clerkConfigured || firebaseConfigured;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-50">Create account</h1>
      <p className="mt-1 text-sm text-slate-400">One identity for Desktop + Cloud Web</p>

      {clerkConfigured ? (
        <div className="mt-6 space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            loading={googleLoading}
            disabled={!authReady}
            onClick={async () => {
              setGoogleLoading(true);
              setFormError("");
              try {
                await loginWithGoogle();
              } catch (err) {
                setFormError(err instanceof Error ? err.message : "Google sign-in failed");
                setGoogleLoading(false);
              }
            }}
          >
            <GoogleIcon /> Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="h-px flex-1 bg-slate-800" />
            or email
            <div className="h-px flex-1 bg-slate-800" />
          </div>
        </div>
      ) : null}

      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = validateRegister(name, email, password);
          setErrors(v);
          if (Object.keys(v).length) return;
          setLoading(true);
          setFormError("");
          setInfo("");
          try {
            await register(name.trim(), email.trim(), password);
            navigate("/app");
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Registration failed";
            if (/verify|email/i.test(msg)) setInfo(msg);
            else setFormError(msg);
          } finally {
            setLoading(false);
          }
        }}
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="email" required />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoComplete="new-password" required />
        {formError ? <p className="text-sm text-rose-400">{formError}</p> : null}
        {info ? <p className="text-sm text-amber-300">{info}</p> : null}
        <Button type="submit" className="w-full" loading={loading} disabled={!authReady}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-sm text-slate-400">
        Already have an account?{" "}
        <Link to="/login" className="text-sky-400 hover:text-sky-300">
          Sign in
        </Link>
      </p>
      {provider === "clerk" ? (
        <p className="mt-3 text-xs text-slate-500">Same Clerk Google / email as Desktop.</p>
      ) : null}
    </div>
  );
}
