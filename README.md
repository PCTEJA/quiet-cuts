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

`python scripts/data_build.py` recreates the original dataset from preserved agency/Census snapshots. For current data, use `python scripts/refresh_data.py`: it downloads into a temporary staging directory, validates all three sources, then updates source and deployable JSON together. Failed collection leaves the prior snapshot intact. Census geometry is pinned to the preserved 2026 files.

The map's separate development dependencies live in `tools-map/`. See its manifest and `scripts/build-tiles.mjs` to rebuild static tiles from US Atlas. Browser delivery requires no Node package installation. WASM and all map tiles are local assets; the Google Fonts stylesheet is optional and system fonts provide a fallback.

## Memory

Viewport-only tiles, at most 32 cached tiles / 8 MiB estimated serialized geometry, four concurrent requests, offscreen request cancellation, capped render surfaces, and explicit Skia object disposal constrain map allocations. CanvasKit initializes an approximately 128 MiB WASM heap; browser/GPU/JS allocations are additional. The geometry counter is not total memory and this is not a guarantee against crashes on all devices.

## Validation

Automated checks cover missing evidence, QCI denominator exclusions, negative and boundary delays, independent receipt baselines, prospective interval ranges, regional sensitivity, fictional-data separation, import validation, and official source totals. UI review covers map rendering, zoomed county detail, filters, evidence drawers, and synthetic study charts.

## Hourly collection and Netlify deployment

GitHub Actions (`.github/workflows/refresh.yml`) checks the three official sources at minute 17 of every hour, on pushes to `main`, and on manual dispatch. Schedules may be delayed or skipped by GitHub; this is not a guaranteed exact hourly service. The workflow tests source completeness, schema, counts, dates, coordinates, and evidence boundaries. A state losing over 30% of its records fails for review (including legitimate fiscal rollovers). Failed downloads or tests prevent publication.

Validated changes are committed to Git for source history. The workflow deploys `dist/` directly through Netlify's API using repository secrets `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`. No Netlify Git build hook is required. Only changed assets trigger deployment; an unchanged hourly check does not consume another production deployment. A failed deployment is retried on the next run because published and local asset hashes are compared. Deployments remain subject to account quotas.

The dashboard displays the retrieval date of its published snapshot. Unchanged checks retain that date; each check's precise timestamp and outcome are in GitHub Actions logs. News searching is not automated, no original posting time is claimed, and coverage remains CA current fiscal report / NY default export / WA first page. The initial counts above document the October 17 sample and may differ after updates.

Run `npm test` and `python -m unittest discover -s tests -p 'test_*.py'` for validation. Imports persist only for the current browser session. The repository is private; operator run history requires repository access.
