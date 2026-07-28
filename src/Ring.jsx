/**
 * RING — renders any ring in the catalogue.
 *
 * Ring-specific knowledge arrives as `profile`; this component holds none of
 * it. Adding a ring means adding a profile, not editing this file.
 */

import React, { useMemo, useLayoutEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';

import { METALS, DIAMOND, CARAT, SHANK_WIDTH } from '../core/standards.js';
import { deformMetal, deformStoneRigid, centroidXZ } from '../core/deform.js';
import { radialDelta } from '../core/configure.js';
import { modelUrl } from '../rings/index.js';

/**
 * ONE shared Draco instance, served from our own /draco/ rather than a CDN.
 * The stock three.js examples point at a Google-hosted path; that breaks
 * offline and behind a firewall, and here it would mean the ring never loads
 * at all. Creating a loader per GLTFLoader also made each one fetch its own
 * copy of the 279 KB wasm — measured as two identical requests.
 */
const dracoLoader = new DRACOLoader().setDecoderPath('/draco/');
const withDraco = (loader) => loader.setDRACOLoader(dracoLoader);

/** Build the three.js materials once per metal choice. */
function useMaterials(metalId) {
  return useMemo(() => {
    const m = METALS[metalId] ?? METALS.yellowGold;

    const metal = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(m.color),
      metalness: m.metalness,
      roughness: m.roughness,
      envMapIntensity: m.envMapIntensity,
    });

    const diamond = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(DIAMOND.color),
      metalness: DIAMOND.metalness,
      roughness: DIAMOND.roughness,
      transmission: DIAMOND.transmission,
      ior: DIAMOND.ior,
      thickness: DIAMOND.thickness,
      envMapIntensity: DIAMOND.envMapIntensity,
      specularIntensity: DIAMOND.specularIntensity,
      ...(Number(THREE.REVISION) >= 167 ? { dispersion: DIAMOND.dispersion } : {}),
      transparent: true,
    });

    return { metal, diamond };
  }, [metalId]);
}

/**
 * Pull the meshes out of a loaded glTF scene, keeping a pristine copy of each
 * position buffer for the deformer to work from.
 *
 * Names come from the glTF NODES (that is where OBJ group names land after
 * conversion), which is what the Diamond_* material rule keys on.
 */
function prepare(obj, skip) {
  const parts = [];
  obj.traverse((child) => {
    if (!child.isMesh) return;
    const name = child.name || '';
    if (skip?.includes(name)) return;

    const geom = child.geometry;
    // Rhino already wrote smoothed per-vertex normals — do NOT recompute,
    // it destroys the hard girdle edges on the diamonds.
    const pos = geom.attributes.position;
    parts.push({
      name,
      geometry: geom,
      isStone: name.startsWith('Diamond_'),
      base: new Float32Array(pos.array),
      centroid: centroidXZ(pos.array),
    });
  });
  return parts;
}

export default function Ring({ profile, config }) {
  const { ringSize, carat, shankWidth, metal } = config;

  const shankGltf = useLoader(GLTFLoader, modelUrl(profile, 'shank'), withDraco);
  const headGltf = useLoader(GLTFLoader, modelUrl(profile, 'head'), withDraco);

  const { metal: metalMat, diamond: diamondMat } = useMaterials(metal);

  // Clone so StrictMode's double-invoke and hot reload don't share buffers,
  // and so switching rings cannot leak geometry between profiles.
  const shankParts = useMemo(
    () => prepare(shankGltf.scene.clone(true), profile.skipParts),
    [shankGltf, profile]
  );
  const headParts = useMemo(
    () => prepare(headGltf.scene.clone(true)),
    [headGltf]
  );

  const boreZ = profile.master.boreCenter.z;

  // --- RING SIZE + WIDTH: deform the shank --------------------------------
  // Runs only when a shank parameter changes, not every frame. Both
  // transforms are applied in one pass from the pristine buffer, so they
  // compose without accumulating error.
  useLayoutEffect(() => {
    const delta = radialDelta(ringSize, profile);
    const widthScale = SHANK_WIDTH.scale(shankWidth, profile.master.shankWidthMM);

    for (const p of shankParts) {
      const attr = p.geometry.attributes.position;
      const target = attr.array;

      if (p.isStone) {
        // Stones ignore widthScale — they keep their size and stay centred
        // on Y = 0 however wide the band gets.
        deformStoneRigid(p.base, target, p.centroid, delta, boreZ);
      } else {
        deformMetal(p.base, target, delta, widthScale, boreZ);
      }
      attr.needsUpdate = true;
      p.geometry.computeBoundingSphere();
    }
  }, [shankParts, ringSize, shankWidth, profile, boreZ]);

  // --- CARAT + SIZE: transform the head as a rigid group -------------------
  const headScale = CARAT.scale(carat, profile.master.carat);
  const headZ =
    (1 - headScale) * profile.head.pivotZ + radialDelta(ringSize, profile);

  return (
    <group>
      <group>
        {shankParts.map((p, i) => (
          <mesh
            key={`s${i}`}
            geometry={p.geometry}
            material={p.isStone ? diamondMat : metalMat}
            castShadow
            receiveShadow
          />
        ))}
      </group>

      <group position={[0, 0, headZ]} scale={headScale}>
        {headParts.map((p, i) => (
          <mesh
            key={`h${i}`}
            geometry={p.geometry}
            material={p.isStone ? diamondMat : metalMat}
            castShadow
            receiveShadow
          />
        ))}
      </group>
    </group>
  );
}
