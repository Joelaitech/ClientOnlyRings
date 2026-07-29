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
