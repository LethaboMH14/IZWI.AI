type S3UploadOptions = {
  projectId: string;
  retryDelays?: number[];
  onProgress: (bytesSent: number, total: number) => void;
  onSuccess: () => void;
  onError: (error: Error & { originalResponse?: { getStatus(): number; getBody(): string } }) => void;
};

type PreviousUpload = { uploadId: string; fingerprint: string };
type Part = { partNumber: number; size: number };

function responseError(message: string, status: number, body = "") {
  const error = new Error(message) as Error & { originalResponse: { getStatus(): number; getBody(): string } };
  error.originalResponse = { getStatus: () => status, getBody: () => body };
  return error;
}

export class S3Upload {
  private readonly fingerprint: string;
  private uploadId: string | null = null;
  private controller: AbortController | null = null;
  private xhr: XMLHttpRequest | null = null;
  private running = false;
  private stopped = false;
  private restartRequested = false;

  constructor(private readonly file: File, private readonly options: S3UploadOptions) {
    this.fingerprint = `izwi:s3:${encodeURIComponent(JSON.stringify([file.name, file.size, file.lastModified, options.projectId]))}`;
  }

  async findPreviousUploads(): Promise<unknown[]> {
    try {
      const uploadId = localStorage.getItem(this.fingerprint);
      return uploadId ? [{ uploadId, fingerprint: this.fingerprint } satisfies PreviousUpload] : [];
    } catch {
      return [];
    }
  }

  resumeFromPreviousUpload(previous: unknown) {
    const item = previous as Partial<PreviousUpload> | null;
    if (!item || item.fingerprint !== this.fingerprint || typeof item.uploadId !== "string") return;
    this.uploadId = item.uploadId;
  }

  start() {
    if (this.running) { if (this.stopped) this.restartRequested = true; return; }
    this.running = true;
    this.stopped = false;
    void this.upload().catch((error: unknown) => {
      if (this.stopped) return;
      const e = error instanceof Error ? error : responseError("Upload failed.", 0);
      const detailed = e as Error & { originalResponse?: { getStatus(): number; getBody(): string } };
      detailed.originalResponse ??= { getStatus: () => 0, getBody: () => "" };
      this.options.onError(detailed);
    }).finally(() => {
      this.running = false;
      if (this.restartRequested) { this.restartRequested = false; this.start(); }
    });
  }

  abort() {
    this.stopped = true;
    this.controller?.abort();
    this.xhr?.abort();
    this.controller = null;
    this.xhr = null;
  }

  private checkStopped() {
    if (this.stopped) throw responseError("Upload paused.", 0);
  }

  private async request<T>(url: string, init: RequestInit, attempts = true): Promise<T> {
    const delays = attempts ? (this.options.retryDelays ?? [0]) : [0];
    let last: Error = responseError("The connection dropped.", 0);
    for (const delay of delays) {
      this.checkStopped();
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      this.checkStopped();
      const controller = new AbortController();
      this.controller = controller;
      try {
        const response = await fetch(url, { ...init, credentials: "same-origin", signal: controller.signal });
        const body = await response.text();
        if (!response.ok) {
          last = responseError(`Upload request failed (${response.status}).`, response.status, body);
          if (response.status < 500 && response.status !== 429) throw last;
          continue;
        }
        try { return (body ? JSON.parse(body) : {}) as T; }
        catch { throw responseError("The upload server returned an invalid response.", response.status, body); }
      } catch (error) {
        if (this.stopped) throw responseError("Upload paused.", 0);
        if (error instanceof Error && "originalResponse" in error) {
          last = error;
          if ((error as typeof last & { originalResponse?: { getStatus(): number } }).originalResponse?.getStatus() !== 0) throw error;
        } else last = responseError("The connection dropped.", 0);
      } finally {
        if (this.controller === controller) this.controller = null;
      }
    }
    throw last;
  }

  private putPart(url: string, blob: Blob, base: number, total: number): Promise<void> {
    const delays = this.options.retryDelays ?? [0];
    let attempt = 0;
    const send = (): Promise<void> => new Promise((resolve, reject) => {
      if (this.stopped) { reject(responseError("Upload paused.", 0)); return; }
      const delay = delays[attempt++];
      if (delay === undefined) { reject(responseError("The connection dropped.", 0)); return; }
      const launch = () => {
        if (this.stopped) { reject(responseError("Upload paused.", 0)); return; }
        const xhr = new XMLHttpRequest();
        this.xhr = xhr;
        xhr.open("PUT", url);
        xhr.upload.onprogress = (event) => this.options.onProgress(base + (event.lengthComputable ? event.loaded : 0), total);
        xhr.onload = () => {
          if (this.xhr === xhr) this.xhr = null;
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            const e = responseError(`Part upload failed (${xhr.status}).`, xhr.status, xhr.responseText);
            if ((xhr.status >= 500 || xhr.status === 429) && attempt < delays.length) void send().then(resolve, reject);
            else reject(e);
          }
        };
        xhr.onerror = () => {
          if (this.xhr === xhr) this.xhr = null;
          if (attempt < delays.length) void send().then(resolve, reject);
          else reject(responseError("The connection dropped.", 0));
        };
        xhr.onabort = () => { if (this.xhr === xhr) this.xhr = null; reject(responseError("Upload paused.", 0)); };
        xhr.send(blob);
      };
      if (delay) setTimeout(launch, delay); else launch();
    });
    return send();
  }

  private async upload() {
    const base = "/api/upload/s3";
    if (!this.uploadId) {
      const created = await this.request<{ uploadId: string; partBytes: number }>(base, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: this.options.projectId, filename: this.file.name, size: this.file.size, type: this.file.type || "" }),
      });
      this.uploadId = created.uploadId;
      try { localStorage.setItem(this.fingerprint, this.uploadId); } catch { /* Resume remains available for this page lifetime. */ }
    }
    const id = encodeURIComponent(this.uploadId);
    const status = await this.request<{ finished?: boolean; partBytes: number; parts: Part[] }>(`${base}/${id}`, { method: "GET" });
    if (status.finished) {
      try { localStorage.removeItem(this.fingerprint); } catch { /* The server has completed the upload. */ }
      this.options.onProgress(this.file.size, this.file.size); this.options.onSuccess(); return;
    }
    const partBytes = status.partBytes;
    if (!Number.isSafeInteger(partBytes) || partBytes < 1) throw responseError("The upload server returned an invalid part size.", 500);
    const received = new Map(status.parts.map((part) => [part.partNumber, part.size]));
    let sent = [...received.values()].reduce((sum, size) => sum + size, 0);
    this.options.onProgress(sent, this.file.size);
    const count = Math.ceil(this.file.size / partBytes);
    for (let partNumber = 1; partNumber <= count; partNumber++) {
      this.checkStopped();
      if (received.has(partNumber)) continue;
      const start = (partNumber - 1) * partBytes;
      const end = Math.min(start + partBytes, this.file.size);
      const signed = await this.request<{ url: string }>(`${base}/${id}/part`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partNumber }),
      });
      await this.putPart(signed.url, this.file.slice(start, end), sent, this.file.size);
      sent += end - start;
      this.options.onProgress(sent, this.file.size);
    }
    await this.request(`${base}/${id}/complete`, { method: "POST" });
    try { localStorage.removeItem(this.fingerprint); } catch { /* The server has completed the upload. */ }
    this.options.onProgress(this.file.size, this.file.size);
    this.options.onSuccess();
  }
}
