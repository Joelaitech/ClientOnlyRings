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
