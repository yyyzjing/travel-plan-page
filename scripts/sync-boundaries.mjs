#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = path.join(ROOT, "assets/boundaries");
const COUNTRY_SOURCE = "https://raw.githubusercontent.com/datasets/geo-countries/main/data/countries.geojson";
const PROVINCE_SOURCE = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/CHN/ADM1/geoBoundaries-CHN-ADM1_simplified.geojson";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const countryCodes = {
  JP: "JPN", KR: "KOR", TH: "THA", SG: "SGP", MY: "MYS", VN: "VNM", ID: "IDN", AU: "AUS", NZ: "NZL",
  CH: "CHE", IT: "ITA", FR: "FRA", DE: "DEU", ES: "ESP", PT: "PRT", GB: "GBR", US: "USA", CA: "CAN", ZA: "ZAF", CN: "CHN"
};
const countryNames = {
  JP: "Japan", KR: "South Korea", TH: "Thailand", SG: "Singapore", MY: "Malaysia", VN: "Vietnam", ID: "Indonesia",
  AU: "Australia", NZ: "New Zealand", CH: "Switzerland", IT: "Italy", FR: "France", DE: "Germany", ES: "Spain",
  PT: "Portugal", GB: "United Kingdom", US: "United States of America", CA: "Canada", ZA: "South Africa", CN: "China"
};
const cities = [
  ["beijing", "北京"], ["shanghai", "上海"], ["shenzhen", "深圳"], ["guangzhou", "广州"], ["hangzhou", "杭州"],
  ["chengdu", "成都"], ["chongqing", "重庆"], ["xian", "西安"], ["nanjing", "南京"], ["suzhou", "苏州"],
  ["wuhan", "武汉"], ["changsha", "长沙"], ["xiamen", "厦门"], ["qingdao", "青岛"], ["sanya", "三亚"],
  ["kunming", "昆明"], ["dali", "大理"], ["lijiang", "丽江"], ["guilin", "桂林"]
];

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "AI-Friendly-Travel-Template boundary-cache", "Accept-Language": "zh-CN,en" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

function alpha2(properties) {
  return properties?.["ISO3166-1-Alpha-2"] || properties?.ISO_A2 || properties?.iso_a2;
}

function alpha3(properties) {
  return properties?.["ISO3166-1-Alpha-3"] || properties?.ISO_A3 || properties?.iso_a3;
}

function slug(value) {
  return String(value || "boundary").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

await Promise.all(["countries", "china-provinces", "major-cities"].map((folder) => fs.mkdir(path.join(BASE, folder), { recursive: true })));
const world = await fetchJson(COUNTRY_SOURCE);
const countryIndex = [];
for (const [iso2, iso3] of Object.entries(countryCodes)) {
  const feature = world.features.find((item) => {
    const name = item.properties?.name || item.properties?.ADMIN;
    return alpha2(item.properties) === iso2 || alpha3(item.properties) === iso3 || name === countryNames[iso2];
  });
  if (!feature) throw new Error(`Country boundary not found: ${iso2}/${iso3}`);
  const filename = `${iso2}.geojson`;
  await writeJson(path.join(BASE, "countries", filename), { type: "FeatureCollection", features: [feature] });
  countryIndex.push({ id: iso2, name: feature.properties?.name || feature.properties?.ADMIN || iso2, file: filename });
}
await writeJson(path.join(BASE, "countries", "index.json"), countryIndex);

const provinces = await fetchJson(PROVINCE_SOURCE);
const provinceIndex = [];
for (const feature of provinces.features) {
  const name = feature.properties?.shapeName || feature.properties?.name || `province-${provinceIndex.length + 1}`;
  const filename = `${slug(name)}.geojson`;
  await writeJson(path.join(BASE, "china-provinces", filename), { type: "FeatureCollection", features: [feature] });
  provinceIndex.push({ id: feature.properties?.shapeISO || slug(name), name, file: filename });
}
await writeJson(path.join(BASE, "china-provinces", "index.json"), provinceIndex);

const cityIndex = [];
for (const [id, nameZh] of cities) {
  const query = new URLSearchParams({ format: "geojson", polygon_geojson: "1", limit: "1", countrycodes: "cn", q: `${nameZh}市, 中国` });
  const result = await fetchJson(`${NOMINATIM}?${query}`);
  const feature = result.features?.[0];
  if (!feature?.geometry) throw new Error(`City boundary not found: ${nameZh}`);
  const filename = `${id}.geojson`;
  await writeJson(path.join(BASE, "major-cities", filename), { type: "FeatureCollection", features: [feature] });
  cityIndex.push({ id, nameZh, displayName: feature.properties?.display_name, file: filename });
  await new Promise((resolve) => setTimeout(resolve, 1100));
}
await writeJson(path.join(BASE, "major-cities", "index.json"), cityIndex);
console.log(`Boundary Library ready: ${countryIndex.length} countries, ${provinceIndex.length} China provinces, ${cityIndex.length} major cities.`);
