#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = path.join(ROOT, "assets/boundaries");
const index = JSON.parse(await fs.readFile(path.join(base, "boundary-index.json"), "utf8"));
const normalize = (value) => String(value).trim().toLocaleLowerCase("en-US");
const aliases = index.aliases || {};
const errors = [];

for (const [alias, relative] of Object.entries(aliases)) {
  try { await fs.access(path.join(base, relative)); }
  catch { errors.push(`Boundary alias '${alias}' points to missing file: ${relative}`); }
}

const guangdong = ["广东", "Guangdong", "CN-GD"].map((value) => aliases[normalize(value)]);
if (!guangdong[0] || new Set(guangdong).size !== 1) errors.push("广东 / Guangdong / CN-GD aliases must resolve to one boundary");

if (errors.length) {
  errors.forEach((message) => console.error(`ERROR ${message}`));
  process.exitCode = 1;
} else {
  console.log(`boundary-index: PASS (${index.entries?.length || 0} boundaries, ${Object.keys(aliases).length} aliases)`);
}
