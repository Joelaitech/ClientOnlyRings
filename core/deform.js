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
 *   - Z always scales fully about the seat, so overall proportions hold —
 *     EXCEPT at or below the seat, which stays frozen (see below).
 *
 * The result reads as a head re-cut for a smaller stone rather than a shrunken
 * copy of the whole assembly — which is what a bench jeweller actually does.
 *
 * Z BELOW THE SEAT IS FROZEN, NOT BLENDED WITH XY'S RAMP.
 * ---------------------------------------------------------------------------
 * An earlier version scaled Z fully about the seat unconditionally, which is
 * only correct for a head whose lowest vertex sits AT the seat. The oval's
 * stem dips to Z 9.655, 0.345 mm below its 10.00 seat, and unconditional Z
 * scaling pulled that stem tip UPWARD as carat shrank, opening a gap against
 * the gallery it's modelled to sit in.
 *
 * The fix tried first shared XY's smoothstep weight with Z too, ramping both
 * from the seat to fullAtZ. That broke something else: two head surfaces
 * that are modelled to meet or nearly meet at slightly different HEIGHTS
 * within that ramp (a stem next to a claw base, say) each got their OWN
 * height's blend weight — which are meant to differ continuously by design
 * — and so picked up slightly different Z scale factors and visibly pulled
 * apart exactly at that internal join, on top of the gallery joint this was
 * meant to fix.
 *
 * So Z gets a plain TWO-PIECE rule instead: frozen (identity) at or below
 * the seat, then the ORIGINAL unconditional linear scale above it — the same
 * formula every ring already used above the seat, untouched. Only the
 * previously-unconditional part below the seat changes; nothing above it,
 * and XY's own ramp, are touched at all.
 *
 * OPTIONAL LIFT — counteracts the seat-ward pull reading as "sunk into the
 * band" at low carat. Shrinking scale<1 necessarily pulls everything above
 * the seat DOWN toward it (that's what "scale about the seat" means), which
 * on the oval read as the whole basket dropping too close to the gallery
 * band right where they meet. `liftMM` adds a small upward ADDITIVE offset —
 * not a further scale — above the seat, ramping in with XY's own `w` so it
 * is exactly 0 at the seat (no new discontinuity there) and full strength by
 * fullAtZ. Being additive rather than multiplied by position, it does not
 * reintroduce the internal-join separation the blended-scale attempt above
 * caused: two nearly-coincident vertices at slightly different heights pick
 * up nearly the same lift, not a lever-arm-amplified difference.
 *
 * @param {Float32Array} base   pristine head positions
 * @param {Float32Array} target buffer to write into
 * @param {number} scale        carat linear scale (1 = master)
 * @param {number} seatZ        the plane where head metal meets the shoulders
 * @param {number} fullAtZ      height at which XY scaling reaches full strength
 * @param {number} [liftMM]     extra upward travel at scale -> 0, full strength
 *   by fullAtZ, fading to 0 at the seat; 0 (no lift) by default
 */
export function deformHead(base, target, scale, seatZ, fullAtZ, liftMM = 0) {
  const span = fullAtZ - seatZ;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  for (let i = 0; i < base.length; i += 3) {
    const x = base[i];
    const y = base[i + 1];
    const z = base[i + 2];

    // XY: ramp from master width at the seat to full scale higher up.
    let w;
    if (span <= 0 || z >= fullAtZ) w = 1;
    else if (z <= seatZ) w = 0;
    else w = smoothstep((z - seatZ) / span);

    // Z: frozen at/below the seat (so a stem dipping below it stays put),
    // the original full linear scale about the seat above it, plus the
    // optional lift (0 at the seat, same ramp as XY, so it stays continuous).
    target[i + 2] = z <= seatZ ? z : seatZ + (z - seatZ) * scale + liftMM * (1 - scale) * w;

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
 * @param {{x:number,y:number,z:number}|null} rigidAt  stone centroid, or null for metal
 * @param {number} [bulgeMM]  outward bow at the ramp's midpoint, fading to 0 at
 *   both `fromZ` (still attached, unmoved) and the tip (still fully pulled in
 *   and down) — reads as the shoulder flexing outward before curving in to
 *   meet the head, rather than swinging inward on a straight hinge. 0 by
 *   default (the original straight-pull shape).
 */
export function bendShoulders(
  target, amount, fromZ, tipZ, inwardMM, downMM, rigidAt = null, bulgeMM = 0
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
    const t = Math.min(1, (z - fromZ) / span);
    const w = smoothstep(t) * amount;
    if (w === 0) return;

    const r = Math.hypot(rigidAt.x, rigidAt.y);
    const pull = r > 1e-6 ? (inwardMM * w) / r : 0;
    let dx = -rigidAt.x * pull;
    let dy = -rigidAt.y * pull;
    const dz = -downMM * w;

    if (bulgeMM && r > 1e-6) {
      const bow = 4 * t * (1 - t) * amount;
      dx += (rigidAt.x / r) * bulgeMM * bow;
      dy += (rigidAt.y / r) * bulgeMM * bow;
    }

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

    const t = Math.min(1, (z - fromZ) / span);
    const w = smoothstep(t) * amount;
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

      if (bulgeMM) {
        const bow = 4 * t * (1 - t) * amount;
        target[i] += (x / r) * bulgeMM * bow;
        target[i + 1] += (y / r) * bulgeMM * bow;
      }
    }
    target[i + 2] = z - downMM * w;
  }
}

/**
 * Rotate the shoulder tip RIGIDLY about a fixed pivot, as an alternative to
 * bendShoulders() above.
 *
 * bendShoulders scales each vertex's pull by its OWN height, so a straight
 * rail segment comes out progressively more curved toward the tip — visually
 * that reads as the piece being reshaped (chipped/warped) rather than moved.
 * A real rail doesn't bow; it pivots at its base. Rotating every vertex above
 * the pivot by the SAME angle preserves the segment's shape exactly (every
 * edge stays the same length and stays straight) while still swinging the
 * far end in and down to meet a smaller head.
 *
 * Only vertices ABOVE pivotZ move; at and below it, untouched, which is
 * where the segment stays attached to the rest of the shoulder.
 *
 * `pivotXAbs` is a MAGNITUDE, not a signed coordinate — the two shoulders are
 * a mirrored pair of parts (one all-positive-X, one all-negative-X), so each
 * vertex's own sign picks which side's pivot (+pivotXAbs or -pivotXAbs) and
 * which rotation direction (so both shoulders sweep inward, not one out).
 *
 * @param {Float32Array} target    buffer to modify IN PLACE (already size/width deformed)
 * @param {number} amount          0..1 blend of the full rotation (0 = no rotation)
 * @param {number} pivotXAbs       |X| of the hinge point (same magnitude both sides)
 * @param {number} pivotZ          Z of the hinge point — at or below this, untouched
 * @param {number} maxAngleDeg     rotation at amount = 1, in degrees
 * @param {{x:number,y:number,z:number}|null} rigidAt  stone centroid, or null for metal
 */
export function rotateShoulderTip(target, amount, pivotXAbs, pivotZ, maxAngleDeg, rigidAt = null) {
  if (amount <= 0) return;
  const angle = (maxAngleDeg * Math.PI / 180) * amount;

  const rotate = (x, z) => {
    const sign = x >= 0 ? 1 : -1;
    const pivotX = sign * pivotXAbs;
    const theta = sign * angle;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const dx = x - pivotX;
    const dz = z - pivotZ;
    return [pivotX + dx * cosT - dz * sinT, pivotZ + dx * sinT + dz * cosT];
  };

  // Stones: evaluate the rotation ONCE at the centroid and translate the
  // whole stone by that offset, exactly as bendShoulders' rigidAt path does
  // — a stone must never be reshaped, only moved.
  if (rigidAt) {
    if (rigidAt.z <= pivotZ) return;
    const [nx, nz] = rotate(rigidAt.x, rigidAt.z);
    const dx = nx - rigidAt.x;
    const dz = nz - rigidAt.z;
    for (let i = 0; i < target.length; i += 3) {
      target[i] += dx;
      target[i + 2] += dz;
    }
    return;
  }

  for (let i = 0; i < target.length; i += 3) {
    const z = target[i + 2];
    if (z <= pivotZ) continue;
    const [nx, nz] = rotate(target[i], z);
    target[i] = nx;
    target[i + 2] = nz;
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
