"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/DashboardShell";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));

    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              email,
              password,
              name: email.split("@")[0],
            })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message ?? "Something went wrong");
        return;
      }

      router.push("/dashboard");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to connect to the API",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleMode() {
    setError("");
    setMode((currentMode) =>
      currentMode === "signin" ? "signup" : "signin",
    );
  }

  return (
    <main className="grid min-h-screen bg-[#EAF4FE] lg:grid-cols-[1fr_0.88fr]">
      <section className="flex min-h-screen flex-col px-6 py-6 sm:px-12 lg:px-16">
        <Brand />
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0E4E9F]">
            {mode === "signin" ? "Welcome back" : "Create your workspace"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#0B1022]">
            {mode === "signin" ? "Sign in to CodecStream." : "Start protecting your videos."}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#4A5874]">
            {mode === "signin"
              ? "Enter your details to access your video library."
              : "Create an account with your work email."}
          </p>
          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <label htmlFor="email" className="block text-sm font-medium text-[#0B1022]">
              Email address
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                className="mt-2 h-12 w-full rounded-xl border border-[#D7E4F6] bg-[#FAFBFE] px-4 text-sm outline-none placeholder:text-[#8994a9] focus:border-[#0E4E9F] focus:ring-4 focus:ring-[#D8EAFD]"
              />
            </label>
            <label htmlFor="password" className="block text-sm font-medium text-[#0B1022]">
              Password
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                minLength={8}
                required
                placeholder="At least 8 characters"
                className="mt-2 h-12 w-full rounded-xl border border-[#D7E4F6] bg-[#FAFBFE] px-4 text-sm outline-none placeholder:text-[#8994a9] focus:border-[#0E4E9F] focus:ring-4 focus:ring-[#D8EAFD]"
              />
            </label>
            {error && (
              <p role="alert" className="rounded-xl border border-[#ead8d5] bg-[#faf1f0] px-4 py-3 text-sm text-[#80514c]">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-12 w-full rounded-xl bg-[#0E4E9F] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#0b4288] disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting
                ? "Please wait..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
          <p className="mt-7 text-center text-sm text-[#4A5874]">
            {mode === "signin" ? "New to CodecStream?" : "Already have an account?"}{" "}
            <button type="button" onClick={toggleMode} className="font-semibold text-[#0E4E9F] hover:underline">
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
        <p className="text-xs text-[#4A5874]">
          Private video, thoughtfully protected.
        </p>
      </section>
      <aside className="relative hidden overflow-hidden bg-[#0E4E9F] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute -right-40 -top-32 h-[500px] w-[500px] rounded-full bg-[#D8EAFD]/20 blur-3xl" />
        <p className="relative ml-auto rounded-full border border-white/15 px-3 py-1.5 text-xs text-[#D8EAFD]">
          Secure video infrastructure
        </p>
        <div className="relative max-w-lg">
          <div className="mb-7 grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[#D8EAFD]">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path d="M12 3 19 6v5c0 4.5-2.7 8-7 10-4.3-2-7-5.5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-[31px] font-medium leading-[1.28] tracking-[-0.035em]">
            Your content deserves a calmer, more considered home.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-6 text-[#D8EAFD]">
            Upload, organize, and securely play your videos with the controls your team needs.
          </p>
        </div>
        <div className="relative grid grid-cols-3 gap-3">
          {[
            ["Resumable", "Large uploads"],
            ["Protected", "Video playback"],
            ["In control", "Security settings"],
          ].map(([value, label]) => (
            <div key={label} className="border-t border-white/15 pt-4">
              <p className="font-semibold">{value}</p>
              <p className="mt-1 text-[11px] text-[#D8EAFD]">{label}</p>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}
