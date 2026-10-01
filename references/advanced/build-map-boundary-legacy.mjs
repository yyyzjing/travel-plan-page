#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN = Object.freeze({
  width: 1448,
  height: 1086,
  padding: 92,
  background: "#f2f1eb",
  land: "#f5f5ee",
  outline: "#899283",
  ink: "#103968",
  routeColors: ["#397dc1", "#e77e22", "#618344", "#209aaa", "#8865a5", "#e45d7b"],
  countryMinSpanKm: 160,
  countryMinCoverage: 0.07
});

function argsFrom(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) values[argv[i].slice(2)] = argv[i + 1];
  }
  return values;
}

function absolute(value, fallback) {
  return path.resolve(ROOT, value || fallback);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function coordinatePairs(geometry) {
  const pairs = [];
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      pairs.push(value);
      return;
    }
    value.forEach(visit);
  };
  visit(geometry?.coordinates);
  return pairs;
}

function featuresFrom(geojson) {
  if (geojson.type === "FeatureCollection") return geojson.features;
  if (geojson.type === "Feature") return [geojson];
  return [{ type: "Feature", properties: {}, geometry: geojson }];
}

function makeProjection(features) {
  const pairs = features.flatMap((feature) => coordinatePairs(feature.geometry));
  if (!pairs.length) throw new Error("Boundary contains no usable coordinates");
  const lngs = pairs.map(([lng]) => lng);
  const lats = pairs.map(([, lat]) => lat);
  const bounds = {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats)
  };
  const innerWidth = GOLDEN.width - GOLDEN.padding * 2;
  const innerHeight = GOLDEN.height - GOLDEN.padding * 2;
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.000001);
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.000001);
  const scale = Math.min(innerWidth / lngRange, innerHeight / latRange);
  const usedWidth = lngRange * scale;
  const usedHeight = latRange * scale;
  const offsetX = (GOLDEN.width - usedWidth) / 2;
  const offsetY = (GOLDEN.height - usedHeight) / 2;
  return {
    bounds,
    project(lng, lat) {
      return {
        x: Number((offsetX + (lng - bounds.minLng) * scale).toFixed(2)),
        y: Number((offsetY + (bounds.maxLat - lat) * scale).toFixed(2))
      };
    }
  };
}

function ringPath(ring, project) {
  return ring.map(([lng, lat], index) => {
    const point = project(lng, lat);
    return `${index ? "L" : "M"}${point.x} ${point.y}`;
  }).join(" ") + " Z";
}

function geometryPath(geometry, project) {
  if (geometry.type === "Polygon") return geometry.coordinates.map((ring) => ringPath(ring, project)).join(" ");
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap((polygon) => polygon.map((ring) => ringPath(ring, project))).join(" ");
  throw new Error(`Unsupported boundary geometry: ${geometry.type}`);
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function routePath(ids, placeById, seed = 0) {
  const points = ids.map((id) => placeById.get(id)).filter(Boolean);
  if (!points.length) return "";
  let result = `M${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const bend = ((seed + index) % 2 ? 1 : -1) * Math.min(34, distance * .12);
    const nx = -dy / distance;
    const ny = dx / distance;
    const c1x = previous.x + dx * .34 + nx * bend;
    const c1y = previous.y + dy * .34 + ny * bend;
    const c2x = previous.x + dx * .68 + nx * bend;
    const c2y = previous.y + dy * .68 + ny * bend;
    result += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${current.x} ${current.y}`;
  }
  return result;
}

function overlaps(first, second) {
  return first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y;
}

function labelFor(place, index, occupied) {
  const choices = [[34, -34], [34, 52], [-34, -34], [-34, 52], [84, -64], [84, 78], [-84, -64], [-84, 78], [148, -92], [-148, -92], [148, 106], [-148, 106]];
  const automatic = choices.map((_, offset) => choices[(offset + index * 2) % choices.length]);
  const candidates = place.labelOffset ? [[place.labelOffset.x, place.labelOffset.y], ...automatic] : automatic;
  const width = Math.max(154, Math.min(330, Math.max(String(place.name || "").length, String(place.nameZh || "").length * 2) * 13));
  let best = null;
  for (const [dx, dy] of candidates) {
    const anchor = place.anchor || (Math.abs(dx) < 4 ? "middle" : dx < 0 ? "end" : "start");
    const x = place.x + dx;
    const y = place.y + dy;
    const box = { x: anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x, y: y - 26, width, height: 58 };
    const inCanvas = box.x >= 18 && box.x + box.width <= GOLDEN.width - 18 && box.y >= 18 && box.y + box.height <= GOLDEN.height - 18;
    const collisions = occupied.filter((item) => overlaps(item, box)).length;
    const score = collisions * 10000 + Math.hypot(dx, dy) + (inCanvas ? 0 : 100000);
    if (!best || score < best.score) best = { x, y, anchor, box, score };
    if (inCanvas && collisions === 0) {
      occupied.push(box);
      return { x, y, anchor };
    }
  }
  occupied.push(best.box);
  return { x: best.x, y: best.y, anchor: best.anchor };
}

function midpoint(first, second) {
  return { x: Number(((first.x + second.x) / 2).toFixed(2)), y: Number(((first.y + second.y) / 2).toFixed(2)) };
}

function normalizeAlias(value) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

async function resolveBoundary(value) {
  if (!value) return null;
  const direct = absolute(value);
  try {
    await fs.access(direct);
    return direct;
  } catch {
    const index = await readJson(absolute("assets/boundaries/boundary-index.json"));
    const relative = index.aliases?.[normalizeAlias(value)];
    if (!relative) throw new Error(`Boundary not found: ${value}`);
    const resolved = absolute(`assets/boundaries/${relative}`);
    await fs.access(resolved);
    return resolved;
  }
}

function distanceKm(first, second) {
  const radians = (value) => value * Math.PI / 180;
  const lat1 = radians(first.lat);
  const lat2 = radians(second.lat);
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(second.lng - first.lng);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function maximumDistance(points) {
  let maximum = 0;
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      maximum = Math.max(maximum, distanceKm(points[first], points[second]));
    }
  }
  return maximum;
}

function averageNearestDistance(points) {
  if (points.length < 2) return 0;
  return points.reduce((sum, point, index) => {
    const nearest = Math.min(...points.filter((_, candidate) => candidate !== index).map((candidate) => distanceKm(point, candidate)));
    return sum + nearest;
  }, 0) / points.length;
}

function mapModeFor(mapData, tripData, boundaryPath, projection) {
  const boundaryRelative = boundaryPath ? path.relative(ROOT, boundaryPath).split(path.sep).join("/") : "";
  const isCountryBoundary = boundaryRelative.startsWith("assets/boundaries/countries/");
  const points = mapData.places.map((place) => place.geo).filter((geo) => Number.isFinite(geo?.lat) && Number.isFinite(geo?.lng));
  const spanKm = maximumDistance(points);
  const countrySpanKm = projection ? distanceKm(
    { lat: projection.bounds.minLat, lng: projection.bounds.minLng },
    { lat: projection.bounds.maxLat, lng: projection.bounds.maxLng }
  ) : 0;
  const coverage = countrySpanKm ? spanKm / countrySpanKm : 0;
  const cityByPlace = new Map((tripData.places || []).map((place) => [place.id, place.cityOrArea]));
  const namedAreas = new Set(mapData.places.map((place) => cityByPlace.get(place.id)).filter(Boolean));
  const areaCount = namedAreas.size || new Set(tripData.trip?.citiesAndAreas || []).size;
  const countryCount = new Set(tripData.trip?.primaryDestinationCountries || []).size;
  const denseCluster = points.length >= 6 && averageNearestDistance(points) < 18 && coverage < 0.12;
  const countryScale = isCountryBoundary && countryCount === 1 && areaCount >= 2 && points.length >= 2 && spanKm >= GOLDEN.countryMinSpanKm && coverage >= GOLDEN.countryMinCoverage && !denseCluster;
  return {
    id: countryScale ? "country-golden" : "generic-diagram",
    reason: countryScale ? "country-boundary-multi-city-wide-span" : !isCountryBoundary ? "non-country-boundary" : denseCluster ? "dense-place-cluster" : "concentrated-or-short-span",
    metrics: {
      placeCount: points.length,
      areaCount,
      countryCount,
      spanKm: Number(spanKm.toFixed(1)),
      countryCoverage: Number(coverage.toFixed(3)),
      averageNearestKm: Number(averageNearestDistance(points).toFixed(1))
    }
  };
}

function genericLayout(places, routeDefinitions) {
  const byId = new Map(places.map((place) => [place.id, place]));
  const orderedIds = [];
  routeDefinitions.flatMap((route) => route.placeIds || []).forEach((id) => {
    if (byId.has(id) && !orderedIds.includes(id)) orderedIds.push(id);
  });
  places.forEach((place) => { if (!orderedIds.includes(place.id)) orderedIds.push(place.id); });
  const count = orderedIds.length;
  const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count * 1.45))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const minX = 360;
  const maxX = 1190;
  const minY = 330;
  const maxY = 820;
  const points = new Map();
  orderedIds.forEach((id, index) => {
    const row = Math.floor(index / columns);
    const columnInRow = index % columns;
    const rowSize = Math.min(columns, count - row * columns);
    const logicalColumn = row % 2 ? rowSize - columnInRow - 1 : columnInRow;
    const x = rowSize === 1 ? (minX + maxX) / 2 : minX + (maxX - minX) * logicalColumn / (rowSize - 1);
    const y = rows === 1 ? (minY + maxY) / 2 : minY + (maxY - minY) * row / (rows - 1);
    points.set(id, { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
  });
  return points;
}

const cli = argsFrom(process.argv.slice(2));
const tripPath = absolute(cli.trip, "trip-data.json");
const configPath = absolute(cli.config, "trip-config.json");
const mapPath = absolute(cli.map, "map-data.json");
const outPath = absolute(cli.out, "travel-data.json");
const [tripData, config, mapData] = await Promise.all([readJson(tripPath), readJson(configPath), readJson(mapPath)]);
const boundaryPath = await resolveBoundary(mapData.region?.boundary);
const boundary = boundaryPath ? await readJson(boundaryPath) : null;
const features = boundary ? featuresFrom(boundary) : [];
const projection = features.length ? makeProjection(features) : null;
const mapMode = mapModeFor(mapData, tripData, boundaryPath, projection);
const safeRegionId = String(mapData.region.id || "region").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
const baseRelative = mapMode.id === "country-golden" ? `assets/maps/generated-${safeRegionId}.svg` : "assets/maps/generic-diagram-template.svg";
const basePath = absolute(baseRelative);

const boundaryPaths = features.map((feature) => geometryPath(feature.geometry, projection.project));
if (mapMode.id === "country-golden") {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${GOLDEN.width}" height="${GOLDEN.height}" viewBox="0 0 ${GOLDEN.width} ${GOLDEN.height}">`,
    `<defs>`,
    `<filter id="paper-noise" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="17" result="noise"/><feColorMatrix in="noise" type="matrix" values=".32 0 0 0 .68 .32 0 0 0 .66 .32 0 0 0 .60 0 0 0 .11 0"/><feBlend in="SourceGraphic" mode="multiply"/></filter>`,
    `<pattern id="contours" width="268" height="184" patternUnits="userSpaceOnUse"><g fill="none" stroke="#899488" stroke-opacity=".16" stroke-width="1"><path d="M18 116c19-55 82-79 139-54 37 16 64 14 95-4"/><path d="M35 127c18-39 69-57 113-37 36 16 68 13 98-6"/><path d="M62 135c17-23 48-34 78-21 28 12 55 10 79-5"/><path d="M200 174c-25-31-18-71 16-94 16-11 29-27 38-48"/></g></pattern>`,
    `<symbol id="mountain" viewBox="0 0 90 55"><path d="M2 52 28 17l10 14L53 4l35 48" fill="#f7f6ef" stroke="#899184" stroke-width="1.4"/><path d="m45 18 8-14 11 17-10-6-5 8z" fill="#d9ded6"/><path d="m19 29 9-12 7 10-8-4z" fill="#d9ded6"/></symbol>`,
    `<symbol id="pine" viewBox="0 0 32 58"><path d="M16 2 4 25h8L2 43h12v13h4V43h12L20 25h8z" fill="none" stroke="#758273" stroke-width="1.5" stroke-linejoin="round"/></symbol>`,
    `<clipPath id="land-clip">${boundaryPaths.map((d) => `<path d="${escapeXml(d)}"/>`).join("")}</clipPath>`,
    `</defs>`,
    `<rect width="100%" height="100%" fill="${GOLDEN.background}"/>`,
    `<rect width="100%" height="100%" fill="#f7f6f1" filter="url(#paper-noise)" opacity=".72"/>`,
    `<g fill="none" stroke="#ffffff" stroke-opacity=".92" stroke-width="12" stroke-linejoin="round" fill-rule="evenodd">`,
    ...boundaryPaths.map((d) => `<path d="${escapeXml(d)}"/>`),
    `</g>`,
    `<g fill="${GOLDEN.land}" stroke="${GOLDEN.outline}" stroke-width="3.6" stroke-linejoin="round" fill-rule="evenodd">`,
    ...boundaryPaths.map((d) => `<path d="${escapeXml(d)}"/>`),
    `</g>`,
    `<rect width="100%" height="100%" fill="url(#contours)" clip-path="url(#land-clip)"/>`,
    `<g clip-path="url(#land-clip)" opacity=".62"><path d="M180 770C330 720 420 755 545 696S770 612 905 650s236 8 365-68" fill="none" stroke="#c7e5f3" stroke-width="12"/><path d="M180 770C330 720 420 755 545 696S770 612 905 650s236 8 365-68" fill="none" stroke="#83bfe2" stroke-width="2.2"/><use href="#mountain" x="280" y="730" width="120"/><use href="#mountain" x="390" y="700" width="145"/><use href="#mountain" x="520" y="744" width="120"/><use href="#mountain" x="655" y="700" width="150"/><use href="#mountain" x="805" y="750" width="125"/><use href="#pine" x="260" y="455" width="37"/><use href="#pine" x="302" y="472" width="32"/><use href="#pine" x="1080" y="412" width="38"/><use href="#pine" x="1122" y="438" width="32"/></g>`,
    `<g fill="${GOLDEN.ink}" fill-opacity=".32" font-family="'Times New Roman','Songti SC','STSong',serif" font-size="17" letter-spacing="4"><text x="58" y="1022">TRAVEL MAP · GOLDEN COUNTRY SERIES</text></g>`,
    `</svg>`
  ].join("\n");
  await fs.mkdir(path.dirname(basePath), { recursive: true });
  await fs.writeFile(basePath, `${svg}\n`, "utf8");
} else {
  await fs.access(basePath);
}

const schematicPoints = mapMode.id === "generic-diagram" ? genericLayout(mapData.places, mapData.routes) : null;
const projectedPlaces = mapData.places.map((place) => ({
  ...place,
  ...(mapMode.id === "country-golden" ? projection.project(place.geo.lng, place.geo.lat) : schematicPoints.get(place.id))
}));
const occupiedLabels = [
  { x: 18, y: 38, width: 330, height: 330 },
  ...projectedPlaces.map((place) => ({ x: place.x - 17, y: place.y - 17, width: 34, height: 34 }))
];
const renderedPlaces = projectedPlaces.map((place, index) => {
  const point = { x: place.x, y: place.y };
  const day = Math.min(...(place.days || [1]));
  const colored = { ...place, ...point, color: GOLDEN.routeColors[(day - 1) % GOLDEN.routeColors.length] };
  const label = labelFor(colored, index, occupiedLabels);
  return {
    id: place.id,
    x: point.x,
    y: point.y,
    color: colored.color,
    tx: Number(label.x.toFixed(2)),
    ty: Number(label.y.toFixed(2)),
    size: 24,
    anchor: label.anchor,
    lines: [`${place.name} /`, place.nameZh || place.name],
    query: place.query || `${place.name} ${mapData.region.label}`,
    geo: place.geo
  };
});
const placeById = new Map(renderedPlaces.map((place) => [place.id, place]));
const routes = mapData.routes.map((route) => ({
  day: route.day,
  color: GOLDEN.routeColors[(route.day - 1) % GOLDEN.routeColors.length],
  paths: [routePath(route.placeIds, placeById, route.day)]
}));
const dailyLayouts = Object.fromEntries(mapData.dailyRoutes.map((daily) => {
  const labels = Object.fromEntries(daily.placeIds.map((id) => {
    const place = placeById.get(id);
    return [id, { x: place.tx, y: place.ty, anchor: place.anchor }];
  }));
  const transport = daily.placeIds.slice(0, -1).map((id, index) => {
    const point = midpoint(placeById.get(id), placeById.get(daily.placeIds[index + 1]));
    return { items: daily.scheduleItems?.[index] || [], ...point };
  });
  return [String(daily.day), { places: [...new Set(daily.placeIds)], labels, transport }];
}));
const days = mapData.routes.map((route) => route.day);
const region = {
  id: safeRegionId,
  label: mapData.region.label,
  countryCode: mapData.region.countryCode,
  scope: mapMode.id === "country-golden" ? "country" : "schematic",
  mapMode: mapMode.id,
  mapModeReason: mapMode.reason,
  mapModeMetrics: mapMode.metrics,
  days,
  canvas: { width: GOLDEN.width, height: GOLDEN.height },
  projection: mapMode.id === "country-golden"
    ? { type: "equirectangular", bounds: projection.bounds }
    : { type: "schematic-grid", bounds: null },
  baseImage: baseRelative,
  title: mapData.title || `${mapData.region.label} · 旅行路线`,
  ariaLabel: `${mapData.region.label}旅行路线，共${days.length}天`,
  description: mapData.region.description,
  heading: { text: mapData.region.heading || mapData.region.label, x: 33, y: 105, size: 40 },
  legend: { x: 35, y: 168, gap: 43 },
  annotations: [{ text: mapData.region.geoNote || mapData.region.label, x: 78, y: 960, size: 18, anchor: "start" }],
  routes,
  places: renderedPlaces,
  dailyLayouts
};

const output = {
  ...tripData,
  metadata: {
    ...tripData.metadata,
    language: config.language || tripData.metadata?.language || "zh-CN",
    assets: { ...(tripData.metadata?.assets || {}), routeMaps: [baseRelative] }
  },
  routeMap: { defaultRegionId: safeRegionId, regions: [region] }
};
await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Built ${path.relative(ROOT, outPath)} with ${mapMode.id} from ${boundaryPath ? path.relative(ROOT, boundaryPath) : "the frozen generic template"}.`);
