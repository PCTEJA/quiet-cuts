// Offline only: browsers request individual visible tiles, never this source geometry.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'tools-map', 'package.json'));
const { feature } = require('topojson-client');
const { default: geojsonvt } = await import(pathToFileURL(path.join(root, 'tools-map/node_modules/geojson-vt/src/index.js')));
const atlas = JSON.parse(await fs.readFile(require.resolve('us-atlas/counties-10m.json'), 'utf8'));
const stateData = feature(atlas, atlas.objects.states);
const countyData = feature(atlas, atlas.objects.counties);
for (const f of [...stateData.features, ...countyData.features]) f.properties = { id: String(f.id), name: f.properties.name };
const states = geojsonvt(stateData, { extent: 4096, maxZoom: 7, indexMaxZoom: 5, tolerance: 2, buffer: 64 });
const counties = geojsonvt(countyData, { extent: 4096, maxZoom: 7, indexMaxZoom: 5, tolerance: 3, buffer: 64 });
const out = path.join(root, 'dist/tiles');
await fs.mkdir(out, { recursive: true });
let tiles = 0, bytes = 0, maxBytes = 0;
const keys = [];
const simplify = t => (t?.features || []).map(f => ({ id: f.tags.id, g: f.geometry }));
async function write(z, x, y) {
  const s = states.getTile(z, x, y);
  if (!s || !s.features.length) return;
  if (z >= 2) {
    const data = JSON.stringify({ s: simplify(s), c: z >= 5 ? simplify(counties.getTile(z, x, y)) : [] });
    await fs.mkdir(path.join(out, String(z), String(x)), { recursive: true });
    await fs.writeFile(path.join(out, String(z), String(x), `${y}.json`), data);
    bytes += Buffer.byteLength(data); maxBytes = Math.max(maxBytes, Buffer.byteLength(data)); tiles++; keys.push(`${z}/${x}/${y}`);
  }
  if (z < 7) for (const [dx, dy] of [[0,0],[1,0],[0,1],[1,1]]) await write(z+1,x*2+dx,y*2+dy);
}
await write(0,0,0);
const vendor = path.join(root, 'dist/vendor');
await fs.mkdir(vendor, { recursive: true });
for (const name of ['canvaskit.js','canvaskit.wasm']) await fs.copyFile(require.resolve(`canvaskit-wasm/bin/${name}`), path.join(vendor, name));
await fs.copyFile(path.join(root, 'tools-map/node_modules/canvaskit-wasm/LICENSE'), path.join(vendor, 'CanvasKit-LICENSE.txt'));
await fs.copyFile(require.resolve('us-atlas/LICENSE'), path.join(vendor, 'US-Atlas-LICENSE.txt'));
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({ minZoom: 2, maxZoom: 7, extent: 4096, tiles, bytes, maxTileBytes: maxBytes, geometry: 'US Census cartographic boundaries via us-atlas 3.0.1 (10m)', source: 'https://github.com/topojson/us-atlas', keys }, null, 2));
console.log(JSON.stringify({ tiles, bytes, maxTileBytes: maxBytes }));
