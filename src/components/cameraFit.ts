import React from "react";
// src/components/cameraFit.ts
import * as THREE from "three";

export interface FitRefs {
  zoomRef: React.MutableRefObject<number>;
  initialZRef: React.MutableRefObject<number>;
  initialTargetRef: React.MutableRefObject<THREE.Vector3 | null>;
}

/** Fits a PerspectiveCamera to a Box3 considering aspect (width & height) with padding. */
export function fitCameraToBox({
  camera,
  controls,
  box,
  padding = 1.1, // why: headroom for UI/edges
  forward = new THREE.Vector3(0, 0, 1), // camera forward when looking at origin
  refs, // zoomRef, initialZRef, initialTargetRef
  BASE_Z = 100, // your model baseline for zoomRef mapping
}: {
  camera: THREE.PerspectiveCamera;
  controls: any; // OrbitControls
  box: THREE.Box3;
  padding?: number;
  forward?: THREE.Vector3;
  refs: FitRefs;
  BASE_Z?: number;
}) {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Guard empty boxes
  if (!isFinite(size.x + size.y + size.z)) return;

  // Vertical & horizontal FOVs (radians)
  const vFOV = (camera.fov * Math.PI) / 180;
  const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * camera.aspect);

  // Distances to fit height and width
  const fitHeight = size.y / (2 * Math.tan(vFOV / 2));
  const fitWidth = size.x / (2 * Math.tan(hFOV / 2));

  // Depth safety: include some allowance for size.z so near-plane won't clip
  const depthPad = size.z * 0.5;

  // Final distance
  const dist = Math.max(fitHeight, fitWidth) * padding + depthPad;

  // Position camera along its forward axis toward the box center
  const dir = forward.clone().normalize();
  const target = center.clone();
  const pos = target.clone().add(dir.multiplyScalar(dist));

  camera.position.copy(pos);
  camera.near = Math.max(0.01, dist * 0.01);
  camera.far = dist + size.length() * 4;
  camera.updateProjectionMatrix();

  // Controls sync
  if (controls) {
    controls.target.copy(target);
    controls.update();
  }

  // Sync zoom model & initial refs
  const fitZ = dist; // single declaration (no duplicates)
  refs.zoomRef.current = BASE_Z / fitZ; // why: keeps your zoom model consistent
  refs.initialZRef.current = fitZ;
  refs.initialTargetRef.current = target.clone();
}
