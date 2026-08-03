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
 * Blend the TOP of the shank from its own radial sizing offset to the HEAD's
 * single rigid one, so the two still meet at large ring sizes.
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * deformMetal pushes every shank vertex along ITS OWN radius from the bore.
 * Near the band that is exactly right. But the shoulder RAIL runs up to the
 * head, and its own radius points progressively further outboard the higher it
 * goes — so as the ring grows, the rail's tip fans OUTWARD in X. Measured on
 * the oval's object_5 tip, US 6.5 -> US 13: X 2.981 -> 3.571 mm, +0.59 mm of
 * pure sideways travel.
 *
 * The head does not follow that fan. It is one rigid body translated along a
 * single direction taken at its own centroid (see the head effect in
 * src/Ring.jsx), because letting IT fan per-vertex is what splayed the setting
 * open in the first place. So the rail slides laterally off the basket it is
 * modelled to clasp, and the joint opens by an amount proportional to `delta`:
 *
 *     oval, 0.50 ct, basket -> shoulder rail
 *        US 3    0.035 mm      US 10   0.199 mm
 *        US 6.5  0.057 mm      US 13   0.397 mm
 *
 * Fourteen times the master weld at the top of the size range, and invisible at
 * the size the mount was tuned at — which is why it survived the carat sweeps.
 *
 * THE CORRECTION is to hand the rail the head's offset instead of its own,
 * ramped in by height so nothing below the joint is disturbed:
 *
 *   - at/below `fromZ` the vertex keeps its own radial offset exactly, so the
 *     band, the bore and the pave are bit-identical to before;
 *   - by `fullZ` it has taken the head's offset in full, so rail and basket
 *     travel as one piece however large the ring gets;
 *   - smoothstep between, so there is no crease where the ramp starts.
 *
 * Applied as a DIFFERENCE on top of deformMetal's output, so it composes with
 * the carat-driven bends that run after it rather than replacing them.
 *
 * @param {Float32Array} base    pristine shank positions (for the height test)
 * @param {Float32Array} target  buffer already written by deformMetal
 * @param {number} delta         radial offset in mm, same value deformMetal got
 * @param {number} boreCenterZ
 * @param {number} headOffX      the head's single rigid X offset
 * @param {number} headOffZ      the head's single rigid Z offset
 * @param {number} fromZ         height where the blend starts easing in
 * @param {number} fullZ         height at which it reaches the head's offset
 * @param {{x:number,z:number}|null} [rigidAt]  stone centroid, or null for metal
 */
export function blendShankToHead(
  base, target, delta, boreCenterZ, headOffX, headOffZ, fromZ, fullZ, rigidAt = null
) {
  const span = fullZ - fromZ;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  /** One vertex's own radial offset, the thing we are blending away from. */
  const ownOffset = (x, z) => {
    const dz = z - boreCenterZ;
    const r = Math.hypot(x, dz);
    if (r < 1e-6) return [0, delta];
    return [(x / r) * delta, (dz / r) * delta];
  };

  /**
   * A stone must never be reshaped, so it takes ONE offset evaluated at its
   * centroid and translates rigidly — the same rule deformStoneRigid and
   * bendStoneToHead already use for the pave.
   */
  if (rigidAt) {
    const z = rigidAt.z;
    if (z <= fromZ) return;
    const w = span <= 0 ? 1 : smoothstep(Math.min(1, (z - fromZ) / span));
    const [ox, oz] = ownOffset(rigidAt.x, rigidAt.z);
    const dx = (headOffX - ox) * w;
    const dz = (headOffZ - oz) * w;
    for (let i = 0; i < target.length; i += 3) {
      target[i] += dx;
      target[i + 2] += dz;
    }
    return;
  }

  for (let i = 0; i < base.length; i += 3) {
    const z = base[i + 2];
    if (z <= fromZ) continue;
    const w = span <= 0 ? 1 : smoothstep(Math.min(1, (z - fromZ) / span));
    const [ox, oz] = ownOffset(base[i], z);
    target[i] += (headOffX - ox) * w;
    // Y is the band-width axis and must stay independent of ring size.
    target[i + 2] += (headOffZ - oz) * w;
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
 * Stretch the shoulder's reach UPWARD, toward the head, without adding any
 * new geometry.
 *
 * "Make the pillar longer" sounds like it needs new material welded onto the
 * tip, but every shoulder mesh in this catalogue is a single CLOSED solid
 * (measured on the pear: object_1 is 4868 verts / 19590 indices, capped at
 * the tip, not an open shell with a rim to extrude from). Cutting one open
 * and stitching in new topology blind — no way to render and check the
 * result here — risks a torn or inside-out mesh that has no visible symptom
 * until someone opens it in a viewer.
 *
 * This gets the same visual result a different way: pure Z motion, so it
 * cannot thin the pillar. Every vertex keeps its own (x, y) exactly — only
 * its height changes — so a cross-section's shape at a given moment in the
 * stretch is identical to its pristine shape, just relocated. Below `fromZ`
 * nothing moves (still welded to the rest of the shoulder). Between `fromZ`
 * and `toZ` the extra height ramps in with a smoothstep. At and above `toZ`
 * every vertex gets the full `extendMM` — a rigid cap riding up as one piece,
 * so the tip's own shape is exactly preserved, just moved.
 *
 * Intended to run BEFORE rotateShoulderTip() in the same pass, so the hinge
 * then bends the newly-extended reach rather than the original one.
 *
 * @param {Float32Array} base    pristine shank-metal positions
 * @param {Float32Array} target  buffer to modify IN PLACE (already size/width deformed)
 * @param {number} fromZ         height below which nothing moves
 * @param {number} toZ           height at which the full extension is reached
 * @param {number} extendMM      how far the tip moves up, in mm
 */
export function extendPillarZ(base, target, fromZ, toZ, extendMM) {
  if (!extendMM) return;
  const span = toZ - fromZ;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  for (let i = 0; i < base.length; i += 3) {
    const z = base[i + 2];
    if (z <= fromZ) continue;
    const t = span <= 0 ? 1 : Math.min(1, (z - fromZ) / span);
    target[i + 2] += extendMM * smoothstep(t);
  }
}

/**
 * Rigid counterpart of extendPillarZ() for shank ACCENT STONES — the same
 * upward stretch, but evaluated once at the stone's centroid and applied as
 * one translation, so a stone never gets reshaped by it (only ever moved).
 *
 * @param {Float32Array} target    buffer already written by deformStoneRigid
 * @param {{z:number}} centroid    stone centroid in pristine model space
 * @param {number} fromZ
 * @param {number} toZ
 * @param {number} extendMM
 */
export function extendStoneZ(target, centroid, fromZ, toZ, extendMM) {
  if (!extendMM) return;
  const z = centroid.z;
  if (z <= fromZ) return;
  const span = toZ - fromZ;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const t = span <= 0 ? 1 : Math.min(1, (z - fromZ) / span);
  const dz = extendMM * smoothstep(t);

  for (let i = 0; i < target.length; i += 3) target[i + 2] += dz;
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

  /**
   * Stones: evaluate the rotation ONCE at the centroid, then apply that SAME
   * rigid rotation to every vertex about the centroid.
   *
   * A stone must never be RESHAPED — but a rigid body rotation is not a
   * reshaping, and it is what actually happens on the bench. An earlier
   * version only TRANSLATED the stone by its centroid's offset (copying
   * bendShoulders' rigidAt path, where the correction is a bend and there is
   * no single well-defined rotation to inherit). That was wrong here, because
   * this function's whole point is that the seat swings through a real angle:
   * measured on the oval at 0.25 ct, the seat metal rotated the full 14 deg
   * while its six shoulder stones travelled up to 0.84 mm and tilted 0.00 deg
   * — every stone left cocked 14 deg in its setting, driving its girdle
   * through one seat wall and opening daylight at the other. That is the gap
   * reported at both shoulder ends.
   *
   * Rotating about the CENTROID rather than the hinge pivot is what keeps this
   * rigid: the centroid lands exactly where the translate-only version put it
   * (so the stone still follows its seat), and the extra rotation is pure
   * orientation about that point — girdle diameter and table size are
   * unchanged, which `verify`'s "stones never resize" check confirms.
   */
  if (rigidAt) {
    if (rigidAt.z <= pivotZ) return;
    const [nx, nz] = rotate(rigidAt.x, rigidAt.z);
    const dx = nx - rigidAt.x;
    const dz = nz - rigidAt.z;

    // The seat's own swing: same sign convention as rotate() above, so a
    // stone on either shoulder tilts the way its own side is tilting.
    const theta = (rigidAt.x >= 0 ? 1 : -1) * angle;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    for (let i = 0; i < target.length; i += 3) {
      // Rotate about the centroid in the XZ (ring-face) plane...
      const ox = target[i] - rigidAt.x;
      const oz = target[i + 2] - rigidAt.z;
      target[i] = rigidAt.x + ox * cosT - oz * sinT + dx;
      // ...Y is the ring axis and the hinge does not act on it.
      target[i + 2] = rigidAt.z + ox * sinT + oz * cosT + dz;
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
 * SCALE FLOOR (`holdScale`) — why the lower pillar needs one.
 * ---------------------------------------------------------------------------
 * The correction above is `(scale - 1) * w`: `w` shapes it by HEIGHT, but its
 * magnitude is driven by `scale` alone, so every height keeps deepening at the
 * same rate as carat falls. On the emerald that is right at the top (the weld
 * must track the head, which really is shrinking) and wrong lower down: the
 * shoulder there does not touch the head at all, so it just sags toward the
 * band. Measured on object_9, going 0.50 -> 0.25 ct, the pillar's mid-section
 * pulled inward another 0.69 mm at Z 7.2-9.6 while the top moved 0.42 mm — the
 * lower shoulder moved MORE than the tip it was supposed to be following.
 *
 * Raising `bendFromZ` does not fix it: starting later crams the same total
 * correction into less height, which measured WORSE (0.87 mm of low drift) and
 * turned the smooth sweep into a cliff at the start of the ramp.
 *
 * So `holdScale` clamps the scale the bend below `holdFullZ` is allowed to see,
 * while the weld at `fullAtZ` still uses the true `scale`. Between the two the
 * clamp releases smoothly, so the pillar keeps bending toward the head at its
 * tip while its lower run holds the shape it had at the held carat. Unset, the
 * clamp is inert and this behaves exactly as before for every other ring.
 *
 * @param {Float32Array} base    pristine shank-metal positions
 * @param {Float32Array} target  buffer already written by deformMetal
 * @param {number} seatZ         head's seat plane — the Z pivot for the contact scale
 * @param {number} fullAtZ       height at which the bend reaches full carat scale (the weld)
 * @param {number} scale         carat linear scale, same value passed to deformHead
 * @param {number} [bendFromZ]   height where the visible bend starts easing in; default seatZ
 * @param {number} [bulgeMM]     outward bow at the ramp's midpoint, at scale -> 0; default 0
 * @param {number} [holdScale]   floor on the scale the LOW pillar may see; null = no clamp
 * @param {number} [holdFullZ]   height where the clamp has fully released into
 *   the true `scale`; below it the clamp is at full strength. Default fullAtZ.
 * @param {number} [thickenMM]   grow the pillar's radial THICKNESS by this much.
 *   Independent of the bend: it pushes each vertex along its own radius, away
 *   from the pillar's local mid-radius AT ITS OWN HEIGHT, so the inner face
 *   moves in and the outer face moves out by half this each. Tapers to 0 at
 *   the weld so it cannot punch through the basket. 0 = off.
 * @param {number} [boreCenterZ] bore centre Z — the radius origin for thickening.
 */
export function bendPillarToHead(
  base, target, seatZ, fullAtZ, scale, bendFromZ = seatZ, bulgeMM = 0,
  holdScale = null, holdFullZ = null,
  thickenMM = 0, boreCenterZ = 0
) {
  const span = fullAtZ - bendFromZ;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  // The clamp is only meaningful while the true scale is below the floor.
  const clamping = holdScale != null && scale < holdScale;
  const releaseTo = holdFullZ ?? fullAtZ;
  const releaseSpan = releaseTo - bendFromZ;

  /**
   * THICKNESS NEEDS THE PILLAR'S OWN CENTRELINE, PER HEIGHT.
   *
   * A single constant mid-radius does not work: measured on the emerald's
   * object_9 the pillar's mid-radius climbs from ~9.4 at Z 6.5 to ~13.1 at
   * the tip, so any fixed value puts most of the pillar entirely on one side
   * of the split — the whole cross-section then translates instead of
   * expanding, and the measured thickness barely moves (and inverts where the
   * constant lands outside the metal).
   *
   * So bin the pristine vertices by height first and take each bin's own
   * mid-radius. One extra pass over `base`, only when thickening is on.
   */
  const thickening = thickenMM !== 0;
  const BIN = 0.25;
  let binMid = null;
  let binMinZ = 0;
  let thickenTopZ = 0;
  if (thickening) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < base.length; i += 3) {
      const z = base[i + 2];
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    binMinZ = lo;
    // This part's own top — where it meets the head. Taken from the mesh so
    // no profile value has to track it, and so a part that stops short of the
    // weld fades out at its own end rather than somewhere in mid-air.
    thickenTopZ = hi;
    const count = Math.max(1, Math.ceil((hi - lo) / BIN) + 1);
    const rMin = new Float64Array(count).fill(Infinity);
    const rMax = new Float64Array(count).fill(-Infinity);
    for (let i = 0; i < base.length; i += 3) {
      const b = Math.min(count - 1, Math.floor((base[i + 2] - lo) / BIN));
      const r = Math.hypot(base[i], base[i + 2] - boreCenterZ);
      if (r < rMin[b]) rMin[b] = r;
      if (r > rMax[b]) rMax[b] = r;
    }
    binMid = new Float64Array(count);
    for (let b = 0; b < count; b++) {
      binMid[b] = rMax[b] >= rMin[b] ? (rMin[b] + rMax[b]) / 2 : NaN;
    }
  }

  for (let i = 0; i < base.length; i += 3) {
    const x = base[i];
    const z = base[i + 2];
    if (z <= bendFromZ) continue;

    const t = span <= 0 ? 1 : Math.min(1, (z - bendFromZ) / span);
    const w = smoothstep(t);

    /**
     * Blend from the held floor up to the true scale by height, so the weld
     * still lands exactly on the head while the lower run stays put.
     */
    let s = scale;
    if (clamping) {
      const r = releaseSpan <= 0 ? 1 : Math.min(1, Math.max(0, (z - bendFromZ) / releaseSpan));
      s = holdScale + (scale - holdScale) * smoothstep(r);
    }

    target[i] += x * (s - 1) * w;
    target[i + 2] += (z - seatZ) * (s - 1) * w;

    if (bulgeMM) {
      const bow = 4 * t * (1 - t); // 0 at both ends, 1 at the ramp's midpoint
      const dir = x >= 0 ? 1 : -1;
      target[i] += dir * bulgeMM * bow * (1 - s);
    }

    /**
     * THICKNESS. Deliberately NOT a scale about the ring axis — that is what
     * the bend above does, and because it multiplies each vertex by its own x
     * the outer face travels further than the inner one, so deepening the bend
     * actually THINS the pillar. There is no value of bulge/hold that can add
     * material back, because both only translate.
     *
     * So this pushes each vertex along its own radius, away from the pillar's
     * local mid-radius: outer face out by half, inner face in by half, giving
     * `thickenMM` total. Applied on the PRISTINE radius (from `base`) so the
     * split stays symmetric no matter how far the bend has already moved the
     * vertex, then added as a plain offset on top of whatever the bend wrote.
     *
     * Tapered by (1 - t) so it is full strength where the bend starts and zero
     * at the weld — the tip must stay exactly where the head expects it, and
     * the master pillar is only 0.19 mm thick there anyway, so thickening it
     * would immediately punch through the basket.
     */
    if (thickening) {
      const dx = x;
      const dz = z - boreCenterZ;
      const r = Math.hypot(dx, dz);
      const mid = binMid[Math.min(binMid.length - 1, Math.floor((z - binMinZ) / BIN))];
      if (r > 1e-6 && Number.isFinite(mid)) {
        /**
         * Tapered against the PILLAR'S OWN TOP, not the bend's `fullAtZ`.
         * On the emerald fullAtZ is 9.5 while the pillar runs to 13.06, so
         * reusing the bend's ramp faded the thickness out less than halfway
         * up — the whole span from the bend to the weld, which is exactly the
         * stretch that needed thickening, got nothing.
         *
         * Full strength from bendFromZ, easing to 0 over the last `FADE` mm
         * so the tip still lands on the head unchanged.
         */
        const FADE = 1.5;
        const fadeStart = thickenTopZ - FADE;
        let taper = 1;
        if (z >= thickenTopZ) taper = 0;
        else if (z > fadeStart) taper = 1 - smoothstep((z - fadeStart) / FADE);

        const push = (r >= mid ? 0.5 : -0.5) * thickenMM * taper;
        target[i] += (dx / r) * push;
        target[i + 2] += (dz / r) * push;
      }
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
 * @param {number} [holdScale]  see bendPillarToHead; null = no clamp
 * @param {number} [holdFullZ]  see bendPillarToHead; default fullAtZ
 */
export function bendStoneToHead(
  target, centroid, seatZ, fullAtZ, scale, bendFromZ = seatZ, bulgeMM = 0,
  holdScale = null, holdFullZ = null
) {
  const z = centroid.z;
  if (z <= bendFromZ) return;

  const span = fullAtZ - bendFromZ;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const t = span <= 0 ? 1 : Math.min(1, (z - bendFromZ) / span);
  const w = smoothstep(t);

  // Same height-blended scale floor the metal uses, evaluated once at the
  // stone's own height so it rides with the shoulder it is set into.
  let s = scale;
  if (holdScale != null && scale < holdScale) {
    const releaseTo = holdFullZ ?? fullAtZ;
    const releaseSpan = releaseTo - bendFromZ;
    const r = releaseSpan <= 0 ? 1 : Math.min(1, Math.max(0, (z - bendFromZ) / releaseSpan));
    s = holdScale + (scale - holdScale) * smoothstep(r);
  }

  let dx = centroid.x * (s - 1) * w;
  const dz = (z - seatZ) * (s - 1) * w;

  if (bulgeMM) {
    const bow = 4 * t * (1 - t);
    const dir = centroid.x >= 0 ? 1 : -1;
    dx += dir * bulgeMM * bow * (1 - s);
  }

  for (let i = 0; i < target.length; i += 3) {
    target[i] += dx;
    target[i + 2] += dz;
  }
}

/**
 * Build a small solid, tapered box from scratch — used to plug a gap that
 * only exists because of a profile's OWN custom shoulder adjustments
 * (shoulderHinge / pillarExtend / bandLift), not something present in any
 * shipped GLB. There is nothing to extrude from for a gap like that; it has
 * to be authored as new geometry.
 *
 * A box, not a organic patch, because it can be verified by construction: 6
 * flat quads, checked here to have outward-facing normals (see the winding
 * comment below), so there is no risk of an inside-out face no matter how
 * the profile's dimensions are set. That trades sculptural elegance for
 * certainty that it will render as a solid, lit correctly, filled shape —
 * the right trade when nobody can view-and-adjust it live.
 *
 * Bottom face is centred at (offsetX, 0, baseZ), sized baseWidthX x
 * baseWidthY. Top face is centred at (offsetX, 0, topZ), sized topWidthX x
 * topWidthY — independent width/depth top and bottom, so it can taper
 * (typically narrower at the top, echoing the band's own peak just below
 * it) or stay a plain prism if top and bottom are set equal.
 *
 * @param {object} opts
 * @param {number} opts.baseWidthX
 * @param {number} opts.baseWidthY
 * @param {number} opts.topWidthX
 * @param {number} opts.topWidthY
 * @param {number} opts.baseZ
 * @param {number} opts.topZ
 * @param {number} [opts.offsetX] X of the box's centre line; 0 = ring axis
 * @returns {{positions: Float32Array, indices: Uint16Array}}
 */
export function buildFillerBox({
  baseWidthX, baseWidthY, topWidthX, topWidthY, baseZ, topZ, offsetX = 0,
}) {
  const bx = baseWidthX / 2, by = baseWidthY / 2;
  const tx = topWidthX / 2, ty = topWidthY / 2;

  // 8 corners: 0-3 at baseZ (bottom), 4-7 at topZ (top), each ring going
  // -X-Y, +X-Y, +X+Y, -X+Y.
  const positions = new Float32Array([
    -bx + offsetX, -by, baseZ,   bx + offsetX, -by, baseZ,
     bx + offsetX,  by, baseZ,  -bx + offsetX,  by, baseZ,
    -tx + offsetX, -ty, topZ,    tx + offsetX, -ty, topZ,
     tx + offsetX,  ty, topZ,   -tx + offsetX,  ty, topZ,
  ]);

  /**
   * Each face as a quad [a,b,c,d], split (a,b,c)(a,c,d). Winding verified
   * numerically (each face's cross-product normal dotted against the
   * direction from the box centre to the face centre, all six positive —
   * i.e. every face point outward) rather than by hand, since hand-deriving
   * six windings is exactly the kind of thing that silently produces one
   * inside-out face.
   */
  const quads = [
    [0, 3, 2, 1], // bottom, -Z
    [4, 5, 6, 7], // top, +Z
    [0, 1, 5, 4], // front, -Y
    [3, 7, 6, 2], // back, +Y
    [0, 4, 7, 3], // left, -X
    [1, 2, 6, 5], // right, +X
  ];
  const indices = new Uint16Array(quads.length * 6);
  let k = 0;
  for (const [a, b, c, d] of quads) {
    indices[k++] = a; indices[k++] = b; indices[k++] = c;
    indices[k++] = a; indices[k++] = c; indices[k++] = d;
  }

  return { positions, indices };
}

/**
 * FIXED TOPOLOGY for a self-measuring bridge across an arbitrarily-shaped
 * gap: N cross-sections along X, each a vertical wall from the surface
 * below to the surface above, swept into one continuous solid. Unlike
 * buildFillerBox (one box, hand-set dimensions), this is meant to be
 * measured against the ACTUAL current geometry every time it is drawn — see
 * sampleArchFillerPositions below — so it keeps fitting even if the
 * shoulder settings it is bridging (shoulderHinge / pillarExtend / bandLift)
 * get retuned later.
 *
 * The INDEX buffer never changes (same N slices, same wall structure every
 * time), only the vertex POSITIONS get resampled per render — see
 * sampleArchFillerPositions. That split is what makes updating this cheap:
 * rebuild positions on every carat/ring-size change, but the topology (and
 * its verified winding) is computed once.
 *
 * 4 vertices per slice: bottom-front, bottom-back, top-front, top-back
 * (front/back being the two faces along Y, the ring's thin axis). Faces:
 * front wall, back wall, top wall, bottom wall (each a strip of quads
 * between adjacent slices), plus two end caps closing the first and last
 * slice into a solid.
 *
 * @param {number} n  number of X slices (n >= 2)
 * @returns {Uint16Array} index buffer, verified below for outward winding
 */
export function buildArchFillerTopology(n) {
  const BF = 0, BB = 1, TF = 2, TB = 3; // per-slice vertex roles
  const vi = (slice, role) => slice * 4 + role;
  const quads = [];

  for (let s = 0; s < n - 1; s++) {
    // front wall (-Y face): looking from -Y, CCW is BF(s), BF(s+1), TF(s+1), TF(s)
    quads.push([vi(s, BF), vi(s + 1, BF), vi(s + 1, TF), vi(s, TF)]);
    // back wall (+Y face): reversed sense relative to front
    quads.push([vi(s, BB), vi(s, TB), vi(s + 1, TB), vi(s + 1, BB)]);
    // top wall (+Z-ish face, the underside of the pillar/head)
    quads.push([vi(s, TF), vi(s + 1, TF), vi(s + 1, TB), vi(s, TB)]);
    // bottom wall (-Z-ish face, resting on the band)
    quads.push([vi(s, BF), vi(s, BB), vi(s + 1, BB), vi(s + 1, BF)]);
  }
  // end caps, one at each extreme slice, closing the solid
  quads.push([vi(0, BF), vi(0, TF), vi(0, TB), vi(0, BB)]);
  quads.push([vi(n - 1, BF), vi(n - 1, BB), vi(n - 1, TB), vi(n - 1, TF)]);

  const indices = new Uint16Array(quads.length * 6);
  let k = 0;
  for (const [a, b, c, d] of quads) {
    indices[k++] = a; indices[k++] = b; indices[k++] = c;
    indices[k++] = a; indices[k++] = c; indices[k++] = d;
  }
  return indices;
}

/**
 * Fill the POSITIONS for buildArchFillerTopology's fixed index buffer, by
 * measuring the actual gap between two already-deformed part groups at
 * render time — this is what makes the bridge self-fitting instead of a
 * hand-set shape.
 *
 * For each of `n` evenly-spaced X values across [xMin, xMax]: the BOTTOM
 * surface's height is the highest Z any `belowParts` vertex reaches within
 * `xToleranceMM` of that X; the TOP surface's height is the lowest Z any
 * `aboveParts` vertex reaches there. Where the two are already touching or
 * overlapping (top <= bottom — the real shoulder contact, outside the gap),
 * the slice collapses to zero height, so the bridge only has material where
 * a real gap exists and tapers to nothing at its own edges by construction.
 *
 * @param {number} n                  slice count, must match the topology's n
 * @param {number} xMin
 * @param {number} xMax
 * @param {number} xToleranceMM       how wide an X band counts as "at this slice"
 * @param {number} halfWidthY         half the bridge's Y width (its face-to-face span)
 * @param {Array<{name:string, target:Float32Array}>} belowParts  e.g. the band
 * @param {Array<{name:string, target:Float32Array}>} aboveParts  e.g. the pillar
 * @returns {Float32Array} positions, ready for buildArchFillerTopology(n)'s indices
 */
export function sampleArchFillerPositions(
  n, xMin, xMax, xToleranceMM, halfWidthY, belowParts, aboveParts
) {
  const positions = new Float32Array(n * 4 * 3);
  const step = n > 1 ? (xMax - xMin) / (n - 1) : 0;

  const extremeAt = (parts, x, wantMax) => {
    let best = wantMax ? -Infinity : Infinity;
    let found = false;
    for (const { target } of parts) {
      for (let i = 0; i < target.length; i += 3) {
        if (Math.abs(target[i] - x) > xToleranceMM) continue;
        const z = target[i + 2];
        if (wantMax ? z > best : z < best) { best = z; found = true; }
      }
    }
    return found ? best : null;
  };

  for (let s = 0; s < n; s++) {
    const x = xMin + step * s;
    const bottomZ = extremeAt(belowParts, x, true);
    const topZRaw = extremeAt(aboveParts, x, false);
    // No data at this X for either surface (outside both parts' extent):
    // collapse to a zero-height sliver at whichever Z is known, or 0.
    const bZ = bottomZ ?? topZRaw ?? 0;
    const tZ = topZRaw != null && topZRaw > bZ ? topZRaw : bZ;

    const o = s * 4 * 3;
    positions[o + 0] = x; positions[o + 1] = -halfWidthY; positions[o + 2] = bZ;  // BF
    positions[o + 3] = x; positions[o + 4] =  halfWidthY; positions[o + 5] = bZ;  // BB
    positions[o + 6] = x; positions[o + 7] = -halfWidthY; positions[o + 8] = tZ;  // TF
    positions[o + 9] = x; positions[o + 10] = halfWidthY; positions[o + 11] = tZ; // TB
  }
  return positions;
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

/**
 * MIRRORED-STONE WINDING FIX — supplier defect, corrected at load.
 * ============================================================================
 * Every one of the four supplied models has one shoulder's pavé stones wound
 * backwards. The artist modelled a single shoulder and MIRRORED it across
 * X = 0 to make the other; a mirror is a negative scale, which reverses
 * triangle handedness, and no normals-unify pass was run afterwards.
 *
 * Proof it is upstream, not ours: signed volume is already negative in the raw
 * OBJs, and mirrored partners match to four decimals with opposite sign
 * (pear x=-9.99 -> +0.2911, x=+9.99 -> -0.2911). Nothing in this pipeline can
 * flip winding — the deformers only translate and scale by POSITIVE factors.
 *
 * Affected stones, per shank (side is NOT consistent between rings, so this
 * detects rather than assumes):
 *   pear        7 of 14   right     emerald   8 of 16   left
 *   clientobj2  7 of 14   left      oval     19 of 38   mixed (14 pavé + 5 gallery)
 *
 * Why it renders hollow: three.js culls back faces by default, so on a
 * reversed stone the near surface is discarded and you see through it. The
 * diamond material also uses transmission, which refracts against the surface
 * normal — pointing inward, those stones lose their sparkle entirely.
 *
 * DoubleSide would hide it but not fix it: refraction still runs against
 * inward normals, so the mirrored side stays visibly duller than its partner.
 * Reversing the triangles is the real correction.
 */

/**
 * Signed volume of a closed triangle mesh (divergence theorem).
 *
 * Positive = outward-facing normals. Negative = reversed winding.
 *
 * Only meaningful on a CLOSED mesh, which is why isWatertight() gates the fix.
 */
export function signedVolume(pos, index) {
  let vol = 0;
  const tri = (a, b, c) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
    vol += (ax * (by * cz - bz * cy)
          - ay * (bx * cz - bz * cx)
          + az * (bx * cy - by * cx)) / 6;
  };
  if (index) {
    for (let i = 0; i < index.length; i += 3) tri(index[i], index[i + 1], index[i + 2]);
  } else {
    for (let i = 0; i < pos.length / 3; i += 3) tri(i, i + 1, i + 2);
  }
  return vol;
}

/**
 * Is every edge shared by exactly two triangles?
 *
 * MUST weld by POSITION first. These meshes carry split vertices along the
 * hard girdle edges — the same point appears under several indices so its
 * normals can differ — and testing raw indices reports every stone as open
 * when in fact none are. Measured on a pear melee: 1166 raw indices weld to
 * 458 real vertices, 912 triangles, zero boundary edges.
 */
export function isWatertight(pos, index) {
  if (!index) return false;
  const ids = new Map();
  const weld = new Int32Array(pos.length / 3);
  for (let i = 0; i < pos.length / 3; i++) {
    const k = `${pos[i * 3].toFixed(5)}_${pos[i * 3 + 1].toFixed(5)}_${pos[i * 3 + 2].toFixed(5)}`;
    let id = ids.get(k);
    if (id === undefined) { id = ids.size; ids.set(k, id); }
    weld[i] = id;
  }
  const edges = new Map();
  for (let i = 0; i < index.length; i += 3) {
    const a = weld[index[i]], b = weld[index[i + 1]], c = weld[index[i + 2]];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  for (const n of edges.values()) if (n !== 2) return false;
  return true;
}

/**
 * Reverse triangle winding in place and flip the shipped normals to match.
 *
 * Swapping two corners of every triangle reverses handedness. The NORMAL
 * attribute must be negated too — it was exported already-flipped, so leaving
 * it would light the now-correct surface as though it still faced inward.
 */
export function reverseWinding(index, normal) {
  for (let i = 0; i < index.length; i += 3) {
    const t = index[i + 1];
    index[i + 1] = index[i + 2];
    index[i + 2] = t;
  }
  if (normal) for (let i = 0; i < normal.length; i++) normal[i] = -normal[i];
}

/**
 * Detect and repair a mirrored stone. Returns true if it was flipped.
 *
 * SELF-DETECTING and conservative: a correctly-authored stone has positive
 * volume and is left untouched, so this is a no-op on a clean re-export and
 * cannot damage a good file. Open shells are skipped rather than guessed at —
 * signed volume is meaningless on them.
 */
export function fixMirroredStone(geometry) {
  const pos = geometry.attributes.position?.array;
  const index = geometry.index?.array;
  const normal = geometry.attributes.normal?.array;
  if (!pos || !index) return false;
  if (!isWatertight(pos, index)) return false;
  if (signedVolume(pos, index) >= 0) return false;
  reverseWinding(index, normal);
  return true;
}
