/**
 * INDUSTRY STANDARDS — identical for every ring in the catalogue.
 * ============================================================================
 * Nothing in this file is specific to a model. Ring sizes, the carat/mm
 * relationship and the metal palette are the same whether you are configuring
 * a solitaire or a five-stone band.
 *
 * Per-ring measured facts live in rings/<id>/profile.js instead.
 */

// ---------------------------------------------------------------------------
// RING SIZE
// ---------------------------------------------------------------------------

/**
 * Standard US sizing. Inner diameter in mm for a given US size:
 *     ID = 11.63 + 0.8128 * (size - 1)
 * One full US size = 0.8128 mm of diameter = 2.554 mm of circumference.
 */
export const RING_SIZE = {
  MIN: 3,
  MAX: 13,
  STEP: 0.5,
  innerDiameterMM: (usSize) => 11.63 + 0.8128 * (usSize - 1),
  innerRadiusMM:   (usSize) => (11.63 + 0.8128 * (usSize - 1)) / 2,
  circumferenceMM: (usSize) => Math.PI * (11.63 + 0.8128 * (usSize - 1)),
  /** mm of diameter per whole US size — used to express errors in sizes. */
  MM_PER_SIZE: 0.8128,
};

// ---------------------------------------------------------------------------
// CARAT
// ---------------------------------------------------------------------------

/**
 * Diamond weight scales with VOLUME, so linear size scales with the cube
 * root of carat:
 *
 *     mm = masterMM * (carat / masterCarat)^(1/3)
 *
 * The master size differs per ring (a 1 ct princess is 5.40 mm, a 1 ct round
 * is 6.50 mm), so the reference pair is supplied by the ring profile. Only
 * the relationship lives here.
 */
export const CARAT = {
  MIN: 0.25,
  MAX: 3.0,
  STEP: 0.25,

  /** Linear scale factor from the master stone to `ct`. */
  scale: (ct, masterCarat = 1) => Math.cbrt(ct / masterCarat),

  /** Girdle width in mm for `ct`, given the ring's master stone. */
  mm: (ct, masterMM, masterCarat = 1) =>
    masterMM * Math.cbrt(ct / masterCarat),

  /** Inverse: what weight does a stone of `mm` correspond to. */
  fromMM: (mm, masterMM, masterCarat = 1) =>
    masterCarat * Math.pow(mm / masterMM, 3),
};

/**
 * Standard princess-cut reference. Useful for sanity-checking a new ring's
 * measured centre stone against the trade chart.
 */
export const PRINCESS_TABLE = [
  { ct: 0.25, mm: 3.40 }, { ct: 0.50, mm: 4.29 }, { ct: 0.75, mm: 4.91 },
  { ct: 1.00, mm: 5.40 }, { ct: 1.25, mm: 5.82 }, { ct: 1.50, mm: 6.18 },
  { ct: 1.75, mm: 6.51 }, { ct: 2.00, mm: 6.80 }, { ct: 2.25, mm: 7.07 },
  { ct: 2.50, mm: 7.33 }, { ct: 2.75, mm: 7.57 }, { ct: 3.00, mm: 7.79 },
];

// ---------------------------------------------------------------------------
// BAND WIDTH
// ---------------------------------------------------------------------------

/**
 * Slider bounds for band width. The MASTER width is per-ring (it is a
 * measured property of the mesh), so it is not here — only the range the
 * control offers.
 */
export const SHANK_WIDTH = {
  MIN: 1.0,
  MAX: 10.0,
  STEP: 0.25,

  /** Multiplier along the ring axis to reach `mm` from a ring's master. */
  scale: (mm, masterMM) => mm / masterMM,
};

// ---------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------

/**
 * PBR values for a physically-based renderer. Colors are linear-space base
 * reflectance for the metal, which is what `metalness: 1` expects. Do not
 * apply sRGB conversion twice.
 */
export const METALS = {
  yellowGold: {
    id: 'yellowGold',
    label: '18K Yellow Gold',
    color: '#F2C14E',
    metalness: 1.0,
    roughness: 0.18,
    envMapIntensity: 1.6,
  },
  whiteGold: {
    id: 'whiteGold',
    label: '18K White Gold',
    color: '#E8E8E6',     // rhodium-plated, near-neutral with a cool cast
    metalness: 1.0,
    roughness: 0.13,
    envMapIntensity: 1.8,
  },
  roseGold: {
    id: 'roseGold',
    label: '18K Rose Gold',
    color: '#E0A080',
    metalness: 1.0,
    roughness: 0.18,
    envMapIntensity: 1.6,
  },
};

/**
 * The diamond material is INDEPENDENT of the metal choice — stones keep this
 * material whichever metal is selected.
 */
export const DIAMOND = {
  id: 'diamond',
  label: 'Diamond',
  color: '#FFFFFF',
  metalness: 0.0,
  roughness: 0.0,
  transmission: 1.0,
  ior: 2.417,             // true refractive index of diamond
  thickness: 2.0,
  dispersion: 0.044,      // diamond's actual dispersion, gives the fire
  envMapIntensity: 2.5,
  specularIntensity: 1.0,
};

/**
 * Assign a material by mesh/group name.
 *
 * CONVENTION, and it must hold for every ring added to the catalogue: any
 * part whose name begins with `Diamond_` is a stone; everything else is
 * metal. Rhino exports this naming by default. If a supplier sends a model
 * that names stones differently, rename the groups at conversion time rather
 * than special-casing here.
 */
export function materialFor(groupName, metalId) {
  return groupName.startsWith('Diamond_') ? DIAMOND : METALS[metalId];
}
