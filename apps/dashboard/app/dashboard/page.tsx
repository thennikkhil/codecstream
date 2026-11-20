"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [me, setMe] = useState<unknown>(null);
  const [isLoadingMe, setIsLoadingMe] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session) return;

    const controller = new AbortController();

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/me", {
          credentials: "include",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Your session has expired. Please sign in again."
              : `Unable to load your user (${response.status})`,
          );
        }

        setMe(await response.json());
      } catch (caughtError) {
        if (controller.signal.aborted) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to connect to the API",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingMe(false);
        }
      }
    }

    void loadCurrentUser();
    return () => controller.abort();
  }, [session]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  if (isPending || !session) {
    return (
      <main className="mx-auto mt-24 w-full max-w-xl p-4">
        <p>Checking your session...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-24 w-full max-w-xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <button
          type="button"
          className="rounded border px-3 py-1"
          onClick={signOut}
        >
          Sign out
        </button>
      </div>
      {isLoadingMe ? (
        <p>Loading your account...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : (
        <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-sm">
          {JSON.stringify(me, null, 2)}
        </pre>
      )}
    </main>
  );
}
