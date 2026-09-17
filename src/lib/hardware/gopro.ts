/**
 * GoPro / external camera capture.
 *
 * MVP: unused in the live path. The booth records via `getUserMedia` (USB
 * webcam / iPad camera) or a bundled demo clip.
 *
 * Future: implement Open GoPro Wi‑Fi / USB webcam mode and return the
 * recorded file as a Blob from `stopRecording()`.
 */

export interface GoProClient {
  connect(): Promise<boolean>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<Blob | null>;
  isConnected(): boolean;
}

export function createStubGoPro(): GoProClient {
  let connected = false;
  let recording = false;

  return {
    async connect() {
      connected = true;
      return true;
    },
    async startRecording() {
      if (!connected) {
        throw new Error("GoPro stub: not connected");
      }
      recording = true;
    },
    async stopRecording() {
      recording = false;
      return null;
    },
    isConnected() {
      return connected && !recording;
    },
  };
}
