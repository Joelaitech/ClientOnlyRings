/**
 * RING PROFILE — oval  (supplier code "RN")
 * ============================================================================
 * Oval solitaire, nail-prong set, with 9 pavé accents per shoulder plus a
 * gallery of smaller accents under the head.
 *
 * COORDINATE SYSTEM (Rhino, do not rotate on import)
 *   +Z  = up through the head
 *   +Y  = ring axis (finger passes along Y); band is thin in Y
 *   +X  = across the ring face
 *
 * SOURCE  rn s.obj (shank, 173 452 v) + rn h.obj (head, 17 852 v) +
 *         rn f.obj (fused, 191 304 v — unused; 173452 + 17852 = 191304, so the
 *         split is lossless).
 *
 * ACCENT COUNT — read this before changing the label.
 *
 * The shank carries 38 accents, but only the 18 x 1.60 mm are SIDE stones:
 * measured L9/R9 along the shoulders. The remaining 20 are smaller gallery
 * decoration clustered under the head at Z 7.2-9.1 (8 x 1.00, 4 x 1.10,
 * 8 x 1.20 mm) and are not side attachments.
 *
 * The spec sheet's "Total Dia. 39" is the sum of all five rows — 1 oval centre
 * plus 8 + 4 + 8 + 18 accents — not 9 accents plus a centre.
 */

export default {
  id: 'oval',
  sku: 'RN',
  name: 'Oval Solitaire',
  subtitle: 'Pavé Shoulders · Gallery',
  description: '18K · Natural Diamond',

  models: {
    shank: 'shank.glb',
    head: 'head.glb',
  },
  sourceFiles: { shank: 'shank.obj', head: 'head.obj' },

  master: {
    /** Kasa circle fit iterated onto the inner surface, sd 0.0024 mm. */
    boreCenter: { x: 0, y: 0, z: 0.310 },
    boreRadius: 8.0267,

    /** Fitted ID 16.033 mm = US 6.42; the spec sheet states US 6.5. */
    ringSize: 6.5,

    /** Spec sheet: 1.500 ct. Already on the 0.25 grid. */
    carat: 1.50,
    /** Long axis, along Y. Measured 9.904; spec sheet 9.9 x 6.5. */
    stoneMM: 9.904,

    /**
     * MEASURED Y span on the plain lower arc: 2.465 mm — the widest band of
     * the four rings.
     */
    shankWidthMM: 2.465,

    /** Measured radially on the same arc. Sheet says 1.8 MM CAD. */
    thicknessMM: 2.111,
  },

  centerStone: {
    cut: 'oval',
    /** Measured 6.500 x 9.904 x 3.780 mm. */
    widthMM: 6.500,
    lengthMM: 9.904,
    depthMM: 3.780,
  },

  /**
   * SIDE stones only — the 18 x 1.60 mm along the shoulders, 9 per side.
   * `count` is what the spec panel totals, so it deliberately excludes the
   * gallery accents listed separately below.
   */
  accents: {
    cut: 'round',
    mm: 1.60,
    caratEach: 0.018,
    count: 18,
    perSide: 9,
  },

  /**
   * Decorative accents under and around the head, not side attachments.
   * Reported separately in the spec panel so the total carat stays honest.
   */
  galleryAccents: {
    cut: 'round',
    count: 20,
    sizes: [1.20, 1.10, 1.00],
    /** 8 x 0.008 + 4 x 0.006 + 8 x 0.005 = 0.128 ct. */
    totalCarat: 0.128,
  },

  head: {
    /** Culet of the centre stone. Kept for reference; see seatZ. */
    pivotZ: 11.471,
    /**
     * SEAT — the Z plane where this head's metal actually meets the shoulders,
     * measured as the height of closest XY approach between the two meshes.
     *
     * Carat scaling pivots HERE, not on the culet. Pivoting on the culet let
     * the seat drop by up to 0.95 mm as the head shrank, which opened the joint
     * and let the shoulders arch over the head at low carat.
     */
    seatZ: 10.00,
    /**
     * Height at which the head's XY scaling reaches full strength.
     *
     * Below the seat the footprint stays at master width so the head remains
     * welded to the shoulders; above this it scales fully so the claws and
     * stone shrink properly. Chosen by sweeping candidate heights and taking
     * the one with the smallest worst-case joint gap over 0.25-1.00 ct.
     */
    scaleFullAtZ: 10.50,

    /**
     * LIFT — at 0.25 ct the head reads as sunk too far down toward the
     * gallery band: shrinking necessarily pulls everything above the seat
     * DOWN toward it (deformHead scales Z about the seat), and here that
     * read as the basket crowding the band right where they meet. A small
     * additive upward offset above the seat (0 right at the seat, full
     * strength by scaleFullAtZ — see deformHead in core/deform.js) gives it
     * back some clearance without moving the seat itself or the frozen stem
     * below it, so the gallery joint fixed earlier is untouched.
     */
    liftMM: 0.9,

    /**
     * FREEZE THE STEM PLATE BELOW 0.50 CT.
     * ---------------------------------------------------------------------
     * object_1/5/8/9 together form the squarish post that drops from the
     * seat into the gallery (Z 9.66-11.19 — measured per-quadrant, X/Y up to
     * 1.18/1.62). That single visual "plate" straddles BOTH of deformHead's
     * internal boundaries at once (seatZ 10.00 and scaleFullAtZ 10.50), so
     * part of it sits frozen, part ramps, and part gets full scale + lift —
     * three different rates of change inside one piece. That was fine at
     * 0.50 ct (small differences), but continuing to shrink it down to
     * 0.25 ct pulled those sub-regions apart fast enough to visibly "chip"
     * the block apart right where it meets the band.
     *
     * freezeBelowCarat holds this piece at EXACTLY its 0.50 ct shape for any
     * carat below that — it simply stops changing instead of continuing to
     * split. Every other head part (the claws, the stone) keeps scaling
     * normally all the way to 0.25 ct; only this plate is exempted.
     */
    freezeParts: ['object_1', 'object_5', 'object_8', 'object_9'],
    freezeBelowCarat: 0.50,

    /**
     * SHOULDER HINGE — close the last joint from the SHANK side, as a RIGID
     * rotation rather than a curve (see rotateShoulderTip in core/deform.js).
     *
     * Same underlying failure as the pear: at the bottom of the carat range
     * the basket rail (head object_3) shrinks away from the shoulder it sits
     * against. bendShoulders (a per-vertex height-scaled pull) was tried
     * first — closing the gap, but visibly reshaping a straight rail into a
     * curve, which read as the piece being chipped rather than moved.
     *
     * A pivot at Z 12.0 (tried first) only rotated the small top claw piece
     * (shank object_3, Z 12.57-13.58) — everything below it, including the
     * accent rows at Z 9.90-12.41 (shank object_7/8/21/22/27/28/41/42), held
     * completely still. That left a visible seam where the rotated tip met
     * the untouched shoulder below it, and the tip itself no longer lined up
     * with the rest of the pillar — reading as a gap, not a bend.
     *
     * pivotZ 9.0 (first try) instead: below the lowest of those accent parts
     * (9.90), so ALL of them rotate as complete, undistorted rigid pieces
     * along with the top of shank object_5 above this height — the whole
     * visible pillar swings together as one connected unit.
     *
     * BUT 9.0 cuts straight through the GALLERY — the small decorative ring
     * of accents under the head (shank object_56-95 and the smaller
     * Diamond_Round gallery stones, all centred near X=0, topping out at
     * Z 9.53/9.56). Splitting that lattice partway up its height visibly
     * shredded it. pivotZ 9.7 clears the gallery's highest point (9.56) with
     * margin while still sitting below the shoulder accent parts (9.90) —
     * so the gallery stays completely untouched and the whole shoulder
     * pillar still swings as one piece above it.
     *
     * pivotXAbs 5.903 is the measured cross-section centroid of shank
     * object_5 at Z 9.7. Below this height the shoulder (and the whole
     * gallery) is untouched — still exactly on its own modelled shape.
     *
     * maxAngleDeg 14: swept against object_3's real corners — moves
     * (2.92, 13.58) to about (2.07, 12.74), essentially unchanged from the
     * Z 9.0 pivot (the shorter arm from the higher pivot barely affects the
     * result) — the same rigid swing, just guaranteed not to touch the
     * gallery.
     *
     * excludeParts: object_49 is a curved bridge under the gallery that
     * CROSSES the centre line (X -1.27 to 1.27), reaching up to Z 9.768 —
     * just above pivotZ. rotateShoulderTip picks rotation direction from
     * each vertex's own sign(x), so the sliver of object_49 above the pivot
     * got mirrored rotations on either side of X=0 at once, folding a single
     * continuous curved surface in half right down its middle — the curved
     * top-to-bottom "crack" through the gallery band. Raising pivotZ instead
     * (to clear 9.768) was tried and rejected: a genuine shoulder accent
     * stone sits at centroid Z 9.74, right in the gap between object_49's
     * top and the claws' floor (9.897) — no single height clears one without
     * also freezing the other. Excluding object_49 by name has no such
     * conflict: it never touches the shoulders (it is not part of the
     * pillar), so leaving it untouched costs nothing.
     */
    shoulderHinge: {
      belowCarat: 0.50,
      pivotXAbs: 5.903,
      pivotZ: 9.7,
      maxAngleDeg: 14,
      excludeParts: ['object_49'],
    },

    tableZ: 15.251,
    minZ: 9.655,
    maxZ: 15.628,
    /** Head metal footprint across Y. The band overhangs past this. */
    widthMM: 9.904,
    centreOffsetY: 0,
    minComfortableCarat: 0.50,
  },

  skipParts: [],
};
