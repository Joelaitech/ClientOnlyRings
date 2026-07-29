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
