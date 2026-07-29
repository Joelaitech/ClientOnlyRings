/**
 * VERIFY A RING'S SHIPPED GLB AGAINST ITS PROFILE
 * ============================================================================
 *   npm run verify [ringId]      (omit the id to check every ring)
 *
 * Draco is lossy and the deformer reads these vertex positions directly, so a
 * quantisation error large enough to matter shows up as a mis-sized ring.
 * These are the same checks that caught real bugs while building the first
 * ring — run them on every new model before shipping it.
 */

import path from 'node:path';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

import { RING_SIZE, SHANK_WIDTH, CARAT } from '../core/standards.js';
import { deformMetal, deformStoneRigid, centroidXZ } from '../core/deform.js';
import { radialDelta } from '../core/configure.js';
import { RINGS } from '../rings/index.js';

const only = process.argv[2];
const targets = only ? [RINGS[only]].filter(Boolean) : Object.values(RINGS);
if (!targets.length) {
  console.error(only ? `Unknown ring: ${only}` : 'No rings registered.');
  process.exit(1);
}

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

let failures = 0;

for (const profile of targets) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`${profile.id}  (${profile.sku} — ${profile.name})`);
  console.log('='.repeat(72));

  const CZ = profile.master.boreCenter.z;
  const glb = path.resolve('rings', profile.id, 'models', profile.models.shank);
  if (!fs.existsSync(glb)) {
    console.log(`  FAIL  missing ${path.relative(process.cwd(), glb)}`);
    failures++;
    continue;
  }

  const doc = await io.read(glb);
  const parts = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const name = node.getName();
    if (profile.skipParts?.includes(name)) continue;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const n = pos.getCount();
      const base = new Float32Array(n * 3);
      const el = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, el);
        base[i*3] = el[0]; base[i*3+1] = el[1]; base[i*3+2] = el[2];
      }
      parts.push({
        name,
        isStone: name.startsWith('Diamond_'),
        base,
        out: new Float32Array(base.length),
        centroid: centroidXZ(base),
      });
    }
  }

  const stones = parts.filter((p) => p.isStone).length;
  const verts = parts.reduce((s, p) => s + p.base.length / 3, 0);
  console.log(`  ${parts.length} parts, ${stones} stones, ${verts} vertices\n`);

  let fail = 0;
  const check = (label, ok, detail) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail}`);
    if (!ok) { fail++; failures++; }
  };

  const applyAll = (delta, ws = 1) => {
    for (const p of parts) {
      if (p.isStone) deformStoneRigid(p.base, p.out, p.centroid, delta, CZ);
      else deformMetal(p.base, p.out, delta, ws, CZ);
    }
  };

  /** Largest cylinder that passes through the ring — what a mandrel measures. */
  const mandrel = () => {
    let minR = Infinity;
    for (const p of parts) {
      if (p.isStone) continue;
      for (let i = 0; i < p.out.length; i += 3) {
        const x = p.out[i], z = p.out[i+2];
        const dz = z - CZ;
        const a = Math.atan2(dz, x) * 180 / Math.PI;
        if (a > 60 && a < 120) continue;      // open head region
        const r = Math.hypot(x, dz);
        if (r < minR) minR = r;
      }
    }
    return minR;
  };

  const section = (s, ws = 1) => {
    applyAll(radialDelta(s, profile), ws);
    let lo = Infinity, hi = -Infinity, yl = Infinity, yh = -Infinity;
    for (const p of parts) {
      if (p.isStone) continue;
      for (let i = 0; i < p.out.length; i += 3) {
        const x = p.out[i], y = p.out[i+1], z = p.out[i+2];
        if (Math.abs(x) > 0.6 || z - CZ > 0) continue;
        const r = Math.hypot(x, z - CZ);
        lo = Math.min(lo, r); hi = Math.max(hi, r);
        yl = Math.min(yl, y); yh = Math.max(yh, y);
      }
    }
    return { t: hi - lo, w: yh - yl };
  };

  // --- sizing accuracy -----------------------------------------------------
  let worst = 0;
  for (let s = RING_SIZE.MIN; s <= RING_SIZE.MAX; s++) {
    applyAll(radialDelta(s, profile));
    const err = mandrel() - RING_SIZE.innerRadiusMM(s);
    if (Math.abs(err) > Math.abs(worst)) worst = err;
  }
  check('sizing accurate across US 3..13',
    Math.abs(worst * 2 / RING_SIZE.MM_PER_SIZE) < 0.05,
    `worst ${worst.toFixed(4)} mm = ${(worst * 2 / RING_SIZE.MM_PER_SIZE).toFixed(3)} US sizes`);

  // --- cross-section preserved --------------------------------------------
  const a = section(3), b = section(7), c = section(13);
  check('thickness constant with size', Math.abs(a.t - c.t) < 0.01,
    `${a.t.toFixed(4)} / ${b.t.toFixed(4)} / ${c.t.toFixed(4)} mm`);
  check('width constant with size', Math.abs(a.w - c.w) < 0.01,
    `${a.w.toFixed(4)} / ${b.w.toFixed(4)} / ${c.w.toFixed(4)} mm`);

  // --- no shear ------------------------------------------------------------
  applyAll(radialDelta(RING_SIZE.MAX, profile));
  const bins = new Map();
  for (const p of parts) {
    if (p.isStone) continue;
    for (let i = 0; i < p.base.length; i += 3) {
      const x = p.base[i], z = p.base[i+2];
      const d = Math.hypot(p.out[i] - x, p.out[i+2] - z);
      const k = Math.round(Math.atan2(z - CZ, x) * 180 / Math.PI / 5) * 5;
      if (!bins.has(k)) bins.set(k, { mn: Infinity, mx: -Infinity });
      const v = bins.get(k);
      v.mn = Math.min(v.mn, d); v.mx = Math.max(v.mx, d);
    }
  }
  let shear = 0;
  for (const v of bins.values()) shear = Math.max(shear, v.mx - v.mn);
  check('no tearing', shear < 0.01, `worst intra-bin spread ${shear.toFixed(5)} mm`);

  // --- width control -------------------------------------------------------
  const master = profile.master.shankWidthMM;
  /**
   * Width of the sampled arc at master scale. The band tapers, so this is not
   * necessarily equal to `master`; ratios are compared against it.
   */
  const sectionMasterWidth = section(profile.master.ringSize, 1).w;
  let wWorst = 0;
  for (let mm = SHANK_WIDTH.MIN; mm <= SHANK_WIDTH.MAX; mm += 0.5) {
    /**
     * Reuse section() so the sample arc and the ring size are identical to the
     * baseline. An earlier version called applyAll(0, ...) here while the
     * baseline used the real radial delta — different geometry, so the check
     * reported 0.05-0.12 mm of drift on bands that track perfectly.
     *
     * Compared as a RATIO because a tapered band's sampled arc is not exactly
     * master width.
     */
    const got = section(profile.master.ringSize, SHANK_WIDTH.scale(mm, master)).w;
    const err = (got / sectionMasterWidth - SHANK_WIDTH.scale(mm, master)) * master;
    if (Math.abs(err) > Math.abs(wWorst)) wWorst = err;
  }
  check('width tracks the slider', Math.abs(wWorst) < 0.02,
    `worst ${wWorst.toFixed(4)} mm across ${SHANK_WIDTH.MIN}..${SHANK_WIDTH.MAX} mm`);

  // --- the two axes are independent ---------------------------------------
  applyAll(radialDelta(7, profile), SHANK_WIDTH.scale(10, master));
  const boreWide = mandrel();
  applyAll(radialDelta(7, profile), SHANK_WIDTH.scale(1, master));
  const boreNarrow = mandrel();
  check('width does not move the bore', Math.abs(boreWide - boreNarrow) < 1e-4,
    `${boreWide.toFixed(4)} at 10 mm vs ${boreNarrow.toFixed(4)} at 1 mm`);

  const w3 = section(3, SHANK_WIDTH.scale(6, master)).w;
  const w13 = section(13, SHANK_WIDTH.scale(6, master)).w;
  /**
   * 0.005 mm rather than exact: the sample is a fixed ANGULAR arc, and resizing
   * slides a tapered band through it, so slightly different cross-sections get
   * measured at the extremes. Observed 0.0016 mm on the oval (0.06% of a
   * 2.5 mm band). Width genuinely leaking from the size control would be
   * proportional — tenths of a millimetre.
   */
  check('ring size does not change width', Math.abs(w3 - w13) < 0.005,
    `${w3.toFixed(4)} at US3 vs ${w13.toFixed(4)} at US13`);

  // --- stones --------------------------------------------------------------
  applyAll(radialDelta(RING_SIZE.MAX, profile), SHANK_WIDTH.scale(10, master));
  const bbox = (buf) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < buf.length; i += 3)
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], buf[i+k]); mx[k] = Math.max(mx[k], buf[i+k]);
      }
    return mx.map((v, k) => v - mn[k]);
  };
  /**
   * Accents split into SHOULDER pavé and GALLERY decoration.
   *
   * Shoulder stones sit on the ring axis (Y centre 0) and are the ones the
   * profile's `accents` block describes. A gallery — the oval ring has one —
   * rings the head instead, so those stones are legitimately OFF-axis and
   * come in several diameters. Lumping them together made three checks fail on
   * geometry that is perfectly correct.
   */
  const galleryCount = profile.galleryAccents?.count ?? 0;
  const shoulderMM = profile.accents?.mm;

  let drift = 0, offY = 0, girdle = 0, shoulderStones = 0;
  for (const p of parts) {
    if (!p.isStone) continue;
    const before = bbox(p.base), after = bbox(p.out);
    // Size preservation applies to EVERY stone, gallery included.
    drift = Math.max(drift, ...after.map((v, k) => Math.abs(v - before[k])));

    // Classify by diameter: a stone matching the profile's accent size is
    // shoulder pavé; anything else is gallery.
    const isShoulder =
      shoulderMM === undefined ||
      Math.abs(Math.max(before[0], before[1], before[2]) - shoulderMM) < 0.05;
    if (!isShoulder) continue;

    shoulderStones++;
    girdle = Math.max(girdle, before[1]);
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < p.out.length; i += 3) {
      lo = Math.min(lo, p.out[i]); hi = Math.max(hi, p.out[i]);
    }
    offY = Math.max(offY, Math.abs((lo + hi) / 2));
  }
  check('stones never resize', drift < 1e-4, `max drift ${drift.toExponential(2)} mm`);
  /**
   * Tolerance is 0.08 mm, not zero: on a ring whose pavé follows a curved
   * shoulder the stones are individually TILTED to sit flush, so their
   * bounding-box centres land up to ~0.05 mm off the ring axis by design. The
   * check is here to catch the deformer dragging stones sideways, which would
   * show up as millimetres, not hundredths.
   */
  check('shoulder stones stay centred', offY < 0.08,
    `max |Y centre| ${offY.toExponential(2)} mm`);

  if (profile.accents) {
    check('shoulder accent count matches profile',
      shoulderStones === profile.accents.count,
      `${shoulderStones} of ${stones} total, profile says ${profile.accents.count}` +
      (galleryCount ? ` (+${galleryCount} gallery)` : ''));
    check('accent size matches profile',
      Math.abs(girdle - profile.accents.mm) < 0.01,
      `${girdle.toFixed(4)} mm vs ${profile.accents.mm} mm`);
  }

  console.log(fail === 0 ? '\n  All checks passed.' : `\n  ${fail} CHECK(S) FAILED.`);
}

console.log();
process.exit(failures === 0 ? 0 : 1);
