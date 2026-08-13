"use client";

import { Component, type ReactNode, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { TOOTH_MODEL_PATH } from "@/lib/constants";

/** Longest dimension of the model after normalization (world units). */
const NORMALIZED_HEIGHT = 2.4;

/**
 * Orientation correction for the supplied GLB so the most attractive
 * anatomical 3/4 view (broad crown + visible cusps) faces the camera.
 * Radians [x, y, z] — tune here without touching the component logic.
 */
export const MODEL_ROTATION: [number, number, number] = [0, 0, 0];

/** Warm ivory enamel — subtle roughness + soft clearcoat, never metallic/glossy. */
function useEnamelMaterial() {
  return useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#e9dfca"),
      roughness: 0.36,
      metalness: 0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.35,
      reflectivity: 0.4,
      envMapIntensity: 1.05,
      sheen: 0.55,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color("#fff6e8"),
      ior: 1.5,
    });
  }, []);
}

/**
 * Loads the tooth GLB, then normalizes it: bounding-box centered at the origin
 * and scaled to a consistent size, with the enamel material applied. Works for
 * the supplied molar and for any artist-authored GLB dropped at the same path.
 */
function LoadedTooth() {
  const { scene } = useGLTF(TOOTH_MODEL_PATH);
  const enamel = useEnamelMaterial();

  const { object, offset, scale } = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = enamel;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // The supplied GLB carries no material/normals — ensure smooth shading.
        if (!mesh.geometry.getAttribute("normal")) {
          mesh.geometry.computeVertexNormals();
        }
      }
    });

    // Center on visual mass (bounding-box centre), not the raw GLB origin,
    // and normalize scale while preserving proportions.
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const normScale = NORMALIZED_HEIGHT / maxDim;

    return {
      object: cloned,
      offset: center.clone().multiplyScalar(-1),
      scale: normScale,
    };
  }, [scene, enamel]);

  // Outer group rotates around the (now centred) model for the 3/4 pose.
  return (
    <group rotation={MODEL_ROTATION}>
      <group scale={scale}>
        <primitive object={object} position={[offset.x, offset.y, offset.z]} />
      </group>
    </group>
  );
}

/**
 * Clean, neutral placeholder shown ONLY if the GLB fails to load. It is a plain
 * soft form (not a fake anatomical tooth) — a clear signal the asset is missing.
 */
function MissingModelPlaceholder() {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#d9d2c5"),
        roughness: 0.8,
        metalness: 0,
      }),
    [],
  );
  return (
    <mesh material={material}>
      <capsuleGeometry args={[0.7, 1.1, 12, 32]} />
    </mesh>
  );
}

class ModelErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // Clear, actionable log — no ugly primitive tooth is presented as final.
    console.error(
      `[ToothModel] Could not load "${TOOTH_MODEL_PATH}". ` +
        `Place a valid tooth GLB at "public${TOOTH_MODEL_PATH}". ` +
        `Showing a neutral placeholder in the meantime.`,
    );
  }
  render() {
    if (this.state.hasError) return <MissingModelPlaceholder />;
    return this.props.children;
  }
}

export function ToothModel() {
  return (
    <ModelErrorBoundary>
      <LoadedTooth />
    </ModelErrorBoundary>
  );
}

useGLTF.preload(TOOTH_MODEL_PATH);
