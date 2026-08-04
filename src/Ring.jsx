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

import { METALS, DIAMOND, CARAT, SHANK_WIDTH, RING_SIZE } from '../core/standards.js';
import {
  deformMetal, deformStoneRigid, deformHead, blendShankToHead,
  bendShoulders, rotateShoulderTip, bendPillarToHead, bendStoneToHead, centroidXZ,
  dropSeat, fixMirroredStone,
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
 * Centroid of a position buffer in all three axes.
 *
 * Taken from the LIVE buffer, not the pristine one: each caller needs the
 * stone's centroid as of the passes that have already run, which is where its
 * seat actually is by then.
 */
function centroidOf(buf) {
  let cx = 0, cy = 0, cz = 0;
  const n = buf.length / 3;
  for (let i = 0; i < buf.length; i += 3) {
    cx += buf[i];
    cy += buf[i + 1];
    cz += buf[i + 2];
  }
  return { x: cx / n, y: cy / n, z: cz / n };
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
   * Unit direction from a part toward the nearest ACCENT BELOW it on the same
   * shoulder — the way that part slides down the pavé row as the ring grows.
   *
   * Keyed by the part OBJECT, not by name: every accent in these models is
   * called `Diamond_Round`, so a name map could not tell the 2nd stone from
   * the 8th. Derived once from the pristine meshes, so each shoulder gets its
   * own correctly mirrored vector with nothing hardcoded.
   */
  const slideDirs = useMemo(() => {
    const dirs = new Map();
    const accents = shankParts.filter((p) => p.isStone).map((p) => p.centroid);
    if (!accents.length) return dirs;

    for (const p of shankParts) {
      let best = null;
      let bestD = Infinity;
      for (const a of accents) {
        // Same shoulder (same side of the ring face) and strictly below.
        if (Math.sign(a.x) !== Math.sign(p.centroid.x)) continue;
        if (a.z >= p.centroid.z) continue;
        const d = Math.hypot(a.x - p.centroid.x, a.z - p.centroid.z);
        if (d < bestD) { bestD = d; best = a; }
      }
      if (!best) continue;
      const dx = best.x - p.centroid.x;
      const dz = best.z - p.centroid.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-6) dirs.set(p, { x: dx / len, z: dz / len });
    }
    return dirs;
  }, [shankParts]);

  /**
   * The accent stones the profile wants slid, by their RANK DOWN EACH
   * SHOULDER — `accentSlideRanks: [2]` means the 2nd stone from the head on
   * both the left and the right, which is the only way to name them given
   * they all share the `Diamond_Round` node name.
   *
   * Held as a Set of part objects so the render loop is a cheap identity
   * lookup rather than a re-sort per slider move.
   */
  const accentSlideSet = useMemo(() => {
    const ranks = profile.head.accentSlideRanks ?? [];
    const set = new Set();
    if (!ranks.length) return set;

    const stones = shankParts.filter((p) => p.isStone);
    for (const side of [1, -1]) {
      const column = stones
        .filter((p) => Math.sign(p.centroid.x) === side)
        .sort((a, b) => b.centroid.z - a.centroid.z);
      for (const rank of ranks) {
        const hit = column[rank - 1];
        if (hit) set.add(hit);
      }
    }
    return set;
  }, [shankParts, profile.head.accentSlideRanks]);

  /**
   * STONES WHOSE SETTING TAKES THE RIGID SEAT DROP.
   *
   * seatDrop moves most shank metal through a height ramp but a named few —
   * the rails and accent claws — RIGIDLY, by one offset (see dropSeat in
   * core/deform.js). A stone bezel-set into one of those claws must inherit
   * the SAME rigid offset, or the claw sinks out from under it.
   *
   * Measured on the oval at 0.25 ct before this existed: the stones at Z 10.44
   * are set into object_27/object_22, which drop the full 1.000 mm, while the
   * stones themselves took the ramp at their own height and dropped only
   * 0.244 mm — 0.756 mm of separation, which is the pavé visibly hanging in
   * mid-air above its own claws.
   *
   * Each stone is paired with the metal part its surface is CLOSEST to, over
   * the pristine meshes, so the pairing is a fixed property of the model and
   * nothing is hardcoded. A stone seated against ramped metal is left alone
   * and keeps the ramp, which is correct for it.
   */
  const rigidDropStones = useMemo(() => {
    const set = new Set();
    const rigidParts = profile.head.seatDrop?.rigidParts;
    if (!rigidParts?.length) return set;

    const metal = shankParts.filter(
      (p) => !p.isStone && rigidParts.includes(p.name)
    );
    if (!metal.length) return set;

    // Only stones high enough to be in the joint region can be affected.
    const fromZ = profile.head.seatDrop.fromZ ?? 0;

    for (const s of shankParts) {
      if (!s.isStone) continue;
      const c = centroidXZ(s.base);
      if (c.z <= fromZ) continue;

      // Nearest metal part to this stone's centroid, rigid or not — a stone
      // must follow whichever piece actually holds it.
      let bestD = Infinity;
      let bestRigid = false;
      for (const p of shankParts) {
        if (p.isStone) continue;
        for (let i = 0; i < p.base.length; i += 3) {
          const d = Math.hypot(p.base[i] - c.x, p.base[i + 2] - c.z);
          if (d < bestD) { bestD = d; bestRigid = rigidParts.includes(p.name); }
        }
      }
      if (bestRigid) set.add(s);
    }
    return set;
  }, [shankParts, profile.head.seatDrop]);

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
   *
   * `blendFullZ` defaults to `seatZ + 2.0` — a short ramp that is plenty at
   * small-to-mid ring sizes. At large sizes `delta` grows past what that short
   * span can absorb smoothly: the vertex's OWN radial offset (which the ramp
   * is blending AWAY from) grows with ring size, so the same 2 mm of height
   * has to shed a bigger and bigger offset, and the rail's outer edge bows in
   * and springs back rather than tapering smoothly. Measured on the oval's
   * shoulder rail (object_5), US 13 / 1.50 ct: the outer edge's slope peaks at
   * 1.51x its own pristine rate mid-ramp before easing back to 1x at the tip —
   * that overshoot-and-recover is what reads as a kink where the rails meet
   * the head.
   *
   * Widening the ramp to cover the part's ENTIRE modelled height (the same fix
   * already applied to seatDrop for the identical reason — see the oval
   * profile's note on object_5/object_44) spreads the same total offset over
   * more height, so the peak rate drops without changing the ramp's endpoints
   * or the joint gap at all (measured tipGap unchanged at 0.132 mm across every
   * window tried). `blendFullZAtTop` opts a profile into this; unset, every
   * other ring keeps the original seatZ + 2.0 ramp untouched.
   */
  const blendFromZ = profile.head.shoulderHinge?.pivotZ
    ?? profile.head.seatZ ?? profile.head.pivotZ;
  const blendFullZ = profile.head.blendFullZAtTop
    ?? (profile.head.seatZ ?? profile.head.pivotZ) + 2.0;

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
  /**
   * Ramps below are only meaningful while the slider can actually reach
   * below `belowCarat`. If the effective carat floor has been raised to or
   * past that threshold (e.g. a catalogue-wide minimum bump), the ratio's
   * denominator would flip sign and pin the "correction" fully ON at every
   * reachable carat instead of OFF — the opposite of what an inert
   * below-threshold rescue should do. Guard it to 0 in that case.
   */
  const bendAmount = bend && bend.belowCarat > caratFloor
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
  const hingeAmount = hinge && hinge.belowCarat > caratFloor
    ? Math.max(0, Math.min(1,
        (hinge.belowCarat - carat) / (hinge.belowCarat - caratFloor)))
    : 0;

  /**
   * SEAT DROP — lower the whole head/shoulder joint as carat falls, rather
   * than closing it by swinging the shoulders in over a head that shrinks in
   * place. See dropSeat in core/deform.js for why the joint has to move.
   *
   * Head and shank both consume this ONE scalar — the head as a rigid
   * translation in the carat effect below, the shank through dropSeat's
   * height ramp — so the joint descends without opening.
   *
   * Same ramp shape as bendAmount/hingeAmount above (full travel at the carat
   * floor, 0 at `belowCarat`), so the three compose smoothly and a profile
   * that sets none of them is untouched.
   */
  const drop = profile.head.seatDrop ?? null;
  /**
   * The 0..1 carat ramp itself, shared by the joint drop and the rail extra
   * below it so the two stay in lockstep — both must be exactly 0 at
   * `belowCarat` and full at the carat floor.
   */
  const dropRamp = drop && drop.belowCarat > caratFloor
    ? Math.max(0, Math.min(1,
        (drop.belowCarat - carat) / (drop.belowCarat - caratFloor)))
    : 0;
  const dropMM = drop ? drop.maxMM * dropRamp : 0;

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
    /**
     * Optional floor on how deep the bend may get LOW on the pillar, with the
     * weld at the top still tracking the true carat. Without it the lower
     * shoulder — which never touches the head — keeps sagging toward the band
     * as carat falls. See bendPillarToHead in core/deform.js.
     */
    const holdScale = profile.head.pillarHoldCarat != null
      ? CARAT.scale(profile.head.pillarHoldCarat, profile.master.carat)
      : null;
    const holdFullZ = profile.head.pillarHoldFullZ ?? null;
    /**
     * Parts the pillar bend must NOT touch. The bend selects purely by height
     * (everything above pillarBendZ), which also catches structures that
     * merely pass through that band without being part of the pillar — on the
     * emerald, the plain inner band arch. Naming them here keeps them on their
     * pristine ring-size-only shape at every carat.
     */
    const bendSkip = profile.head.pillarBendSkipParts ?? [];
    /**
     * Radial thickness added to the pillars. Separate from the bend: the bend
     * only moves the pillar, and because it is a scale about the ring axis it
     * actually thins it as it deepens. See bendPillarToHead in core/deform.js.
     *
     * On top of the flat amount, an optional RING-SIZE RAMP: a bigger ring
     * stretches the same pillar over a longer arc, so it reads thinner at
     * large sizes even though its cross-section never changed. The ramp adds
     * `pillarThickenPerSize` mm for every RING_SIZE.STEP above
     * `pillarThickenFromSize`, and contributes nothing at or below it.
     */
    const perSize = profile.head.pillarThickenPerSize ?? 0;
    const fromSize = profile.head.pillarThickenFromSize ?? profile.master.ringSize;
    const sizeSteps = Math.max(0, (ringSize - fromSize) / RING_SIZE.STEP);
    const thickenMM = (profile.head.pillarThickenMM ?? 0) + perSize * sizeSteps;

    /**
     * RIGID-ABOVE-SIZE PARTS — small details that ride the shank but must not
     * be reshaped by it.
     *
     * deformMetal pushes each vertex a fixed distance along its OWN radius.
     * That preserves the cross-section of something radially thin like the
     * band, but a compact detail sitting on a pillar has vertices at
     * meaningfully different radii and angles, so they fan apart as the ring
     * grows and the detail visibly stretches. On the emerald these are the
     * bead prongs between the 2nd and 3rd accents (object_24/25/36/37): they
     * are welded to the pillar, so they move with it, but their own shape is
     * a fixed piece of metalwork that a bench jeweller would never stretch.
     *
     * Above `rigidAboveSize` they get ONE offset derived from their centroid
     * and applied to every vertex — a pure translation, so the part still
     * travels with the pillar but its shape is frozen exactly as modelled.
     * At or below the threshold nothing changes at all.
     */
    const rigidParts = profile.head.rigidAbovePartsMM ?? [];
    const rigidFrom = profile.head.rigidAboveSize ?? null;
    const rigidActive = rigidFrom != null && ringSize > rigidFrom + 1e-9;
    /**
     * SLIDE the frozen prongs down the shoulder as the ring grows.
     *
     * Sizing spreads the accents apart along the shoulder arc, so a prong
     * that is frozen in place drifts out of the gap it was set into. This
     * walks it back toward the NEXT ACCENT BELOW by
     * `rigidSlidePerSizeMM` for every RING_SIZE.STEP past `rigidAboveSize`.
     *
     * The direction is derived per part at runtime, from that part's own
     * centroid to the nearest accent centroid below it, so the left and
     * right shoulders each get their own correct vector and nothing has to
     * be hardcoded. Measured on object_24: the target sits 0.878 mm away
     * along (0.6275, -0.7787), which is distinctly NOT the tangential
     * direction (0.9047, -0.4260) — the accent row climbs faster than the
     * arc does, so sliding along the arc would miss it.
     */
    const slidePerStep = profile.head.rigidSlidePerSizeMM ?? 0;
    const slideSteps = rigidActive
      ? Math.max(0, (ringSize - rigidFrom) / RING_SIZE.STEP)
      : 0;
    /**
     * Same idea for the ACCENT STONES named by `accentSlideRanks`, on its own
     * per-step amount so a stone and the prongs beside it can be tuned apart.
     * Shares `rigidAboveSize` as the threshold, so both start moving together.
     */
    const accentSlidePerStep = profile.head.accentSlidePerSizeMM ?? 0;

    /**
     * DRAG THE SEAT WITH THE STONE.
     *
     * The bezel hole under each accent is not its own object — it is a set of
     * vertices cut into the pillar shell (measured: 593 of object_9's 4917
     * belong to the accent-#2 seat). So it cannot be translated as a part; the
     * only way to move it is to displace those vertices inside the pillar.
     *
     * Each entry is one moving stone: where its seat sits in PRISTINE model
     * space, and the offset it is about to take. Metal vertices near that
     * point get the same offset, weighted by a smooth falloff so the hole
     * travels with the stone and the surrounding pillar stays put.
     *
     * `accentSeatRadiusMM` is the falloff radius. It must stay under the
     * spacing to the neighbouring seats — measured 1.673 mm up to accent #1
     * and 1.745 mm down to accent #3 — or moving one stone would drag its
     * neighbours' holes too.
     */
    const seatRadius = profile.head.accentSeatRadiusMM ?? 0;
    const seatDrags = [];
    if (accentSlidePerStep && slideSteps && seatRadius > 0) {
      for (const s of accentSlideSet) {
        const dir = slideDirs.get(s);
        if (!dir) continue;
        const move = accentSlidePerStep * slideSteps;
        seatDrags.push({
          x: s.centroid.x,
          z: s.centroid.z,
          dx: dir.x * move,
          dz: dir.z * move,
        });
      }
    }

    for (const p of shankParts) {
      const attr = p.geometry.attributes.position;
      const target = attr.array;

      const keepRigid = !p.isStone && rigidActive && rigidParts.includes(p.name);

      if (keepRigid) {
        /**
         * Frozen shape: the radial offset for THIS part is evaluated once at
         * its centroid, exactly as deformStoneRigid does for a gemstone, and
         * every vertex gets that same translation. Y still takes the width
         * scale so the band-width control keeps working on it.
         *
         * Deliberately does NOT `continue` — the passes further down
         * (blendShankToHead, the carat bend, the hinge) still have to run.
         * These prongs sit at Z 10.05, inside the blend ramp that keeps the
         * upper shank tracking the head, so skipping it would leave them
         * behind as the ring grows. Only the SIZING step is swapped here.
         */
        deformStoneRigid(p.base, target, p.centroid, delta, boreZ);
        for (let i = 1; i < target.length; i += 3) target[i] = p.base[i] * widthScale;

        // Walk it down the shoulder toward the accent below, so it keeps its
        // place in the gap as sizing spreads the accent row apart.
        const dir = slideDirs.get(p);
        if (slidePerStep && slideSteps && dir) {
          const move = slidePerStep * slideSteps;
          for (let i = 0; i < target.length; i += 3) {
            target[i] += dir.x * move;
            target[i + 2] += dir.z * move;
          }
        }

        if (pillarBend && !bendSkip.includes(p.name)) {
          /**
           * The carat bend still applies, but through the STONE path — one
           * offset from the centroid, translated rigidly — so the prong
           * follows the pillar inward without being reshaped by it. Using
           * the per-vertex bendPillarToHead here would undo the freeze.
           */
          bendStoneToHead(
            target, p.centroid, seat, full, caratScale, bendFromZ, bulgeMM,
            holdScale, holdFullZ
          );
        }
      } else if (p.isStone) {
        // Stones ignore widthScale — they keep their size and stay centred
        // on Y = 0 however wide the band gets.
        deformStoneRigid(p.base, target, p.centroid, delta, boreZ);

        /**
         * Slide the accents named by `accentSlideRanks` down toward the stone
         * below them, on the same threshold the prongs use. A translation, so
         * the stone keeps its exact girdle — never a scale.
         */
        if (accentSlidePerStep && slideSteps && accentSlideSet.has(p)) {
          const dir = slideDirs.get(p);
          if (dir) {
            const move = accentSlidePerStep * slideSteps;
            for (let i = 0; i < target.length; i += 3) {
              target[i] += dir.x * move;
              target[i + 2] += dir.z * move;
            }
          }
        }

        if (pillarBend && !bendSkip.includes(p.name)) {
          // Accents above the seat (the topmost pavé, nearest the head) ride
          // with the head's carat scale too, so they stay flush against the
          // shoulder metal instead of floating once it bends inward.
          bendStoneToHead(
            target, p.centroid, seat, full, caratScale, bendFromZ, bulgeMM,
            holdScale, holdFullZ
          );
        }
      } else {
        deformMetal(p.base, target, delta, widthScale, boreZ);

        /**
         * Carry the bezel hole along with its stone. Weighted by distance
         * from the seat in PRISTINE space — full offset at the seat centre,
         * easing to nothing by `seatRadius` — so the hole moves as one with
         * the stone while the pillar around it is untouched.
         */
        if (seatDrags.length) {
          for (const s of seatDrags) {
            for (let i = 0; i < target.length; i += 3) {
              const ddx = p.base[i] - s.x;
              const ddz = p.base[i + 2] - s.z;
              const d = Math.hypot(ddx, ddz);
              if (d >= seatRadius) continue;
              // smoothstep from 1 at the centre to 0 at the radius
              const t = 1 - d / seatRadius;
              const w = t * t * (3 - 2 * t);
              target[i] += s.dx * w;
              target[i + 2] += s.dz * w;
            }
          }
        }

        if (pillarBend && !bendSkip.includes(p.name)) {
          // Shank metal above the seat — the pillars and the claws that carry
          // the topmost accents — bends with carat so it keeps meeting the
          // head instead of holding still while the head shrinks around it.
          bendPillarToHead(
            p.base, target, seat, full, caratScale, bendFromZ, bulgeMM,
            holdScale, holdFullZ, thickenMM, boreZ
          );
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
        // Frozen parts take the rigid path too — the blend is another
        // per-vertex radial transform, so letting it run normally would
        // reshape exactly what the freeze is protecting.
        (p.isStone || keepRigid) ? p.centroid : null
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
        // Centroid AFTER the size/width pass, which is where the seat now is.
        const seatAt = p.isStone ? centroidOf(target) : null;
        bendShoulders(
          target, bendAmount, bend.fromZ + delta, bend.tipZ + delta,
          bend.inwardMM, bend.downMM, seatAt, bend.bulgeMM ?? 0
        );
      }

      if (hinge && !hinge.excludeParts?.includes(p.name)) {
        // Centroid AFTER the size/width pass, matching bend's seatAt above.
        const rigidAt = p.isStone ? centroidOf(target) : null;
        rotateShoulderTip(
          target, hingeAmount, hinge.pivotXAbs, hinge.pivotZ + delta,
          hinge.maxAngleDeg, rigidAt, hinge.easeZ ?? 0
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
          // Centroid AFTER the rotation above, so the stone rides the pull
          // from where it now sits rather than from its pre-swing position.
          const pullAt = p.isStone ? centroidOf(target) : null;
          bendShoulders(
            target, hingeAmount,
            hinge.seatPull.fromZ + delta, hinge.seatPull.tipZ + delta,
            hinge.seatPull.inwardMM, hinge.seatPull.downMM, pullAt,
            hinge.seatPull.bulgeMM ?? 0
          );
        }
      }

      /**
       * SEAT DROP — LAST, so it translates whatever the passes above produced
       * rather than being rotated or re-weighted by them. It is a pure Z
       * translation, so ordering cannot change its magnitude; running it here
       * simply means the hinge swings the rail and THEN the whole assembly
       * descends, which is the intended composition.
       *
       * `+ delta` on both heights for the same reason the hinge and bend do
       * it: sizing has already pushed this metal radially outward, so a fixed
       * model-space height would sit at the wrong place on the deformed part.
       *
       * Stones take the rigid path (one offset at the centroid) — a
       * height-varying drop applied per vertex would stretch them along Z.
       */
      if (dropMM || (drop && dropRamp && drop.railExtraMM)) {
        const dropFromZ = (drop.fromZ ?? blendFromZ) + delta;
        const dropFullZ = (drop.fullZ ?? blendFullZ) + delta;
        /**
         * Stones always translate rigidly. So do the METAL parts named by
         * `rigidParts` — the shoulder rails and accent claws, whose long
         * triangles would otherwise be stretched by the height ramp rather
         * than moved by it (0.555 mm of edge stretch, measured; see dropSeat
         * in core/deform.js). They are the pieces that must travel with the
         * head as one body, so they take one offset like the head does.
         *
         * WHERE that offset is evaluated matters. A stone is small and sits
         * entirely inside the ramp, so its own centroid is the right place.
         * The rails are not: object_5/44 run from Z -9.53 to 13.30, so their
         * centroids land at Z 5.2/4.4 — BELOW the ramp start, where the drop
         * is zero. Evaluated there they would never move at all, and the
         * joint they are supposed to carry would tear open.
         *
         * So a rigid metal part is evaluated at `rigidAtZ` — the joint height
         * it is being asked to follow — rather than at its own middle. The
         * profile states it once; it is the height where these parts actually
         * meet the head.
         */
        const rigidAtZ = (drop.rigidAtZ ?? drop.fullZ) + delta;
        let dropAt = null;
        if (p.isStone) {
          /**
           * A stone set INTO one of the rigid parts must take that same rigid
           * offset — otherwise its claw drops the full amount while the stone
           * only takes the ramp at its own height, and the setting sinks out
           * from under it (0.756 mm of separation, measured; see
           * rigidDropStones above). Every other stone keeps the ramp.
           */
          dropAt = rigidDropStones.has(p)
            ? { z: rigidAtZ }
            : centroidOf(target);
        } else if (drop.rigidParts?.includes(p.name)) {
          dropAt = { z: rigidAtZ };
        }

        /**
         * PARTS THAT ARE BOTH THE JOINT AND THE BAND.
         *
         * A `rigidParts` entry normally sits entirely up at the joint, so one
         * offset for the whole part is right. The oval's object_5/object_44 are
         * not like that: each is a whole HALF OF THE SHANK (Z -9.53..13.30), so
         * translating it rigidly carried the band, the bore and nine pavé
         * stones down with the head — measured at 0.25 ct, the band bottom fell
         * 1.11 mm, the ring gauged US 6.38, and ten stones floated up to
         * 0.416 mm off their seats. `splitParts` keeps the rigid offset where
         * these parts clasp the head and fades it out to nothing before the
         * band. See dropSeat in core/deform.js.
         */
        /**
         * NO `+ delta` HERE, unlike dropFromZ/dropFullZ above.
         *
         * Those heights are compared against metal the earlier passes have
         * already pushed outward, so they have to follow it. This window is
         * different in two ways: dropSeat tests it against the PRISTINE `base`
         * buffer, and what it is keyed to — the gap between two pavé rows, and
         * the height where the rail meets the basket — are properties of the
         * part's own modelled geometry that radial sizing does not move up or
         * down. Shifting it by delta made it drift off the part entirely:
         * measured on object_5 (pristine top Z 13.299), the window landed at
         * Z 12.87-13.67 at US 13, so ZERO of its 2527 vertices took the offset,
         * the rail stopped following the head, and the joint opened to 0.702 mm
         * with the prong buried 0.332 mm below the shoulder. Held fixed, the
         * split stays where it was measured at every size.
         */
        const split = drop.splitParts?.includes(p.name) && drop.splitZ
          ? { aboveZ: drop.splitZ.aboveZ, fadeZ: drop.splitZ.fadeZ }
          : null;

        dropSeat(p.base, target, dropMM, dropFromZ, dropFullZ, dropAt, split);

        /**
         * RAIL EXTRA — sink the shoulder tips FURTHER than the joint, so the
         * prong still stands proud of them at low carat.
         *
         * The head shrinks with carat but the rails do not: measured with the
         * drop disabled entirely, the head's top falls 15.652 -> 13.211 mm from
         * 1.50 to 0.25 ct while the rail tops hold at 13.322 mm. Clearance of
         * the prong above the rails therefore collapses 2.329 -> 0.305 mm and
         * the setting reads as swallowed between the shoulders.
         *
         * That is NOT caused by seatDrop — the drop moves head and rails
         * together, so clearance is 0.305 mm at every value of maxMM including
         * zero. It is the head's own carat scale, and it needs its own
         * correction: lower the rails by a little MORE than the joint travels.
         *
         * Swept at 0.25 ct, resulting clearance:
         *
         *     extra   clearance      extra   clearance
         *     0.00    0.305 mm       0.40    0.705 mm
         *     0.20    0.505 mm       0.50    0.805 mm
         *     0.35    0.655 mm  <-   0.60    0.905 mm
         *
         * 0.35 restores 0.655 mm, matching the 0.665 mm the ring has at
         * 0.50 ct — the weight where the proportion still reads correctly and
         * no correction is active at all. Applied only to the rigid parts (the
         * rails and claws), on the same carat ramp as the drop, so it is 0 at
         * and above `belowCarat` and every higher weight is untouched.
         *
         * Stones set into those rails ride along, for the same reason they
         * inherit the rigid drop — otherwise the claw sinks and the stone
         * stays put.
         */
        const railExtra = (drop.railExtraMM ?? 0) * dropRamp;
        if (railExtra) {
          const ridesRails = p.isStone
            ? rigidDropStones.has(p)
            : (drop.rigidParts?.includes(p.name) ?? false);
          if (ridesRails) {
            /**
             * Gated by the SAME window as the drop above, for the same reason:
             * on a part that is also the band, an ungated extra sinks the
             * finger hole. Ungated this added the full 0.70 mm to the band
             * bottom on top of the drop — 1.72 mm of total sag at Z -10.
             */
            if (split) {
              const fadeSpan = split.aboveZ - split.fadeZ;
              for (let i = 0; i < p.base.length; i += 3) {
                const z = p.base[i + 2];
                if (z <= split.fadeZ) continue;
                const t = z >= split.aboveZ || fadeSpan <= 0
                  ? 1
                  : (z - split.fadeZ) / fadeSpan;
                const k = t * t * (3 - 2 * t);
                target[i + 2] -= railExtra * k;
              }
            } else {
              for (let i = 2; i < target.length; i += 3) target[i] -= railExtra;
            }
          }
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
  }, [shankParts, delta, ringSize, shankWidth, carat, profile, boreZ,
      headOffset, blendFromZ, blendFullZ, slideDirs, accentSlideSet,
      bend, bendAmount, hinge, hingeAmount, drop, dropMM, dropRamp,
      rigidDropStones]);

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
      /**
       * SEAT DROP rides along here as part of the same rigid translation.
       *
       * The head is free-floating above the joint, so unlike the shank it
       * needs no height ramp — the whole body descends by the full `dropMM`,
       * which is exactly what keeps its shape and internal proportions
       * untouched. The shank's ramped version of the same scalar carries the
       * shoulder rails down with it (see dropSeat in core/deform.js), so the
       * joint travels as one piece.
       */
      for (let i = 0; i < target.length; i += 3) {
        target[i] += offX;
        target[i + 2] += offZ - dropMM;
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
  }, [headParts, headOffset, carat, profile, delta, boreZ, dropMM]);

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
