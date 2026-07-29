/**
 * RING — renders any ring in the catalogue.
 *
 * Ring-specific knowledge arrives as `profile`; this component holds none of
 * it. Adding a ring means adding a profile, not editing this file.
 */

import React, { useMemo, useEffect, useLayoutEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';

import { METALS, DIAMOND, CARAT, SHANK_WIDTH } from '../core/standards.js';
import {
  deformMetal, deformStoneRigid, deformHead,
  bendPillarToHead, bendStoneToHead, centroidXZ,
} from '../core/deform.js';
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

    /**
     * DEEP-COPY THE GEOMETRY. This is not optional.
     *
     * useLoader caches the parsed GLTF by URL, and Object3D.clone(true) copies
     * the node tree but SHARES BufferGeometry with the original. So switching
     * away from a ring and back handed us the same buffers we had already
     * deformed: `base` was captured from deformed vertices, the transform was
     * applied on top of itself, and the error compounded on every round-trip —
     * the head visibly climbing away from the shank a little more each time.
     *
     * geometry.clone() gives this mount its own attribute arrays, so `base` is
     * always the pristine mesh.
     */
    const geom = child.geometry.clone();
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

  // prepare() deep-copies each geometry, so this mount never writes into the
  // buffers useLoader has cached — see the note there.
  const shankParts = useMemo(
    () => prepare(shankGltf.scene, profile.skipParts),
    [shankGltf, profile.skipParts]
  );
  const headParts = useMemo(
    () => prepare(headGltf.scene),
    [headGltf]
  );

  /**
   * These geometries are clones this component owns, so it must free them.
   * Without this, every ring switch would leak a full set of GPU buffers —
   * ~190k vertices for the emerald shank alone.
   */
  useEffect(() => () => {
    for (const p of shankParts) p.geometry.dispose();
    for (const p of headParts) p.geometry.dispose();
  }, [shankParts, headParts]);

  const boreZ = profile.master.boreCenter.z;

  // --- RING SIZE + WIDTH: deform the shank --------------------------------
  // Runs only when a shank parameter changes, not every frame. Both
  // transforms are applied in one pass from the pristine buffer, so they
  // compose without accumulating error.
  useLayoutEffect(() => {
    const delta = radialDelta(ringSize, profile);
    const widthScale = SHANK_WIDTH.scale(shankWidth, profile.master.shankWidthMM);
    const caratScale = CARAT.scale(carat, profile.master.carat);
    const seat = profile.head.seatZ ?? profile.head.pivotZ;
    const full = profile.head.scaleFullAtZ ?? seat;
    /**
     * The pillar bend is an explicit opt-in (profile.head.pillarBend), not a
     * blanket behaviour for every ring. Only the emerald profile sets it —
     * the other three never asked for their shanks to react to carat at all,
     * and enabling it unconditionally would move their shoulder/accent
     * geometry near the seat even with bendFromZ/bulgeMM left at defaults.
     *
     * It also only fires at the smallest carat (CARAT.MIN = 0.25) — every
     * other value, including the 1.00 ct master, keeps the plain rigid
     * shank exactly as it rendered before this feature existed. The bend
     * was tuned to look right at the one carat where the head shrinks the
     * most; interpolating it across the whole slider was never asked for.
     */
    const pillarBend = profile.head.pillarBend === true && carat <= CARAT.MIN + 1e-6;
    const bendFromZ = profile.head.pillarBendZ ?? seat;
    const bulgeMM = profile.head.pillarBulgeMM ?? 0;

    for (const p of shankParts) {
      const attr = p.geometry.attributes.position;
      const target = attr.array;

      if (p.isStone) {
        // Stones ignore widthScale — they keep their size and stay centred
        // on Y = 0 however wide the band gets.
        deformStoneRigid(p.base, target, p.centroid, delta, boreZ);
        if (pillarBend) {
          // Accents above the seat (the topmost pavé, nearest the head) ride
          // with the head's carat scale too, so they stay flush against the
          // shoulder metal instead of floating once it bends inward.
          bendStoneToHead(target, p.centroid, seat, full, caratScale, bendFromZ, bulgeMM);
        }
      } else {
        deformMetal(p.base, target, delta, widthScale, boreZ);
        if (pillarBend) {
          // Shank metal above the seat — the pillars and the claws that carry
          // the topmost accents — bends with carat so it keeps meeting the
          // head instead of holding still while the head shrinks around it.
          bendPillarToHead(p.base, target, seat, full, caratScale, bendFromZ, bulgeMM);
        }
      }
      attr.needsUpdate = true;
      p.geometry.computeBoundingSphere();
    }
  }, [shankParts, ringSize, shankWidth, carat, profile, boreZ]);

  // --- CARAT: deform the head ---------------------------------------------
  /**
   * The head cannot be a plain group scale. Shrinking it uniformly also
   * shrinks its FOOTPRINT, so it pulls away from the shoulders — measured
   * 0.50 mm of inward travel on the pear at 0.25 ct, which opened the joint
   * visibly. And because that gap is horizontal, no vertical offset closes it.
   *
   * deformHead() instead holds the base at master width and ramps the XY scale
   * in with height, so the head stays welded to the shoulders while the claws
   * and stone still shrink. Worst-case gap on the pear fell 0.471 -> 0.032 mm.
   */
  useLayoutEffect(() => {
    const s = CARAT.scale(carat, profile.master.carat);
    const seat = profile.head.seatZ ?? profile.head.pivotZ;
    const full = profile.head.scaleFullAtZ ?? seat;

    for (const p of headParts) {
      const attr = p.geometry.attributes.position;
      deformHead(p.base, attr.array, s, seat, full);
      attr.needsUpdate = true;
      p.geometry.computeBoundingSphere();
    }
  }, [headParts, carat, profile]);

  /** The head rides outward with ring size, as a rigid group. */
  const headZ = radialDelta(ringSize, profile);

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

      <group position={[0, 0, headZ]}>
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
