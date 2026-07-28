import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const RINGS_DIR = path.resolve('rings');

/** The three files DRACOLoader fetches from its decoder path. */
const DRACO_FILES = [
  'draco_decoder.js',
  'draco_decoder.wasm',
  'draco_wasm_wrapper.js',
];
const DRACO_SRC = path.resolve(
  'node_modules/three/examples/jsm/libs/draco'
);

/**
 * Serve the Draco decoder straight out of node_modules.
 *
 * These files used to be hand-copied into public/draco/, which meant 1.06 MB
 * of vendored binary in the repo that would silently go stale the moment
 * `three` was upgraded — a decoder/loader version mismatch shows up as a
 * corrupt-mesh error, not a clear one. Reading them from the installed
 * package keeps them in lockstep with the three version in package.json.
 */
function dracoAssets() {
  return {
    name: 'draco-assets',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/draco\/([^/?#]+)/.exec(req.url ?? '');
        if (!m || !DRACO_FILES.includes(m[1])) return next();
        const file = path.join(DRACO_SRC, m[1]);
        if (!fs.existsSync(file)) return next();
        res.setHeader(
          'Content-Type',
          m[1].endsWith('.wasm') ? 'application/wasm' : 'text/javascript'
        );
        fs.createReadStream(file).pipe(res);
      });
    },

    generateBundle() {
      for (const f of DRACO_FILES) {
        const file = path.join(DRACO_SRC, f);
        if (!fs.existsSync(file)) {
          this.error(
            `Draco decoder missing: ${file}\n` +
            `Expected it in the installed three package. Run npm install.`
          );
        }
        this.emitFile({
          type: 'asset',
          fileName: `draco/${f}`,
          source: fs.readFileSync(file),
        });
      }
    },
  };
}

/**
 * Serve each ring's GLBs from /rings/<id>/<file>.
 *
 * The models deliberately live in rings/<id>/models/ next to the profile and
 * the source OBJs, so everything about one ring is in one folder. This plugin
 * maps them onto a public URL in dev, and copies them into dist on build, so
 * adding a ring never means touching public/.
 */
function ringAssets() {
  const listRings = () =>
    fs.existsSync(RINGS_DIR)
      ? fs.readdirSync(RINGS_DIR, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [];

  return {
    name: 'ring-assets',

    // DEV ONLY. `vite preview` deliberately does NOT get this middleware:
    // preview must behave like a real static host so a build missing its
    // ring assets fails visibly here rather than in production.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/rings\/([^/]+)\/([^/?#]+\.glb)/.exec(req.url ?? '');
        if (!m) return next();
        const file = path.join(RINGS_DIR, m[1], 'models', m[2]);
        if (!fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
      });
    },

    generateBundle() {
      for (const id of listRings()) {
        const dir = path.join(RINGS_DIR, id, 'models');
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.glb')) continue;
          this.emitFile({
            type: 'asset',
            fileName: `rings/${id}/${f}`,
            source: fs.readFileSync(path.join(dir, f)),
          });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), ringAssets(), dracoAssets()],
  server: { port: 5173, open: true },
  build: { chunkSizeWarningLimit: 1500 },
});
