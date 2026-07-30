import React, { Suspense, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  Lightformer,
  ContactShadows,
  Html,
} from '@react-three/drei';
import * as THREE from 'three';

import Ring from './Ring.jsx';
import Controls from './Controls.jsx';
import { getRing, DEFAULT_RING_ID, RING_LIST } from '../rings/index.js';
import { defaultConfig, resolve, validate } from '../core/configure.js';

function Loader() {
  return (
    <Html center>
      <div className="loader">
        <div className="spinner" />
        <span>Loading ring…</span>
      </div>
    </Html>
  );
}

export default function App() {
  const [ringId, setRingId] = useState(DEFAULT_RING_ID);
  const profile = useMemo(() => getRing(ringId), [ringId]);

  // Each ring has its own master values, so the config resets when the ring
  // changes — carrying a 1.99 mm width onto a ring modelled at 2.4 mm would
  // silently apply an unintended narrowing.
  const [config, setConfig] = useState(() => defaultConfig(profile));

  const resolved = useMemo(() => resolve(config, profile), [config, profile]);
  const { warnings } = useMemo(() => validate(config, profile), [config, profile]);

  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));

  const selectRing = (id) => {
    const next = getRing(id);
    setRingId(id);
    setConfig(defaultConfig(next));
  };

  /**
   * The model is authored with +Z up through the head, so the rig is rotated
   * -90deg about X to stand upright in three.js's +Y-up world. Offsetting by
   * -boreCenter.z along local Z then lands the bore on the world origin.
   *
   * Anchored on the bore rather than wrapped in <Center>: an auto-centering
   * bounds box is recomputed whenever the head scales, so the ring would
   * visibly jump every time the carat slider moved.
   */
  const boreZ = -profile.master.boreCenter.z;

  /**
   * CAMERA-DISTANCE COMPENSATION FOR RING SIZE.
   * ---------------------------------------------------------------------------
   * The head has to ride outward with ring size to stay welded to the growing
   * shoulders (see Ring.jsx) — that offset is model-Z, which this rig's -90deg
   * rotation maps directly onto world Y. So a bigger ring size moves the head
   * closer to the camera's own height, and a FIXED camera sees an object at a
   * different distance as a different apparent size — ordinary perspective,
   * not a geometry bug, but visible as "the diamond looks bigger at max ring
   * size" when comparing screenshots at a fixed zoom. Measured on the
   * clientobj2 (LR64530) ring at US3 vs US13: 2.25% apparent width change,
   * 0.65% height, purely from this position shift.
   *
   * Countering it by shifting the WHOLE RIG down by radialDelta in world Y
   * cancels the head's own +radialDelta drift almost exactly (measured
   * residual: 0.003% / 0.004%, floating-point noise) — the head lands back at
   * the same screen position and apparent size at every ring size. The band's
   * bottom — which independently moves away from the bore in the opposite
   * direction — ends up visually travelling further as a result, but that
   * reads as the resizing actually happening, not as an error, and nothing
   * about the head/diamond region was touched to get there.
   */
  const ringSizeCompensationY = -resolved.shank.radialDelta;

  return (
    <div className="app">
      <div className="viewport">
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
          }}
          camera={{ position: [30, 20, 44], fov: 34, near: 0.1, far: 500 }}
        >
          {/* Pure white studio backdrop, matching jewellery e-commerce
              convention. Cuts out cleanly against a white page with no visible
              seam. The stones keep their silhouette because separation comes
              from the girdle outline and pavilion shadows, not from background
              contrast. */}
          <color attach="background" args={['#ffffff']} />

          {/* Studio lighting built from Lightformers rather than
              <Environment preset="…">, because the presets fetch a 1k HDRI
              from a GitHub CDN at runtime — that breaks offline, and until it
              resolves every transmissive diamond renders black. */}
          <Environment resolution={512}>
            <Lightformer form="rect" intensity={6} color="#ffffff"
              position={[-6, 8, 10]} scale={[12, 12, 1]} target={[0, 0, 0]} />
            <Lightformer form="rect" intensity={3} color="#dfe8ff"
              position={[9, 3, 8]} scale={[10, 10, 1]} target={[0, 0, 0]} />
            <Lightformer form="rect" intensity={4.5} color="#fff2dd"
              position={[0, 4, -12]} scale={[14, 8, 1]} target={[0, 0, 0]} />
            <Lightformer form="rect" intensity={5} color="#ffffff"
              position={[0, 14, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[3, 20, 1]} />
            <Lightformer form="rect" intensity={1.6} color="#ffffff"
              position={[0, -9, 3]} rotation={[-Math.PI / 2, 0, 0]} scale={[14, 14, 1]} />
            <Lightformer form="circle" intensity={9} color="#ffffff"
              position={[-4, 6, 6]} scale={1.4} target={[0, 0, 0]} />
            <Lightformer form="circle" intensity={7} color="#ffffff"
              position={[5, 7, -3]} scale={1.1} target={[0, 0, 0]} />
          </Environment>

          <ambientLight intensity={0.25} />
          <directionalLight
            position={[12, 22, 14]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0001}
            shadow-normalBias={0.06}
            shadow-camera-near={1}
            shadow-camera-far={80}
            shadow-camera-left={-18}
            shadow-camera-right={18}
            shadow-camera-top={18}
            shadow-camera-bottom={-18}
          />
          <directionalLight position={[-14, 8, -10]} intensity={0.9} />
          <directionalLight position={[0, -12, 6]} intensity={0.4} />

          <Suspense fallback={<Loader />}>
            {/* key on ring id so switching rings remounts cleanly rather than
                trying to reuse the previous ring's geometry */}
            <group
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, ringSizeCompensationY, boreZ]}
            >
              <Ring key={profile.id} profile={profile} config={resolved.config} />
            </group>

            {/* Softer and lighter than on the dark backdrop: at 0.45 opacity a
                contact shadow reads as a grey smudge against near-white.
                Shares ringSizeCompensationY with the ring group above (a
                sibling, not a child, so it isn't shifted automatically) —
                without it the band would drift away from a shadow plane
                fixed at the old Y, on top of its own pre-existing drift. */}
            <ContactShadows
              position={[0, -11.2 + ringSizeCompensationY, 0]}
              opacity={0.22}
              scale={55}
              blur={3.2}
              far={20}
              color="#5a5a62"
            />
          </Suspense>

          <OrbitControls
            makeDefault
            enablePan={false}
            /* Aim above the bore: the ring spans roughly -10.7 mm (band) to
               +15.5 mm (prong tips), so its visual centre is above origin. */
            target={[0, 4, 0]}
            minDistance={26}
            maxDistance={90}
            minPolarAngle={0.15}
            maxPolarAngle={Math.PI - 0.15}
            enableDamping
            dampingFactor={0.06}
          />
        </Canvas>

        <div className="badge">
          <strong>{profile.sku}</strong>
          <span>{profile.name} · {profile.subtitle}</span>
        </div>
      </div>

      <Controls
        profile={profile}
        rings={RING_LIST}
        onSelectRing={selectRing}
        config={config}
        resolved={resolved}
        warnings={warnings}
        onChange={set}
      />
    </div>
  );
}
