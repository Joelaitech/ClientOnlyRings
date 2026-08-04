# Adding a ring

Every ring folder is fully self-contained: its own `profile.js`, its own
`deform.js`, its own `configure.js`, its own `standards.js`, its own
`models/`. Nothing is shared between ring folders — copying an existing
ring's folder and editing the copy can never conflict with anyone else's
ring, because no file is touched by more than one ring.

```bash
# 1. put the supplier's OBJ files somewhere OUTSIDE the project
#    (they are ~35 MB each and only needed for these steps)
SRC=~/Downloads/ring-cad-masters/<id>

npm run profile <id> -- --src "$SRC"      # 2. measure the mesh

# 3. copy an existing ring's folder as the starting point — profile,
#    deform, configure, standards and the bundle index all come along
cp src/rings/clientobj2/profile.js   src/rings/<id>/profile.js
cp src/rings/clientobj2/deform.js    src/rings/<id>/deform.js
cp src/rings/clientobj2/configure.js src/rings/<id>/configure.js
cp src/rings/clientobj2/standards.js src/rings/<id>/standards.js
cp src/rings/clientobj2/index.js     src/rings/<id>/index.js
#    then fill in profile.js's numbers, and deform.js/configure.js/
#    standards.js if this ring needs behaviour the copied ones don't have

npm run models  <id> -- --src "$SRC"      # 4. OBJ -> Draco GLB
npm run verify  <id>                      # 5. prove it before shipping
```

`RING_SRC=~/Downloads/ring-cad-masters` also works, and then the `--src` flag
can be dropped. The CAD masters for `clientobj2` are in
`~/Downloads/ring-cad-masters/clientobj2/`.

## What lives where, and why

| | Committed | Needed to run the app | Needed to add/re-convert a ring |
|---|---|---|---|
| `rings/<id>/profile.js` | yes | yes | yes |
| `rings/<id>/deform.js` | yes | yes | yes |
| `rings/<id>/configure.js` | yes | yes | yes |
| `rings/<id>/standards.js` | yes | yes | yes |
| `rings/<id>/index.js` | yes | yes | yes |
| `rings/<id>/models/*.glb` | yes (581 KB) | **yes** | no |
| CAD `*.obj` (outside repo) | no | no | **yes** |
| `dist/` | no | it *is* the app | no |

**Do not delete `dist/rings/`.** It looks like a duplicate of `rings/*/models/`
but it is the build output the browser actually fetches. Deleting it makes a
real static host return `index.html` in place of the GLB — 409 bytes of HTML
instead of a 546 KB mesh, and the ring never loads. `vite preview` hides this
(it reuses the dev middleware), so always check with a plain static server.

**Keep the CAD masters somewhere durable.** The Draco GLB is a lossy output
(12-bit normals) and cannot be converted back. You need the OBJ to change
compression settings, to diff against a client revision, or to run any
geometry analysis that welding destroyed.

Then register the bundle in `rings/index.js`:

```js
import * as myRing from './myRing/index.js';
export const RING_MODULES = {
  [clientobj2.profile.id]: clientobj2,
  [myRing.profile.id]: myRing,
};
```

The model picker appears in the UI automatically once there is more than one.

---

## What each step does

**`npm run profile <id>`** reads the OBJ files and prints every value the
profile needs: bore centre and radius, US size, band width and thickness,
stone sizes and angles, head pivot and footprint. It does not write the
profile — some calls need a human.

**`npm run models <id>`** converts to Draco GLB. On the first ring this took
35.5 MB down to 581 KB. The weld step is not optional: OBJLoader de-indexes
into flat triangle soup (142k vertices became 702k) and Draco cannot recover
that alone.

**`npm run verify <id>`** runs the deformer against the shipped GLB bytes and
checks sizing accuracy, cross-section preservation, shear, width tracking,
axis independence, and stone integrity. Draco is lossy and the deformer reads
these positions directly, so this is the step that catches a bad conversion.

---

## Read the profiler's last two sections carefully

These are where the first ring cost real time.

**Section 7 — duplicate shells.** Coincident parts z-fight. Add one to
`skipParts`.

**Section 8 — shoulder structure.** If a part spans the full cross-section
(bore out to the outer wall), it *is* the finger hole at that angle and cannot
be held still during resize.

On `clientobj2`, `object_6` and `object_10` each span 8.40 → 10.56 mm — they
are the left and right halves of the shank, not inner-rail and outer-wall
layers. Assuming otherwise produced a ring that gauged US 7.3 when set to
US 13, because the frozen shoulders choked the bore. Check this before
assuming a new ring's shoulders are separable.

---

## Conventions a new model must follow

- **Stones are named `Diamond_*`.** That is how materials are assigned. Rhino
  exports this by default; if a supplier names them differently, rename the
  groups at conversion time rather than special-casing the renderer.
- **+Z up through the head, +Y the ring axis, band thin in Y.** As authored by
  Rhino. A model in a different orientation needs rotating at conversion, not
  at render.
- **Shank and head as separate files sharing one world origin.** The profiler
  checks losslessness against the fused file. If a supplier only sends a fused
  model, the head cannot be configured independently.

---

## Optional profile keys

Omit any of these and the related behaviour simply does not appear:

| Key | Effect when omitted |
|---|---|
| `accents` | No pavé warnings, no accent row in the spec panel |
| `head.basketMM` | No head-overhang warning |
| `head.minComfortableCarat` | No small-stone prong warning |
| `skipParts` | Nothing skipped at load |
| `sourceFiles` | Roles guessed by vertex count — override if the guess is wrong |
| `extraWarnings` | No ring-specific warnings |
