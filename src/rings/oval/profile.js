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
     * RING-SIZE BLEND CEILING — how high blendShankToHead's ramp runs before
     * the shoulder rail is fully riding the head's rigid offset.
     * ---------------------------------------------------------------------
     * The default (seatZ + 2.0 = 12.0) is a short ramp: fine at small-to-mid
     * ring sizes, but at large sizes the vertex's OWN radial offset — which
     * the ramp sheds over that same 2 mm of height — grows with `delta`, so
     * the outer rail edge has to shed a bigger correction in the same span.
     * Measured on object_5 at US 13 / 1.50 ct: the outer edge's slope peaked
     * at 1.51x its own pristine rate around Z 11.5, then eased back to 1x by
     * the tip — that bow-in-then-straighten is the visible kink reported
     * where the shoulders meet the head at large sizes.
     *
     * 13.3 is object_5/object_44's own measured top (see seatDrop.fullZ
     * above, sized for exactly this rail for the same reason) — widening the
     * ramp to the part's ENTIRE modelled height spreads the same total
     * offset over the whole rail instead of the last 2 mm of it. Swept at
     * US 13 / 1.50 ct: peak slope ratio 1.51x -> 1.37x, joint gap unchanged
     * at 0.132 mm (the ramp's ENDPOINTS — where it starts and where it
     * reaches the head's offset in full — are untouched, so nothing below
     * blendFromZ or beyond the tip moves differently than before).
     */
    blendFullZAtTop: 13.3,

    /**
     * LIFT — a small additive upward offset above the seat (0 right at the
     * seat, full strength by scaleFullAtZ — see deformHead in core/deform.js),
     * to stop the shrinking head reading as sunk toward the gallery band.
     *
     * 0.2, NOT 0.9. The original 0.9 was chosen to buy clearance over the
     * gallery band, but it does not actually do that: the gallery contact is
     * made by the FROZEN stem plate (freezeParts below), which sits at or
     * below seatZ where deformHead applies no lift at all. Measured gallery
     * clearance is a flat 0.043 mm at lift 0.9 / 0.4 / 0.2 alike — the
     * parameter never moved it.
     *
     * What 0.9 DID do was push the basket up out of reach of the shoulder
     * rail, opening the joint the hinge below exists to close. Measured gap,
     * head object_3 (basket rail) -> shank object_5/44 (shoulder rail), at
     * 0.25 ct with the hinge active:
     *
     *        liftMM     shoulder joint     gallery clearance
     *        0.9        0.200 mm           0.043 mm
     *        0.4        0.072 mm           0.043 mm
     *        0.2        0.003 mm           0.043 mm   <- used
     *        0.0        0.051 mm           0.043 mm
     *
     * 0.2 closes the joint tighter than the 1.50 ct master weld itself
     * (0.028 mm) and costs nothing anywhere else: the master, 1.00 and
     * 0.50 ct all stay within 0.01-0.03 mm of where lift 0.9 put them.
     * Below 0.2 the head starts to sink and the gap reopens from the other
     * side, so this is a genuine minimum rather than "less is better".
     */
    liftMM: 0.2,

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
     * SEAT DROP — lower the JOINT as carat falls, instead of closing it by
     * swinging the shoulders in over a head that shrinks where it stands.
     * ---------------------------------------------------------------------
     * THE PROBLEM THIS REPLACES.
     *
     * deformHead freezes Z at or below seatZ, so the head's floor is nailed to
     * one height at every weight while its top collapses toward it. Measured
     * here, 1.50 -> 0.25 ct:
     *
     *     prong tips   15.652 -> 13.211 mm   (-2.441)
     *     head floor    9.679 ->  9.679 mm   ( 0.000)
     *
     * The head deflates onto a fixed floor rather than descending. The
     * shoulder rails, modelled to clasp a full-height head, then had to reach
     * down and inward to find it — the 14 deg hinge and its 0.80/0.40 seat
     * pull below. At full strength that reads as the rails arching over and
     * swallowing the setting: the ring changes STRUCTURE as the slider moves,
     * which is the reported fault.
     *
     * WHAT THIS DOES INSTEAD: translate the whole joint down by `maxMM`, head
     * and shoulders together, so the head keeps its own shape and its
     * modelled relationship to the rails and only its height in the ring
     * changes. See dropSeat in core/deform.js.
     *
     * 1.0 mm, AND IT DOES THE WHOLE JOB BY ITSELF. Swept at 0.25 ct, joint
     * gap against hinge angle and pull:
     *
     *     drop    0 deg, no pull    5 deg, 0.30/0.15    14 deg, 0.80/0.40
     *     0.0     0.0427 mm         0.0427 mm           0.0093 mm
     *     0.5     0.0205 mm         0.0205 mm           0.0093 mm
     *     1.0     0.0095 mm         0.0095 mm           0.0093 mm   <- used
     *
     * At 1.0 mm the gap is 0.0095 mm with NO hinge at all — tighter than the
     * 1.50 ct master's own 0.028 mm weld, and indistinguishable from what the
     * full 14 deg swing bought (0.0093). The row is flat across the whole
     * angle column, which is the proof that the swing was only ever
     * compensating for a head that could not come down.
     *
     * `fromZ` -9.5 / `fullZ` 13.3 span the ENTIRE rail (object_5/44 run
     * Z -9.53..13.30) rather than a short window near the joint — see why
     * below, under "WHY THE RAMP NOW COVERS THE WHOLE RAIL".
     *
     * Same ramp shape as the hinge below (full travel at the carat floor, 0 at
     * belowCarat), so the two compose without a step anywhere on the slider.
     */
    seatDrop: {
      belowCarat: 0.50,
      maxMM: 1.0,
      fromZ: -9.5,
      fullZ: 13.3,

      /**
       * PARTS THAT TAKE THE DROP RIGIDLY rather than through the height ramp.
       *
       * The ramp eases the motion in by height, which is what keeps the drop
       * from tearing away from the static shank below it. These claws are
       * short, self-contained pieces (the biggest spans about 1 mm in Z) that
       * sit entirely above `fullZ`, so a rigid offset costs them nothing and
       * saves the edge stretch a height-varying ramp would put across them.
       *
       * object_5 / object_44 (the shoulder rails) are NOT here — see the note
       * below on why they take the plain ramp instead.
       */
      rigidParts: [
        'object_8', 'object_21', 'object_28', 'object_41',   // lower claws
        'object_7', 'object_22', 'object_27', 'object_42',   // upper claws
        'object_3', 'object_4', 'object_45', 'object_46',    // top claw caps
      ],

      /**
       * WHY THE RAMP NOW COVERS THE WHOLE RAIL (object_5 / object_44).
       * ---------------------------------------------------------------------
       * object_5 / object_44 ARE THE WHOLE SHANK, NOT JUST THE RAILS. Each is
       * a complete half of the shank, spanning Z -9.53..13.30 and |X| 0..9.93 —
       * at once the rail that clasps the head, the band that forms the finger
       * hole, and the seat for nine pavé stones. (clientobj2's profile warns
       * about exactly this trap on its own object_6/object_10; the same thing
       * is true here.)
       *
       * A first attempt put these two in `rigidParts` with a `splitParts`
       * fade window (rigid above the joint, untouched at the band, blended
       * over a narrow Z gap) to get a zero-stretch rigid offset at the joint
       * without sinking the band. It does not work: this part has no gap to
       * hide a Z-height seam in. Z 9.5-11.5 alone carries 548 vertices of
       * dense scrollwork with 117 edges over 0.5 mm long crossing any window
       * placed in that range — there is no height where the geometry itself
       * has a seam, so ANY split window cuts across live scrollwork and tears
       * it. Measured worst edge stretch on the best window found by a 2D
       * sweep of 60+ candidates: 0.53-0.71 mm (58-80%) at 0.25-0.375 ct — a
       * visible chip right at the shoulder, reported as the ring's structure
       * breaking at low carat.
       *
       * A plain per-vertex ramp with NO split (tried next) does not fully fix
       * it either, for the reason the original notes already found: 0.62 mm
       * of edge stretch on a 0.98 mm edge with the old fromZ 9.7/fullZ 12.0
       * window, because that span is still short enough for one edge to
       * cross most of the gradient.
       *
       * What actually works is widening the ramp to cover the part's ENTIRE
       * modelled height (fromZ -9.53, i.e. -9.5, to fullZ 13.3, i.e. the top).
       * Every edge on the part is now short relative to the ramp's total span,
       * so no single edge sees a large jump in offset between its two ends.
       * Swept against the real mesh edges (not an approximate neighbour
       * search):
       *
       *     fromZ/fullZ     stretch @ 0.25 ct   joint gap @ 0.25 ct
       *     9.7 / 12.0      0.621 mm  62%       0.044 mm   (rejected: tears)
       *     9.7 / 15.0      0.331 mm  33%       0.381 mm
       *     9.7 / 22.0      0.135 mm  14%       0.645 mm   (gap reopens)
       *     -9.5 / 13.3     0.133 mm  13%       0.042 mm   <- used
       *
       * -9.5/13.3 is the only window that keeps BOTH numbers small at once:
       * stretch stays under the ~0.2 mm / 10-20% the mount already tolerates
       * elsewhere on rigid parts at this carat (the claws sit at 5-10%), and
       * the joint gap stays tight (0.042 mm, versus the 0.028 mm master weld)
       * because the rail keeps travelling with the head all the way to its
       * own top instead of running out of ramp early. The bore, band and pavé
       * are untouched by construction — nothing here is rigid, so there is no
       * offset to gate away from the band in the first place; the ramp simply
       * evaluates to ~0 down at the band's own height, same as the master.
       *
       * Measured full carat sweep with this window (US 6.5):
       *
       *     ct      joint gap   rail stretch   pavé float   prong clearance
       *     1.50    0.028 mm    0.009 mm       0.002 mm     2.046 mm
       *     0.50    0.059 mm    0.009 mm       0.002 mm     0.381 mm
       *     0.375   0.017 mm    0.065 mm       0.010 mm     0.388 mm
       *     0.25    0.042 mm    0.133 mm       0.018 mm     0.305 mm
       *
       * Smooth and small at every carat — no jump, no reopening, no tear.
       */

      /**
       * RAIL EXTRA — sink the shoulder tips FURTHER than the joint, so the
       * prong still stands proud of them at low carat.
       *
       * Separate from `maxMM` because it fixes a DIFFERENT fault. The head
       * shrinks with carat; the shoulder tips do not. Measured with the drop
       * disabled entirely, so this is not something the drop introduced — and
       * measured against the CAPS (object_3/4/45/46), which are the highest
       * shank metal, not the rails:
       *
       *     ct      cap top     head top    clearance
       *     1.50    13.606      15.652      2.046
       *     0.50    13.606      13.987      0.381
       *     0.25    13.606      13.211     -0.395   <- caps over the prong
       *
       * The tips hold their height while the head falls away, so the prong ends
       * up buried between the shoulders — the reported "prong going inside".
       * The deficit is there at EVERY value of maxMM, including zero, which is
       * what proves it is the head's own carat scale and needs its own
       * correction rather than more joint travel.
       *
       * 0.35, NOT 0.70. 0.70 was sized back when object_5/44 were themselves
       * rigid and needed a bigger push to clear the prong from the same base
       * height as the caps. Now that the rails take the plain ramp and the
       * caps alone carry the extra, 0.35 is enough — bigger values reopen the
       * rail's own joint gap (0.70 measures 0.117 mm vs 0.35's 0.042 mm at
       * 0.25 ct) for no further gain in prong clearance, since the caps are
       * already the tallest metal on the shank.
       *
       * Applies to `rigidParts` only, on the same carat ramp as the drop, so it
       * is exactly 0 at and above `belowCarat` and every higher weight is
       * bit-identical.
       */
      railExtraMM: 0.35,
    },

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
     * maxAngleDeg 18, RAISED FROM 5.
     *
     * The 5 deg figure (itself reduced from an original 14) was sized against
     * the GLOBAL nearest-neighbour gap between the rail and object_3 — the
     * closest two points anywhere on either part. That measurement is
     * misleading: it finds a point roughly mid-height on the rail's inner
     * face, not the visible top corner where the rail actually ends and the
     * eye expects it to meet the basket. Measured at the rail's own topmost
     * vertex specifically (its front-facing tip, the corner circled as
     * visibly unjoined) rather than the whole-part nearest-neighbour:
     *
     *     maxAngleDeg   tip gap, US 6.5/0.25 ct   tip gap, US 13/0.25 ct
     *     5  (old)      1.03 / 1.10 mm            1.06 / 1.13 mm
     *     10             0.64 / 0.72 mm            -
     *     14             0.34 / 0.42 mm            -
     *     18  <- used    0.06 / 0.18 mm            0.07 / 0.18 mm
     *     22             0.07 / 0.07 mm            -
     *
     * Even the master weld (1.50 ct, no hinge) only closes its own tip to
     * 0.21-0.22 mm — that is the real "fully joined" reference, not the
     * ~0.009 mm the old note quotes from the global search. 18 deg brings
     * the hinged low-carat tip UNDER the master's own gap at both the
     * smallest (US 6.5) and largest (US 13) ring size, so the visible corner
     * now reads at least as joined as the un-hinged mount does.
     *
     * Stopped short of 22 deg despite it measuring slightly tighter here:
     * past ~22 deg the rail swings clear of the basket entirely and the gap
     * reopens on the OTHER side of the sweep (1.041 mm measured at 38 deg),
     * so 18 keeps a margin against that reversal rather than sitting right
     * at the edge of it.
     *
     * The global nearest-neighbour gap this was originally tuned against is
     * unaffected by this change — it stays under 0.06 mm at every carat/size
     * combination checked, same as before.
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
      maxAngleDeg: 18,
      excludeParts: ['object_49'],

      /**
       * EASE ZONE — the rotation above used to jump from 0 to 5 deg the
       * instant a vertex crossed pivotZ, so the rail stayed dead straight on
       * both sides of that height but met at a sharp corner right at the
       * seam (reported as "still a sharp curve bend" rather than a smooth
       * meeting with the head). Ramping the angle up smoothly with height —
       * instead of applying it all at once — bends that corner into a
       * continuous curve: every thin slice still only rotates (nothing
       * stretches or thins), but neighbouring slices now differ by a small
       * amount instead of jumping the full 5 deg in zero height.
       *
       * 3.4 mm, WIDENED FROM 2.0. At 2.0 mm the ramp only occupied the top
       * ~55% of the rail's straight run (pivotZ 9.7 to tip 13.3, 3.6 mm
       * total), so the visible curve still started late and swept through
       * its full angle in a short span near the tip — read as a bend
       * concentrated right at the head rather than one smooth arc rising out
       * of the shoulder. Stretching the ramp across nearly the entire run
       * (3.4 of 3.6 mm) starts the curve right off the pivot and lets it
       * unfold gradually the whole way up, matching how a bench-set rail
       * actually rounds into the head. Kept under the full 3.6 mm rather than
       * exactly at it so the angle still reaches strictly zero at the pivot
       * itself (no residual slope at the seam where it re-attaches to the
       * untouched shoulder below).
       */
      easeZ: 3.4,

      /**
       * SEAT PULL — bury the rail in the head instead of just touching it.
       *
       * A closed joint is not the same as a deep one: ENGAGEMENT (how far the
       * shoulder rail's inner face reaches past the basket rail's outer face)
       * was +0.798 mm at 3 heights on the 1.50 ct master but only +0.092 mm at
       * 1 height at 0.25 ct under the swing alone. Same contact, a tenth of
       * the overlap — the joint closed but read thin.
       *
       * Rotation cannot supply that (past ~22 deg the rail swings clear of the
       * basket and the gap grows again — 1.041 mm at 38 deg), so this adds the
       * missing TRANSLATION. It remains useful under seatDrop: the drop brings
       * the rail and basket to the same HEIGHT, but the last fraction of a
       * millimetre of overlap is still an inward move.
       *
       * 0.30/0.15, REDUCED FROM 0.80/0.40. The larger pull was sized to close
       * a gap the drop now closes on its own, and at 0.80/0.40 it pulls the
       * rail visibly inboard on top of the descent — the same over-closing
       * this change exists to remove. Swept at 0.25 ct with the 1.0 mm drop
       * and the 5 deg hinge in place:
       *
       *     inward/down     gap        note
       *     0.00 / 0.00     0.0095     closed, but shallowest overlap
       *     0.30 / 0.15     0.0095     same gap, deeper seat   <- used
       *     0.80 / 0.40     0.0095     same gap, rail pulled visibly inboard
       *
       * The gap is identical across all three, so this is chosen purely for
       * engagement depth at the least inward travel.
       *
       * `fromZ` 9.7 matches pivotZ so the pull starts exactly where the swing
       * does; `tipZ` 13.3 is the measured top of the shoulder rail
       * (object_5/44 reach Z 13.30). The bore is untouched at every setting —
       * mandrel radius holds at 8.0502 mm (US 6.5 exact) because the weight is
       * zero below fromZ, far above the finger hole.
       */
      seatPull: {
        fromZ: 9.7,
        tipZ: 13.3,
        inwardMM: 0.30,
        downMM: 0.15,
      },
    },

    /**
     * ============================================================
     * SHOULDER PAVE SPACING AT LARGE RING SIZES
     * ============================================================
     * blendShankToHead (core/deform.js) hands the rail the head's ONE rigid
     * offset above blendFromZ (shoulderHinge.pivotZ, 9.7), ramping up to
     * blendFullZAtTop (13.3, set above) so the rail stays welded to the
     * basket as the ring grows — see shoulderHinge above and the
     * blendFullZAtTop note for the metal side of this same fix. Stones take
     * the identical ramp (src/Ring.jsx passes the same blendFromZ/blendFullZ
     * to both), so widening it for the rail also reshaped the pave curve,
     * but did not flatten it.
     *
     * The two topmost shoulder pave stones (rank 1, centroid Z 12.51, and
     * rank 2, Z 11.15 — counting down from the head) sit inside that ramp,
     * on different parts of its curve, so they pick up different fractions
     * of the head's offset than rank 3 (Z 9.74, just below blendFromZ) and
     * the rest of the row. Measured WITH blendFullZAtTop already active but
     * nothing here set, US 6.5 -> US 13:
     *
     *              rank1-2 gap   rank2-3 gap   next 6 gaps (2-3..8-9)
     *     US 6.5   1.838 mm      1.834 mm      1.814-1.869 mm
     *     US 13    2.385 mm      2.555 mm      2.242-2.350 mm   <- both wide
     *
     * Every other gap in the row grows in step with the ring size; these two
     * grow noticeably further and land visibly wider than the rest of the
     * necklace by US 13 — the residual piece of the large-size "structure
     * changes" report that blendFullZAtTop's own rail fix does not reach,
     * since that fix targets the metal kink, not stone spacing.
     *
     * FIX: walk rank 1 and rank 2 down toward the accent below them as size
     * grows past rigidAboveSize, same mechanism the emerald profile uses for
     * its own "2nd stone from the head" (see rings/emerald/profile.js). A
     * pure translation — the stones keep their exact girdle — so this only
     * ever repositions them, never reshapes them.
     */
    rigidAboveSize: 6.5,

    /**
     * How far rank 1 and rank 2 each slide toward the accent below them, per
     * RING_SIZE.STEP past rigidAboveSize. Tuned against the measured US 13
     * gaps above: at 0.02 mm/step (13 steps, US 6.5 -> 13) the two gaps land
     * at 2.384 / 2.299 mm — both inside the 2.24-2.38 mm span the rest of
     * the row already occupies at that size, and every intermediate size
     * (checked at US 8, 10, 11.5) stays equally uniform rather than only
     * fixing the endpoint.
     */
    accentSlidePerSizeMM: 0.02,
    /** Rank 1 (nearest the head) and rank 2, on BOTH shoulders — see above. */
    accentSlideRanks: [1, 2],
    /**
     * Falloff radius (mm) for dragging each sliding stone's bezel seat along
     * with it — see the emerald profile for why this has to stay under the
     * spacing to the neighbouring seats. Measured here: smallest pristine
     * shoulder gap is 1.348 mm (rank1-2 at US 3, the tightest the slider
     * ever gets), so 1.2 mm clears every seat at every size with margin.
     */
    accentSeatRadiusMM: 1.2,

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
