/**
 * CONFIGURATION ENGINE — ring-agnostic.
 * ============================================================================
 * Turns a user's choices plus a ring profile into everything the renderer and
 * the spec panel need. Add a ring by writing a profile; nothing here changes.
 */

import { RING_SIZE, CARAT, SHANK_WIDTH, METALS } from './standards.js';

/** The config every ring accepts. Defaults come from the ring's own master. */
export function defaultConfig(profile) {
  return {
    ringSize: profile.master.ringSize,
    carat: profile.master.carat,
    shankWidth: profile.master.shankWidthMM,
    metal: 'yellowGold',
  };
}

/**
 * Clamp + snap an incoming config to the legal option set for this ring.
 *
 * Master values are preserved exactly even when they are off-grid. A ring
 * modelled at 1.99 mm would otherwise snap to 2.00 on every load and silently
 * render 0.5% wider than it was built — the app could never show the ring as
 * actually modelled.
 */
export function normalizeConfig(cfg, profile) {
  const m = profile.master;
  const snap = (v, min, max, step) =>
    Math.min(max, Math.max(min, Math.round(v / step) * step));
  const snapOrMaster = (v, masterVal, min, max, step) =>
    Math.abs(v - masterVal) < 1e-6 ? masterVal : snap(v, min, max, step);

  return {
    ringSize: snapOrMaster(
      cfg.ringSize ?? m.ringSize, m.ringSize,
      RING_SIZE.MIN, RING_SIZE.MAX, RING_SIZE.STEP),
    carat: snapOrMaster(
      cfg.carat ?? m.carat, m.carat,
      CARAT.MIN, CARAT.MAX, CARAT.STEP),
    shankWidth: snapOrMaster(
      cfg.shankWidth ?? m.shankWidthMM, m.shankWidthMM,
      SHANK_WIDTH.MIN, SHANK_WIDTH.MAX, SHANK_WIDTH.STEP),
    metal: METALS[cfg.metal] ? cfg.metal : 'yellowGold',
  };
}

/** Radial offset in mm to reach `usSize` on this ring. */
export function radialDelta(usSize, profile) {
  return RING_SIZE.innerRadiusMM(usSize) - profile.master.boreRadius;
}

/**
 * Transform for the head group: uniform scale plus a translation.
 *
 * The head scales about the centre stone's CULET, not the world origin and
 * not the stone's centroid. That keeps the head planted on its seat while the
 * stone grows upward — how a real head is re-cut for a larger stone. It then
 * rides the shoulders up or down with ring size.
 */
export function headTransform(carat, usSize, profile) {
  const s = CARAT.scale(carat, profile.master.carat);
  const pivot = profile.head.pivotZ;
  return {
    scale: s,
    position: { x: 0, y: 0, z: (1 - s) * pivot + radialDelta(usSize, profile) },
  };
}

/** Everything a renderer and a spec panel need, derived from a config. */
export function resolve(cfg, profile) {
  const c = normalizeConfig(cfg, profile);
  const m = profile.master;

  const stoneMM = CARAT.mm(c.carat, m.stoneMM, m.carat);
  const accents = profile.accents;

  return {
    config: c,
    profile,
    shank: {
      radialDelta: radialDelta(c.ringSize, profile),
      innerDiameter: RING_SIZE.innerDiameterMM(c.ringSize),
      circumference: RING_SIZE.circumferenceMM(c.ringSize),
      widthMM: c.shankWidth,
      widthScale: SHANK_WIDTH.scale(c.shankWidth, m.shankWidthMM),
      thicknessMM: m.thicknessMM,
    },
    head: headTransform(c.carat, c.ringSize, profile),
    stone: { mm: stoneMM, carat: c.carat, cut: profile.centerStone.cut },
    accents: accents
      ? {
          ...accents,
          totalCarat: +(accents.count * accents.caratEach).toFixed(3),
        }
      : null,
    totalCarat: +(
      c.carat + (accents ? accents.count * accents.caratEach : 0)
    ).toFixed(3),
    material: METALS[c.metal],
  };
}

/**
 * Manufacturability warnings.
 *
 * Generic rules live here and read their thresholds from the profile, so a
 * ring without pavé simply omits `accents` and the pavé rules do not fire.
 * A ring with a genuinely unusual constraint can add `profile.extraWarnings`,
 * a function returning additional strings.
 */
export function validate(cfg, profile) {
  const c = normalizeConfig(cfg, profile);
  const m = profile.master;
  const warnings = [];
  const stoneMM = CARAT.mm(c.carat, m.stoneMM, m.carat);

  // --- head vs shank proportion -------------------------------------------
  if (profile.head?.basketMM) {
    const basket = profile.head.basketMM * CARAT.scale(c.carat, m.carat);
    const minSize = profile.head.minSizeForLargeBasket ?? 6;
    if (basket > profile.head.maxBasketMM && c.ringSize < minSize) {
      warnings.push(
        `A ${c.carat} ct head (${basket.toFixed(1)} mm basket) overhangs a ` +
        `US ${c.ringSize} shank. Recommended minimum size for this carat is ` +
        `US ${minSize}.`
      );
    }
  }

  // --- prong coverage on very small stones ---------------------------------
  if (profile.head?.minComfortableCarat && c.carat <= profile.head.minComfortableCarat) {
    warnings.push(
      `At ${c.carat} ct (${stoneMM.toFixed(2)} mm) the prongs cover a large ` +
      `fraction of the stone. Consider a smaller head for this weight.`
    );
  }

  // --- pavé: too narrow to bead-set ----------------------------------------
  if (profile.accents) {
    const need = profile.accents.mm + 0.3;
    if (c.shankWidth < need) {
      warnings.push(
        `A ${c.shankWidth.toFixed(2)} mm band leaves under 0.15 mm of metal ` +
        `either side of the ${profile.accents.mm} mm pavé. Below about ` +
        `${need.toFixed(2)} mm the stones cannot be bead-set. Consider a ` +
        `plain (unset) shank at this width.`
      );
    }

    // --- pavé: bead-work stretches when the band is scaled up --------------
    const stretchAt = profile.accents.maxCleanWidthMM ?? 5;
    if (c.shankWidth > stretchAt) {
      const x = SHANK_WIDTH.scale(c.shankWidth, m.shankWidthMM).toFixed(1);
      warnings.push(
        `At ${c.shankWidth.toFixed(2)} mm (${x}× the modelled band) the pavé ` +
        `bead-work stretches — the melee stay ${profile.accents.mm} mm but ` +
        `their setting widens. A real shank this wide would use more stones ` +
        `or multiple rows. Consider a plain shank above about ${stretchAt} mm.`
      );
    }
  }

  // --- band wider than the head it carries ---------------------------------
  if (profile.head?.widthMM && c.shankWidth > profile.head.widthMM) {
    warnings.push(
      `At ${c.shankWidth.toFixed(2)} mm the band is also wider than the head ` +
      `(${profile.head.widthMM.toFixed(2)} mm), so the shank will visibly ` +
      `overhang the setting.`
    );
  }

  if (profile.extraWarnings) warnings.push(...profile.extraWarnings(c, profile));

  return { valid: warnings.length === 0, warnings, config: c };
}
