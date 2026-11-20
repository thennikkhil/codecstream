import { api, ApiError } from "./api";

const CONCURRENCY = 4;
const URL_BATCH = 16;
const URL_MAX_AGE_MS = 45 * 60 * 1000;
const MAX_RETRIES = 5;

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
};

export type UploadStatus = "idle" | "starting" | "uploading" | "paused" | "completing" | "done" | "error";
export type PauseReason = "user" | "offline";
export type PartState = "done" | "active" | "pending";

export interface UploadSnapshot {
  status: UploadStatus;
  pauseReason: PauseReason | null;
  fileSize: number;
  uploadedBytes: number;
  totalParts: number;
  doneParts: number;
  parts: PartState[];
  speedBps: number;
  resumedParts: number;
  resumes: number;
  uploadId?: string;
  videoId?: string;
  error?: string;
}

interface CreateRes {
  uploadId: string;
  videoId: string;
  partSize: number;
  totalParts: number;
}

interface InfoRes extends CreateRes {
  status: "in_progress" | "completed" | "aborted";
  size: number;
  parts: { partNumber: number; etag: string; size: number }[];
}

interface PartsRes {
  urls: { partNumber: number; url: string }[];
}

class PutError extends Error {
  constructor(public status: number) {
    super(`S3 PUT failed (${status})`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function friendly(error: ApiError): string {
  switch (error.body.error) {
    case "file_too_large":
      return "This file is larger than your upload limit.";
    case "daily_upload_limit":
      return "You have reached the daily upload limit.";
    case "too_many_active_uploads":
      return "You already have an unfinished upload. Choose that file again to resume it, or cancel it.";
    case "invalid_body":
      return "The file type or size was not accepted.";
    default:
      return error.status === 401
        ? "Session expired. Please sign in again."
        : `Request failed (${error.status}).`;
  }
}

export class Uploader {
  private status: UploadStatus = "idle";
  private pauseReason: PauseReason | null = null;
  private error?: string;
  private uploadId?: string;
  private videoId?: string;
  private partSize = 0;
  private totalParts = 0;
  private gen = 0;
  private queue: number[] = [];
  private done = new Map<number, number>();
  private partBytes = new Map<number, number>();
  private inflight = new Map<number, XMLHttpRequest>();
  private urls = new Map<number, { url: string; at: number }>();
  private attempts = new Map<number, number>();
  private resumedParts = 0;
  private resumes = 0;
  private samples: { t: number; b: number }[] = [];
  private lastEmit = 0;
  private cancelled = false;
  private destroyed = false;
  private readonly storageKey: string;

  private handleOffline = () => this.pause("offline");
  private handleOnline = () => {
    if (this.status === "paused" && this.pauseReason === "offline") this.resume();
  };

  constructor(
    private file: File,
    private onChange: (snapshot: UploadSnapshot) => void,
  ) {
    this.storageKey = `cs-upload:${file.name}:${file.size}:${file.lastModified}`;
    window.addEventListener("offline", this.handleOffline);
    window.addEventListener("online", this.handleOnline);
  }

  async start() {
    this.setStatus("starting");
    try {
      let info: InfoRes | null = null;
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        try {
          const existing = await api<InfoRes>("GET", `/uploads/${saved}`);
          if (existing.status === "completed" && existing.size === this.file.size) {
            this.uploadId = existing.uploadId;
            this.videoId = existing.videoId;
            this.partSize = existing.partSize;
            this.totalParts = existing.totalParts;
            localStorage.removeItem(this.storageKey);
            this.setStatus("done");
            return;
          }
          if (existing.status === "in_progress" && existing.size === this.file.size) {
            info = existing;
          } else {
            localStorage.removeItem(this.storageKey);
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            localStorage.removeItem(this.storageKey);
          } else {
            throw error;
          }
        }
      }

      if (!info) {
        const ext = this.file.name.split(".").pop()?.toLowerCase() ?? "mp4";
        const created = await api<CreateRes>("POST", "/uploads", {
          filename: this.file.name,
          contentType: TYPES[ext] ?? "video/mp4",
          size: this.file.size,
        });
        localStorage.setItem(this.storageKey, created.uploadId);
        info = { ...created, status: "in_progress", size: this.file.size, parts: [] };
      }

      this.uploadId = info.uploadId;
      this.videoId = info.videoId;
      this.partSize = info.partSize;
      this.totalParts = info.totalParts;

      if (this.cancelled) {
        await this.cancelUpload(info.uploadId);
        return;
      }
      if (this.destroyed || this.status === "paused") return;
      await this.run();
    } catch (error) {
      this.handleError(error);
    }
  }

  pause(reason: PauseReason = "user") {
    if (this.status !== "uploading" && this.status !== "starting" && this.status !== "completing") return;
    this.halt();
    this.pauseReason = reason;
    this.status = "paused";
    this.emit(true);
  }

  resume() {
    if (this.status !== "paused") return;
    this.resumes++;
    void this.run();
  }

  async cancel() {
    this.cancelled = true;
    this.halt();
    if (this.uploadId) {
      await this.cancelUpload(this.uploadId);
      return;
    }
    this.status = "idle";
    this.emit(true);
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("offline", this.handleOffline);
    window.removeEventListener("online", this.handleOnline);
    this.halt();
  }

  private async cancelUpload(id: string) {
    try {
      await api("DELETE", `/uploads/${id}`);
      localStorage.removeItem(this.storageKey);
      this.error = undefined;
      this.status = "idle";
      this.emit(true);
    } catch (error) {
      this.fail(
        error instanceof Error ? `Could not cancel the upload: ${error.message}` : "Could not cancel the upload.",
      );
    }
  }

  private halt() {
    this.gen++;
    for (const request of this.inflight.values()) request.abort();
    this.inflight.clear();
    this.partBytes.clear();
  }

  private async run() {
    const gen = ++this.gen;
    this.pauseReason = null;
    this.error = undefined;
    this.samples = [];
    this.setStatus("uploading");
    try {
      const info = await api<InfoRes>("GET", `/uploads/${this.uploadId}`);
      if (gen !== this.gen) return;
      if (info.status === "completed") {
        localStorage.removeItem(this.storageKey);
        this.setStatus("done");
        return;
      }
      if (info.status !== "in_progress") {
        localStorage.removeItem(this.storageKey);
        this.fail("This upload is no longer available. Please choose the file again.");
        return;
      }

      this.done = new Map(info.parts.map((part) => [part.partNumber, part.size]));
      this.partBytes.clear();
      this.urls.clear();
      this.attempts.clear();
      this.resumedParts = this.done.size;
      this.queue = Array.from({ length: this.totalParts }, (_, index) => index + 1).filter(
        (partNumber) => !this.done.has(partNumber),
      );
      this.emit(true);

      await Promise.all(Array.from({ length: CONCURRENCY }, () => this.worker(gen)));
      if (gen !== this.gen) return;
      if (this.done.size < this.totalParts) {
        this.pause("offline");
        return;
      }
      await this.complete(gen);
    } catch (error) {
      if (gen === this.gen) this.handleError(error);
    }
  }

  private async worker(gen: number) {
    while (gen === this.gen) {
      const partNumber = this.queue.shift();
      if (partNumber === undefined) return;
      try {
        const url = await this.urlFor(partNumber);
        if (gen !== this.gen) return;
        await this.putPart(partNumber, url);
        this.done.set(partNumber, this.partLength(partNumber));
        this.partBytes.delete(partNumber);
        this.attempts.delete(partNumber);
        this.emit(true);
      } catch (error) {
        this.partBytes.delete(partNumber);
        if (gen !== this.gen) return;
        this.queue.unshift(partNumber);
        this.urls.delete(partNumber);
        if (error instanceof ApiError && error.status !== 429 && error.status < 500) {
          this.halt();
          this.fail(friendly(error));
          return;
        }
        if (error instanceof PutError && error.status !== 429 && error.status < 500) {
          this.halt();
          this.fail(`S3 rejected part ${partNumber} (${error.status}). Check the bucket CORS and upload permissions.`);
          return;
        }
        const tries = (this.attempts.get(partNumber) ?? 0) + 1;
        this.attempts.set(partNumber, tries);
        if (tries >= MAX_RETRIES || !navigator.onLine) {
          this.pause("offline");
          return;
        }
        await sleep(Math.min(1000 * 2 ** tries, 15000));
      }
    }
  }

  private async urlFor(partNumber: number): Promise<string> {
    const cached = this.urls.get(partNumber);
    if (cached && Date.now() - cached.at < URL_MAX_AGE_MS) return cached.url;

    const batch = [partNumber, ...this.queue.slice(0, URL_BATCH - 1)];
    const response = await api<PartsRes>("POST", `/uploads/${this.uploadId}/parts`, {
      partNumbers: batch,
    });
    const now = Date.now();
    for (const item of response.urls) {
      this.urls.set(item.partNumber, { url: item.url, at: now });
    }
    const url = this.urls.get(partNumber)?.url;
    if (!url) throw new Error(`No upload URL returned for part ${partNumber}`);
    return url;
  }

  private partLength(partNumber: number) {
    return Math.min(this.partSize, this.file.size - (partNumber - 1) * this.partSize);
  }

  private putPart(partNumber: number, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = (partNumber - 1) * this.partSize;
      const blob = this.file.slice(start, start + this.partLength(partNumber));
      const request = new XMLHttpRequest();
      this.inflight.set(partNumber, request);
      request.open("PUT", url);
      request.timeout = 10 * 60 * 1000;
      request.upload.onprogress = (event) => {
        this.partBytes.set(partNumber, event.loaded);
        this.emit();
      };
      request.onload = () => {
        this.inflight.delete(partNumber);
        if (request.status >= 200 && request.status < 300) resolve();
        else reject(new PutError(request.status));
      };
      request.onerror = () => {
        this.inflight.delete(partNumber);
        reject(new Error("network error"));
      };
      request.ontimeout = () => {
        this.inflight.delete(partNumber);
        reject(new Error("timeout"));
      };
      request.onabort = () => {
        this.inflight.delete(partNumber);
        reject(new Error("aborted"));
      };
      request.send(blob);
    });
  }

  private async complete(gen: number) {
    this.setStatus("completing");
    await api("POST", `/uploads/${this.uploadId}/complete`);
    if (gen !== this.gen) return;
    localStorage.removeItem(this.storageKey);
    this.setStatus("done");
  }

  private handleError(error: unknown) {
    if (this.status === "paused") return;
    if (error instanceof ApiError) {
      if (error.status === 404) localStorage.removeItem(this.storageKey);
      this.fail(friendly(error));
    } else if (error instanceof TypeError || !navigator.onLine) {
      this.pause("offline");
    } else {
      this.fail(error instanceof Error ? error.message : "Upload failed");
    }
  }

  private fail(message: string) {
    this.status = "error";
    this.error = message;
    this.emit(true);
  }

  private setStatus(status: UploadStatus) {
    this.status = status;
    this.emit(true);
  }

  private emit(force = false) {
    const now = Date.now();
    if (!force && now - this.lastEmit < 100) return;
    this.lastEmit = now;

    let bytes = 0;
    for (const value of this.done.values()) bytes += value;
    for (const value of this.partBytes.values()) bytes += value;

    this.samples.push({ t: now, b: bytes });
    while (this.samples.length > 1 && now - this.samples[0].t > 5000) this.samples.shift();
    const first = this.samples[0];
    const elapsed = (now - first.t) / 1000;
    const speedBps =
      this.status === "uploading" && elapsed > 0.5 ? Math.max(0, (bytes - first.b) / elapsed) : 0;

    const parts: PartState[] = Array.from({ length: this.totalParts }, (_, index) => {
      const partNumber = index + 1;
      if (this.done.has(partNumber)) return "done";
      return this.inflight.has(partNumber) ? "active" : "pending";
    });

    this.onChange({
      status: this.status,
      pauseReason: this.pauseReason,
      fileSize: this.file.size,
      uploadedBytes: bytes,
      totalParts: this.totalParts,
      doneParts: this.done.size,
      parts,
      speedBps,
      resumedParts: this.resumedParts,
      resumes: this.resumes,
      uploadId: this.uploadId,
      videoId: this.videoId,
      error: this.error,
    });
  }
}
