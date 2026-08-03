

/**
 * RING PROFILE — pear  (supplier code "01")
 * ============================================================================
 * Pear-cut solitaire, nail-prong set, with 7 pavé accents per shoulder.
 *
 * COORDINATE SYSTEM (Rhino, do not rotate on import)
 *   +Z  = up through the head
 *   +Y  = ring axis (finger passes along Y); band is thin in Y
 *   +X  = across the ring face
 *
 * SOURCE  01 s.obj (shank, 72 678 v) + 01 h.obj (head, 8 689 v) + 01 f.obj
 *         (fused, 81 367 v — unused; 72678 + 8689 = 81367, so the split is
 *         lossless and both halves share one origin).
 *
 * The supplier files are well structured: parts are separated and stones are
 * already named Diamond_*, so no group renaming was needed.
 */

export default {
  id: 'pear',
  sku: '01',
  name: 'Pear Solitaire',
  subtitle: 'Pavé Shoulders',
  description: '18K · Natural Diamond',

  models: {
    shank: 'shank.glb',
    head: 'head.glb',
  },
  sourceFiles: { shank: 'shank.obj', head: 'head.obj' },

  master: {
    /**
     * Kasa circle fit gave centre (0, 0, -0.009) r 8.2120 (sd 0.0067), but this
     * bore is very slightly out of round and the TIGHTEST point is 8.1899 at
     * -174 degrees. A finger is limited by the tightest point, not the average,
     * so the mandrel value is the one recorded here.
     */
    boreCenter: { x: 0, y: 0, z: -0.009 },
    boreRadius: 8.1899,

    /** ID 16.380 mm = US 6.84; the spec sheet states US 6. */
    ringSize: 6.0,

    /**
     * CARAT LABELLING — deliberately 1.00, not the sheet's 0.800.
     *
     * The stone measures 8.00 x 5.10 mm. The trade chart puts a 1.00 ct pear at
     * 8.0 x 5.0 mm, so this mesh IS essentially a 1 ct stone and the sheet's
     * 0.800 ct looks like a light-cut estimate. Calling it 1.00 also puts it on
     * the same 0.25 carat grid as every other ring, so the slider behaves
     * identically across the catalogue.
     *
     * The MESH IS NOT RESCALED — only relabelled. At slider 1.00 the ring
     * renders exactly as supplied.
     */
    carat: 1.00,
    /** Long axis, along Y. Measured 8.000; spec sheet 8.0 x 5.1. */
    stoneMM: 8.000,

    /** Full catalogue range. */
    caratMin: 0.25,
    caratMax: 3.00,

    /** Measured Y span on the plain lower arc. Matches the sheet's 2.1 MM. */
    shankWidthMM: 2.100,

    /**
     * MEASURED radially on the same arc: 2.165 mm. The sheet's "1.5 MM CAD"
     * is a callout at the bottom of the band, which is thinner than the arc
     * the app samples — using it understated the section by 30%.
     */
    thicknessMM: 2.165,
  },

  centerStone: {
    cut: 'pear',
    /** Measured 5.099 x 8.000 x 3.260 mm. */
    widthMM: 5.099,
    lengthMM: 8.000,
    depthMM: 3.260,
  },

  /** 14 round accents, 7 per shoulder. Spec sheet: 1.70 mm, 0.020 ct each. */
  accents: {
    cut: 'round',
    mm: 1.70,
    caratEach: 0.020,
    count: 14,
    perSide: 7,
  },

  head: {
    /** Culet of the centre stone. Kept for reference; see seatZ. */
    pivotZ: 10.821,
    /**
     * SEAT — the Z plane where this head's metal actually meets the shoulders,
     * measured as the height of closest XY approach between the two meshes.
     *
     * Carat scaling pivots HERE, not on the culet. Pivoting on the culet let
     * the seat drop by up to 0.95 mm as the head shrank, which opened the joint
     * and let the shoulders arch over the head at low carat.
     *
     * 9.00, not 12.50. This head touches the shank in TWO places: low at
     * Z 9.0-9.5 where its stem enters the shoulder V, and again at Z 12.0-13.0
     * where the shoulder tips meet the basket. The LOW contact is the
     * structural joint, so that is the plane to anchor. An earlier 12.50
     * anchored only the upper contact and left a 0.54 mm gap at the stem.
     */
    seatZ: 9.00,

    /**
     * EQUAL TO seatZ, which makes the head scale UNIFORMLY.
     *
     * The height-ramped scale that other rings use cannot work here. This
     * head's claws span Z 9.08-15.12, so any ramp between seat and tip runs
     * straight through them: at 3 ct the claw base stayed at 1.00x while its
     * tip reached 1.44x. On a claw only 1.08 mm wide that shear read as
     * stretched and forced — the "not natural" look reported.
     *
     * Measured trade-off, worst joint gap vs claw shear:
     *   ramped (seat 12.50, full 15.00) — gap 0.04 mm, shear 0.442  <- forced
     *   uniform (seat 9.00)             — gap 0.23 mm at 0.25 ct, shear 0
     *
     * Uniform wins: the shear is visible at every carat, whereas the gap only
     * appears below 0.50 ct, where a 1 ct mount holding a quarter-carat stone
     * is already out of proportion. Gap by carat with this setting:
     *   0.25 -> 0.231   0.40 -> 0.139   0.50 -> 0.036
     *   0.75 -> 0.060   1.00 -> 0.019   2.00 -> 0.028   3.00 -> 0.076
     */
    scaleFullAtZ: 9.00,

    /**
     * SHOULDER HINGE — close the last joint from the SHANK side, as a RIGID
     * rotation rather than a curve (see rotateShoulderTip in core/deform.js).
     *
     * At the bottom of the carat range the basket rail (head object_3)
     * shrinks away from the shoulder tips. Measured rail-to-shoulder gap:
     *   1.00 ct  0.017 mm      0.25 ct  0.565 mm
     * Every other head part stays connected at 0.25 ct (0.09-0.16 mm), so
     * this one contact is the whole problem.
     *
     * This used to be a smooth curve (bendShoulders, scaling each vertex by
     * its own height). That closes the gap fine, but it has no single
     * "bend point" to speak of — `fromZ` only sets where a gradient starts
     * easing in, so there is nothing to point at and move. Replaced with a
     * rigid rotation instead: below `pivotZ` the shoulder is completely
     * untouched (still on the plain shell's own shape, still welded to the
     * band); at and above it, EVERY vertex rotates by the same angle — a
     * true hinge, so there is exactly one place to look for the bend, and
     * `pivotZ` IS that place.
     *
     * pivotZ 9.0 carries over the old fromZ value (already vetted: low
     * enough to close the joint, where the shoulder naturally starts to
     * rise) as the starting point for retuning where the visible elbow sits.
     * pivotXAbs 5.64 is the measured cross-section mid-point of shank
     * object_1 at that height — everything below stays on the shoulder's own
     * modelled curve.
     *
     * maxAngleDeg 15 is a starting swing, not a tuned final value — move it
     * to change how far the shoulder leans once it passes pivotZ.
     */
    shoulderHinge: {
      belowCarat: 0.50,
      pivotXAbs: 15.8, // 1.8 // change to pull the pillers down
      pivotZ: -2.5,  // -2.0,
      maxAngleDeg: 2.9,
      /**
       * shoulderHinge has no per-part scoping by default, so with pivotZ this
       * low (-2.5, below the band's own Z range of -0.26..9.20) it was ALSO
       * rotating the plain band — and because pivotXAbs (15.8) is far larger
       * than the band's actual X position (~0 at its peak), that huge lever
       * arm turned a small 2.9deg swing into a ~0.8 mm drop at the band's
       * peak. That was silently cancelling bandLift's own +0.7 mm lift
       * (measured: bandLift alone raises the peak to 9.557, but the
       * unexcluded hinge then pulls it back down to 8.742) — the actual
       * cause of the visible gap under the head, not something bandLift's
       * own value could ever fix by itself.
       */
      excludeParts: ['object_5', 'object_40'],
    },

    /**
     * PILLAR EXTEND — same mechanism, now used to COMPACT rather than
     * lengthen. `extendMM` is a plain Z offset applied above `fromZ` (see
     * extendPillarZ in core/deform.js): positive stretches the tip further
     * away, negative pulls it back down toward `fromZ`, shortening the
     * shoulder's reach — which is what was actually wanted here: as the head
     * gets smaller, the pillar reaching up to meet it should get more
     * compact too, not longer. Then the SAME second hinge bends that
     * shortened reach inward. UNCONDITIONAL — a shape of the master mesh,
     * present at every carat, not a carat correction like shoulderHinge
     * above.
     *
     * fromZ 10.5 / toZ 12.69: 12.69 is object_1's own measured tip, so the
     * cap above it pulls down as one undistorted piece; 10.5 sits just above
     * the accent stone at Z 10.01-11.23, so the compaction does not touch it.
     * Swept at extendMM -0.8/-1.2/-1.6/-2.0, tip reach lands at 11.27 / 11.01
     * / 10.97 / 10.95 — the effect saturates fast because pulling the tip
     * down toward fromZ also pulls the whole ramp down with it, so there
     * is not much room left to compact further past about -1.2.
     *
     * bendPivotZ matches fromZ, so the bend starts exactly where the
     * compaction begins. bendPivotXAbs 4.10 is the measured cross-section
     * mid-point of object_1 at that height.
     *
     * extendMM -1.2 and bendAngleDeg 20 are STARTING values, not tuned —
     * this is the pair to move first. More negative extendMM = shorter
     * pillar; raise bendAngleDeg to lean the shortened tip further inward.
     */
    pillarExtend: {
      fromZ: 10.5,
      toZ: 12.69,
      extendMM: 1.0,
      bendPivotXAbs: 4.10,
      bendPivotZ: 10.5,
      bendAngleDeg: 20,
    },

    /**
     * BAND LIFT — push the plain round band's TOP up or down, where the
     * head's stem actually rests. A DIFFERENT part from the pillars above:
     * object_5/object_40 are the two halves of the plain band (meeting at
     * X=0, reaching up to Z 9.20 right under the head) — not object_1/
     * object_2, which are the shoulder pillars carrying the pavé.
     *
     * Reuses extendPillarZ (see core/deform.js) exactly as pillarExtend
     * does, just aimed at these parts with its own fromZ/toZ/liftMM, so it
     * is fully independent — tune this without touching pillarExtend at all.
     *
     * Same carat gating as the other corrections here: 0 at/above
     * belowCarat, full strength at the carat floor.
     *
     * fromZ 6.0 / toZ 9.20: 9.20 is object_5/40's own measured top, so it
     * rides up/down as one undistorted cap; 6.0 gives a few mm of ramp so
     * the push eases in rather than kinking where it starts.
     *
     * liftMM 0.0 is OFF — this is the value to change. Positive raises the
     * band's top toward the head; negative lowers it.
     */
    bandLift: {
      belowCarat: 0.50,
      parts: ['object_5', 'object_40'],
      fromZ: 0.0,
      toZ: -9.50,  // 9.20,
      liftMM: 0.1, // 0.6 stable
    },

    /**
     * BAND FILLER — a NEW, from-scratch object plugging the gap that opened
     * up under the head once shoulderHinge/pillarExtend/bandLift reshaped
     * the pillars and band. There is nothing in any shipped GLB to extrude
     * from here (that gap is a consequence of these profile settings, not
     * something the original mesh ever had), so this is authored geometry —
     * a small solid box (see buildFillerBox in core/deform.js), not an edit
     * to object_1/2/5/40.
     *
     * It becomes a real shank part (built once in Ring.jsx's buildFillerPart,
     * pushed into the same `shankParts` array everything else lives in), so
     * it automatically takes the SAME ring-size deformMetal pass as the rest
     * of the shank — grows/shrinks with the ring size slider exactly like
     * the band it is welded to, with no extra wiring needed for that part of
     * the ask.
     *
     * baseZ 9.15 sits just under the band's own measured peak (object_5/40
     * converge to a point at X=0, Y=+-1.05, Z=9.20) — the 0.05 mm overlap is
     * deliberate, so the filler's bottom is buried inside the band rather
     * than just touching it, guaranteeing no seam even if bandLift moves the
     * band slightly. baseWidthY 2.1 matches shankWidthMM exactly for the
     * same reason.
     *
     * topZ / topWidthX / topWidthY are the ones to move to close YOUR
     * specific gap — start here and adjust height and taper to match what
     * the current shoulderHinge/pillarExtend settings have opened up.
     */
    /**
     * ARCH FILLER — a NEW, from-scratch bridge that MEASURES its own shape
     * from the live geometry on every render, instead of a hand-set box.
     *
     * The gap this plugs turned out to be wider and more irregular than a
     * single box (measured across the pear at 0.25 ct, with the current
     * shoulderHinge/pillarExtend/bandLift settings applied): a roof-shaped
     * void spanning X roughly -3.5 to +3.5, only ~0.3 mm tall at its edges
     * but ~2.0 mm tall at the centre, closing to nothing right where the
     * shoulders already touch (measured X +-4). No fixed box matches that,
     * and hand-tuning six numbers to chase a shape this irregular was the
     * actual ask ("can't you find what area needs to be filled").
     *
     * So this measures it directly (see updateArchFiller in src/Ring.jsx,
     * sampleArchFillerPositions in core/deform.js): for each of `slices` X
     * positions between xMin/xMax, it finds the highest point any
     * `belowParts` vertex reaches there (the band, object_5/object_40) and
     * the lowest point any `aboveParts` vertex reaches there (the shoulder,
     * object_1/object_2), and builds a solid bridge spanning exactly that,
     * every time carat or ring size changes. Where the two already touch,
     * the slice collapses to zero height on its own — no separate tapering
     * logic needed.
     *
     * Because it re-measures every render, it keeps fitting even if
     * shoulderHinge / pillarExtend / bandLift above get retuned again later.
     *
     * xMin/xMax -4/4 and xToleranceMM 0.3 were set from where the measured
     * gap actually starts and ends (+-4 is where it collapses to ~0);
     * halfWidthY 1.05 matches the band's own half-width (shankWidthMM/2)
     * so the bridge is exactly as wide as what it is welded to.
     */
    

    tableZ: 14.081,
    minZ: 9.081,
    maxZ: 15.118,
    /** Head metal footprint across Y. The band overhangs past this. */
    widthMM: 8.000,
    /**
     * The pear is not centred on the ring axis: its centroid sits 0.295 mm
     * forward in Y because the tip extends further than the belly.
     */
    centreOffsetY: 0.295,
    minComfortableCarat: 0.30,
  },

  skipParts: [],
};
