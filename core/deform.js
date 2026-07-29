/**
 * SHANK DEFORMER — ring-agnostic.
 * ============================================================================
 * Takes a bore centre and offsets; knows nothing about any particular model.
 * Every ring in the catalogue uses these same three functions.
 *
 * WHY A RING IS NOT UNIFORMLY SCALED
 * ---------------------------------------------------------------------------
 * Scaling the whole mesh to change size would thicken the band and enlarge
 * the stones. Real sizing only adds length to the hoop; the cross-section is
 * unchanged. So we push each metal vertex outward along its own radial
 * direction by a fixed DISTANCE (not a ratio) — the cross-section is
 * translated, never stretched.
 *
 * WIDTH is a separate axis: a scale along Y, the ring axis. The two never
 * interact, because Y is not part of the radial term.
 */

/**
 * Deform shank metal: radial expansion for ring size, Y scale for width.
 *
 * @param {Float32Array} base        pristine master positions (never mutated)
 * @param {Float32Array} target      buffer to write deformed positions into
 * @param {number} delta             radial offset in mm (+ grows the bore)
 * @param {number} widthScale        multiplier along the ring axis
 * @param {number} boreCenterZ       the ring's bore centre Z, from its profile
 */
export function deformMetal(base, target, delta, widthScale = 1, boreCenterZ = 0) {
  for (let i = 0; i < base.length; i += 3) {
    const x = base[i];
    const y = base[i + 1];
    const z = base[i + 2];

    const dx = x;
    const dz = z - boreCenterZ;
    const r = Math.hypot(dx, dz);

    // Width: uniform scale along the ring axis, applied to ALL shank metal so
    // the band stays one continuous object at any width. Shank metal is
    // symmetric about Y = 0, so this needs no re-centring term.
    target[i + 1] = y * widthScale;

    if (r < 1e-6) {
      target[i] = x;
      target[i + 2] = z;
      continue;
    }

    // Radial: a fixed distance along each vertex's own radius, so band
    // thickness is preserved exactly at every size.
    target[i] = x + (dx / r) * delta;
    target[i + 2] = z + (dz / r) * delta;
  }
}

/**
 * Translate a stone rigidly. The offset is computed ONCE from the centroid
 * and applied to every vertex, so the stone moves with its seat but never
 * changes size — deriving it per-vertex would scale the stone with the ring.
 *
 * @param {Float32Array} base
 * @param {Float32Array} target
 * @param {{x:number,z:number}} centroid  stone centroid in model space
 * @param {number} delta
 * @param {number} boreCenterZ
 */
export function deformStoneRigid(base, target, centroid, delta, boreCenterZ = 0) {
  const dx = centroid.x;
  const dz = centroid.z - boreCenterZ;
  const r = Math.hypot(dx, dz);

  let ox = 0;
  let oz = 0;
  if (r > 1e-6) {
    ox = (dx / r) * delta;
    oz = (dz / r) * delta;
  }

  for (let i = 0; i < base.length; i += 3) {
    target[i] = base[i] + ox;
    // Y verbatim: the stone keeps its diameter and its centring however wide
    // the band gets. Applying the width scale here would silently turn the
    // width control into a carat control for the melee.
    target[i + 1] = base[i + 1];
    target[i + 2] = base[i + 2] + oz;
  }
}

/**
 * Scale a HEAD for carat while keeping its base welded to the shoulders.
 *
 * WHY A PLAIN GROUP SCALE IS NOT ENOUGH
 * ---------------------------------------------------------------------------
 * Scaling the head group uniformly shrinks its FOOTPRINT as well as its stone.
 * Measured on the pear ring at 0.25 ct, the head's contact face pulled 0.50 mm
 * inward in X and the joint visibly opened — and no vertical offset can close
 * that, because the gap is horizontal (0.6 mm of travel recovered only 0.10 mm).
 *
 * So the scale is blended by HEIGHT ABOVE THE SEAT:
 *   - at and below the seat, XY stays at master width, so the base keeps
 *     touching the shoulders exactly as modelled;
 *   - above `fullAtZ`, XY scales fully, so the claws and stone shrink properly;
 *   - Z always scales fully about the seat, so overall proportions hold.
 *
 * The result reads as a head re-cut for a smaller stone rather than a shrunken
 * copy of the whole assembly — which is what a bench jeweller actually does.
 *
 * @param {Float32Array} base   pristine head positions
 * @param {Float32Array} target buffer to write into
 * @param {number} scale        carat linear scale (1 = master)
 * @param {number} seatZ        the plane where head metal meets the shoulders
 * @param {number} fullAtZ      height at which XY scaling reaches full strength
 */
export function deformHead(base, target, scale, seatZ, fullAtZ) {
  const span = fullAtZ - seatZ;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  for (let i = 0; i < base.length; i += 3) {
    const x = base[i];
    const y = base[i + 1];
    const z = base[i + 2];

    // Z: full scale about the seat, so the seat plane is invariant.
    target[i + 2] = seatZ + (z - seatZ) * scale;

    // XY: ramp from master width at the seat to full scale higher up.
    let w;
    if (span <= 0 || z >= fullAtZ) w = 1;
    else if (z <= seatZ) w = 0;
    else w = smoothstep((z - seatZ) / span);

    const s = 1 + (scale - 1) * w;
    target[i] = x * s;
    target[i + 1] = y * s;
  }
}

/**
 * Bend shank metal that rises above the head's seat so it keeps meeting the
 * head as carat scales it.
 *
 * The shoulder pillars — and the claws that carry the topmost pavé accents —
 * are shank metal, so deformMetal only ever pushes them by the ring-size
 * radial delta; they hold still while deformHead shrinks the head's
 * footprint for a smaller stone. That leaves a gap open exactly where those
 * parts are modelled to meet or sit flush against the head.
 *
 * The CONTACT POINT (z >= fullAtZ) must land exactly where the head's own
 * edge does, so it uses the same seat-pivoted scale deformHead applies there
 * (w = 1: x*scale, z = seatZ + (z-seatZ)*scale) — shank and head share one
 * origin, so a vertex and the head vertex it touches start at the same
 * pristine (x, z) and this keeps them together at every carat.
 *
 * BELOW that, the ramp is deliberately widened past the head's own
 * seatZ..scaleFullAtZ span (which is ~0.5 mm — fine for the head, but reads
 * as a hinge rather than a bend when reused for the whole pillar). `bendFromZ`
 * lets a profile start the ramp further down the pillar, and `bulgeMM` adds a
 * small outward bow that peaks at the ramp's midpoint and fades to 0 at both
 * ends — 0 at bendFromZ (still welded) and 0 at fullAtZ (still exactly on the
 * head) — so it reads as a rod flexing rather than kinking at a fixed hinge.
 * Both default to the old hinge-at-the-seat behaviour when unset.
 *
 * Applied as a CORRECTION on top of deformMetal's output (which has already
 * written the ring-size radial delta into `target`), so ring sizing is left
 * untouched; only the carat-driven bend is added. Y is left alone — that is
 * the shank-width axis and must stay independent of carat.
 *
 * @param {Float32Array} base    pristine shank-metal positions
 * @param {Float32Array} target  buffer already written by deformMetal
 * @param {number} seatZ         head's seat plane — the Z pivot for the contact scale
 * @param {number} fullAtZ       height at which the bend reaches full carat scale (the weld)
 * @param {number} scale         carat linear scale, same value passed to deformHead
 * @param {number} [bendFromZ]   height where the visible bend starts easing in; default seatZ
 * @param {number} [bulgeMM]     outward bow at the ramp's midpoint, at scale -> 0; default 0
 */
export function bendPillarToHead(base, target, seatZ, fullAtZ, scale, bendFromZ = seatZ, bulgeMM = 0) {
  const span = fullAtZ - bendFromZ;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  for (let i = 0; i < base.length; i += 3) {
    const x = base[i];
    const z = base[i + 2];
    if (z <= bendFromZ) continue;

    const t = span <= 0 ? 1 : Math.min(1, (z - bendFromZ) / span);
    const w = smoothstep(t);

    target[i] += x * (scale - 1) * w;
    target[i + 2] += (z - seatZ) * (scale - 1) * w;

    if (bulgeMM) {
      const bow = 4 * t * (1 - t); // 0 at both ends, 1 at the ramp's midpoint
      const dir = x >= 0 ? 1 : -1;
      target[i] += dir * bulgeMM * bow * (1 - scale);
    }
  }
}

/**
 * Rigid counterpart of bendPillarToHead() for shank ACCENT STONES.
 *
 * A stone must never be resized, so it cannot take the per-vertex bend above
 * — that would stretch it as its top and bottom vertices pick up different
 * corrections. Instead the whole stone is translated once, by the amount its
 * OWN CENTROID would move under the same formula, exactly as deformStoneRigid
 * derives one offset from the centroid for ring size. Call this after
 * deformStoneRigid has written the ring-size offset into `target`.
 *
 * @param {Float32Array} target    buffer already written by deformStoneRigid
 * @param {{x:number,z:number}} centroid  stone centroid in pristine model space
 * @param {number} seatZ
 * @param {number} fullAtZ
 * @param {number} scale
 * @param {number} [bendFromZ]  see bendPillarToHead; default seatZ
 * @param {number} [bulgeMM]    see bendPillarToHead; default 0
 */
export function bendStoneToHead(target, centroid, seatZ, fullAtZ, scale, bendFromZ = seatZ, bulgeMM = 0) {
  const z = centroid.z;
  if (z <= bendFromZ) return;

  const span = fullAtZ - bendFromZ;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const t = span <= 0 ? 1 : Math.min(1, (z - bendFromZ) / span);
  const w = smoothstep(t);

  let dx = centroid.x * (scale - 1) * w;
  const dz = (z - seatZ) * (scale - 1) * w;

  if (bulgeMM) {
    const bow = 4 * t * (1 - t);
    const dir = centroid.x >= 0 ? 1 : -1;
    dx += dir * bulgeMM * bow * (1 - scale);
  }

  for (let i = 0; i < target.length; i += 3) {
    target[i] += dx;
    target[i + 2] += dz;
  }
}

/** Centroid of a position buffer, in the XZ plane. */
export function centroidXZ(pos) {
  let sx = 0;
  let sz = 0;
  const n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) {
    sx += pos[i];
    sz += pos[i + 2];
  }
  return { x: sx / n, z: sz / n };
}
