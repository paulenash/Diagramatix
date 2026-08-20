"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// Display-only pricing for the ?plan= banner. Source of truth for tier
// pricing is scripts/seed-subscriptions.ts — keep these in sync.
const PAID_PLANS: Record<string, { name: string; price: number }> = {
  introductory: { name: "Introductory", price: 50 },
  professional: { name: "Professional", price: 150 },
  expert: { name: "Expert", price: 270 },
};

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const plan =
    planParam === "free" || (planParam && PAID_PLANS[planParam])
      ? planParam
      : null;
  const paidPlan = plan ? PAID_PLANS[plan] : undefined;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Registration failed");
    } else {
      // Carry the chosen plan through to /login (URL only — the register
      // API doesn't accept a tier).
      router.push(plan ? `/login?registered=1&plan=${plan}` : "/login?registered=1");
    }
  }

  return (
    <>
      {plan && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded text-sm">
          {paidPlan ? (
            <>
              You&apos;re starting the {paidPlan.name} plan — AU${paidPlan.price}
              /month.
            </>
          ) : (
            <>You&apos;re starting the 30-day free trial.</>
          )}{" "}
          <Link href="/pricing" className="text-blue-600 hover:underline font-medium">
            change plan
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Name (optional)
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="Your name"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1={1} y1={1} x2={23} y2={23} />
                </svg>
              ) : (
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx={12} cy={12} r={3} />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 px-4 text-white rounded-md font-medium text-sm ${
            loading ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"
          } disabled:cursor-not-allowed`}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="text-xs text-gray-500 text-center">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <button
        type="button"
        onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/dashboard" })}
        className="mt-4 w-full py-2 px-4 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 font-medium text-sm flex items-center justify-center gap-2"
      >
        <svg width={16} height={16} viewBox="0 0 21 21">
          <rect x={1} y={1} width={9} height={9} fill="#f25022"/>
          <rect x={11} y={1} width={9} height={9} fill="#7fba00"/>
          <rect x={1} y={11} width={9} height={9} fill="#00a4ef"/>
          <rect x={11} y={11} width={9} height={9} fill="#ffb900"/>
        </svg>
        Sign up with Microsoft
      </button>

      <p className="mt-4 text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-600 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Create your account
      </h1>

      <Suspense fallback={<div className="text-sm text-gray-500">Loading...</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
