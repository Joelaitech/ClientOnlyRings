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

  /** No Band Width control for this ring — see Controls.jsx. */
  hideBandWidth: true,

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

    /** Restricted range for this ring: 1.00-3.00 ct only. */
    caratMin: 1.00,
    caratMax: 3.00,

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

    /**
     * PILLAR STRETCH — keeps the shoulder pillars welded to the head as
     * carat changes, instead of holding still while the head's basket/
     * prongs grow or shrink around them (see stretchPillarToHead in
     * core/deform.js).
     *
     * An earlier attempt used bendPillarToHead directly, which ramps the
     * SAME kind of correction (X scale, Z stretch) over just seatZ..
     * scaleFullAtZ (9.25-9.75, half a millimetre) — cramming up to 44% of
     * scale change into that half-millimetre is what squeezed/stretched
     * every pavé stone's own seat sideways, the settings visibly buckling
     * apart from the metal that was reported. stretchPillarToHead applies
     * the same X scale and Z stretch formulas but ramped over a much wider
     * span (`pillarStretchFromZ` to `pillarStretchToZ` below, ~10 mm), which
     * reads as a smooth taper instead of a kink. X is a genuine
     * PROPORTIONAL scale (each vertex/stone's own x), not a fixed shift — an
     * even earlier version added the same fixed offset to every vertex
     * regardless of its own x, which bulged the middle of the cross-section
     * outward (a vertex near the centre grew by a much larger fraction of
     * its own small x than one already far out); see stretchPillarToHead's
     * own comment in core/deform.js for the measured numbers.
     *
     * pillarStretchFromZ 2.50 anchors just below the LOWEST pavé stone on
     * the pillar (measured bottom 2.827) — nothing at or below it moves, so
     * the row's starting point never drifts. pillarStretchToZ 12.444 is the
     * OUTER pillar's own measured top (object_4/8/9/10 — see
     * pillarStretchSkipParts below for why object_6/7 are excluded), where
     * it welds to the head — the stretch reaches deformHead's own Z formula
     * in full exactly there, so the two always land on the same point
     * regardless of carat, AND (since X is proportional) automatically
     * matches the head's own sideways growth too, without a separate X
     * parameter — verified against the actual measured touching pair (shank
     * object_8's tip vs head object_5, the small basket bar the pillar tip
     * nestles under) at every carat up to 3.00 ct. Runs at every carat above
     * the 1.00 ct master (0 there by construction) — this ring's slider
     * cannot go below it.
     *
     * pillarStretchSkipParts — object_6/object_7 ("shoulder, full
     * cross-section") reach only up to Z 9.46, essentially AT the seat
     * (9.25) — this is the smooth inner V-rail that welds right at the
     * seat, not the outer pavé pillar reaching all the way to
     * pillarStretchToZ. Applying the same stretch there overshot: at 9.46
     * it is already 70% of the way through the fromZ..toZ ramp, so it
     * picked up most of the FULL stretch (computed for the 12.444 tip)
     * while the head's own metal barely moves that close to the seat by
     * design (deformHead freezes Z at/below the seat) — measured, the
     * V-notch rose to Z 10.52 at 3.00 ct while the head's matching point
     * stayed at Z 9.44, reading as the shank rising up through the head's
     * base. Excluding these two leaves them tracking only ring size, same
     * as the plain lower band, matching how little the head itself moves
     * this close to the seat.
     */
    pillarStretch: true,
    pillarStretchFromZ: 2.50,
    pillarStretchToZ: 12.444,
    pillarStretchSkipParts: ['object_6', 'object_7'],
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
