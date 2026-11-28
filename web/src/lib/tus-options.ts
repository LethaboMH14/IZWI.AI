// The settings for a resumable upload to this server (disk storage). The screen only learns what happened through
// the callbacks, so they are part of the settings and cannot be left off.
import { defaultOptions, type UploadOptions } from "tus-js-client";

export type UploadCallbacks = {
  onProgress: (bytesSent: number, total: number) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
};

export const UPLOAD_RETRY_DELAYS = [0, 3000, 10000, 30000];

export function tusOptions(projectId: string, file: { name: string; type: string }, callbacks: UploadCallbacks): UploadOptions {
  return {
    endpoint: "/api/upload",
    chunkSize: 8 * 1024 * 1024,
    retryDelays: UPLOAD_RETRY_DELAYS,
    metadata: { projectId, filename: file.name, filetype: file.type || "application/octet-stream" },
    // The default fingerprint is the file; add the story so the same file in two stories never shares an upload.
    fingerprint: async (input, options) => `${await defaultOptions.fingerprint(input, options)}::${projectId}`,
    removeFingerprintOnSuccess: true,
    onProgress: callbacks.onProgress,
    onSuccess: () => callbacks.onSuccess(),
    onError: callbacks.onError,
  };
}
