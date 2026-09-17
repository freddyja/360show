"use client";

import {
  MAX_CUSTOM_MUSIC_BYTES,
  formatMusicBytes,
  isLikelyAudioFile,
} from "./custom";

/** Read timeout for phone / cloud-backed file handles (Samsung Drive, etc.). */
export const CUSTOM_MUSIC_READ_MS = 25_000;
/** IndexedDB put of an already-copied Blob should finish well under this. */
export const CUSTOM_MUSIC_STORE_MS = 15_000;

const materialized = new WeakSet<Blob>();

export function isMaterializedCustomMusic(blob: Blob) {
  return materialized.has(blob);
}

export function isQuotaExceededError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String((error as { message?: unknown }).message) : "";
  const code = "code" in error ? Number((error as { code?: unknown }).code) : NaN;
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    /quota/i.test(message)
  );
}

export function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "AbortError" || name === "TimeoutError";
}

export function formatCustomMusicError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    if (
      /this phone|that song|audio file|too large|looks empty|Drive or Samsung|Stopped reading|Stopped sending|booth|Capture/i.test(
        error.message,
      )
    ) {
      return error.message;
    }
  }
  if (isQuotaExceededError(error)) {
    return "This phone is out of storage for that song. Free some space, clear the current custom song, or pick a smaller file.";
  }
  if (isAbortError(error)) {
    const message = error instanceof Error ? error.message : "";
    if (/timed? out|too long/i.test(message) || (error instanceof Error && error.name === "TimeoutError")) {
      return "That song took too long to read. If it lives in Drive or Samsung Cloud, download it to this phone first, then pick it again.";
    }
    return "Stopped reading the song. Pick it again if you still want it.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not save that song on this phone. Try another file.";
}

export function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(timeoutMessage);
      err.name = "TimeoutError";
      reject(err);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Copy a picker File into an in-memory File so IndexedDB / upload never hangs
 * on a cloud placeholder handle. Honors abort + timeout and the 18 MB cap.
 */
export async function materializeCustomMusicFile(
  file: File,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<File> {
  if (options?.signal?.aborted) {
    throw abortError();
  }
  if (isMaterializedCustomMusic(file)) return file;

  if (!isLikelyAudioFile(file)) {
    throw new Error("Please pick an audio file (mp3, m4a, wav, aac, or ogg).");
  }
  if (file.size > MAX_CUSTOM_MUSIC_BYTES) {
    throw new Error(
      `That song is too large (${formatMusicBytes(file.size)}). Max is 18 MB so this phone’s storage stays healthy.`,
    );
  }
  if (file.size > 0 && file.size < 64) {
    throw new Error("That file looks empty. Pick another song.");
  }

  const timeoutMs = options?.timeoutMs ?? CUSTOM_MUSIC_READ_MS;
  const buffer = await readBlobArrayBuffer(file, {
    timeoutMs,
    signal: options?.signal,
    maxBytes: MAX_CUSTOM_MUSIC_BYTES,
  });

  if (buffer.byteLength > MAX_CUSTOM_MUSIC_BYTES) {
    throw new Error(
      `That song is too large (${formatMusicBytes(buffer.byteLength)}). Max is 18 MB so this phone’s storage stays healthy.`,
    );
  }
  if (buffer.byteLength < 64) {
    throw new Error("That file looks empty. Pick another song.");
  }

  const copy = new File([buffer], file.name || "song", {
    type: file.type || "application/octet-stream",
    lastModified: Date.now(),
  });
  materialized.add(copy);
  return copy;
}

function abortError() {
  const err = new Error("Stopped reading the song.");
  err.name = "AbortError";
  return err;
}

function timeoutError() {
  const err = new Error(
    "That song took too long to read. If it lives in Drive or Samsung Cloud, download it to this phone first, then pick it again.",
  );
  err.name = "TimeoutError";
  return err;
}

function readBlobArrayBuffer(
  blob: Blob,
  options: { timeoutMs: number; signal?: AbortSignal; maxBytes: number },
): Promise<ArrayBuffer> {
  if (typeof FileReader !== "undefined") {
    return readWithFileReader(blob, options);
  }
  return withTimeout(
    blob.arrayBuffer(),
    options.timeoutMs,
    timeoutError().message,
  ).then((buffer) => {
    if (buffer.byteLength > options.maxBytes) {
      throw new Error(
        `That song is too large (${formatMusicBytes(buffer.byteLength)}). Max is 18 MB so this phone’s storage stays healthy.`,
      );
    }
    return buffer;
  });
}

function readWithFileReader(
  blob: Blob,
  options: { timeoutMs: number; signal?: AbortSignal; maxBytes: number },
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const onAbort = () => {
      reader.abort();
      finish(() => reject(abortError()));
    };

    const timer = setTimeout(() => {
      reader.abort();
      finish(() => reject(timeoutError()));
    }, options.timeoutMs);

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort);
    }

    reader.onprogress = (event) => {
      if (event.loaded > options.maxBytes) {
        reader.abort();
        finish(() =>
          reject(
            new Error(
              `That song is too large (${formatMusicBytes(event.loaded)}). Max is 18 MB so this phone’s storage stays healthy.`,
            ),
          ),
        );
      }
    };

    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        finish(() => reject(new Error("Could not read that song on this phone. Try another file.")));
        return;
      }
      finish(() => resolve(result));
    };

    reader.onerror = () => {
      const raw = reader.error;
      finish(() =>
        reject(
          new Error(
            raw?.message
              ? `Could not read that song (${raw.message}). If it lives in Drive or Samsung Cloud, download it to this phone first.`
              : "Could not read that song on this phone. If it lives in Drive or Samsung Cloud, download it to this phone first.",
          ),
        ),
      );
    };

    reader.onabort = () => {
      finish(() => reject(options.signal?.aborted ? abortError() : timeoutError()));
    };

    try {
      reader.readAsArrayBuffer(blob);
    } catch (error) {
      finish(() =>
        reject(
          error instanceof Error
            ? error
            : new Error("Could not read that song on this phone. Try another file."),
        ),
      );
    }
  });
}
