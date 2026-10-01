#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CANVAS = { width: 1448, height: 1086 };
const DEFAULT_PADDING = 74;
const PALETTE = ["#397dc1", "#e77e22", "#618344", "#209aaa", "#8865a5", "#df6185"];
const STABLE_IDS = {
  day: /^day-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  item: /^item-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  place: /^place-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  transport: /^transport-[a-z0-9]+(?:-[a-z0-9]+)*$/
};

function usage() {
  return `Generate a deterministic map package from authorized GeoJSON and canonical trip data.

Usage:
  node scripts/generate-map-package.mjs \\
    --boundary <country.geojson> \\
    --data <canonical-travel-data.json> \\
    --country <ISO2> \\
    --out <region.json> \\
    --source <boundary source name or URL> \\
    --license <boundary license>

Options:
  --base-out <file>  Generated SVG path (default: <out-dir>/<country>-base.svg)
  --root <dir>       Root used for baseImage href (default: current directory)
  --label <text>     Region label (default: country code)
  --title <text>     Map title (default: <label> · 旅行路线)
  --padding <number> Projection padding in SVG units (default: 74)
  --json             Print result metadata as JSON
  --help             Show this help

The command never downloads boundary data. Supply a public or authorized Polygon/MultiPolygon
GeoJSON file and record its source and license explicitly.
`;
}

function parseArgs(argv) {
  const options = {
    boundary: null, data: null, country: null, out: null, source: null, license: null,
    baseOut: null, root: process.cwd(), label: null, title: null, padding: DEFAULT_PADDING, json: false
  };
  const args = [...argv];
  while (args.length) {
    const key = args.shift();
    if (key === "--json") options.json = true;
    else if (key === "--help") options.help = true;
    else if (["--boundary", "--data", "--country", "--out", "--source", "--license", "--base-out", "--root", "--label", "--title", "--padding"].includes(key)) {
      if (!args.length) throw new Error(`${key} requires a value`);
      const normalized = key === "--base-out" ? "baseOut" : key.slice(2);
      options[normalized] = args.shift();
    } else throw new Error(`Unknown option: ${key}`);
  }
  if (options.help) return options;
  for (const key of ["boundary", "data", "country", "out", "source", "license"]) {
    if (!options[key]) throw new Error(`--${key} is required`);
  }
  options.root = path.resolve(options.root);
  options.boundary = path.resolve(options.boundary);
  options.data = path.resolve(options.data);
  options.out = path.resolve(options.out);
  options.country = String(options.country).toUpperCase();
  if (!/^[A-Z]{2}$/.test(options.country)) throw new Error("--country must be an ISO alpha-2 code");
  options.padding = Number(options.padding);
  if (!Number.isFinite(options.padding) || options.padding < 0 || options.padding * 2 >= Math.min(CANVAS.width, CANVAS.height)) {
    throw new Error("--padding must be a non-negative number smaller than half the canvas");
  }
  options.baseOut = options.baseOut
    ? path.resolve(options.baseOut)
    : path.join(path.dirname(options.out), `${options.country.toLowerCase()}-base.svg`);
  return options;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`);
  }
}

function geometryList(geoJson) {
  if (geoJson?.type === "FeatureCollection") return geoJson.features.flatMap((feature) => geometryList(feature));
  if (geoJson?.type === "Feature") return geometryList(geoJson.geometry);
  if (geoJson?.type === "GeometryCollection") return geoJson.geometries.flatMap(geometryList);
  if (geoJson?.type === "Polygon") return [geoJson.coordinates];
  if (geoJson?.type === "MultiPolygon") return geoJson.coordinates;
  throw new Error("Boundary GeoJSON must contain Polygon or MultiPolygon geometry");
}

function validateRingCoordinate(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) throw new Error("Invalid GeoJSON coordinate");
  const lng = Number(coordinate[0]);
  const lat = Number(coordinate[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new Error(`Invalid longitude/latitude: ${coordinate.slice(0, 2).join(",")}`);
  }
  return { lng, lat };
}

function boundaryBounds(polygons) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  let pointCount = 0;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const coordinate of ring) {
        const point = validateRingCoordinate(coordinate);
        west = Math.min(west, point.lng);
        east = Math.max(east, point.lng);
        south = Math.min(south, point.lat);
        north = Math.max(north, point.lat);
        pointCount += 1;
      }
    }
  }
  if (!pointCount) throw new Error("Boundary contains no coordinates");
  if (east === west) { west -= 0.01; east += 0.01; }
  if (north === south) { south -= 0.01; north += 0.01; }
  return { west, south, east, north };
}

function pointOnSegment(point, first, second) {
  const cross = (point.lat - first.lat) * (second.lng - first.lng) - (point.lng - first.lng) * (second.lat - first.lat);
  if (Math.abs(cross) > 1e-9) return false;
  return point.lng >= Math.min(first.lng, second.lng) - 1e-9
    && point.lng <= Math.max(first.lng, second.lng) + 1e-9
    && point.lat >= Math.min(first.lat, second.lat) - 1e-9
    && point.lat <= Math.max(first.lat, second.lat) + 1e-9;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index++) {
    const current = validateRingCoordinate(ring[index]);
    const previous = validateRingCoordinate(ring[previousIndex]);
    if (pointOnSegment(point, previous, current)) return true;
    const intersects = (current.lat > point.lat) !== (previous.lat > point.lat)
      && point.lng < (previous.lng - current.lng) * (point.lat - current.lat) / (previous.lat - current.lat) + current.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygons(point, polygons) {
  return polygons.some((polygon) => {
    if (!polygon.length || !pointInRing(point, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(point, hole));
  });
}

function projector(bounds, padding) {
  const midLatitude = (bounds.north + bounds.south) / 2;
  const longitudeFactor = Math.max(0.05, Math.cos(midLatitude * Math.PI / 180));
  const projected = {
    west: bounds.west * longitudeFactor,
    east: bounds.east * longitudeFactor,
    north: -bounds.north,
    south: -bounds.south
  };
  const availableWidth = CANVAS.width - padding * 2;
  const availableHeight = CANVAS.height - padding * 2;
  const projectedWidth = projected.east - projected.west;
  const projectedHeight = projected.south - projected.north;
  const scale = Math.min(availableWidth / projectedWidth, availableHeight / projectedHeight);
  const renderedWidth = projectedWidth * scale;
  const renderedHeight = projectedHeight * scale;
  const offsetX = (CANVAS.width - renderedWidth) / 2;
  const offsetY = (CANVAS.height - renderedHeight) / 2;
  const project = ({ lng, lat }) => ({
    x: offsetX + (lng * longitudeFactor - projected.west) * scale,
    y: offsetY + (-lat - projected.north) * scale
  });
  project.metadata = {
    type: "equirectangular-fit",
    bounds: [bounds.west, bounds.south, bounds.east, bounds.north],
    padding,
    midLatitude: round(midLatitude),
    longitudeFactor: Number(longitudeFactor.toFixed(8)),
    scale: Number(scale.toFixed(8)),
    offset: { x: round(offsetX), y: round(offsetY) },
    projectedBounds: {
      west: Number(projected.west.toFixed(8)), east: Number(projected.east.toFixed(8)),
      north: Number(projected.north.toFixed(8)), south: Number(projected.south.toFixed(8))
    }
  };
  return project;
}

function round(value) {
  return Number(value.toFixed(2));
}

function svgPathForPolygon(polygon, project) {
  return polygon.map((ring) => ring.map((coordinate, index) => {
    const point = project(validateRingCoordinate(coordinate));
    return `${index ? "L" : "M"}${round(point.x)} ${round(point.y)}`;
  }).join(" ") + " Z").join(" ");
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"
  })[character]);
}

function makeBaseSvg(polygons, project, options, boundarySha256) {
  const paths = polygons.map((polygon) => svgPathForPolygon(polygon, project));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" role="img" aria-label="${escapeXml(options.label)} country base map">
  <title>${escapeXml(options.label)} · 标准化国家底图</title>
  <desc>Boundary source: ${escapeXml(options.source)}. License: ${escapeXml(options.license)}.</desc>
  <metadata>{"generator":"generate-map-package.mjs","boundarySha256":"${boundarySha256}","source":"${escapeXml(options.source)}","license":"${escapeXml(options.license)}"}</metadata>
  <defs>
    <clipPath id="land-clip">
      ${paths.map((pathData) => `<path d="${pathData}" fill-rule="evenodd"/>`).join("\n      ")}
    </clipPath>
    <filter id="paper-grain" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="4" seed="17" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.42 0 0 0 0 0.40 0 0 0 0 0.34 0 0 0 .10 0"/>
    </filter>
    <filter id="wash-soften" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="38"/>
    </filter>
    <pattern id="contour-lines" width="112" height="78" patternUnits="userSpaceOnUse">
      <path d="M-18 22 C14 3 49 4 78 20 S130 39 151 14" fill="none" stroke="#65715f" stroke-width="1" opacity=".17"/>
      <path d="M-25 54 C8 34 48 37 72 53 S120 73 146 48" fill="none" stroke="#65715f" stroke-width=".8" opacity=".12"/>
    </pattern>
  </defs>
  <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="#f7f3e9"/>
  <rect width="${CANVAS.width}" height="${CANVAS.height}" filter="url(#paper-grain)" opacity=".20"/>
  <g fill="#e2e6d5" fill-opacity=".62" fill-rule="evenodd">
    ${paths.map((pathData) => `<path d="${pathData}"/>`).join("\n    ")}
  </g>
  <g clip-path="url(#land-clip)" opacity=".50" filter="url(#wash-soften)">
    <ellipse cx="${round(CANVAS.width * .32)}" cy="${round(CANVAS.height * .36)}" rx="${round(CANVAS.width * .24)}" ry="${round(CANVAS.height * .19)}" fill="#b9c7aa"/>
    <ellipse cx="${round(CANVAS.width * .68)}" cy="${round(CANVAS.height * .67)}" rx="${round(CANVAS.width * .27)}" ry="${round(CANVAS.height * .22)}" fill="#d8c9a8" opacity=".54"/>
  </g>
  <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#contour-lines)" clip-path="url(#land-clip)"/>
  <g fill="none" stroke-linejoin="round" fill-rule="evenodd">
    ${paths.map((pathData) => `<path d="${pathData}" stroke="#858b70" stroke-opacity=".48" stroke-width="5"/>`).join("\n    ")}
    ${paths.map((pathData) => `<path d="${pathData}" stroke="#5e695a" stroke-opacity=".76" stroke-width="1.35"/>`).join("\n    ")}
  </g>
</svg>
`;
}

function requireCanonical(data) {
  if (!data || typeof data !== "object" || !data.entities || !Array.isArray(data.days)) {
    throw new Error("--data must use the canonical shape: { trip, entities, days }");
  }
  if (!data.entities.places || typeof data.entities.places !== "object" || Array.isArray(data.entities.places)) {
    throw new Error("Canonical data must include entities.places as an object keyed by place ID");
  }
}

function countryLabel(data, countryCode) {
  const value = data.trip?.countryNames?.[countryCode];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    for (const key of ["nameZh", "localizedName", "name"]) {
      if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
    }
  }
  return countryCode;
}

function checkId(id, kind, location) {
  if (!STABLE_IDS[kind].test(id || "")) throw new Error(`${location} must be a stable ${kind}- ID`);
}

function pushPlace(target, id) {
  if (id && target.at(-1) !== id) target.push(id);
}

function itemPlaceSequence(item, entities) {
  const result = [];
  pushPlace(result, item.placeId);
  (item.placeIds || []).forEach((id) => pushPlace(result, id));
  if (item.transportId) {
    const transport = entities.transport?.[item.transportId];
    if (!transport) throw new Error(`Unknown transport reference: ${item.transportId}`);
    pushPlace(result, transport.fromPlaceId);
    (transport.viaPlaceIds || []).forEach((id) => pushPlace(result, id));
    pushPlace(result, transport.toPlaceId);
  }
  if (item.flightId) {
    const flight = entities.flights?.[item.flightId];
    if (!flight) throw new Error(`Unknown flight reference: ${item.flightId}`);
    pushPlace(result, flight.departure?.placeId);
    pushPlace(result, flight.arrival?.placeId);
  }
  if (item.stayId) pushPlace(result, entities.stays?.[item.stayId]?.placeId);
  if (item.restaurantId) pushPlace(result, entities.restaurants?.[item.restaurantId]?.placeId);
  if (item.rentalId) {
    const rental = entities.rentals?.[item.rentalId];
    pushPlace(result, rental?.pickup?.placeId);
    pushPlace(result, rental?.dropoff?.placeId);
  }
  return result.filter(Boolean);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function viewportFor(placeIds, projectedPlaces) {
  const points = placeIds.map((id) => projectedPlaces.get(id)).filter(Boolean);
  if (!points.length) return { x: 0, y: 0, width: CANVAS.width, height: CANVAS.height };
  const minX = Math.min(...points.map(({ x }) => x));
  const maxX = Math.max(...points.map(({ x }) => x));
  const minY = Math.min(...points.map(({ y }) => y));
  const maxY = Math.max(...points.map(({ y }) => y));
  const aspect = CANVAS.width / CANVAS.height;
  const span = Math.max(maxX - minX, maxY - minY);
  const padding = Math.max(54, span * 0.28);
  let width = Math.max(220, maxX - minX + padding * 2);
  let height = Math.max(165, maxY - minY + padding * 2);
  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;
  width = Math.min(CANVAS.width, width);
  height = Math.min(CANVAS.height, height);
  return {
    x: round(clamp((minX + maxX) / 2 - width / 2, 0, CANVAS.width - width)),
    y: round(clamp((minY + maxY) / 2 - height / 2, 0, CANVAS.height - height)),
    width: round(width),
    height: round(height)
  };
}

function labelWidth(text, size) {
  let units = 0;
  for (const character of String(text)) units += /[\u2e80-\u9fff\uf900-\ufaff]/.test(character) ? 1 : character === " " ? 0.32 : 0.56;
  return Math.min(330, Math.max(54, units * size));
}

function labelBox(candidate, text, size) {
  const width = labelWidth(text, size);
  const height = size * 1.2;
  const left = candidate.anchor === "end" ? candidate.x - width : candidate.anchor === "middle" ? candidate.x - width / 2 : candidate.x;
  return { left, right: left + width, top: candidate.y - size, bottom: candidate.y - size + height };
}

function overlapArea(first, second, padding = 7) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left) + padding);
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) + padding);
  return width * height;
}

function labelCandidates(point) {
  return [
    { x: point.x + 22, y: point.y - 18, anchor: "start" },
    { x: point.x - 22, y: point.y - 18, anchor: "end" },
    { x: point.x + 22, y: point.y + 40, anchor: "start" },
    { x: point.x - 22, y: point.y + 40, anchor: "end" },
    { x: point.x, y: point.y - 28, anchor: "middle" },
    { x: point.x, y: point.y + 48, anchor: "middle" },
    { x: point.x + 52, y: point.y + 8, anchor: "start" },
    { x: point.x - 52, y: point.y + 8, anchor: "end" }
  ];
}

function layoutPlaceLabels(placeIds, projectedPlaces, language, dayCount) {
  const placements = new Map();
  const warnings = [];
  const occupied = [
    { left: 18, right: 620, top: 36, bottom: 130 },
    { left: 18, right: 285, top: 138, bottom: Math.min(CANVAS.height - 20, 190 + dayCount * 43) }
  ];
  const markerBoxes = placeIds.map((id) => {
    const point = projectedPlaces.get(id);
    return { left: point.x - 13, right: point.x + 13, top: point.y - 13, bottom: point.y + 13 };
  });
  const sorted = placeIds.slice().sort((first, second) => {
    const a = projectedPlaces.get(first);
    const b = projectedPlaces.get(second);
    return a.y - b.y || a.x - b.x || first.localeCompare(second, "en");
  });
  for (const id of sorted) {
    const entry = projectedPlaces.get(id);
    const text = placeNameForLayout(entry.place, language, id);
    const size = text.length > 22 ? 20 : text.length > 14 ? 22 : 24;
    const candidates = labelCandidates(entry)
      .map((candidate) => ({ candidate, box: labelBox(candidate, text, size) }))
      .filter(({ box }) => box.left >= 18 && box.right <= CANVAS.width - 18 && box.top >= 18 && box.bottom <= CANVAS.height - 18);
    const scored = (candidates.length ? candidates : labelCandidates(entry).map((candidate) => ({ candidate, box: labelBox(candidate, text, size) })))
      .map((option, index) => ({
        ...option,
        index,
        score: [...occupied, ...markerBoxes].reduce((sum, other) => sum + overlapArea(option.box, other), 0)
      }))
      .sort((first, second) => first.score - second.score || first.index - second.index);
    const selected = scored[0];
    if (selected.score > 0) warnings.push({ code: "label-collision-risk", placeId: id, overlapScore: round(selected.score) });
    occupied.push(selected.box);
    placements.set(id, { tx: round(selected.candidate.x), ty: round(selected.candidate.y), anchor: selected.candidate.anchor, size });
  }
  return { placements, warnings };
}

function placeNameForLayout(place, language, fallback) {
  return place?.localizedNames?.[language] || place?.name || fallback;
}

function relativeAssetHref(root, baseOut) {
  const relative = path.relative(root, baseOut);
  return (!relative.startsWith("..") && !path.isAbsolute(relative) ? relative : path.basename(baseOut)).split(path.sep).join("/");
}

function makeRegion(data, options, polygons, bounds, project, boundarySha256) {
  const entities = data.entities;
  const allPlaces = entities.places;
  const countryPlaces = new Map();
  for (const [id, place] of Object.entries(allPlaces)) {
    checkId(id, "place", `entities.places.${id}`);
    if (place.countryCode !== options.country) continue;
    if (!place.geo || !Number.isFinite(Number(place.geo.lat)) || !Number.isFinite(Number(place.geo.lng))) continue;
    const geo = { lat: Number(place.geo.lat), lng: Number(place.geo.lng) };
    if (!pointInPolygons(geo, polygons)) throw new Error(`Geocoded place ${id} falls outside the supplied ${options.country} boundary; resolve the location before preview.`);
    const point = project(geo);
    countryPlaces.set(id, { ...point, geo, place });
  }
  if (!countryPlaces.size) throw new Error(`No geocoded entities.places belong to ${options.country}`);

  const routes = [];
  const dailyLayouts = {};
  const referencedPlaceIds = [];
  const coveredDays = [];
  for (const [dayIndex, day] of data.days.entries()) {
    checkId(day.id, "day", `days[${dayIndex}].id`);
    if (!Number.isInteger(day.sequence) || day.sequence < 1) throw new Error(`days[${dayIndex}].sequence must be a positive integer`);
    const routePlaceIds = [];
    const transportPins = [];
    for (const [itemIndex, item] of (day.items || []).entries()) {
      checkId(item.id, "item", `days[${dayIndex}].items[${itemIndex}].id`);
      const referencedIds = itemPlaceSequence(item, entities);
      referencedIds.forEach((id) => {
        if (allPlaces[id]?.countryCode === options.country && !countryPlaces.has(id)) {
          throw new Error(`Referenced place ${id} has no valid geo point for ${options.country}; resolve it in the missing-material confirmation.`);
        }
      });
      const localIds = referencedIds.filter((id) => countryPlaces.has(id));
      localIds.forEach((id) => pushPlace(routePlaceIds, id));
      if (item.transportId) {
        checkId(item.transportId, "transport", `days[${dayIndex}].items[${itemIndex}].transportId`);
        const transport = entities.transport[item.transportId];
        const transportPlaceIds = [transport?.fromPlaceId, ...(transport?.viaPlaceIds || []), transport?.toPlaceId].filter((id) => countryPlaces.has(id));
        const pinPoints = transportPlaceIds.map((id) => countryPlaces.get(id)).filter(Boolean);
        if (pinPoints.length) {
          transportPins.push({
            type: transport.mode || "transfer",
            itemIds: [item.id],
            transportIds: [item.transportId],
            x: round(pinPoints.reduce((sum, point) => sum + point.x, 0) / pinPoints.length),
            y: round(pinPoints.reduce((sum, point) => sum + point.y, 0) / pinPoints.length)
          });
        }
      }
    }
    if (!routePlaceIds.length) continue;
    coveredDays.push(day.sequence);
    routePlaceIds.forEach((id) => { if (!referencedPlaceIds.includes(id)) referencedPlaceIds.push(id); });
    routes.push({
      day: day.sequence,
      dayId: day.id,
      color: PALETTE[(day.sequence - 1) % PALETTE.length],
      placeIds: routePlaceIds,
      bend: day.sequence % 2 ? 12 : -12
    });
    dailyLayouts[String(day.sequence)] = {
      dayId: day.id,
      places: [...new Set(routePlaceIds)],
      labels: {},
      transport: transportPins,
      viewport: viewportFor(routePlaceIds, countryPlaces)
    };
  }
  if (!coveredDays.length) throw new Error(`No itinerary day references a geocoded place in ${options.country}`);

  const { placements, warnings: layoutWarnings } = layoutPlaceLabels(referencedPlaceIds, countryPlaces, data.trip?.language, coveredDays.length);
  const places = referencedPlaceIds.map((placeId, index) => {
    const { geo, place, x, y } = countryPlaces.get(placeId);
    const label = place.localizedNames?.[data.trip?.language] || place.name || placeId;
    const layout = placements.get(placeId);
    return {
      placeId,
      geo,
      x: round(x),
      y: round(y),
      label,
      lines: [label],
      color: PALETTE[index % PALETTE.length],
      ...layout
    };
  });
  Object.entries(dailyLayouts).forEach(([dayKey, layout]) => {
    layout.labels = Object.fromEntries(layout.places.map((placeId) => {
      const label = placements.get(placeId);
      return [placeId, { x: label.tx, y: label.ty, anchor: label.anchor }];
    }));
  });
  return {
    id: `country-${options.country.toLowerCase()}`,
    label: options.label,
    countryCode: options.country,
    days: coveredDays,
    dayIds: routes.map((route) => route.dayId),
    canvas: CANVAS,
    baseImage: relativeAssetHref(options.root, options.baseOut),
    projection: project.metadata,
    title: options.title,
    ariaLabel: `${options.label}旅行路线地图`,
    description: "由授权国家边界与本次行程地点确定性生成的标准路线地图。",
    heading: { text: options.label, x: 33, y: 105, size: 40 },
    legend: { x: 35, y: 168, gap: 43 },
    annotations: [],
    places,
    placeIds: referencedPlaceIds,
    routes,
    dailyLayouts,
    provenance: {
      boundarySource: options.source,
      boundaryLicense: options.license,
      boundarySha256,
      generator: "scripts/generate-map-package.mjs"
    },
    layoutWarnings
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  for (const filePath of [options.boundary, options.data]) {
    if (!existsSync(filePath)) throw new Error(`File does not exist: ${filePath}`);
  }
  const [boundaryBuffer, geoJson, data] = await Promise.all([
    readFile(options.boundary), readJson(options.boundary), readJson(options.data)
  ]);
  requireCanonical(data);
  options.label ||= countryLabel(data, options.country);
  options.title ||= `${options.label} · 旅行路线`;
  const polygons = geometryList(geoJson);
  const bounds = boundaryBounds(polygons);
  const project = projector(bounds, options.padding);
  const boundarySha256 = createHash("sha256").update(boundaryBuffer).digest("hex");
  const region = makeRegion(data, options, polygons, bounds, project, boundarySha256);
  const svg = makeBaseSvg(polygons, project, options, boundarySha256);
  await Promise.all([mkdir(path.dirname(options.out), { recursive: true }), mkdir(path.dirname(options.baseOut), { recursive: true })]);
  await Promise.all([
    writeFile(options.out, `${JSON.stringify(region, null, 2)}\n`, "utf8"),
    writeFile(options.baseOut, svg, "utf8")
  ]);
  const result = {
    ok: true,
    region: options.country,
    days: region.days.length,
    places: region.places.length,
    routes: region.routes.length,
    output: options.out,
    baseImage: options.baseOut
  };
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`Generated ${options.country}: ${result.days} day(s), ${result.places} place(s), ${result.routes} route(s)\n${options.out}\n${options.baseOut}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
