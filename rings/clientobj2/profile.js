/**
 * RING PROFILE — clientobj2  (source model LR64530)
 * ============================================================================
 * Measured facts about ONE ring. Everything here came from measuring the
 * supplied OBJ files; none of it can be derived from the mesh at runtime.
 *
 * Shared maths (US size chart, carat cube-root, metals, the deformer) lives
 * in core/ and is not repeated per ring.
 *
 * To add a ring: copy this file, run `npm run profile <id>` to get the
 * measurements, fill them in, and register it in rings/index.js.
 *
 * COORDINATE SYSTEM (as authored in Rhino — do not rotate on import)
 * ---------------------------------------------------------------------------
 *   +Z  = up through the head / centre stone
 *   +Y  = ring axis (the finger passes along Y); the band is thin in Y
 *   +X  = left/right across the ring face
 *
 * SOURCE FILES  (rings/clientobj2/source/)
 * ---------------------------------------------------------------------------
 *   LR64530 S_2193.obj   142 429 v — shank: band, pavé shoulders, 14 melee
 *   LR64530 H_1136.obj     7 585 v — head: 4 prongs, basket, princess stone
 *   LR64530_1289.obj     150 014 v — the two FUSED. Not used: the head and
 *                                    shank must move independently.
 *
 *   S + H = the fused file exactly (142429 + 7585 = 150014 vertices). The
 *   split is lossless and both halves share one world origin, so they load
 *   with NO transform. That is what makes the ring configurable.
 */

export default {
  id: 'clientobj2',
  sku: 'LR64530',
  name: 'Princess Solitaire',
  subtitle: 'Pavé Shoulders',
  description: '18K · Natural Diamond',

  /** Draco-compressed GLB, served from rings/clientobj2/models/. */
  models: {
    shank: 'shank.glb',
    head: 'head.glb',
  },

  /**
   * MEASURED MASTER — what the mesh actually is, before any configuration.
   * Every transform is expressed relative to these.
   */
  master: {
    /**
     * Bore centre in model space. NOTE the -0.10 Z offset: this ring is not
     * modelled on the origin. Every radial transform must use it.
     */
    boreCenter: { x: 0, y: 0, z: -0.10 },

    /** Circle-fit over 142k vertices, sd 0.003 mm. */
    boreRadius: 8.2729,

    /** 16.546 mm ID = US 7 (nominal 16.507; +0.04 is within CAD tolerance). */
    ringSize: 7.0,

    /** Centre stone as modelled: 5.40 mm princess girdle = exactly 1.00 ct. */
    carat: 1.0,
    stoneMM: 5.40,

    /**
     * Band width (Y span) at the bottom of the shank. The master is not a
     * constant width — it swells to 2.019 mm at the shoulders, a deliberate
     * 1.4% taper. Scaling about Y = 0 preserves that proportionally.
     */
    shankWidthMM: 1.99,

    /** Band thickness, radial. Constant at every ring size by construction. */
    thicknessMM: 1.78,
  },

  centerStone: {
    cut: 'princess',
    /** Measured: girdle 5.40 mm, table 3.24 mm, culet Z 10.93, table Z 14.82. */
    tableMM: 3.24,
    depthMM: 3.89,
  },

  /**
   * Accent stones. Omit this key entirely on a ring with no pavé — the
   * pavé warnings in core/configure.js then simply do not fire.
   */
  accents: {
    cut: 'round',
    mm: 1.55,
    caratEach: 0.0155,
    count: 14,          // 7 per shoulder
    /** Measured centre angles from the bore, 0 = side, +90 = head. */
    anglesDeg: [21.6, 31.4, 41.0, 50.6, 60.1, 69.0, 76.4],
    /** Above this the bead-work visibly stretches. Drives a warning. */
    maxCleanWidthMM: 5,
  },

  head: {
    /** Culet of the centre stone. Kept for reference; see seatZ. */
    pivotZ: 10.932,
    /**
     * SEAT — the Z plane where this head's metal actually meets the shoulders,
     * measured as the height of closest XY approach between the two meshes.
     *
     * Carat scaling pivots HERE, not on the culet. Pivoting on the culet let
     * the seat drop by up to 0.95 mm as the head shrank, which opened the joint
     * and let the shoulders arch over the head at low carat.
     *
     * Supersedes an earlier 12.38 estimate taken from where the basket bottoms
     * out against the shoulder tips. The shoulders actually wrap up alongside
     * the head, so the two meshes first touch much lower, at 9.25.
     */
    seatZ: 9.25,
    /**
     * Height at which the head's XY scaling reaches full strength.
     *
     * Below the seat the footprint stays at master width so the head remains
     * welded to the shoulders; above this it scales fully so the claws and
     * stone shrink properly. Chosen by sweeping candidate heights and taking
     * the one with the smallest worst-case joint gap over 0.25-1.00 ct.
     */
    scaleFullAtZ: 9.75,

    /**
     * PRONG-TO-SHOULDER GAP — why this ring bends its shank with carat.
     * -------------------------------------------------------------------------
     * The head's XY scale reaches full strength at scaleFullAtZ (9.75), so
     * above that height the prong shafts (head object_1..4) are pulled inward
     * by the full carat factor while the shoulder walls (shank object_9/10,
     * fixed at |X| >= 1.68) do not move at all. The shaft swings inboard away
     * from the wall it is modelled to run against, and the daylight between
     * them reads as a gap beside the prong.
     *
     * Measured nearest distance, head metal -> shank metal, per 1 mm Z band:
     *
     *        Z band     1.00 ct    0.25 ct
     *        9-10       0.037      0.017     <- seat weld, correct at both
     *        10-11      0.410      0.568
     *        11-12      0.292      0.507
     *        12-13      0.509      0.530
     *
     * The seat weld is sound at every carat, so the head is NOT detaching —
     * only the shaft mid-span pulls away. Correcting it from the SHANK side
     * leaves the weld and the stone position untouched, which is what every
     * previous attempt from the head side failed to do.
     *
     * NOT fixed with head.liftMM. Solving for the lift that keeps the basket
     * rail's burial constant gives a consistent 3.07 mm, but applying it makes
     * THIS gap worse — the 10-11 band goes 0.568 -> 0.661 mm at 0.25 ct. The
     * rail was never the visible defect (object_5 sits 0.021 mm off the wall
     * at 0.25 ct, essentially touching); the shaft is.
     */
    pillarBend: true,
    /**
     * Ramp the bend across the WHOLE carat range, not just the 0.25 ct floor.
     * The gap is already 0.29 mm at the master and grows smoothly, so a
     * floor-only correction would leave 0.50 and 0.75 ct gapped and would pop
     * as the slider hit the end. See pillarBendAllCarats in src/Ring.jsx.
     */
    pillarBendAllCarats: true,
    /**
     * Start the bend well below the gap band (10-12) so the sweep reads as the
     * wall flexing inward along its length rather than kinking at a hinge.
     * object_9/10 span Z -0.47..12.44, so there is ample wall to curve across;
     * 8.0 keeps the ramp clear of the pavé seats below (topmost melee at
     * Z 9.59-10.65 rides the bend rigidly via bendStoneToHead).
     */
    pillarBendZ: 8.0,

    /** Extremes of the master head, for clearance checks. */
    minZ: 9.362,
    maxZ: 15.491,        // prong tips — highest point of the ring

    /** Head metal footprint across Y. The band overhangs past this. */
    widthMM: 7.185,

    /** Basket diameter, and the point past which it overhangs a small shank. */
    basketMM: 8.25,
    maxBasketMM: 11.0,
    minSizeForLargeBasket: 6,

    /** At or below this weight the master prongs dominate the stone. */
    minComfortableCarat: 0.375,
  },

  /**
   * Parts to skip at load. object_5 is a coincident duplicate of object_4
   * (identical bounds X 2.310..3.123, Z 12.209..12.407); rendering both
   * z-fights on the right shoulder tip.
   */
  skipParts: ['object_5'],

  /**
   * Part map, for reference when debugging. Materials are assigned by the
   * Diamond_* naming convention, not from this list.
   *
   * Group names are NOT unique — "Diamond_Round" appears 14 times. Index by
   * order of appearance, never by name.
   */
  parts: {
    shank: {
      metal: [
        'object_1',   // bottom of band           Z -10.14 .. -7.67
        'object_2',   // left lower band          X -10.30 .. -3.25
        'object_3',   // right lower band         X   3.25 .. 10.30
        'object_4',   // right shoulder tip cap   Z  12.21 .. 12.41
        'object_5',   // duplicate of object_4 — skipped
        'object_6',   // right shoulder, full cross-section
        'object_7',   // left shoulder, full cross-section
        'object_8',   // left shoulder tip cap
        'object_9',   // left outer wall
        'object_10',  // right outer wall
      ],
      stones: 'Diamond_Round',
    },
    head: {
      metal: ['object_1', 'object_2', 'object_3', 'object_4', 'object_5'],
      stones: 'Diamond_Princess',
    },
  },

  /**
   * NOTE FOR FUTURE RINGS — the trap this model set.
   *
   * object_6 / object_10 each span the FULL cross-section of the shoulder
   * (8.40 -> 10.56 mm at 30 deg). They are the left and right halves of the
   * shank split down the middle, NOT separate inner-rail / outer-wall layers.
   *
   * That matters because it rules out any "hold the shoulders still while the
   * band grows" strategy: at those angles the shoulder IS the finger hole.
   * Freezing it capped the bore at 8.38 mm — a US 13 ring gauged US 7.3.
   *
   * Check this on every new ring before assuming the shoulders are separable.
   * `npm run profile <id>` reports the per-group radius span per angle.
   */
};
