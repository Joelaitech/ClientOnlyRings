/**
 * RING REGISTRY
 * ============================================================================
 * Every ring the builder can show. To add one:
 *
 *   1. mkdir rings/<id>/source  and drop the supplier's OBJ files in
 *   2. npm run profile <id>     — measures the mesh, prints the numbers
 *   3. cp rings/clientobj2/profile.js rings/<id>/profile.js  and fill it in
 *   4. copy deform.js / configure.js / standards.js from an existing ring
 *      folder into rings/<id>/ too — every ring's copy is its own
 *   5. cp rings/clientobj2/index.js rings/<id>/index.js  (bundles the four)
 *   6. npm run models <id>      — converts to Draco GLB and verifies
 *   7. import and add it below
 *
 * Each ring folder is fully self-contained — its own profile, deform,
 * configure and standards. Nothing is shared between ring folders.
 */

import * as clientobj2 from './clientobj2/index.js';
import * as pear from './pear/index.js';
import * as emerald from './emerald/index.js';
import * as oval from './oval/index.js';

/** Every ring's full bundle (profile + deform + configure + standards), by id. */
export const RING_MODULES = {
  [clientobj2.profile.id]: clientobj2,
  [pear.profile.id]: pear,
  [emerald.profile.id]: emerald,
  [oval.profile.id]: oval,
};

export const RINGS = Object.fromEntries(
  Object.entries(RING_MODULES).map(([id, mod]) => [id, mod.profile])
);

/** Ordered list, for a picker UI. */
export const RING_LIST = Object.values(RINGS);

/** The ring shown on first load. */
export const DEFAULT_RING_ID = clientobj2.profile.id;

export function getRing(id) {
  return RINGS[id] ?? RINGS[DEFAULT_RING_ID];
}

/** This ring's own bundle — profile, deform, configure, standards. */
export function getRingModule(id) {
  return RING_MODULES[id] ?? RING_MODULES[DEFAULT_RING_ID];
}

/**
 * Public URL for one of a ring's model files. Vite serves everything under
 * public/, so the build step copies rings/<id>/models/*.glb to
 * public/rings/<id>/ — see tools/build-models.mjs.
 */
export function modelUrl(profile, which) {
  return `/rings/${profile.id}/${profile.models[which]}`;
}
