# Ring Builder

Parametric 3D ring configurator. Loads real CAD geometry and drives it from
four controls — ring size, centre-stone carat, band width and metal — with
every transform derived from measurements of the source mesh rather than
guessed.

```bash
npm install
npm run dev
```

Currently ships one ring: **LR64530**, a princess-cut solitaire with pavé
shoulders.

---

## What it does

| Control | Range | How it works |
|---|---|---|
| Ring size | US 3 – 13, ½ steps | Uniform **radial offset** about the bore centre. A fixed distance, not a ratio, so the band's cross-section is translated rather than stretched — thickness stays 1.78 mm at every size. |
| Centre stone | 0.25 – 3.0 ct | Diamond weight scales with volume, so linear size is the **cube root** of carat. The head scales about the stone's culet so it stays seated while the stone grows upward. |
| Band width | 1 – 10 mm | Scale along the ring axis. Stones keep their size and centring; only metal widens. |
| Metal | 3 options | Yellow / white / rose gold PBR. Stones keep the diamond material regardless. |

Sizing accuracy is verified at **±0.016 US sizes** across the whole range,
measured against the shipped GLB bytes.

---

## Layout

```
src/
  app/        The React app — App.jsx, Controls.jsx, Ring.jsx, main.jsx.
              Ring-agnostic: it takes a ring's bundle as a prop/lookup and
              holds no per-ring knowledge itself.

  rings/      One folder per ring — see src/rings/README.md
    index.js       the registry
    <id>/
      index.js     bundles this ring's profile + deform + configure + standards
      profile.js   ~40 measured numbers for that ring
      deform.js    this ring's OWN vertex deformer (not shared)
      configure.js this ring's OWN normalize / resolve / validate
      standards.js this ring's OWN size chart, carat maths, metals
      models/      Draco-compressed GLB (581 KB for LR64530)

  tools/      profile → build → verify pipeline
```

Every ring folder is fully self-contained — its own deform math, its own
configure/standards, its own models. Nothing is shared between ring folders,
so tuning one ring can never conflict with another's files. Adding a ring
means copying an existing ring's folder, writing a new profile, and dropping
in two GLBs.

---

## Adding a ring

See **[src/rings/README.md](src/rings/README.md)** for the full walkthrough. Short version:

```bash
SRC=~/Downloads/ring-cad-masters/<id>          # CAD lives outside the repo
npm run profile <id> -- --src "$SRC"           # measure the mesh
cp src/rings/clientobj2/profile.js src/rings/<id>/profile.js
cp src/rings/clientobj2/deform.js src/rings/<id>/deform.js
cp src/rings/clientobj2/configure.js src/rings/<id>/configure.js
cp src/rings/clientobj2/standards.js src/rings/<id>/standards.js
cp src/rings/clientobj2/index.js src/rings/<id>/index.js
npm run models  <id> -- --src "$SRC"           # OBJ -> welded Draco GLB
npm run verify  <id>                           # prove it before shipping
```

Then one import line in `src/rings/index.js`. The model picker appears in the
UI automatically once more than one ring is registered.

---

## Scripts

| | |
|---|---|
| `npm run dev` | dev server on :5173 |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve `dist/` as a real static host would |
| `npm run profile <id>` | measure a new mesh, print profile values |
| `npm run models <id>` | OBJ → GLB (convert, weld, Draco compress) |
| `npm run verify [id]` | run the geometry contract against shipped GLBs |

`npm run verify` with no argument checks every registered ring.

---

## Things worth knowing before you change anything

**The CAD masters are not in this repo.** They are ~35 MB of ASCII OBJ per
ring and are only needed to re-measure or re-convert. The committed GLBs are
what the app loads, so a fresh clone runs without them. Keep the OBJs
somewhere durable — Draco is lossy (12-bit normals) and cannot be reversed.

**Don't delete `dist/rings/`.** It looks like a copy of `src/rings/*/models/` but
it is the build output the browser fetches. Without it a real static host
returns `index.html` in place of the GLB and no ring loads.

**Don't call `computeVertexNormals()`.** Rhino already wrote smoothed
per-vertex normals; recomputing destroys the hard girdle edges and the
diamonds render like glass beads.

**Weld before Draco.** OBJLoader de-indexes into flat triangle soup — 142k
source vertices become 702k. Welding restores the index buffer and accounts
for most of the size win before Draco runs.

**Environment maps are generated locally.** drei's `<Environment preset>`
fetches an HDRI from a GitHub CDN at runtime, which breaks offline and makes
every transmissive diamond render black until it resolves. The studio rig in
`src/app/App.jsx` is built from `Lightformer`s instead. The Draco decoder is
likewise served from `node_modules` rather than a CDN.

**Run `npm run verify` after any geometry change.** The deformer reads vertex
positions directly, so a bad conversion or a wrong constant shows up as a
mis-sized ring. The checks in `src/tools/verify-ring.mjs` caught several real bugs
during development, including a version where a ring set to US 13 physically
gauged US 7.3.

---

## Known limits

- **Band width above ~5 mm stretches the pavé bead-work.** The melee stay
  1.55 mm while the metal around them widens. A real shank that wide would
  carry more stones or extra rows, which is new geometry rather than a
  transform. The UI warns above 5 mm. Fixing it properly needs a plain-shank
  mesh variant.
- **The JS bundle is ~1.1 MB** (313 KB gzipped), mostly three.js. Code
  splitting is not done.
- **One ring shipped.** The profile interface is shaped around a centre stone
  plus optional accents plus a separate head. A three-stone or bezel setting
  may need a genuine extension, not just new values.
