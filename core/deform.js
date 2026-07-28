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
