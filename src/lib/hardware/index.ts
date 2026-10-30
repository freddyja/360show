export { createStubMotor, type PlatformMotor, type MotorStatus } from "./motor";
export { createStubGoPro, type GoProClient } from "./gopro";
export {
  getCameraAvailability,
  getCameraStream,
  isCameraFacing,
  openCamera,
  probeCamera,
  probeCameraFacing,
  readCameraFacing,
  stopStream,
  writeCameraFacing,
  type CameraAvailability,
  type CameraFacing,
  type CameraStatus,
} from "./camera";
