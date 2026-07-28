/**
 * RING REGISTRY
 * ============================================================================
 * Every ring the builder can show. To add one:
 *
 *   1. mkdir rings/<id>/source  and drop the supplier's OBJ files in
 *   2. npm run profile <id>     — measures the mesh, prints the numbers
 *   3. cp rings/clientobj2/profile.js rings/<id>/profile.js  and fill it in
 *   4. npm run models <id>      — converts to Draco GLB and verifies
 *   5. import and add it below
 *
 * Nothing in core/ or src/ changes.
 */

import clientobj2 from './clientobj2/profile.js';

export const RINGS = {
  [clientobj2.id]: clientobj2,
};

/** Ordered list, for a picker UI. */
export const RING_LIST = Object.values(RINGS);

/** The ring shown on first load. */
export const DEFAULT_RING_ID = clientobj2.id;

export function getRing(id) {
  return RINGS[id] ?? RINGS[DEFAULT_RING_ID];
}

/**
 * Public URL for one of a ring's model files. Vite serves everything under
 * public/, so the build step copies rings/<id>/models/*.glb to
 * public/rings/<id>/ — see tools/build-models.mjs.
 */
export function modelUrl(profile, which) {
  return `/rings/${profile.id}/${profile.models[which]}`;
}
