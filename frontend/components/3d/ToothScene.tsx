"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import { ToothModel } from "./ToothModel";
import {
  kf,
  TOOTH_POS_X,
  TOOTH_POS_Y,
  TOOTH_ROT_X,
  TOOTH_ROT_Y,
  TOOTH_SCALE,
} from "@/lib/animations";

const SPIN_SPEED = 0.7; // Smooth continuous 360° rotation speed (rad/s)

function ToothRig({
  reducedMotion,
}: {
  reducedMotion: boolean;
  scrollProgress?: React.RefObject<number>;
}) {
  const spinner = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const s = spinner.current;
    if (!s) return;

    if (reducedMotion) {
      s.rotation.set(0, -0.4, 0);
      return;
    }

    // Pure continuous 360° spin on the Y-axis
    s.rotation.y += delta * SPIN_SPEED;
  });

  return (
    <group ref={spinner}>
      <ToothModel />
    </group>
  );
}

export function ToothScene({
  scrollProgress,
}: {
  scrollProgress: React.RefObject<number>;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const wrapRef = useRef<HTMLDivElement>(null);
  // Pause the WebGL render loop whenever the Hero is scrolled out of view.
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setFrameloop(entry.isIntersecting ? "always" : "never"),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <Canvas
        frameloop={frameloop}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.1, 7.2], fov: 22 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.02,
        }}
        className="!absolute inset-0"
      >
        <Suspense fallback={null}>
          {/* Premium dental studio lighting */}
          <ambientLight intensity={0.35} />
          {/* Large soft key (upper front-left) */}
          <directionalLight position={[-4, 6, 6]} intensity={2.4} />
          {/* Gentle fill (front-right, low) */}
          <directionalLight position={[5, 1, 3]} intensity={0.5} color="#fff3e2" />
          {/* Subtle rim (behind) to separate from the cream page */}
          <directionalLight position={[1, 2, -5]} intensity={0.9} color="#ffffff" />

          <group scale={0.64} position={[0, 0, 0]}>
            <ToothRig
              reducedMotion={reducedMotion}
              scrollProgress={scrollProgress}
            />
          </group>

        {/* Soft natural contact shadow grounds the tooth in the page */}
        <ContactShadows
          position={[0, -1.5, 0]}
          opacity={0.3}
          scale={9}
          blur={3}
          far={4}
          resolution={512}
          color="#101820"
        />

        {/* In-memory soft studio environment (no external HDR fetch) */}
        <Environment resolution={256}>
          <Lightformer
            form="rect"
            intensity={2.4}
            position={[-3, 3, 3]}
            scale={[7, 8, 1]}
            color="#ffffff"
          />
          <Lightformer
            form="rect"
            intensity={1.0}
            position={[4, 1, 2]}
            scale={[5, 6, 1]}
            color="#f6efe1"
          />
          <Lightformer
            form="circle"
            intensity={1.3}
            position={[0, -3, -2]}
            scale={6}
            color="#ffffff"
          />
        </Environment>
        </Suspense>
      </Canvas>
    </div>
  );
}
