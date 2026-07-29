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
