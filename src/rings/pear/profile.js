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

  /** No Band Width control for this ring — see Controls.jsx. */
  hideBandWidth: true,

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

    /** Restricted range for this ring: 1.00-3.00 ct only. */
    caratMin: 1.00,
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
     * SHOULDER BEND — REMOVED for this ring.
     *
     * This used to close a joint gap that only opens up below 0.50 ct (the
     * basket rail shrinking away from the shoulder tips — measured 0.565 mm
     * at 0.25 ct, vs 0.017 mm at 1.00 ct). It read its ramp strength from
     * `(belowCarat - carat) / (belowCarat - caratFloor)`, where caratFloor
     * comes from `master.caratMin` — which was 0.25 (the old catalogue
     * floor) when this was tuned.
     *
     * master.caratMin is now 1.00 (this ring's slider was restricted to
     * 1.00-3.00 ct), so caratFloor became 1.00 too — and with belowCarat
     * (0.50) now BELOW caratFloor (1.00), that same ramp formula's
     * denominator flips sign, and the correction no longer fades to 0
     * above belowCarat: it clamps to FULL strength (1.0) at every carat
     * from 1.00 to 3.00 instead, permanently bending the shoulder tip
     * inward/down 0.80/0.70 mm — the visibly thinned, bent pillar top
     * reported at both ends of the new range.
     *
     * Since the gap this fixed only ever existed below 0.50 ct, and this
     * ring's slider can no longer reach below 1.00 ct, the correction has
     * no remaining carat value where it is even supposed to apply — so it
     * is removed outright rather than re-tuned.
     */

    /**
     * BLEND FROM Z — widens the ring-size "hand the rail the head's single
     * offset" zone (see blendShankToHead in core/deform.js, and the note by
     * blendFromZ in src/Ring.jsx) from its 2 mm default (seatZ to seatZ+2)
     * down to 1.50, spreading the same correction across the whole pavé row
     * instead of concentrating it in a 2 mm band.
     *
     * Without this, measured on object_1 at US 13 (delta +2.502): the
     * pillar's own ring-size fan pushes it out to X 8.32 at Z 9.0, then the
     * default 2 mm blend zone cancels almost all of that back to X 4.96 by
     * Z 11.0 — a 3.36 mm change in 2 mm of height, which reads as the
     * pillar kinking/bending sharply right there rather than leaning
     * smoothly. Widened to 1.50, the SAME total change spreads across
     * ~9.5 mm (X 12.52 at Z 1.5, easing down to the same X 4.92 at Z 11.0),
     * matching the head at the same final position without ever creating a
     * visible corner in between.
     *
     * blendSkipParts excludes object_5/object_40 (the plain round band,
     * topping out at Z 9.20 — just above the new blendFromZ) for the same
     * reason pillarStretchSkipParts excludes them below: the band's OWN
     * individual ring-size fan is what keeps the bore circular, and forcing
     * it toward the head's single fixed offset instead would reopen that
     * exact ovality bug for the sake of a part that barely diverges from
     * the head's offset anyway (its topmost vertex sits at X=0, where the
     * own-fan and the head-offset paths are already the same).
     */
    blendFromZ: 1.50,
    blendSkipParts: ['object_5', 'object_40'],

    /**
     * BLEND ONLY SHRINKING — new plan: when the ring size is INCREASED
     * above the master, keep the pillar's own individual radial fan instead
     * of straightening it toward the head via blendShankToHead at all. A
     * vertex's own radial direction points further outboard the higher up
     * the pillar sits, so left alone it curves and leans outward as the
     * ring grows — the wanted look now, replacing the straight/aligned
     * result blendFromZ above was tuned to produce.
     *
     * Only affects the GROWING direction (ring size above the 6.0 master):
     * blendFromZ/blendSkipParts above still apply as before when the ring
     * size is at or below the master, so shrinking is unchanged.
     */
    blendOnlyShrinking: true,

    /**
     * PILLAR STRETCH — same mechanism built for LR64530/clientobj2 (see
     * stretchPillarToHead in core/deform.js, and the long comment there):
     * keeps the shoulder pillars welded to the head as carat grows, instead
     * of holding still while the head's basket/claws grow around them.
     *
     * Measured the actual touching pair at the 1.00 ct master: shank
     * object_1's tip (2.414, -0.605, 12.694) against head object_3 (2.399,
     * -0.607, 12.700) — 0.017 mm apart, essentially touching. object_3 is
     * the small basket rail spanning between the claws (Z 11.80-12.70),
     * exactly the "basket rail" already named in the seatZ/scaleFullAtZ
     * notes above.
     *
     * pillarStretchFromZ 1.50 anchors just below the LOWEST pavé stone on
     * the pillar (measured bottom 1.868) — nothing at or below it moves.
     * pillarStretchToZ 12.69 is object_1/2's own measured top (matching the
     * touching point above almost exactly), where the stretch reaches
     * deformHead's own formula in full — same as clientobj2, X is a
     * PROPORTIONAL scale (each vertex's own x) so the pillar's own top
     * lands on that touching point automatically, without a separate X
     * parameter, and never reshapes the pavé settings.
     *
     * pillarStretchSkipParts — object_5/object_40 ("the plain round band")
     * reach only up to Z 9.20, essentially AT the seat (9.00) — the same
     * situation as clientobj2's object_6/7: a smooth rail welding right at
     * the seat, not the outer pillar reaching all the way to
     * pillarStretchToZ. Left un-excluded, it would pick up most of the full
     * stretch (computed for the 12.69 tip) while the head barely moves that
     * close to the seat by design (deformHead freezes Z at/below the seat),
     * reading as the band rising up through the head's base — exactly the
     * bug found and fixed on clientobj2, so excluded here from the start
     * rather than waiting to reproduce it.
     *
     * pillarStretchEasePower 4 — same value, same reason: a plain
     * linear/smoothstep ramp grows fastest through the pillar's own
     * mid-height, exactly where its pristine cross-section (measured on
     * object_1: ~10.1 mm wide near the band, tapering to ~3.2 mm at the
     * tip) is ALSO narrowing fastest, and the two rates fighting flattens
     * the taper into a bulge. 4 was re-verified on this ring's own width
     * profile (per 0.5 mm height bin) to give zero local widening.
     */
    pillarStretch: true,
    pillarStretchFromZ: 1.50,
    pillarStretchToZ: 12.69,
    pillarStretchSkipParts: ['object_5', 'object_40'],
    pillarStretchEasePower: 4,

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
