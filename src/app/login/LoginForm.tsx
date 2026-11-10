"use client";

import { useEffect, useState, type FormEvent } from "react";

async function parseLoginError(response: Response): Promise<{ message: string; retryAfterSeconds: number }> {
  try {
    const body = await response.json();
    const retryAfterSeconds = typeof body?.retryAfterSeconds === "number" && body.retryAfterSeconds > 0 ? body.retryAfterSeconds : 0;
    if (typeof body?.error === "string") return { message: body.error, retryAfterSeconds };
  } catch {
    // fall through to fallback
  }
  return { message: "Invalid credentials.", retryAfterSeconds: 0 };
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retrySecondsLeft, setRetrySecondsLeft] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  // Ticks the lockout countdown down once a second, only while one is
  // active — gated on the >0/=0 boundary rather than the raw number so the
  // interval isn't torn down and recreated on every single tick.
  useEffect(() => {
    if (retrySecondsLeft <= 0) return;
    const timer = setInterval(() => {
      setRetrySecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrySecondsLeft > 0]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const { message, retryAfterSeconds } = await parseLoginError(response);
        setError(message);
        setRetrySecondsLeft(retryAfterSeconds);
        setSubmitting(false);
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  const locked = retrySecondsLeft > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          Email
        </label>
        <div className="relative">
          <i
            className="ri-mail-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            id="email"
            name="email"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white/90 py-2.5 pr-3 pl-10 text-base text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-zinc-700">
          Password
        </label>
        <div className="relative">
          <i
            className="ri-lock-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white/90 py-2.5 pr-10 pl-10 text-base text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
          >
            <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {locked ? `Too many attempts. Try again in ${formatCountdown(retrySecondsLeft)}.` : error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || locked}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {locked ? (
          `Try again in ${formatCountdown(retrySecondsLeft)}`
        ) : submitting ? (
          <>
            <i className="ri-loader-4-line animate-spin" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs leading-relaxed text-zinc-500">
        <i className="ri-information-line  shrink-0 text-sm text-brand-500" aria-hidden="true" />
        <span>Forgot password? Contact your admin.</span>
      </p>
    </form>
  );
}
