"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
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
      return { text: "Starting", cls: "bg-blue-600" };
    case "uploading":
      return { text: "Uploading", cls: "bg-blue-600" };
    case "paused":
      return snapshot.pauseReason === "offline"
        ? { text: "Connection lost. Resumes automatically", cls: "bg-amber-600" }
        : { text: "Paused", cls: "bg-amber-600" };
    case "completing":
      return { text: "Finishing", cls: "bg-blue-600" };
    case "done":
      return { text: "Uploaded", cls: "bg-green-600" };
    case "error":
      return { text: "Failed", cls: "bg-red-600" };
    default:
      return { text: "Idle", cls: "bg-neutral-500" };
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
    <main className="mx-auto mt-16 max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Upload a video</h1>
        <Link href="/dashboard" className="text-sm underline">
          Back to dashboard
        </Link>
      </div>

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
          className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center ${
            dragging ? "border-blue-500 bg-blue-500/10" : "border-neutral-500/50"
          }`}
        >
          <p className="font-medium">Drag a video here, or click to choose one</p>
          <p className="mt-1 text-sm opacity-70">
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
        <p role="alert" className="text-sm text-red-500">
          {fileError}
        </p>
      )}

      {file && snapshot && snapshot.status !== "idle" && statusBadge && (
        <section className="space-y-4 rounded-lg border border-neutral-500/40 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-sm opacity-70">
                {fmtBytes(snapshot.uploadedBytes)} of {fmtBytes(snapshot.fileSize)} ·{" "}
                {snapshot.doneParts}/{snapshot.totalParts} parts
              </p>
            </div>
            <span className={`shrink-0 rounded px-2 py-1 text-xs text-white ${statusBadge.cls}`}>
              {statusBadge.text}
            </span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded bg-neutral-500/30">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
          </div>

          <div className="flex justify-between text-sm opacity-80">
            <span>{percent.toFixed(1)}%</span>
            <span>
              {snapshot.status === "uploading" && snapshot.speedBps > 0
                ? `${fmtBytes(snapshot.speedBps)}/s · ${fmtEta(remaining / snapshot.speedBps)}`
                : ""}
            </span>
          </div>

          {(snapshot.resumes > 0 || snapshot.resumedParts > 0) && snapshot.status !== "done" && (
            <p className="text-sm text-amber-500">
              {snapshot.resumes > 0 ? `Resumed ${snapshot.resumes}×. ` : ""}
              {snapshot.resumedParts > 0
                ? `${snapshot.resumedParts} of ${snapshot.totalParts} parts were already stored, so they were skipped.`
                : ""}
            </p>
          )}

          <div className="flex flex-wrap gap-0.5" aria-label="Part status">
            {snapshot.parts.map((part, index) => (
              <span
                key={index}
                title={`Part ${index + 1}`}
                className={`h-2.5 w-2.5 rounded-sm ${
                  part === "done"
                    ? "bg-green-500"
                    : part === "active"
                      ? "animate-pulse bg-blue-500"
                      : "bg-neutral-500/30"
                }`}
              />
            ))}
          </div>

          {snapshot.error && (
            <p role="alert" className="text-sm text-red-500">
              {snapshot.error}
            </p>
          )}

          {snapshot.status === "done" && (
            <p className="text-sm">
              Upload complete. Video id <code>{snapshot.videoId}</code>. Processing starts once the worker is built (Day 4).
            </p>
          )}

          <div className="flex gap-2">
            {snapshot.status === "uploading" && (
              <button
                className="rounded border px-3 py-1"
                onClick={() => uploaderRef.current?.pause("user")}
              >
                Pause
              </button>
            )}
            {snapshot.status === "paused" && (
              <button
                className="rounded bg-blue-600 px-3 py-1 text-white"
                onClick={() => uploaderRef.current?.resume()}
              >
                Resume
              </button>
            )}
            {snapshot.status === "error" && (
              <button
                className="rounded bg-blue-600 px-3 py-1 text-white"
                onClick={() => begin(file)}
              >
                Try again
              </button>
            )}
            {snapshot.status !== "done" && (
              <button
                className="rounded border px-3 py-1"
                onClick={() => void uploaderRef.current?.cancel()}
              >
                Cancel
              </button>
            )}
            {snapshot.status === "done" && (
              <button
                className="rounded border px-3 py-1"
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
    </main>
  );
}
