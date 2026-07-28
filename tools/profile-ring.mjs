/**
 * MEASURE A NEW RING
 * ============================================================================
 *   npm run profile <ringId>
 *
 * Reads rings/<id>/source/*.obj and prints every number a profile needs,
 * plus the checks that caught real problems on the first ring.
 *
 * This does NOT write the profile. Some calls need a human — deciding which
 * file is the shank, whether a duplicate shell is redundant or load-bearing.
 * It gets you the measurements; you fill in rings/<id>/profile.js.
 */

import fs from 'node:fs';
import path from 'node:path';

const id = process.argv[2];
if (!id) {
  console.error('usage: npm run profile <ringId>');
  console.error('       expects OBJ files in rings/<ringId>/source/');
  process.exit(1);
}

/**
 * Where the CAD masters live. See tools/build-models.mjs — the OBJs are kept
 * outside the project because they are large and only needed for measuring
 * and converting, never to run the app.
 */
const argSrc = (() => {
  const i = process.argv.indexOf('--src');
  return i > -1 ? process.argv[i + 1] : null;
})();
const SRC = path.resolve(
  argSrc ??
  (process.env.RING_SRC ? path.join(process.env.RING_SRC, id) : null) ??
  path.join('rings', id, 'source')
);
if (!fs.existsSync(SRC)) {
  console.error(`No CAD source found at: ${SRC}`);
  console.error();
  console.error('Point at the OBJ folder with either:');
  console.error(`  npm run profile ${id} -- --src "<folder>"`);
  console.error(`  RING_SRC=<parent-folder> npm run profile ${id}`);
  process.exit(1);
}

const BS = String.fromCharCode(92);

function loadOBJ(file) {
  const verts = [];
  const groups = [];
  let cur = null;
  let pending = '';
  const txt = fs.readFileSync(file, 'latin1');
  for (let line of txt.split('\n')) {
    line = line.replace(/\r$/, '');
    if (pending) { line = pending + ' ' + line.trim(); pending = ''; }
    if (line.endsWith(BS)) { pending = line.slice(0, -1).trim(); continue; }
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      verts.push([+p[1], +p[2], +p[3]]);
    } else if (line.startsWith('g ')) {
      cur = { name: line.slice(2).trim(), min: Infinity, max: 0, faces: 0 };
      groups.push(cur);
    } else if (line.startsWith('f ') && cur) {
      cur.faces++;
      for (const t of line.split(/\s+/).slice(1)) {
        const s = t.split('/')[0];
        if (!/^-?\d+$/.test(s)) continue;
        let i = +s;
        if (i < 0) i = verts.length + 1 + i;
        if (i > cur.max) cur.max = i;
        if (i < cur.min) cur.min = i;
      }
    }
  }
  return { verts, groups };
}

const bbox = (pts) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) {
    mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]);
  }
  return { mn, mx, size: mx.map((v, k) => v - mn[k]) };
};

const files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.obj'));
if (!files.length) {
  console.error(`No .obj files in ${SRC}`);
  process.exit(1);
}

console.log(`\n${'='.repeat(78)}`);
console.log(`MEASURING  rings/${id}`);
console.log('='.repeat(78));

const loaded = files.map((f) => ({ file: f, ...loadOBJ(path.join(SRC, f)) }));

// --- 1. which file is which ------------------------------------------------
console.log('\n1. FILES');
for (const L of loaded) {
  const b = bbox(L.verts);
  const stones = L.groups.filter((g) => /^Diamond_/i.test(g.name)).length;
  console.log(`  ${L.file}`);
  console.log(`     ${L.verts.length} verts, ${L.groups.length} groups, ${stones} stone group(s)`);
  console.log(`     X[${b.mn[0].toFixed(2)} ${b.mx[0].toFixed(2)}] ` +
              `Y[${b.mn[1].toFixed(2)} ${b.mx[1].toFixed(2)}] ` +
              `Z[${b.mn[2].toFixed(2)} ${b.mx[2].toFixed(2)}]`);
}

// Heuristic: the shank is the file with the largest X extent (it is a hoop);
// the head is the small one sitting high in Z.
const byWidth = [...loaded].sort((a, b) => bbox(b.verts).size[0] - bbox(a.verts).size[0]);
const fused = loaded.find((L) =>
  loaded.some((A) => loaded.some((B) =>
    A !== B && A !== L && B !== L && A.verts.length + B.verts.length === L.verts.length)));
const shank = byWidth.find((L) => L !== fused);
const head = loaded.find((L) => L !== fused && L !== shank);

console.log('\n   Guessed roles:');
console.log(`     shank = ${shank?.file ?? '?'}`);
console.log(`     head  = ${head?.file ?? '?'}`);
if (fused) {
  console.log(`     fused = ${fused.file}  (shank + head — do not use)`);
}
console.log('   VERIFY THESE before writing the profile.');

if (!shank) process.exit(0);

// --- 2. split is lossless? -------------------------------------------------
if (fused && head) {
  const sum = shank.verts.length + head.verts.length;
  const ok = sum === fused.verts.length;
  console.log(`\n2. SPLIT CHECK  ${shank.verts.length} + ${head.verts.length} = ${sum} ` +
              `vs fused ${fused.verts.length}  ${ok ? 'LOSSLESS' : 'MISMATCH'}`);
  if (ok) console.log('   Both halves share one origin — they load with no transform.');
  else console.log('   WARNING: the split files may not reassemble cleanly.');
}

// --- 3. bore fit -----------------------------------------------------------
// The ring axis is the thinnest dimension; assume Y as authored by Rhino.
console.log('\n3. BORE');
let best = null;
for (let cz10 = -30; cz10 <= 40; cz10++) {
  const cz = cz10 / 10;
  const rs = [];
  for (const [x, y, z] of shank.verts) {
    if (Math.abs(y) > 0.15) continue;
    const dz = z - cz;
    if (dz > -3) continue;              // bottom arc: the plain band
    rs.push(Math.hypot(x, dz));
  }
  if (rs.length < 200) continue;
  rs.sort((a, b) => a - b);
  const inner = rs.slice(0, Math.max(1, Math.floor(rs.length / 50)));
  const mean = inner.reduce((s, v) => s + v, 0) / inner.length;
  const sd = Math.sqrt(inner.reduce((s, v) => s + (v - mean) ** 2, 0) / inner.length);
  if (!best || sd < best.sd) best = { cz, mean, sd };
}
if (best) {
  const id_mm = best.mean * 2;
  const usSize = (id_mm - 11.63) / 0.8128 + 1;
  console.log(`   boreCenter: { x: 0, y: 0, z: ${best.cz.toFixed(2)} }`);
  console.log(`   boreRadius: ${best.mean.toFixed(4)}        (circle-fit sd ${best.sd.toFixed(4)})`);
  console.log(`   ringSize:   ${usSize.toFixed(2)}  ->  use ${(Math.round(usSize * 2) / 2).toFixed(1)}`);
  console.log(`   inner diameter ${id_mm.toFixed(3)} mm`);
}

const CZ = best ? best.cz : 0;

// --- 4. band width + thickness --------------------------------------------
console.log('\n4. BAND');
{
  let lo = Infinity, hi = -Infinity, yl = Infinity, yh = -Infinity;
  for (const [x, y, z] of shank.verts) {
    if (Math.abs(x) > 0.6) continue;
    const dz = z - CZ;
    if (dz > 0) continue;
    const r = Math.hypot(x, dz);
    lo = Math.min(lo, r); hi = Math.max(hi, r);
    yl = Math.min(yl, y); yh = Math.max(yh, y);
  }
  console.log(`   shankWidthMM: ${(yh - yl).toFixed(2)}   (Y span at the bottom)`);
  console.log(`   thicknessMM:  ${(hi - lo).toFixed(2)}   (radial)`);

  // taper: is the band constant width, or does it swell at the shoulders?
  const w = (loD, hiD) => {
    let a = Infinity, b = -Infinity;
    for (const [x, y, z] of shank.verts) {
      const d = Math.atan2(z - CZ, Math.abs(x)) * 180 / Math.PI;
      if (d < loD || d > hiD) continue;
      a = Math.min(a, y); b = Math.max(b, y);
    }
    return b - a;
  };
  console.log(`   taper: ${w(-90, -60).toFixed(3)} mm at the bottom -> ` +
              `${w(60, 90).toFixed(3)} mm at the shoulders`);
}

// --- 5. stones -------------------------------------------------------------
console.log('\n5. STONES');
for (const L of [shank, head].filter(Boolean)) {
  const stoneGroups = L.groups.filter((g) => /^Diamond_/i.test(g.name));
  if (!stoneGroups.length) continue;
  const byName = {};
  for (const g of stoneGroups) (byName[g.name] ??= []).push(g);
  for (const [name, gs] of Object.entries(byName)) {
    const g = gs[0];
    const pts = L.verts.slice(g.min - 1, g.max);
    const b = bbox(pts);
    const girdle = Math.max(b.size[0], b.size[1]);
    console.log(`   ${L.file}  ${name} ×${gs.length}`);
    console.log(`      bbox ${b.size.map((v) => v.toFixed(3)).join(' × ')}  girdle ≈ ${girdle.toFixed(3)} mm`);
    if (gs.length === 1) {
      // centre stone: infer carat from the princess/round chart
      const asPrincess = Math.pow(girdle / 5.40, 3);
      const asRound = Math.pow(girdle / 6.50, 3);
      console.log(`      if princess: ${asPrincess.toFixed(2)} ct · if round: ${asRound.toFixed(2)} ct`);
    } else {
      const ct = Math.pow(girdle / 6.50, 3);
      console.log(`      accents: ${gs.length} × ${girdle.toFixed(2)} mm ≈ ${ct.toFixed(4)} ct each`);
      const angles = gs.map((s) => {
        const p = L.verts.slice(s.min - 1, s.max);
        const bb = bbox(p);
        const cx = (bb.mn[0] + bb.mx[0]) / 2, cz = (bb.mn[2] + bb.mx[2]) / 2;
        return Math.atan2(cz - CZ, Math.abs(cx)) * 180 / Math.PI;
      }).sort((a, b) => a - b);
      const uniq = [...new Set(angles.map((a) => +a.toFixed(1)))];
      console.log(`      anglesDeg: [${uniq.join(', ')}]`);
    }
  }
}

// --- 6. head ---------------------------------------------------------------
if (head) {
  console.log('\n6. HEAD');
  const b = bbox(head.verts);
  console.log(`   minZ: ${b.mn[2].toFixed(3)}   maxZ: ${b.mx[2].toFixed(3)}`);
  let mLo = Infinity, mHi = -Infinity;
  for (const g of head.groups) {
    if (/^Diamond_/i.test(g.name)) continue;
    for (let i = g.min - 1; i < g.max; i++) {
      mLo = Math.min(mLo, head.verts[i][1]); mHi = Math.max(mHi, head.verts[i][1]);
    }
  }
  console.log(`   widthMM: ${(mHi - mLo).toFixed(3)}   (metal footprint in Y)`);
  const stone = head.groups.find((g) => /^Diamond_/i.test(g.name));
  if (stone) {
    const pts = head.verts.slice(stone.min - 1, stone.max);
    const sb = bbox(pts);
    console.log(`   pivotZ: ${sb.mn[2].toFixed(3)}   (culet — the head scales about this)`);
    console.log(`   stone table Z ${sb.mx[2].toFixed(3)}, depth ${sb.size[2].toFixed(3)}`);
  }
}

// --- 7. duplicate shells ---------------------------------------------------
console.log('\n7. DUPLICATE SHELLS  (identical bounds = z-fighting; add to skipParts)');
{
  let found = 0;
  const metal = shank.groups.filter((g) => !/^Diamond_/i.test(g.name));
  for (let i = 0; i < metal.length; i++) {
    for (let j = i + 1; j < metal.length; j++) {
      const a = bbox(shank.verts.slice(metal[i].min - 1, metal[i].max));
      const b = bbox(shank.verts.slice(metal[j].min - 1, metal[j].max));
      const same = a.mn.every((v, k) => Math.abs(v - b.mn[k]) < 1e-3) &&
                   a.mx.every((v, k) => Math.abs(v - b.mx[k]) < 1e-3);
      if (same) {
        console.log(`   ${metal[i].name} and ${metal[j].name} are coincident ` +
                    `— skip one (usually the later)`);
        found++;
      }
    }
  }
  if (!found) console.log('   none');
}

// --- 8. the trap -----------------------------------------------------------
console.log('\n8. SHOULDER STRUCTURE  (does any part span the full cross-section?)');
console.log('   If a part reaches from the bore out to the outer wall, it IS the');
console.log('   finger hole at that angle and cannot be frozen during resize.');
{
  const metal = shank.groups.filter((g) => !/^Diamond_/i.test(g.name));
  for (const g of metal) {
    let rl = Infinity, rh = -Infinity, aLo = Infinity, aHi = -Infinity;
    for (let i = g.min - 1; i < g.max; i++) {
      const [x, y, z] = shank.verts[i];
      if (x < 0) continue;
      const dz = z - CZ;
      const r = Math.hypot(x, dz);
      rl = Math.min(rl, r); rh = Math.max(rh, r);
      const a = Math.atan2(dz, x) * 180 / Math.PI;
      aLo = Math.min(aLo, a); aHi = Math.max(aHi, a);
    }
    if (!isFinite(rl)) continue;
    const spans = rh - rl > 1.5;
    console.log(`   ${g.name.padEnd(11)} r ${rl.toFixed(2)}..${rh.toFixed(2)}  ` +
                `angle ${aLo.toFixed(0)}..${aHi.toFixed(0)}` +
                (spans ? '   <- full cross-section' : ''));
  }
}

console.log(`\n${'='.repeat(78)}`);
console.log('Copy rings/clientobj2/profile.js and fill in the values above.');
console.log('Then: npm run models ' + id);
console.log('='.repeat(78) + '\n');
