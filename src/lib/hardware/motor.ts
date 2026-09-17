/**
 * Platform motor control.
 *
 * MVP: stub that waits for the capture duration so the operator UI can
 * sequence a spin. Replace `createStubMotor()` with a serial / BLE / USB
 * implementation (e.g. GRBL, custom ESP32, or a vendor SDK) without changing
 * capture orchestration.
 */

export type MotorStatus = "idle" | "spinning" | "error";

export interface PlatformMotor {
  spin(durationMs: number): Promise<void>;
  stop(): Promise<void>;
  getStatus(): MotorStatus;
}

export function createStubMotor(): PlatformMotor {
  let status: MotorStatus = "idle";
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    async spin(durationMs: number) {
      status = "spinning";
      if (timer) clearTimeout(timer);
      await new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          status = "idle";
          resolve();
        }, durationMs);
      });
    },
    async stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      status = "idle";
    },
    getStatus() {
      return status;
    },
  };
}
