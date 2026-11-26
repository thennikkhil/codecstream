"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

// Signs into the shared, capped demo account. These values are public on purpose.
export default function DemoPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { error } = await authClient.signIn.email({
        email: process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "",
        password: process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "",
      });
      if (error) setError(error.message ?? "Demo sign-in failed");
      else router.replace("/dashboard");
    })();
  }, [router]);

  return (
    <main className="mx-auto mt-24 max-w-sm p-4 text-center">
      {error ? <p className="text-red-500">{error}</p> : <p className="opacity-70">Signing you into the demo…</p>}
    </main>
  );
}
