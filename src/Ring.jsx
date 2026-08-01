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
  deformMetal, deformStoneRigid, deformHead, blendShankToHead,
  bendShoulders, rotateShoulderTip, bendPillarToHead, bendStoneToHead, centroidXZ,
  fixMirroredStone,
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
    /**
     * NORMALS. Rhino wrote smoothed per-vertex normals, and recomputing them on
     * a STONE destroys its hard girdle edges — so stones keep theirs verbatim.
     *
     * Metal is different. The carat deformers (bendPillarToHead, bendShoulders,
     * deformHead) are NON-UNIFORM: they scale X/Z by a height-dependent weight,
     * so a shoulder wall physically leans inward as carat drops while its
     * shipped normals still point where the vertical master pointed them. The
     * surface is then lit as though it had not moved, and the shading break
     * where the leaning wall meets the prong reads as a gap/seam beside the
     * prong — worst at 0.25 ct, invisible at the 1.00 ct master, because the
     * error scales with (1 - caratScale).
     *
     * So metal normals are recomputed after every deform (see the two effects
     * below). That needs a non-indexed-safe source of truth for the smoothing,
     * which computeVertexNormals() derives from the deformed positions itself —
     * nothing extra to cache here.
     */
    const pos = geom.attributes.position;
    const isStone = name.startsWith('Diamond_');

    /**
     * MIRRORED STONES. One shoulder of every supplied model has its pavé wound
     * backwards — the artist mirrored a shoulder across X = 0 without unifying
     * normals afterwards, and a mirror reverses triangle handedness. Back-face
     * culling then discards the near surface and the stone reads as hollow.
     *
     * Detected per stone by signed volume, so a clean re-export is left alone
     * and this becomes a no-op. See fixMirroredStone in core/deform.js.
     */
    if (isStone) fixMirroredStone(geom);

    parts.push({
      name,
      geometry: geom,
      isStone,
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
   * THE HEAD'S OWN CENTROID, over every head part at once.
   *
   * Ring sizing moves the head as ONE RIGID BODY, so the radial offset must be
   * derived from a single point shared by all of its parts — see the note in
   * the carat/size effect below. Taken from the pristine `base` buffers so it
   * is a fixed property of the model, independent of carat and ring size.
   */
  const headCentroid = useMemo(() => {
    let sx = 0, sz = 0, n = 0;
    for (const p of headParts) {
      for (let i = 0; i < p.base.length; i += 3) {
        sx += p.base[i];
        sz += p.base[i + 2];
        n++;
      }
    }
    return n ? { x: sx / n, z: sz / n } : { x: 0, z: 0 };
  }, [headParts]);

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
  /** Radial offset for the selected ring size, shared by shank and head. */
  const delta = radialDelta(ringSize, profile);

  /**
   * THE HEAD'S SINGLE RIGID OFFSET for this ring size — `delta` evaluated once,
   * at the head's centroid. The head moves by exactly this (see the carat/size
   * effect below), and the TOP OF THE SHANK is blended onto it too so the rail
   * and the basket travel together — see blendShankToHead in core/deform.js.
   */
  const headOffset = useMemo(() => {
    const dx = headCentroid.x;
    const dz = headCentroid.z - boreZ;
    const r = Math.hypot(dx, dz);
    if (r < 1e-6) return { x: 0, z: delta };
    return { x: (dx / r) * delta, z: (dz / r) * delta };
  }, [headCentroid, boreZ, delta]);

  /**
   * Where the shank stops sizing on its own radius and starts riding the head's
   * offset. The ramp must clear everything BELOW the joint — the bore, the
   * band, the pave and (on the oval) the gallery — so it starts at the shoulder
   * hinge's pivot where a profile defines one, since that pivot was already
   * measured to sit above the gallery and below the shoulder accents. Rings
   * with no hinge start at the seat, which is where their head meets the shank
   * by definition.
   */
  const blendFromZ = profile.head.shoulderHinge?.pivotZ
    ?? profile.head.seatZ ?? profile.head.pivotZ;
  const blendFullZ = (profile.head.seatZ ?? profile.head.pivotZ) + 2.0;

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
     * By DEFAULT it also only fires at the smallest carat (CARAT.MIN = 0.25) —
     * every other value, including the 1.00 ct master, keeps the plain rigid
     * shank exactly as it rendered before this feature existed. The emerald's
     * bend was tuned to look right at the one carat where the head shrinks the
     * most, and interpolating it across the whole slider was never asked for
     * there.
     *
     * A profile that DOES need it across the range sets `pillarBendAllCarats`.
     * clientobj2 needs that: its prong shafts stand off the shoulder walls by
     * 0.29 mm already at 1.00 ct, widening to 0.51 mm at 0.25 ct (measured
     * head-metal -> shank-metal, Z band 11-12), so a correction that only
     * fires at the slider's floor would leave every intermediate carat gapped
     * and would pop as the slider reached the end. `caratScale` already makes
     * the bend proportional, so it is 0 at the master and eases in on its own
     * — no extra ramp term is needed, and the emerald is untouched because it
     * does not set the flag.
     */
    const pillarBendAll = profile.head.pillarBendAllCarats === true;
    const pillarBend = profile.head.pillarBend === true
      && (pillarBendAll || carat <= CARAT.MIN + 1e-6);
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
       * RING SIZE, TOP OF THE SHANK: hand the rail the head's single offset.
       *
       * Everything above only applied each vertex's OWN radial offset, which
       * fans the shoulder tip outward in X as the ring grows (+0.59 mm on the
       * oval, US 6.5 -> 13) while the rigid head does not follow. That slid the
       * rail sideways off the basket and opened the joint to 0.397 mm at
       * 0.50 ct / US 13 — worst exactly where the shoulder hinge has just
       * switched off, so no carat correction was left to hide it.
       *
       * Blending the rail onto `headOffset` above `blendFromZ` makes rail and
       * basket travel as one piece at every size; the gap goes flat at
       * 0.059 mm and stops depending on ring size at all. Below the ramp
       * nothing changes, so the bore and band are untouched. See
       * blendShankToHead in core/deform.js.
       */
      blendShankToHead(
        p.base, target, delta, boreZ, headOffset.x, headOffset.z,
        blendFromZ, blendFullZ,
        p.isStone ? p.centroid : null
      );

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

        /**
         * SEAT THE JOINT — an optional inward pull applied AFTER the rotation.
         *
         * The hinge alone only brings the shoulder rail into contact; it does
         * not bury it in the head. Measured on the oval, how far the rail's
         * inner face reaches past the basket's outer face ("engagement"):
         *
         *     1.50 ct master   +0.798 mm, at 3 sampled heights
         *     0.25 ct, hinge   +0.092 mm, at 1 height
         *
         * So the master interlocks deeply while the hinged small-carat version
         * merely grazes — the joint closes but reads thin, which is the "should
         * be somewhat more joint" report.
         *
         * Rotating harder does NOT fix it: swept from 14 to 38 deg the gap
         * bottoms out at 0.186 mm around 22 deg then WORSENS (1.041 mm at
         * 38 deg) because the rail swings PAST the basket instead of into it.
         * The missing motion is translation, not rotation, so this reuses
         * bendShoulders for a small inward/downward pull on top of the swing.
         *
         * It rides `hingeAmount`, the SAME ramp as the rotation, so it is
         * exactly 0 at and above hinge.belowCarat and eases in together with
         * the swing — no new discontinuity anywhere on the slider, and every
         * carat the hinge does not touch is bit-identical to before.
         */
        if (hinge.seatPull) {
          let pullAt = null;
          if (p.isStone) {
            // Centroid AFTER the rotation above, so the stone rides the pull
            // from where it now sits rather than from its pre-swing position.
            let cx = 0, cy = 0, cz = 0;
            const n = target.length / 3;
            for (let i = 0; i < target.length; i += 3) {
              cx += target[i]; cy += target[i + 1]; cz += target[i + 2];
            }
            pullAt = { x: cx / n, y: cy / n, z: cz / n };
          }
          bendShoulders(
            target, hingeAmount,
            hinge.seatPull.fromZ + delta, hinge.seatPull.tipZ + delta,
            hinge.seatPull.inwardMM, hinge.seatPull.downMM, pullAt,
            hinge.seatPull.bulgeMM ?? 0
          );
        }
      }
      attr.needsUpdate = true;
      /**
       * Metal only — the shoulder bends above are non-uniform, so the shipped
       * normals no longer match the surface they describe. Stones are moved
       * rigidly (translation never invalidates a normal) and must keep their
       * authored girdle edges, so they are skipped. See prepare().
       */
      if (!p.isStone) {
        p.geometry.computeVertexNormals();
        p.geometry.attributes.normal.needsUpdate = true;
      }
      p.geometry.computeBoundingSphere();
    }
  }, [shankParts, delta, shankWidth, carat, profile, boreZ,
      headOffset, blendFromZ, blendFullZ,
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

    /**
     * The head's single ring-size offset — `delta` evaluated ONCE at the head's
     * centroid, shared with the shank's blend so the two agree exactly. See the
     * long note in the loop below for why this is not per-vertex.
     */
    const { x: offX, z: offZ } = headOffset;

    for (const p of headParts) {
      const attr = p.geometry.attributes.position;
      const target = attr.array;
      const partScale = freezeParts.includes(p.name) ? sFrozen : s;
      deformHead(p.base, target, partScale, seat, full, liftMM);

      /**
       * RING SIZE: move the head out to meet the resized shank.
       *
       * The head used to ride out on a rigid +Z group translation. But the shank
       * expands RADIALLY — a shoulder vertex moves in X as well as Z — so the
       * two diverged sideways as the ring grew. Measured on the oval shoulder
       * contact at (2.14, 12.51): at US 13 the shank moved 0.460 mm outward in X
       * while the head only moved up, which is exactly the 0.44 mm joint gap
       * that appeared at US 9-13 in the 0.25-0.75 ct range. So the head takes
       * the same radial offset the shank does.
       *
       * THE WHOLE HEAD IS ONE RIGID BODY. NOT A PER-VERTEX RADIAL PUSH.
       * ---------------------------------------------------------------------
       * deformMetal moves each vertex along ITS OWN radius from the bore
       * centre. That is exactly right for the SHANK, whose cross-section is
       * small next to its radius, so the section translates and band thickness
       * is preserved.
       *
       * The head is the opposite case. It sits 12-13 mm out from the bore and
       * spans several mm across X, so its vertices' radial directions FAN
       * APART and the whole setting splays open as the ring grows. Measured on
       * the oval's basket rail (head object_3) at a FIXED 1.50 ct, X span went
       * 5.636 mm at US 3 -> 6.303 at US 6.5 -> 7.540 at US 13 — +34% with the
       * carat slider never touched, while Y stayed at 9.408 mm because Y is not
       * part of the radial term. A prong basket that widens in X but not in Y
       * reads exactly as the centre stone changing proportion with ring size.
       * Every ring in the catalogue had it: +26% at US 13 and -10% at US 3,
       * at every carat.
       *
       * The stone was already exempted from this — it took deformStoneRigid,
       * one offset from its own centroid — but the metal around it was not, so
       * the setting kept splaying around a correctly-sized stone. Both take the
       * SAME single offset now, derived once from `headCentroid`, so the head
       * travels out to the shank and keeps its modelled shape exactly at every
       * size. Sharing one offset (rather than each part using its own centroid)
       * is what keeps the head's parts from drifting relative to each other.
       *
       * Cost, measured worst-case head-metal -> shank-metal gap over
       * 0.25/master/3.00 ct x US 3/master/13: 0.115 mm on the pear, 0.056 mm or
       * less on the other three, against the master weld's own 0.028-0.076 mm.
       * Every master row is unchanged. That is a fraction of a tenth of a mm of
       * joint traded for up to 1.4 mm of splay.
       */
      for (let i = 0; i < target.length; i += 3) {
        target[i] += offX;
        target[i + 2] += offZ;
      }

      attr.needsUpdate = true;
      /**
       * deformHead ramps the XY scale with height, so head metal (the prong
       * shafts especially) is reshaped, not just moved — its normals must be
       * rebuilt for the same reason the shank's are. The centre stone is a
       * Diamond_* part and keeps its authored normals. See prepare().
       */
      if (!p.isStone) {
        p.geometry.computeVertexNormals();
        p.geometry.attributes.normal.needsUpdate = true;
      }
      p.geometry.computeBoundingSphere();
    }
  }, [headParts, headOffset, carat, profile, delta, boreZ]);

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
