/**
 * RING PROFILE — emerald  (supplier code "LR60189-2")
 * ============================================================================
 * Emerald-cut solitaire, nail-prong set, with 8 pavé accents per shoulder.
 *
 * COORDINATE SYSTEM (Rhino, do not rotate on import)
 *   +Z  = up through the head
 *   +Y  = ring axis (finger passes along Y); band is thin in Y
 *   +X  = across the ring face
 *
 * SOURCE  LR60189-2 s.obj (shank, 191 220 v) + LR60189-2 h.obj (head,
 *         10 604 v) + LR60189-2 f.obj (fused, 201 824 v — unused;
 *         191220 + 10604 = 201824, so the split is lossless).
 *
 * Note this is an EMERALD cut, not a cushion — confirmed by both the spec
 * sheet and the Diamond_Emerald group name.
 */

export default {
  id: 'emerald',
  sku: 'LR60189-2',
  name: 'Emerald Solitaire',
  subtitle: 'Pavé Shoulders',
  description: '18K · Natural Diamond',

  models: {
    shank: 'shank.glb',
    head: 'head.glb',
  },
  sourceFiles: { shank: 'shank.obj', head: 'head.obj' },

  master: {
    /** Kasa circle fit iterated onto the inner surface, sd 0.0153 mm. */
    boreCenter: { x: 0.007, y: 0, z: 0.062 },
    boreRadius: 7.8031,

    /** Fitted ID 15.621 mm = US 5.91; the spec sheet states US 5. */
    ringSize: 5.0,

    /** Spec sheet: 1.000 ct. Already on the 0.25 grid. */
    carat: 1.00,
    /** Long axis, along Y. Measured 7.200; spec sheet 7.2 x 5.0. */
    stoneMM: 7.200,

    /**
     * MEASURED Y span on the plain lower arc: 1.972 mm.
     *
     * The spec sheet's "2.0 MM CAD" is a thickness callout at a different
     * location, not the band width — taking it as width made the app render
     * the band 4.5% narrow at its own default.
     */
    shankWidthMM: 1.972,

    /** Measured radially on the same arc. Sheet says 1.6 MM CAD. */
    thicknessMM: 1.794,
  },

  centerStone: {
    cut: 'emerald',
    /** Measured 5.000 x 7.200 x 3.000 mm. */
    widthMM: 5.000,
    lengthMM: 7.200,
    depthMM: 3.000,
  },

  /** 16 round accents, 8 per shoulder. Spec sheet: 1.55 mm, 0.016 ct each. */
  accents: {
    cut: 'round',
    mm: 1.55,
    caratEach: 0.016,
    count: 16,
    perSide: 8,
  },

  head: {
    /** Culet of the centre stone. Kept for reference; see seatZ. */
    pivotZ: 11.594,
    /**
     * SEAT — the Z plane where this head's metal actually meets the shoulders,
     * measured as the height of closest XY approach between the two meshes.
     *
     * Carat scaling pivots HERE, not on the culet. Pivoting on the culet let
     * the seat drop by up to 0.95 mm as the head shrank, which opened the joint
     * and let the shoulders arch over the head at low carat.
     */
    seatZ: 9.00,
    /**
     * Height at which the head's XY scaling reaches full strength.
     *
     * Below the seat the footprint stays at master width so the head remains
     * welded to the shoulders; above this it scales fully so the claws and
     * stone shrink properly. Chosen by sweeping candidate heights and taking
     * the one with the smallest worst-case joint gap over 0.25-1.00 ct.
     */
    scaleFullAtZ: 9.50,
    /**
     * Opt-in for the shank pillar/accent carat-bend (see bendPillarToHead
     * and bendStoneToHead in core/deform.js, wired in src/Ring.jsx). Only
     * this ring sets it — the other profiles get no bend at all, same as
     * before this feature existed.
     */
    pillarBend: true,
    /**
     * The pillars' contact point with the head must land exactly at
     * scaleFullAtZ (see bendPillarToHead in core/deform.js), but easing that
     * over just seatZ..scaleFullAtZ (0.5 mm) reads as a hinge, not a bend —
     * measured Z 0.63-13.06 on the pillar meshes (object_8/object_9), so
     * there is plenty of shoulder to sweep the curve across instead.
     */
    pillarBendZ: 4.5,
    /**
     * Outward bow at the bend's midpoint, at the minimum carat.
     *
     * 1.4, raised from 0.5: the scale floor below stops the lower pillar
     * sagging FURTHER, but the bow is what actually carries it back outward.
     * Measured on object_9 at 0.25 ct, mid-run x at Z 7.8/9.0 goes
     * 5.67/3.80 (bow 0.5) -> 5.86/3.93 (bow 1.4), against the 0.50 ct
     * reference of 5.70/4.01 — so the mid-section lands essentially back on
     * the shape that already reads correctly. The bow is 0 at both ends of
     * the ramp by construction, so the tip stays welded at x 1.61 at every
     * value tried, and it scales with (1 - scale), so the 1.00 ct master is
     * untouched.
     */
    pillarBulgeMM: 1.4,
    /**
     * The plain inner band arch — NOT part of the pillar, but it passes
     * through the same height range, so the height-selected bend was catching
     * it and moving it up to 0.47 mm at 0.25 ct.
     *
     * Identified by radius from the bore rather than by height, which is what
     * actually separates the two structures: these sit at r 7.8-9.0 (the bore
     * is 7.80, so they ARE the band) while the pillars object_8/object_9 sit
     * at r 8.8-10.5 outside them. Listing them here keeps the band on its
     * pristine ring-size-only shape at every carat.
     */
    pillarBendSkipParts: ['object_7', 'object_30', 'object_33'],
    /**
     * HOLD THE LOWER PILLAR — stop it sagging toward the band at 0.25 ct.
     *
     * The bend's depth is driven by carat alone, so as the slider fell the
     * WHOLE pillar kept pulling inward at the same rate — but only its tip
     * actually touches the head. Measured on object_9, 0.50 -> 0.25 ct, the
     * mid-section (Z 7.2-9.6) pulled inward another 0.69 mm while the tip
     * moved only 0.42 mm: the part that was not attached to anything moved
     * further than the part that was, which is exactly the "pillars bent too
     * far toward the band" report. At 0.50 ct the same bend reads correctly,
     * so the shape to preserve is the one it already has there.
     *
     * These clamp the scale the bend may see LOW on the pillar to its 0.50 ct
     * value, releasing smoothly into the true carat by Z 13.06 (the pillar's
     * own measured top) so the weld still lands exactly on the head. Swept
     * against the 0.50 ct reference profile: worst low-run deviation falls
     * 0.692 -> 0.350 mm, with the tip unchanged at x 1.61.
     *
     * The floor is 0.50 and not a deeper hold (0.75 measured better on paper,
     * 0.180 mm) because the clamp is inert only at and above its own carat:
     * a 0.75 floor would have altered the 0.50 ct render too, and 0.50 is the
     * shape being matched, not one to change. Above 0.50 ct every vertex is
     * bit-identical to before this existed — verified, max delta 0.000000.
     *
     * pillarHoldFullZ is capped at the pillar's measured top: pushing the
     * release higher keeps improving the low run (0.237 mm at 15.0) but drags
     * the tip off the head with it (x 1.61 -> 1.67), reopening the joint this
     * whole mechanism exists to close.
     *
     * Raising pillarBendZ was tried first and made it worse (0.87 mm, and it
     * turned the sweep into a cliff) — starting later just crams the same
     * total correction into less height.
     */
    pillarHoldCarat: 1.00,
    pillarHoldFullZ: 15.06,

    /**
     * ============================================================
     * PILLAR THICKNESS  <-- CHANGE THIS ONE
     * ============================================================
     * How much radial thickness to ADD to the pillars, in mm, from the bend
     * point up toward the head. 0 = off (the shipped mesh, unchanged).
     *
     *   0.0  master, as modelled
     *   0.2  subtle
     *   0.4  clearly chunkier
     *   0.6+ heavy
     *
     * Half goes to the inner face and half to the outer, so the pillar's
     * centreline stays put and only its cross-section grows.
     *
     * This is SEPARATE from the bend on purpose. The bend is a scale about the
     * ring axis, which multiplies each vertex by its own x — so the outer face
     * travels further than the inner one and deepening the bend actually THINS
     * the pillar. No value of pillarBulgeMM or pillarHoldCarat can add metal
     * back; they only translate. This adds it directly.
     *
     * It tapers to zero at the weld: the master pillar is only 0.19 mm thick
     * where it meets the head (measured on object_9 at Z 13.0), so thickening
     * there would immediately punch through the basket. Full strength sits
     * down at pillarBendZ, fading out as it climbs.
     *
     * Applies at every carat, not just 0.25 — it is a property of the metal,
     * not a carat correction.
     */
    pillarThickenMM: 0.0,

    /**
     * ============================================================
     * PILLAR THICKNESS PER RING SIZE  <-- AND THIS ONE
     * ============================================================
     * Extra mm of pillar thickness added for every ring-size STEP above
     * pillarThickenFromSize. The size slider steps in 0.5 US
     * (RING_SIZE.STEP), so 0.01 here = +0.01 mm per half-size.
     *
     * Adds ON TOP of the flat pillarThickenMM above; that one applies at
     * every size, this one only above the threshold. 0 = off, flat amount
     * only.
     *
     * Why: a bigger ring stretches the same pillar over a longer arc, so it
     * reads visually thinner at large sizes even though its cross-section
     * never actually changed. This compensates. At 0.01/step the whole
     * US 5 -> 13 range adds 0.16 mm, which is deliberately subtle — raise
     * it if the taper is still visible at the top of the range.
     *
     * Sizes at or below the threshold get nothing, so US 5 and down render
     * exactly as they do today.
     */
    pillarThickenPerSize: 0.022,
    // /** Ring size the per-size ramp starts from. Below this it contributes 0. */
    pillarThickenFromSize: 5.0,

    /**
     * ============================================================
     * FREEZE THE BEAD PRONGS ABOVE A RING SIZE
     * ============================================================
     * The four bead prongs that grip the pillar between the 2nd and 3rd
     * accent stones (counting down from the head): object_24/25 on the right
     * shoulder, object_36/37 on the left — two per side, front and back,
     * all centred at Z 10.05 in the gap between accent #2 (Z 10.03-11.25)
     * and accent #3 (Z 8.79-9.94).
     *
     * They sit ON the pillars, so every per-vertex transform the pillars get
     * — the radial sizing offset, the head blend, the carat bend — was also
     * fanning these apart. Each is a compact block whose vertices span real
     * differences in radius and angle, so a transform that only preserves a
     * thin band's cross-section visibly stretches them.
     *
     * Above `rigidAboveSize` each one is instead translated as a single rigid
     * piece: one offset taken at its own centroid, applied to every vertex.
     * It still travels with the pillar and still follows the carat bend, but
     * its own shape is exactly as modelled. At or below the threshold the
     * behaviour is completely unchanged.
     */
    rigidAboveSize: 6.5,
    rigidAbovePartsMM: ['object_24', 'object_25', 'object_36', 'object_37'],

    /**
     * ============================================================
     * PRONG SLIDE PER RING SIZE  <-- CHANGE THIS ONE
     * ============================================================
     * How far each frozen prong slides DOWN the shoulder — toward the third
     * accent below it — for every ring-size step past rigidAboveSize.
     *
     * The slider steps in 0.5 US (RING_SIZE.STEP), so this is mm per
     * half-size. 0 = off, the prongs just sit frozen where they are.
     *
     *   0.00  no slide
     *   0.02  subtle
     *   0.05  clear
     *   0.10  strong
     *
     * For scale: at the master size the prong sits 0.878 mm from the accent
     * below it, and US 6.5 -> 13 is 13 steps, so 0.067 would close the whole
     * gap. Values well under that are the useful range.
     *
     * The direction is worked out per part at runtime (see slideDirs in
     * src/Ring.jsx) — from each prong's own centroid to the nearest accent
     * below it on the same shoulder — so both sides slide correctly and
     * nothing is hardcoded. Only applies above rigidAboveSize; at or below
     * it the prongs are untouched.
     */
    rigidSlidePerSizeMM: 0.02,

    /**
     * ============================================================
     * ACCENT SLIDE PER RING SIZE  <-- CHANGE THIS ONE
     * ============================================================
     * Moves the 2nd accent stone on each shoulder DOWN toward the 3rd accent
     * below it, by this many mm per ring-size step past `rigidAboveSize`
     * (6.5). Same threshold and same per-half-size stepping as the prong
     * slide above, but its own value so the stone and the prongs beside it
     * can be tuned independently.
     *
     *   0.00  no slide (default)
     *   0.02  subtle
     *   0.05  clear
     *   0.10  strong
     *
     * For scale: accent #2 sits 1.75 mm from accent #3, and US 6.5 -> 13 is
     * 13 steps, so 0.135 would close the whole gap. Stay well under that.
     *
     * This is a pure TRANSLATION — the stone keeps its exact girdle at every
     * size, it only changes where it sits.
     */
    accentSlidePerSizeMM: 0.05,
    /**
     * Which accents move, by rank down each shoulder from the head: 2 = the
     * second stone from the top, on BOTH sides. Ranks are used because every
     * accent shares the node name `Diamond_Round`, so names cannot single one
     * out. Add more ranks to move more stones, e.g. [2, 3].
     */
    accentSlideRanks: [2],
    /**
     * How far around each sliding accent the SEAT (the bezel hole in the
     * pillar) is dragged along with it, in mm. 0 = off, the stone moves but
     * the hole stays behind.
     *
     * The hole is not its own object — it is 593 of object_9's 4917 vertices,
     * cut into the pillar shell — so it can only move by displacing those
     * vertices. Everything within this radius of the stone's seat takes the
     * stone's offset, smoothly fading to nothing at the edge, so the hole
     * travels as one piece and the pillar around it does not move.
     *
     * Keep this UNDER the spacing to the neighbouring seats or their holes
     * get dragged too: measured 1.673 mm up to accent #1 and 1.745 mm down
     * to accent #3. 1.2 covers the hole (659 verts) with margin on both
     * sides. Only active while accentSlidePerSizeMM is non-zero.
     */
    accentSeatRadiusMM: 1.9,

    tableZ: 14.594,
    minZ: 8.961,
    maxZ: 15.468,
    /** Head metal footprint across Y. The band overhangs past this. */
    widthMM: 7.200,
    centreOffsetY: 0,
    minComfortableCarat: 0.375,
  },

  skipParts: [],
};
