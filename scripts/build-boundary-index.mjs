#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOUNDARIES = path.join(ROOT, "assets/boundaries");

const provinceMetadata = {
  "anhui-province.geojson": ["CN-AH", "Anhui", "安徽"],
  "beijing-municipality.geojson": ["CN-BJ", "Beijing", "北京"],
  "chongqing-municipality.geojson": ["CN-CQ", "Chongqing", "重庆"],
  "fujian-province.geojson": ["CN-FJ", "Fujian", "福建"],
  "guangzhou-province.geojson": ["CN-GD", "Guangdong", "广东"],
  "gansu-province.geojson": ["CN-GS", "Gansu", "甘肃"],
  "guangxi-zhuang-autonomous-region.geojson": ["CN-GX", "Guangxi", "广西"],
  "guizhou-province.geojson": ["CN-GZ", "Guizhou", "贵州"],
  "henan-province.geojson": ["CN-HA", "Henan", "河南"],
  "hubei-province.geojson": ["CN-HB", "Hubei", "湖北"],
  "hebei-province.geojson": ["CN-HE", "Hebei", "河北"],
  "hainan-province.geojson": ["CN-HI", "Hainan", "海南"],
  "hong-kong-special-administrative-region.geojson": ["CN-HK", "Hong Kong", "香港"],
  "heilongjiang-province.geojson": ["CN-HL", "Heilongjiang", "黑龙江"],
  "hunan-province.geojson": ["CN-HN", "Hunan", "湖南"],
  "jilin-province.geojson": ["CN-JL", "Jilin", "吉林"],
  "jiangsu-province.geojson": ["CN-JS", "Jiangsu", "江苏"],
  "jiangxi-province.geojson": ["CN-JX", "Jiangxi", "江西"],
  "liaoning-province.geojson": ["CN-LN", "Liaoning", "辽宁"],
  "macau-special-administrative-region.geojson": ["CN-MO", "Macao", "澳门"],
  "inner-mongolia-autonomous-region.geojson": ["CN-NM", "Inner Mongolia", "内蒙古"],
  "ningxia-ningxia-hui-autonomous-region.geojson": ["CN-NX", "Ningxia", "宁夏"],
  "qinghai-province.geojson": ["CN-QH", "Qinghai", "青海"],
  "sichuan-province.geojson": ["CN-SC", "Sichuan", "四川"],
  "shandong-province.geojson": ["CN-SD", "Shandong", "山东"],
  "shanghai-municipality.geojson": ["CN-SH", "Shanghai", "上海"],
  "shaanxi-province.geojson": ["CN-SN", "Shaanxi", "陕西"],
  "shanxi-province.geojson": ["CN-SX", "Shanxi", "山西"],
  "tianjin-municipality.geojson": ["CN-TJ", "Tianjin", "天津"],
  "taiwan-province.geojson": ["CN-TW", "Taiwan", "台湾"],
  "xinjiang-uyghur-autonomous-region.geojson": ["CN-XJ", "Xinjiang", "新疆"],
  "tibet-autonomous-region.geojson": ["CN-XZ", "Tibet", "西藏"],
  "yunnan-province.geojson": ["CN-YN", "Yunnan", "云南"],
  "zhejiang-province.geojson": ["CN-ZJ", "Zhejiang", "浙江"]
};

const countryMetadata = {
  JP: ["JPN", "日本"], KR: ["KOR", "韩国"], TH: ["THA", "泰国"], SG: ["SGP", "新加坡"],
  MY: ["MYS", "马来西亚"], VN: ["VNM", "越南"], ID: ["IDN", "印度尼西亚"], AU: ["AUS", "澳大利亚"],
  NZ: ["NZL", "新西兰"], CH: ["CHE", "瑞士"], IT: ["ITA", "意大利"], FR: ["FRA", "法国"],
  DE: ["DEU", "德国"], ES: ["ESP", "西班牙"], PT: ["PRT", "葡萄牙"], GB: ["GBR", "英国"],
  US: ["USA", "美国"], CA: ["CAN", "加拿大"], ZA: ["ZAF", "南非"], CN: ["CHN", "中国"]
};

const normalize = (value) => String(value || "").trim().toLocaleLowerCase("en-US");
const list = (raw) => Array.isArray(raw) ? raw : raw.entries || raw.boundaries || raw.countries || raw.provinces || raw.cities || [];
const read = async (folder) => list(JSON.parse(await fs.readFile(path.join(BOUNDARIES, folder, "index.json"), "utf8")));
const [countries, provinces, cities] = await Promise.all([read("countries"), read("china-provinces"), read("major-cities")]);
const entries = [];
const aliases = {};

function add(kind, id, name, nameZh, file, extraAliases = []) {
  const relative = `${kind}/${file}`;
  const values = [...new Set([id, name, nameZh, ...extraAliases].filter(Boolean))];
  entries.push({ kind, id, name, nameZh, file: relative, aliases: values });
  values.forEach((value) => { aliases[normalize(value)] = relative; });
}

for (const item of countries) {
  const id = String(item.id || item.code || "").toUpperCase();
  const [iso3, nameZh] = countryMetadata[id] || [];
  add("countries", id, item.name || item.displayName || id, nameZh, item.file, [iso3]);
}
for (const item of provinces) {
  const meta = provinceMetadata[item.file];
  if (!meta) continue;
  const [id, name, nameZh] = meta;
  add("china-provinces", id, name, nameZh, item.file, [`${name} Province`, `${nameZh}省`, item.name]);
}
for (const item of cities) {
  const english = String(item.displayName || item.name || item.id).split(",")[0].trim();
  add("major-cities", item.id, english, item.name, item.file, [`${item.name}市`, item.displayName]);
}

const output = { version: 1, generatedBy: "scripts/build-boundary-index.mjs", entries, aliases };
await fs.writeFile(path.join(BOUNDARIES, "boundary-index.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Built assets/boundaries/boundary-index.json with ${entries.length} boundaries and ${Object.keys(aliases).length} aliases.`);
