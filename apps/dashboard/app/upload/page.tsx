"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { DashboardShell } from "@/components/DashboardShell";
import { Uploader, type UploadSnapshot } from "@/lib/uploader";

const EXTENSIONS = ["mp4", "mov", "mkv", "webm"];

function fmtBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

function fmtEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s left`;
}

function badge(snapshot: UploadSnapshot): { text: string; cls: string } {
  switch (snapshot.status) {
    case "starting":
      return { text: "Starting", cls: "bg-[#D8EAFD] text-[#0E4E9F]" };
    case "uploading":
      return { text: "Uploading", cls: "bg-[#D8EAFD] text-[#0E4E9F]" };
    case "paused":
      return snapshot.pauseReason === "offline"
        ? { text: "Connection lost. Resumes automatically", cls: "bg-[#f4f0e7] text-[#7a6740]" }
        : { text: "Paused", cls: "bg-[#f4f0e7] text-[#7a6740]" };
    case "completing":
      return { text: "Finishing", cls: "bg-[#D8EAFD] text-[#0E4E9F]" };
    case "done":
      return { text: "Uploaded", cls: "bg-[#edf4ef] text-[#486451]" };
    case "error":
      return { text: "Failed", cls: "bg-[#f6eceb] text-[#89534f]" };
    default:
      return { text: "Idle", cls: "bg-[#EDF4FD] text-[#4A5874]" };
  }
}

export default function UploadPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const uploaderRef = useRef<Uploader | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [snapshot, setSnapshot] = useState<UploadSnapshot | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => () => uploaderRef.current?.destroy(), []);

  const active =
    snapshot?.status === "starting" ||
    snapshot?.status === "uploading" ||
    snapshot?.status === "completing";
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);

  const begin = useCallback((selectedFile: File) => {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONS.includes(ext)) {
      setFileError("Please choose an .mp4, .mov, .mkv or .webm video.");
      return;
    }
    setFileError("");
    uploaderRef.current?.destroy();
    setFile(selectedFile);
    setSnapshot(null);
    const uploader = new Uploader(selectedFile, setSnapshot);
    uploaderRef.current = uploader;
    void uploader.start();
  }, []);

  const showDropzone = !file || !snapshot || snapshot.status === "idle";
  const percent =
    snapshot && snapshot.fileSize
      ? Math.min(100, (snapshot.uploadedBytes / snapshot.fileSize) * 100)
      : 0;
  const remaining = snapshot ? snapshot.fileSize - snapshot.uploadedBytes : 0;
  const statusBadge = snapshot ? badge(snapshot) : null;

  return (
    <DashboardShell>
    <main className="mx-auto w-full max-w-[1180px] px-5 pb-28 pt-10 sm:px-8 sm:pt-14">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#4A5874]">New video</p>
          <h1 className="text-[30px] font-semibold tracking-[-0.035em] text-[#0B1022] sm:text-[36px]">
            {file && snapshot && snapshot.status !== "idle" ? "Uploading video" : "Upload a video"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#4A5874]">Large files are uploaded in secure, resumable parts.</p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-[#4A5874] hover:text-[#0E4E9F]">
          Back to library
        </Link>
      </header>

      <div className="mt-9 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
      {showDropzone && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const selectedFile = event.dataTransfer.files[0];
            if (selectedFile) begin(selectedFile);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-3xl border-2 border-dashed bg-[#FAFBFE] px-6 py-20 text-center transition ${
            dragging ? "border-[#0E4E9F] bg-[#D8EAFD]" : "border-[#D7E4F6] hover:border-[#9bb9dc]"
          }`}
        >
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#D8EAFD] text-[#0E4E9F]">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="mt-5 text-lg font-semibold text-[#0B1022]">Drop your video here</h2>
          <p className="mt-2 text-sm text-[#4A5874]">
            or choose a file from your computer
          </p>
          <span className="mt-6 inline-flex h-10 items-center rounded-xl border border-[#D7E4F6] bg-white px-5 text-sm font-medium text-[#4A5874] shadow-sm">
            Choose video
          </span>
          <p className="mt-8 text-xs text-[#4A5874]">MP4, MOV, MKV or WebM</p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-[#4A5874]">
            .mp4, .mov, .mkv or .webm. If an upload was interrupted, choose the same file again to resume it.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mov,.mkv,.webm,video/*"
            className="hidden"
            onChange={(event) => {
              const selectedFile = event.target.files?.[0];
              if (selectedFile) begin(selectedFile);
              event.target.value = "";
            }}
          />
        </div>
      )}
      {fileError && (
        <p role="alert" className="rounded-xl border border-[#ead8d5] bg-[#faf1f0] px-4 py-3 text-sm text-[#80514c]">
          {fileError}
        </p>
      )}

      {file && snapshot && snapshot.status !== "idle" && statusBadge && (
        <section className="space-y-5 rounded-2xl border border-[#D7E4F6] bg-[#FAFBFE] p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#0B1022]">{file.name}</p>
              <p className="mt-1 text-sm text-[#4A5874]">
                {fmtBytes(snapshot.uploadedBytes)} of {fmtBytes(snapshot.fileSize)} ·{" "}
                {snapshot.doneParts}/{snapshot.totalParts} parts
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge.cls}`}>
              {statusBadge.text}
            </span>
          </div>

          <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="h-2 w-full overflow-hidden rounded-full bg-[#D7E4F6]">
            <div className="h-full rounded-full bg-[#0E4E9F] transition-all" style={{ width: `${percent}%` }} />
          </div>

          <div className="flex justify-between text-xs text-[#4A5874]">
            <span className="font-medium">{percent.toFixed(1)}% complete</span>
            <span>
              {snapshot.status === "uploading" && snapshot.speedBps > 0
                ? `${fmtBytes(snapshot.speedBps)}/s · ${fmtEta(remaining / snapshot.speedBps)}`
                : ""}
            </span>
          </div>

          {(snapshot.resumes > 0 || snapshot.resumedParts > 0) && snapshot.status !== "done" && (
            <p className="rounded-xl bg-[#EDF4FD] px-4 py-3 text-sm text-[#4A5874]">
              {snapshot.resumes > 0 ? `Resumed ${snapshot.resumes}×. ` : ""}
              {snapshot.resumedParts > 0
                ? `${snapshot.resumedParts} of ${snapshot.totalParts} parts were already stored, so they were skipped.`
                : ""}
            </p>
          )}

          <div className="border-t border-[#D7E4F6] pt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#0B1022]">Upload parts</p>
            <p className="text-xs text-[#4A5874]">{snapshot.doneParts} of {snapshot.totalParts} stored</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-1" aria-label="Part status">
            {snapshot.parts.map((part, index) => (
              <span
                key={index}
                title={`Part ${index + 1}`}
                className={`h-2.5 w-2.5 rounded-sm ${
                  part === "done"
                    ? "bg-[#0E4E9F]"
                    : part === "active"
                      ? "animate-pulse bg-[#0E4E9F]"
                      : "bg-[#D7E4F6]"
                }`}
              />
            ))}
          </div>
          </div>

          {snapshot.error && (
            <p role="alert" className="rounded-xl border border-[#ead8d5] bg-[#faf1f0] px-4 py-3 text-sm text-[#80514c]">
              {snapshot.error}
            </p>
          )}

          {snapshot.status === "done" && (
            <p className="rounded-xl bg-[#edf4ef] px-4 py-3 text-sm text-[#486451]">
              Upload complete. Video id <code>{snapshot.videoId}</code>. Processing starts once the worker is built (Day 4).
            </p>
          )}

          <div className="flex flex-wrap gap-3 border-t border-[#D7E4F6] pt-5">
            {snapshot.status === "uploading" && (
              <button
                className="rounded-xl border border-[#D7E4F6] bg-white px-4 py-2.5 text-sm font-medium text-[#4A5874]"
                onClick={() => uploaderRef.current?.pause("user")}
              >
                Pause
              </button>
            )}
            {snapshot.status === "paused" && (
              <button
                className="rounded-xl bg-[#0E4E9F] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0b4288]"
                onClick={() => uploaderRef.current?.resume()}
              >
                Resume
              </button>
            )}
            {snapshot.status === "error" && (
              <button
                className="rounded-xl bg-[#0E4E9F] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0b4288]"
                onClick={() => begin(file)}
              >
                Try again
              </button>
            )}
            {snapshot.status !== "done" && (
              <button
                className="rounded-xl border border-[#D7E4F6] bg-white px-4 py-2.5 text-sm font-medium text-[#4A5874]"
                onClick={() => void uploaderRef.current?.cancel()}
              >
                Cancel
              </button>
            )}
            {snapshot.status === "done" && (
              <button
                className="rounded-xl border border-[#D7E4F6] bg-white px-4 py-2.5 text-sm font-medium text-[#4A5874]"
                onClick={() => {
                  uploaderRef.current?.destroy();
                  setFile(null);
                  setSnapshot(null);
                }}
              >
                Upload another
              </button>
            )}
          </div>
        </section>
      )}
      </div>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-[#D7E4F6] bg-[#EDF4FD] p-5">
          <h2 className="text-sm font-semibold text-[#0B1022]">Resumable by design</h2>
          <p className="mt-2 text-xs leading-5 text-[#4A5874]">
            Uploads are split into parts, so interrupted transfers can continue without starting over.
          </p>
        </div>
        <div className="rounded-2xl border border-[#D7E4F6] bg-[#FAFBFE] p-5">
          <h2 className="text-sm font-semibold text-[#0B1022]">Secure upload</h2>
          <p className="mt-2 text-xs leading-5 text-[#4A5874]">
            Your video is sent directly to storage. Playback becomes available after processing is complete.
          </p>
        </div>
      </aside>
      </div>
    </main>
    </DashboardShell>
  );
}
