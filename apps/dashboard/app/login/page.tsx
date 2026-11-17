"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
    <main className="mx-auto mt-24 w-full max-w-sm space-y-4 p-4">
      <h1 className="text-2xl font-semibold">
        {mode === "signin" ? "Sign in" : "Create account"}
      </h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded border p-2"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            minLength={8}
            required
            className="w-full rounded border p-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-black p-2 text-white disabled:opacity-60"
        >
          {isSubmitting
            ? "Please wait..."
            : mode === "signin"
              ? "Sign in"
              : "Sign up"}
        </button>
      </form>
      <button type="button" className="text-sm underline" onClick={toggleMode}>
        {mode === "signin"
          ? "Need an account? Sign up"
          : "Have an account? Sign in"}
      </button>
    </main>
  );
}
