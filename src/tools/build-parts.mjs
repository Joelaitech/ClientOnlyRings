/**
 * OBJ -> Draco GLB for an interchangeable PART (a shank or a head).
 * ============================================================================
 *   node tools/build-parts.mjs <srcFolder> <outFolder> <name>=<file> [...]
 *
 * e.g.
 *   node tools/build-parts.mjs \
 *     "C:/.../ring-cad-masters/pear" rings/lr64530/models \
 *     shank-7wide=shank.obj head-pear=head.obj
 *
 * Unlike tools/build-models.mjs this does not assume one ring = one shank +
 * one head. The catalogue now has a POOL of shanks and a POOL of heads that
 * combine freely, so parts are converted individually and named explicitly.
 *
 * WELD IS NOT OPTIONAL. OBJLoader de-indexes into flat triangle soup — on the
 * first ring 142k source vertices became 702k — and Draco cannot recover that
 * on its own. Welding restores the index buffer and accounts for most of the
 * size win before Draco even runs.
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

const [srcDir, outDir, ...pairs] = process.argv.slice(2);
if (!srcDir || !outDir || !pairs.length) {
  console.error('usage: node tools/build-parts.mjs <srcFolder> <outFolder> name=file.obj [...]');
  process.exit(1);
}
if (!fs.existsSync(srcDir)) {
  console.error(`No such source folder: ${srcDir}`);
  process.exit(1);
}

/**
 * GLTFExporter is browser code and reaches for FileReader while serialising.
 * Node has Blob but not FileReader, so shim one that actually resolves — the
 * exporter listens on `onloadend`, and the usual no-op shim leaves the export
 * promise pending forever.
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
  const bin = Buffer.alloc(raw.reduce((s, b) => s + pad4(b.length), 0));
  let cursor = 0;
  const bases = raw.map((b) => {
    const at = cursor; b.copy(bin, cursor); cursor += pad4(b.length); return at;
  });
  for (const bv of gltf.bufferViews ?? []) {
    bv.byteOffset = (bv.byteOffset ?? 0) + bases[bv.buffer];
    bv.buffer = 0;
  }
  gltf.buffers = [{ byteLength: bin.length }];

  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jp = Buffer.alloc(pad4(json.length) - json.length, 0x20);
  const bp = Buffer.alloc(pad4(bin.length) - bin.length, 0);
  const h = Buffer.alloc(12);
  h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4);
  h.writeUInt32LE(12 + 8 + json.length + jp.length + 8 + bin.length + bp.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(json.length + jp.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length + bp.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, jh, json, jp, bh, bin, bp]);
}

const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
const kb = (b) => (b / 1024).toFixed(1) + ' KB';

// Resolve the CLI out of node_modules/.bin: npm only puts it on PATH for
// `npm run` scripts, and a bare name fails with an opaque spawn error here.
const gt = path.resolve(
  'node_modules/.bin',
  process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform'
);
if (!fs.existsSync(gt)) {
  console.error(`gltf-transform not found at ${gt} — run npm install.`);
  process.exit(1);
}
const run = (args) =>
  execFileSync(gt, args, { stdio: 'pipe', shell: process.platform === 'win32' });

const loader = new OBJLoader();
const exporter = new GLTFExporter();
fs.mkdirSync(outDir, { recursive: true });

console.log(`\n${srcDir}  ->  ${outDir}\n`);

for (const pair of pairs) {
  const eq = pair.indexOf('=');
  if (eq < 0) { console.error(`bad pair "${pair}" (want name=file.obj)`); process.exit(1); }
  const name = pair.slice(0, eq);
  const file = pair.slice(eq + 1);
  const srcPath = path.join(srcDir, file);
  if (!fs.existsSync(srcPath)) { console.error(`missing ${srcPath}`); process.exit(1); }

  const group = loader.parse(fs.readFileSync(srcPath, 'utf8'));

  let meshes = 0, verts = 0, stones = 0;
  const names = [];
  group.traverse((c) => {
    if (!c.isMesh) return;
    meshes++;
    verts += c.geometry.attributes.position.count;
    names.push(c.name);
    if ((c.name || '').startsWith('Diamond_')) stones++;
    if (c.geometry.attributes.uv) c.geometry.deleteAttribute('uv');
  });

  const json = await new Promise((res, rej) =>
    exporter.parse(group, res, rej,
      { binary: false, onlyVisible: false, truncateDrawRange: false }));

  const outFile = path.join(outDir, `${name}.glb`);
  fs.writeFileSync(outFile, packGLB(json));
  const rawSize = fs.statSync(outFile).size;

  run(['weld', outFile, outFile]);
  const weldSize = fs.statSync(outFile).size;
  run(['draco', outFile, outFile, '--quantize-position', '16', '--quantize-normal', '12']);
  const finalSize = fs.statSync(outFile).size;

  const srcSize = fs.statSync(srcPath).size;
  console.log(`  ${name}`);
  console.log(`     from ${file}: ${meshes} meshes, ${verts} verts, ${stones} Diamond_* groups`);
  console.log(`     ${mb(srcSize)} -> ${mb(rawSize)} raw -> ${mb(weldSize)} welded -> ${kb(finalSize)} draco`);
}
console.log();
