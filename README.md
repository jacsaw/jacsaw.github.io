# SNAP Eligibility Timeline + Map

A scrollytelling visualization showing SNAP (food assistance) eligibility
changes by state under the One Big Beautiful Bill Act of 2025, from
enactment in July 2025 through projected implementation in October 2028.

## Files

- `index.html` — page structure; loads CSS, D3, and the app script
- `styles.css` — all styling (timeline, event cards, map, legend, tooltip, responsive layout, dark mode)
- `script.js` — fetches `data.json`, builds the timeline, renders the D3 map, and wires up scroll-driven highlighting
- `data.json` — all source data: state abbreviation lookup, legend definitions, and the full timeline of policy events with sources
- `README.md` — this file

## Dependencies (loaded via CDN, no install needed)

- [D3.js v7.8.5](https://d3js.org/) — map projection and rendering
- [TopoJSON v3.0.2](https://github.com/topojson/topojson) — converts US Atlas topology to GeoJSON
- [us-atlas](https://github.com/topojson/us-atlas) (`states-10m.json`) — US state boundary data
- [Geist font](https://vercel.com/font) — loaded from Google Fonts via `@import` in `styles.css`

## Running locally

Because `script.js` fetches `data.json` via `fetch()`, opening `index.html`
directly with `file://` will fail in most browsers due to CORS restrictions
on local file fetches. Serve the folder with any static server, for example:

```bash
cd snap-timeline-map
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Editing the data

All content lives in `data.json`. Each entry in the `timeline` array has
this shape:

```json
{
  "monthId": "2025-07",
  "monthLabel": "July 4, 2025 — One Big Beautiful Bill signed",
  "updates": [
    {
      "id": "unique-id-for-this-update",
      "category": "Short category label",
      "direction": "restrict | expand | neutral",
      "statesAffected": ["AL", "AK", "..."],
      "description": "Full plain-language description of the change.",
      "source": {
        "label": "Human-readable source name",
        "url": "https://..."
      }
    }
  ]
}
```

To add a new policy update, add a new object to an existing month's
`updates` array, or add a new month object to the `timeline` array.
The timeline and map will pick up the change automatically; no code edits
are needed for new data.

`direction` controls both the badge color on the event card and the
state's fill color on the map:

- `restrict` → red/orange (`#D85A30`)
- `expand` → green (`#1D9E75`)
- `neutral` → blue (`#378ADD`), used for litigation or informational events
- a state appearing in two updates with different directions in the same
  month is automatically colored purple (`#7F77DD`) to indicate mixed status

## Notes on sourcing

Events through November 2025 are sourced from primary USDA Food and
Nutrition Service implementation memos and federal court filings. Events
dated 2026 and later are projections based on the statutory text of the
One Big Beautiful Bill Act and secondary policy analysis (NACo, Ballotpedia,
CBPP); these dates may shift as USDA issues further guidance and should be
verified against FNS's official OBBB implementation page
(https://www.fns.usda.gov/obbb) before being treated as final.
