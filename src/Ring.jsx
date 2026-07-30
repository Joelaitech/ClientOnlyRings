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
  bendShoulders, rotateShoulderTip, bendPillarToHead, bendStoneToHead, centroidXZ,
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
  const axisY = profile.master.boreCenter.y ?? 0;
  /** Radial offset for the selected ring size, shared by shank and head. */
  const delta = radialDelta(ringSize, profile);

  /**
   * Shoulder bend strength: 1 at the bottom of the carat range, easing to 0 at
   * `belowCarat`, so the correction is at full travel exactly where the gap is
   * widest and there is no visible step as the slider crosses the threshold.
   *
   * Interpolated between caratMin and belowCarat rather than from zero — a
   * fraction of `belowCarat` only reached 0.5 at the minimum and left the
   * joint 0.39 mm open.
   */
  const bend = profile.head.shoulderBend ?? null;
  const caratFloor = profile.master.caratMin ?? CARAT.MIN;
  const bendAmount = bend
    ? Math.max(0, Math.min(1,
        (bend.belowCarat - carat) / (bend.belowCarat - caratFloor)))
    : 0;

  /**
   * Shoulder HINGE — a rigid alternative to shoulderBend above. bendShoulders
   * scales each vertex by its own height, so a straight rail segment comes
   * out progressively curved; a hinge rotates every vertex above the pivot by
   * the SAME angle, so the segment's own shape is preserved exactly (see
   * rotateShoulderTip in core/deform.js). Same amount-blending as bendAmount.
   */
  const hinge = profile.head.shoulderHinge ?? null;
  const hingeAmount = hinge
    ? Math.max(0, Math.min(1,
        (hinge.belowCarat - carat) / (hinge.belowCarat - caratFloor)))
    : 0;

  // --- RING SIZE + WIDTH: deform the shank --------------------------------
  // Runs only when a shank parameter changes, not every frame. Both
  // transforms are applied in one pass from the pristine buffer, so they
  // compose without accumulating error.
  useLayoutEffect(() => {
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

      /**
       * At small carats the head shrinks away from the shoulder tips, so the
       * tips are bent in and down to meet it. Applied to the SHANK on purpose —
       * every attempt to correct this from the head side broke the 0.50-3.00 ct
       * range. Zero above `belowCarat`.
       *
       * Pavé stones get the SAME bend, evaluated once at their centroid so they
       * translate rigidly. Skipping them left them behind while their seats
       * moved, and they popped out of the shoulders.
       */
      if (bend) {
        let seatAt = null;
        if (p.isStone) {
          // Centroid AFTER the size/width pass, which is where the seat now is.
          let cx = 0, cy = 0, cz = 0;
          const n = target.length / 3;
          for (let i = 0; i < target.length; i += 3) {
            cx += target[i]; cy += target[i + 1]; cz += target[i + 2];
          }
          seatAt = { x: cx / n, y: cy / n, z: cz / n };
        }
        bendShoulders(
          target, bendAmount, bend.fromZ + delta, bend.tipZ + delta,
          bend.inwardMM, bend.downMM, seatAt, bend.bulgeMM ?? 0
        );
      }

      if (hinge && !hinge.excludeParts?.includes(p.name)) {
        let rigidAt = null;
        if (p.isStone) {
          // Centroid AFTER the size/width pass, matching bend's seatAt above.
          let cx = 0, cy = 0, cz = 0;
          const n = target.length / 3;
          for (let i = 0; i < target.length; i += 3) {
            cx += target[i]; cy += target[i + 1]; cz += target[i + 2];
          }
          rigidAt = { x: cx / n, y: cy / n, z: cz / n };
        }
        rotateShoulderTip(
          target, hingeAmount, hinge.pivotXAbs, hinge.pivotZ + delta,
          hinge.maxAngleDeg, rigidAt
        );
      }
      attr.needsUpdate = true;
      p.geometry.computeBoundingSphere();
    }
  }, [shankParts, delta, shankWidth, carat, profile, boreZ, axisY,
      bend, bendAmount, hinge, hingeAmount]);

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
    const liftMM = profile.head.liftMM ?? 0;
    /**
     * Some head parts straddle the seat/fullAtZ boundaries themselves (e.g.
     * the oval's stem, object_1/5/8/9, Z 9.66-11.19 vs seatZ 10.00 and
     * scaleFullAtZ 10.50 — part of that one piece sits frozen, part ramps,
     * part gets full scale+lift). Continuing to shrink it below a carat
     * where that internal split already reads fine visibly "chips" it —
     * different sub-regions of the SAME part pulling apart at different
     * rates as carat keeps dropping. `freezeParts` names the pieces that
     * should simply stop changing once carat crosses `freezeBelowCarat`,
     * holding them at exactly their appearance there instead of continuing
     * to shrink. Both are opt-in — no effect unless a profile sets them.
     */
    const freezeParts = profile.head.freezeParts ?? [];
    const freezeFloor = profile.head.freezeBelowCarat ?? null;
    const sFrozen = freezeFloor != null
      ? CARAT.scale(Math.max(carat, freezeFloor), profile.master.carat)
      : s;

    for (const p of headParts) {
      const attr = p.geometry.attributes.position;
      const target = attr.array;
      const partScale = freezeParts.includes(p.name) ? sFrozen : s;
      deformHead(p.base, target, partScale, seat, full, liftMM);

      /**
       * RING SIZE: expand the head radially, the same way the shank is expanded.
       *
       * The head used to ride out on a rigid +Z group translation. But the shank
       * expands RADIALLY — a shoulder vertex moves in X as well as Z — so the
       * two diverged sideways as the ring grew. Measured on the oval shoulder
       * contact at (2.14, 12.51): at US 13 the shank moved 0.460 mm outward in X
       * while the head only moved up, which is exactly the 0.44 mm joint gap
       * that appeared at US 9-13 in the 0.25-0.75 ct range.
       *
       * Applying the same radial offset here keeps the two locked together at
       * every size — for METAL. deformMetal pushes each vertex a fixed distance
       * along ITS OWN radius, which is only shape-preserving for something
       * radially thin like the shank band. The centre stone has real width, so
       * two vertices on opposite edges sit at slightly different radii and get
       * pushed along slightly different directions — measured on a 4 mm-wide
       * stone, a US 3->13 delta of 3 mm fanned it out to 5.0 mm, a 25% stretch,
       * which is exactly the "head elongates with ring size" report on the
       * clientobj2 (LR64530) ring. Stones instead get ONE offset computed from
       * their own (post-deformHead) centroid and translated rigidly — same
       * fix the shank's accent stones already use, just computed after carat
       * scaling here since the centre stone's centroid moves with carat.
       */
      if (p.isStone) {
        let cx = 0, cy = 0, cz = 0;
        const n = target.length / 3;
        for (let i = 0; i < target.length; i += 3) {
          cx += target[i]; cy += target[i + 1]; cz += target[i + 2];
        }
        deformStoneRigid(target, target, { x: cx / n, z: cz / n }, delta, boreZ);
      } else {
        deformMetal(target, target, delta, 1, boreZ);
      }

      attr.needsUpdate = true;
      p.geometry.computeBoundingSphere();
    }
  }, [headParts, carat, profile, delta, boreZ, axisY]);

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

      <group>
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
