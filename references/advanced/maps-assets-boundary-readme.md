# Demo Map Assets

`aster-isles-base.png` and `mist-coast-base.png` were generated specifically for this public template. Both countries, coastlines, terrain, cities, and travel details are fictional; the images contain no private route data and do not represent accurate real-world geography.

The assets follow the visual principles in `../../references/golden-map-spec.md`: warm paper, restrained topographic linework, muted borders, pale water, and clear space for SVG labels and routes. Route paths, points, labels, legends, and interaction are added separately by the renderer from `travel-data.json > routeMap.regions[]`.

For a real destination, do not redraw or overwrite these Demo files. Supply an accurate, authorized country-boundary GeoJSON to `scripts/generate-map-package.mjs`, and always pass its required `--source` and `--license` metadata; it generates a separate `1448×1086` Golden-style base SVG plus projected route/layout data from canonical Places.

A reusable country-base cache may contain only boundary/style output and source/license metadata. Never place a user's locations, route, dates, addresses, queries, or source-document information in a shared cache.
