/**
 * OBJ -> Draco GLB, for one ring.
 * ============================================================================
 *   npm run models <ringId>
 *
 * Reads rings/<id>/source/*.obj, writes rings/<id>/models/*.glb.
 * On the first ring this took 35.5 MB of ASCII OBJ down to 581 KB.
 *
 * WELD IS NOT OPTIONAL. OBJLoader de-indexes into flat triangle soup — 142k
 * source vertices became 702k — and Draco cannot recover that on its own.
 * Welding restores the index buffer and accounts for most of the win
 * (16.9 MB -> 4.8 MB) before Draco even runs.
 *
 * Group names must survive: the material rule keys on Diamond_*. They land on
 * the glTF NODES, which is where GLTFLoader reads child.name from.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const id = process.argv[2];
if (!id) {
  console.error('usage: npm run models <ringId>');
  process.exit(1);
}

/**
 * Where the CAD masters live. Default is rings/<id>/source, but the OBJs are
 * ~35 MB each and are not needed to run or ship the app — only to re-convert
 * or re-measure. So they normally live outside the project entirely:
 *
 *   npm run models <id> -- --src "D:/cad-masters/<id>"
 *   RING_SRC=D:/cad-masters npm run models <id>
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
const OUT = path.resolve('rings', id, 'models');

if (!fs.existsSync(SRC)) {
  console.error(`No CAD source found at: ${SRC}`);
  console.error();
  console.error('The source OBJs are not kept in the project (they are large');
  console.error('and only needed for conversion). Point at them with either:');
  console.error(`  npm run models ${id} -- --src "<folder>"`);
  console.error(`  RING_SRC=<parent-folder> npm run models ${id}`);
  process.exit(1);
}

// The profile tells us which source file is the shank and which is the head.
const profilePath = path.resolve('rings', id, 'profile.js');
if (!fs.existsSync(profilePath)) {
  console.error(`No profile at ${profilePath}`);
  console.error(`Run \`npm run profile ${id}\` first, then write the profile.`);
  process.exit(1);
}
const profile = (await import('file://' + profilePath)).default;

/**
 * GLTFExporter is written for the browser and reaches for FileReader while
 * serialising. Node has Blob but not FileReader, so shim one that actually
 * resolves — note the exporter listens on `onloadend`, and the usual no-op
 * shim leaves the export promise pending forever.
 */
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReaderShim {
    constructor() { this.result = null; this.onload = null; this.onloadend = null; }
    #done() { this.onload?.({ target: this }); this.onloadend?.({ target: this }); }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((b) => { this.result = b; this.#done(); },
        (e) => this.onerror?.(e));
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((b) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,` +
          Buffer.from(b).toString('base64');
        this.#done();
      }, (e) => this.onerror?.(e));
    }
  };
}

const pad4 = (n) => (n + 3) & ~3;

/** Pack a glTF JSON doc (base64 data: buffers) into a binary GLB container. */
function packGLB(gltf) {
  const raw = (gltf.buffers ?? []).map((b) =>
    Buffer.from(b.uri.slice(b.uri.indexOf(',') + 1), 'base64'));
  const total = raw.reduce((s, b) => s + pad4(b.length), 0);
  const bin = Buffer.alloc(total);
  let cursor = 0;
  const bases = raw.map((b) => { const at = cursor; b.copy(bin, cursor); cursor += pad4(b.length); return at; });

  for (const bv of gltf.bufferViews ?? []) {
    bv.byteOffset = (bv.byteOffset ?? 0) + bases[bv.buffer];
    bv.buffer = 0;
  }
  gltf.buffers = [{ byteLength: bin.length }];

  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = Buffer.alloc(pad4(json.length) - json.length, 0x20);
  const binPad = Buffer.alloc(pad4(bin.length) - bin.length, 0);
  const jsonLen = json.length + jsonPad.length;
  const binLen = bin.length + binPad.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonLen + 8 + binLen, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonLen, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binLen, 0); bh.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jh, json, jsonPad, bh, bin, binPad]);
}

const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
const kb = (b) => (b / 1024).toFixed(1) + ' KB';

const loader = new OBJLoader();
const exporter = new GLTFExporter();
fs.mkdirSync(OUT, { recursive: true });

// Match each declared model to its source file. The profile names the output
// (shank.glb); we find the source by role using the same heuristic the
// profiler reports, but the mapping can be overridden per ring via
// profile.sourceFiles = { shank: '...', head: '...' }.
const objs = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.obj'));
const explicit = profile.sourceFiles ?? null;

function sourceFor(role) {
  if (explicit?.[role]) return explicit[role];
  // fall back: shank is the widest file, head the smallest non-fused one
  const sized = objs.map((f) => {
    const txt = fs.readFileSync(path.join(SRC, f), 'latin1');
    const n = (txt.match(/^v /gm) ?? []).length;
    return { f, n };
  }).sort((a, b) => a.n - b.n);
  if (role === 'head') return sized[0].f;
  // shank = the middle one when a fused file is present, else the largest
  return sized.length >= 3 ? sized[1].f : sized[sized.length - 1].f;
}

console.log(`\nBuilding models for rings/${id}\n`);

for (const role of Object.keys(profile.models)) {
  const srcFile = sourceFor(role);
  const outFile = path.join(OUT, profile.models[role]);

  const group = loader.parse(fs.readFileSync(path.join(SRC, srcFile), 'utf8'));

  let meshes = 0, verts = 0;
  const names = [];
  group.traverse((c) => {
    if (!c.isMesh) return;
    meshes++;
    verts += c.geometry.attributes.position.count;
    names.push(c.name);
    if (c.geometry.attributes.uv) c.geometry.deleteAttribute('uv');
  });

  const json = await new Promise((res, rej) =>
    exporter.parse(group, res, rej,
      { binary: false, onlyVisible: false, truncateDrawRange: false }));

  fs.writeFileSync(outFile, packGLB(json));
  const rawSize = fs.statSync(outFile).size;

  // weld -> restore the index buffer, then Draco -> compress
  const gt = process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform';
  const run = (args) => execFileSync(gt, args, { stdio: 'pipe' });
  run(['weld', outFile, outFile]);
  const weldSize = fs.statSync(outFile).size;
  run(['draco', outFile, outFile, '--quantize-position', '16', '--quantize-normal', '12']);
  const finalSize = fs.statSync(outFile).size;

  const srcSize = fs.statSync(path.join(SRC, srcFile)).size;
  console.log(`  ${role.padEnd(6)} ${srcFile}`);
  console.log(`         ${meshes} meshes, ${verts} verts (de-indexed)`);
  console.log(`         names: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` … +${names.length - 4}` : ''}`);
  console.log(`         ${mb(srcSize)} -> ${mb(rawSize)} raw -> ${mb(weldSize)} welded -> ${kb(finalSize)} draco`);
  console.log(`         -> ${path.relative(process.cwd(), outFile)}\n`);
}

console.log(`Now verify:  npm run verify ${id}\n`);
