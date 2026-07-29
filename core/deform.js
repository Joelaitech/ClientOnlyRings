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
 * Bend the shoulder tips in and down to meet a small head.
 * ---------------------------------------------------------------------------
 * At the bottom of the carat range a uniformly-scaled head is both narrower
 * and shorter than the shoulders it sits between, so the tips no longer reach
 * it. On the pear at 0.25 ct the basket rail lands at Z 10.76-11.33 / |X| <=
 * 1.70 while the tips are at Z 11.96-12.96 / |X| 2.05-3.68.
 *
 * Every attempt to fix this from the HEAD side broke the 0.50-3.00 range,
 * which is otherwise correct. Moving the SHANK instead is strictly safer: the
 * head is untouched, so nothing that already works can regress, and the
 * correction is zero above `belowCarat`.
 *
 * The bend is weighted by height (`fromZ` -> the tip), so the band, the bore
 * and the pave all stay exactly where they were — only the last couple of
 * millimetres of shoulder move.
 *
 * @param {Float32Array} target buffer to modify IN PLACE (already size/width deformed)
 * @param {number} amount   0..1 blend of the full correction (0 = no bend)
 * @param {number} fromZ    height where the bend starts easing in
 * @param {number} tipZ     height of the tips, where it reaches full strength
 * @param {number} inwardMM how far the tip moves toward the ring axis
 * @param {number} downMM   how far the tip drops
 */
export function bendShoulders(
  target, amount, fromZ, tipZ, inwardMM, downMM, rigidAt = null
) {
  if (amount <= 0) return;
  const span = tipZ - fromZ;
  if (span <= 0) return;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  /**
   * A pavé stone must travel with its seat but never deform: bending it would
   * squash the girdle. So when `rigidAt` is supplied — the stone's centroid —
   * the weight is evaluated ONCE there and the whole stone is translated by
   * that single offset.
   *
   * Without this the stones stayed put while the metal around them moved, and
   * they visibly popped out of the shoulders.
   */
  if (rigidAt) {
    const z = rigidAt.z;
    if (z <= fromZ) return;
    const w = smoothstep(Math.min(1, (z - fromZ) / span)) * amount;
    if (w === 0) return;

    const r = Math.hypot(rigidAt.x, rigidAt.y);
    const pull = r > 1e-6 ? (inwardMM * w) / r : 0;
    const dx = -rigidAt.x * pull;
    const dy = -rigidAt.y * pull;
    const dz = -downMM * w;

    for (let i = 0; i < target.length; i += 3) {
      target[i] += dx;
      target[i + 1] += dy;
      target[i + 2] += dz;
    }
    return;
  }

  for (let i = 0; i < target.length; i += 3) {
    const z = target[i + 2];
    if (z <= fromZ) continue;

    const w = smoothstep(Math.min(1, (z - fromZ) / span)) * amount;
    if (w === 0) continue;

    // Move toward the ring axis in the ring-face plane. Scaling rather than
    // translating keeps the two shoulders symmetric without needing to know
    // which side a vertex is on.
    const x = target[i];
    const y = target[i + 1];
    const r = Math.hypot(x, y);
    if (r > 1e-6) {
      const pull = (inwardMM * w) / r;
      target[i] = x - x * pull;
      target[i + 1] = y - y * pull;
    }
    target[i + 2] = z - downMM * w;
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
