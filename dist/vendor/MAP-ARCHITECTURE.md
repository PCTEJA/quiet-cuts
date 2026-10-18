# Quiet Cuts map renderer

The renderer is **CanvasKit 0.40.0 (Skia compiled to WebAssembly)**. Skia executes geometry and drawing operations in WASM; `MakeCanvasSurface` uses WebGL acceleration when available, with CanvasKit's software surface fallback. This is not a JavaScript map relabeled as WASM. All runtime assets are served from this site.

## Viewport loading and memory

- Census cartographic geometry is converted **offline** with us-atlas 3.0.1, topojson-client 3.1.0, and geojson-vt 4.0.2. The browser never downloads the complete geometry file.
- 537 clipped, simplified JSON tiles occupy about 3.81 MB in total. The largest tile is 218 KB uncompressed. Tile zoom levels are 2–7; counties appear only at zoom level 5 and above. State geometry includes Alaska, Hawaii and Puerto Rico; the default view fits the contiguous US study context.
- Only current viewport/current zoom tiles are requested or rendered, with at most four requests in flight. Requests that leave the viewport are aborted. No whole-country county layer is loaded on zoom.
- The LRU keeps at most 32 tiles. An 8 MiB serialized UTF-16 tile estimate additionally bounds cached source size. JSON is discarded after building Skia paths; `tileBytes` is an input-size estimate, not a measurement of actual process memory. Skia paths are explicitly deleted upon eviction. WebAssembly allocations, renderer resources, and browser overhead are separate.
- Rendering is triggered by changes only. There is no idle animation loop. DPR is capped at 2; the backing surface is capped at four million pixels. Paints, paths, surfaces, observers, pending frames, fetches, and listeners are disposed on `destroy()`.
- The bundled CanvasKit runtime initializes a **128 MiB WASM linear-memory heap**, measured in the runtime smoke test. This is a fixed engine cost before tile/cache and browser/GPU costs. Bounded geometry reduces additional allocation but does not promise a browser can never run out of memory. `wasmBytes` reports actual WASM heap capacity.
- Extremely large viewports draw the 32 nearest visible tiles to retain the strict bound. A failed WASM load reports an error so the application can keep its accessible record explorer available.

## API

```js
import { createMap } from './map.js';
const map = await createMap(canvas, { onSelect(id) {}, onStats(stats) {}, onError(message) {} });
map.setEvents([{ id, state, company, workers, lat, lon }]);
map.fit('CA'); // US, CA, WA, NY
map.zoomBy(0.5);
map.select(id);
map.setMode('regions'); // events or regions
map.destroy();
```

`onStats` provides `engine`, `zoom`, `visibleTiles`, `renderedTiles`, `cachedTiles`, `cacheLimit`, `tileBytes`, `activeRequests`, `requests`, `countyDetail`, and `wasmBytes`.

Mouse wheel zoom is anchored to the pointer. Pointer drag pans. Keyboard arrows pan, +/- zoom, and Home resets. Event markers can be selected by pointer; the consuming app supplies the equivalent accessible record list. Map point coordinates are supplied by the application and should be labeled according to their precision.

## Rebuilding

From the project root, run `npm install --prefix tools-map` and `node scripts/build-tiles.mjs`. `tools-map/package-lock.json` pins build dependencies. Only `dist` is deployed. `node --check dist/map.js` validates module syntax. The Skia smoke test uses the real WASM runtime, a software surface, a path and paint, and PNG encoding.

## Sources and attribution

- CanvasKit official documentation: https://skia.org/docs/user/modules/canvaskit/
- CanvasKit usage and explicit disposal: https://skia.org/docs/user/modules/quickstart/
- CanvasKit 0.40.0: https://www.npmjs.com/package/canvaskit-wasm/v/0.40.0 — BSD-3-Clause; see `CanvasKit-LICENSE.txt`.
- US Atlas source and Census boundary provenance: https://github.com/topojson/us-atlas — ISC; see `US-Atlas-LICENSE.txt`.
- Census cartographic boundary information: https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html
- geojson-vt: https://github.com/mapbox/geojson-vt — ISC; build-time only.
- topojson-client: https://github.com/topojson/topojson-client — ISC; build-time only.

Boundaries are generalized cartographic context, not precise legal boundaries. In events mode, study-state highlighting shows scope. Regions mode shades CA, NY and WA by filtered sample worker totals, normalized against the maximum selected state; zero selected workers is distinct from outside-study states. County boundaries do not imply county measures. State samples have different windows, so the shade is not a labor-market risk or prevalence ranking.
