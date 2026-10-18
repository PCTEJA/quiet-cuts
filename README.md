# Quiet Cuts

An evidence-first WARN and news-visibility dashboard based on the Quiet Cuts project proposal. Run `npm start`, then open http://127.0.0.1:4173. Run `npm test` for calculation and data-integrity checks. The application is buildless: `dist/` contains all deployable assets.

## Included

- 591 official source/site records, 32,680 reported affected workers, from CA EDD, NY DOL, and WA ESD. These are not a deduplicated event cohort. See `data/README.md` for sampling windows and source semantics.
- Actual WebAssembly map rendering through self-hosted Skia CanvasKit. Only active viewport tiles load; zoom reveals county detail. Geometry is never downloaded as a nationwide full-resolution payload. See `dist/vendor/MAP-ARCHITECTURE.md` for cache bounds, cleanup, sources, and limitations.
- Overview with geographic points, state totals, monthly bars/line, industry bars, and linked source records.
- Posting/receipt/first-seen baseline selection, latency scatterplot, industry distributions, QCI30 (or separately labeled receipt no-match rate), search audit bars, and repeat-employer timelines.
- Company/state/industry/date filters, employer sorting/pagination, evidence drawer, CSV/JSON exports, and schema-validated session-only JSON import.
- A completely separate fictional 72-event study demonstrates the research views. No fictional coverage is attached to real employers.

## Evidence boundaries

Official news matches have not yet been independently reviewed. Real QCI and latency panels therefore remain unavailable instead of inventing findings. Public posting is never inferred from receipt/processed dates; NY listed postings remain unverified-original dates. State sample windows differ and cannot establish state prevalence rankings. Coordinates are Census geographic internal points, not workplace addresses. Two multi-city records remain in tables but are not plotted.

The proposal's nationwide trend/heatmap, salary comparison, and AI/non-AI illustrations are design references, not source data. Nationwide boundary context is present, but outside-study states show no metrics; salary and AI causation stay explicitly unavailable. Adding those claims requires additional source-backed datasets and review.

## Reproduce data and tiles

`python scripts/data_build.py` recreates the original dataset from preserved agency/Census snapshots. Current collection runs in the separate `quiet-cuts-data` repository and publishes to Supabase. The old local refresh script is retained for baseline reproduction only. Census geometry is pinned to the preserved 2026 files.

The map's separate development dependencies live in `tools-map/`. See its manifest and `scripts/build-tiles.mjs` to rebuild static tiles from US Atlas. Browser delivery requires no Node package installation. WASM and all map tiles are local assets; the Google Fonts stylesheet is optional and system fonts provide a fallback.

## Memory

Viewport-only tiles, at most 32 cached tiles / 8 MiB estimated serialized geometry, four concurrent requests, offscreen request cancellation, capped render surfaces, and explicit Skia object disposal constrain map allocations. CanvasKit initializes an approximately 128 MiB WASM heap; browser/GPU/JS allocations are additional. The geometry counter is not total memory and this is not a guarantee against crashes on all devices.

## Validation

Automated checks cover missing evidence, QCI denominator exclusions, negative and boundary delays, independent receipt baselines, prospective interval ranges, regional sensitivity, fictional-data separation, import validation, and official source totals. UI review covers map rendering, zoomed county detail, filters, evidence drawers, and synthetic study charts.

## Independent data API and monthly history

Hourly collection now runs in the private [quiet-cuts-data repository](https://github.com/PCTEJA/quiet-cuts-data). It validates agency sources and stores changed snapshots plus successful check observations in the dedicated free-tier Supabase project. Data updates do not trigger website deployments.

The website reads the API through `dist/data-client.js` on startup and every five minutes. The Source Snapshot selector opens the last captured observation in an available UTC month. Missing months remain unavailable. Failed polling retains displayed data; startup outages use a clearly labeled bundled baseline.

History begins with the evidenced October 17, 2026 capture (Chicago time). Older record dates in that snapshot are not verified historical monthly captures or complete monthly totals. The collector preserves old versions even when agencies remove or correct rows. Source coverage remains CA current fiscal report, NY default export, and WA first page. See the data repository README for API endpoints, schema, provenance, and recovery instructions.

The website workflow `.github/workflows/deploy.yml` runs only for website code/configuration changes or manual dispatch. It tests and publishes `dist/` using the existing Netlify secrets. There is no hourly schedule or collection step in this repository. The bundled `data/` and `dist/data/` files are a fallback/reproduction baseline; the database is authoritative for live data.

Run `npm test` for website and data-client checks. The collector repository owns collection validation and source backups. Both repositories are private; viewing Actions logs requires repository access.
