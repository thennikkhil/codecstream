"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

const navigation = [
  { href: "/dashboard", label: "Library" },
  { href: "/upload", label: "Upload" },
];

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/dashboard" className="inline-flex items-center gap-2.5" aria-label="CodecStream home">
      <span className={`grid h-8 w-8 place-items-center rounded-[10px] ${light ? "bg-[#FAFBFE] text-[#0B1022]" : "bg-[#0E4E9F] text-white"}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M5 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="m10 9 5 3-5 3V9Z" fill="currentColor" />
        </svg>
      </span>
      <span className={`text-[17px] font-semibold tracking-[-0.02em] ${light ? "text-white" : "text-[#0B1022]"}`}>CodecStream</span>
    </Link>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[#EAF4FE] pb-24 text-[#0B1022] md:pb-0">
      <header className="sticky top-0 z-30 border-b border-[#D7E4F6] bg-[#EAF4FE]/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] w-full max-w-[1180px] items-center px-5 sm:px-8">
          <Brand />
          <nav aria-label="Main navigation" className="ml-10 hidden h-full items-center gap-1 md:flex">
            {navigation.map(({ href, label }) => {
              const active = pathname === href || (href === "/dashboard" && pathname.startsWith("/videos/"));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-[#D8EAFD] text-[#0B1022]"
                      : "text-[#4A5874] hover:bg-[#EDF4FD] hover:text-[#0B1022]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden max-w-56 truncate text-xs font-medium text-[#4A5874] sm:block">
              {session?.user.email}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-xl border border-[#D7E4F6] bg-[#FAFBFE] px-3 py-2 text-xs font-medium text-[#4A5874] hover:text-[#0B1022]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {children}
      <nav aria-label="Mobile navigation" className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-around rounded-2xl border border-[#D7E4F6] bg-[#FAFBFE]/95 p-2 shadow-xl shadow-black/5 backdrop-blur md:hidden">
        {navigation.map(({ href, label }) => {
          const active = pathname === href || (href === "/dashboard" && pathname.startsWith("/videos/"));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 justify-center rounded-xl py-2.5 text-xs font-medium ${
                active ? "bg-[#D8EAFD] text-[#0B1022]" : "text-[#4A5874]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
