import * as THREE from "three";

export const CAMERA_FOV = 45;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 2000;
export const CAMERA_BASE_Z = 240;

/**
 * Creates or updates a projector camera that EXACTLY mirrors RingRenderer.
 * Zoom == camera Z only. Pan == camera target only.
 */
export function createFreeformCamera(
  canvas: HTMLCanvasElement,
  panX = 0,
  panY = 0,
  zoom = 1,
  existing?: THREE.PerspectiveCamera,
) {
  const rect = canvas.getBoundingClientRect();
  const aspect = Math.max(1e-6, rect.width) / Math.max(1e-6, rect.height);

  const cam =
    existing ??
    new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);

  cam.aspect = aspect;
  cam.position.set(panX, panY, CAMERA_BASE_Z / Math.max(1e-6, zoom));
  cam.lookAt(panX, panY, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);

  return cam;
}

/** World → Screen */
export function projectWorldToScreen(
  cam: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  wx: number,
  wy: number,
  wz = 0,
) {
  const rect = canvas.getBoundingClientRect();
  const v = new THREE.Vector3(wx, wy, wz).project(cam);

  return {
    sx: (v.x * 0.5 + 0.5) * rect.width,
    sy: (-v.y * 0.5 + 0.5) * rect.height,
  };
}

/** Screen → World (raycast to Z=0 plane) */
export function screenToWorld(
  cam: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
) {
  const rect = canvas.getBoundingClientRect();

  const xNdc = (sx / rect.width) * 2 - 1;
  const yNdc = -((sy / rect.height) * 2 - 1);

  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(xNdc, yNdc), cam);

  const t = -ray.ray.origin.z / ray.ray.direction.z;

  return {
    wx: ray.ray.origin.x + ray.ray.direction.x * t,
    wy: ray.ray.origin.y + ray.ray.direction.y * t,
  };
}
