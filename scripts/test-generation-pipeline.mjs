#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURES = path.join(SCRIPT_DIR, "test-fixtures");

function run(script, args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [path.join(SCRIPT_DIR, script), ...args], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, expectedStatus, `${script} exited ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "travel-generation-test-"));
  const site = path.join(temporaryRoot, "site");
  const privateWork = path.join(temporaryRoot, "private-work");
  await Promise.all([mkdir(path.join(site, "assets/maps"), { recursive: true }), mkdir(privateWork, { recursive: true })]);
  await copyFile(path.join(FIXTURES, "trip-config.json"), path.join(site, "trip-config.json"));

  const regionPath = path.join(site, "assets/maps/zz-region.json");
  const basePath = path.join(site, "assets/maps/zz-base.svg");
  run("generate-map-package.mjs", [
    "--boundary", path.join(FIXTURES, "synthetic-boundary.geojson"),
    "--data", path.join(FIXTURES, "canonical-trip.json"),
    "--country", "ZZ",
    "--out", regionPath,
    "--base-out", basePath,
    "--root", site,
    "--source", "Synthetic test boundary",
    "--license", "CC0-1.0",
    "--json"
  ]);

  const compiledPath = path.join(site, "travel-data.json");
  run("compile-travel-data.mjs", [
    "--input", path.join(FIXTURES, "canonical-trip.json"),
    "--config", path.join(site, "trip-config.json"),
    "--region", regionPath,
    "--out", compiledPath,
    "--public-edition",
    "--json"
  ]);
  run("validate-generation.mjs", ["check", "--root", site, "--skip-integrity", "--profile", "publish", "--json"]);

  await mkdir(path.join(site, "schemas"), { recursive: true });
  const frozenCorePath = path.join(site, "index.html");
  await writeFile(frozenCorePath, "<!doctype html><title>Generic fixture core</title>\n");
  run("validate-generation.mjs", ["freeze", "--root", site, "--profile", "publish", "--json"]);
  run("validate-generation.mjs", ["check", "--root", site, "--profile", "publish", "--json"]);
  await writeFile(frozenCorePath, "<!doctype html><title>Unexpected trip-time mutation</title>\n");
  const integrityFailure = run("validate-generation.mjs", ["check", "--root", site, "--profile", "publish", "--json"], 1);
  assert.match(integrityFailure.stdout, /integrity\.core-modified/);
  await writeFile(frozenCorePath, "<!doctype html><title>Generic fixture core</title>\n");

  const compiled = await readJson(compiledPath);
  const region = compiled.routeMap.regions[0];
  assert.equal(compiled.trip.nightCountAway, 0, "A one-day trip has zero nights away");
  assert.equal(compiled.days[0].schedule[0].id, "item-fixture-transfer");
  assert.deepEqual(compiled.days[0].schedule[0].placeIds, ["place-fixture-west", "place-fixture-east"]);
  assert.deepEqual(region.routes[0].placeIds, ["place-fixture-west", "place-fixture-east"]);
  assert.equal(region.label, "虚构之国");
  assert.equal(region.title, "虚构之国 · 旅行路线");
  assert.equal(region.projection.type, "equirectangular-fit");
  assert.ok(region.places.every((place) => [place.x, place.y, place.tx, place.ty, place.size].every(Number.isFinite)));
  assert.ok(region.dailyLayouts["1"].viewport);
  const baseSvg = await readFile(basePath, "utf8");
  assert.match(baseSvg, /fill="#f7f3e9"/);
  assert.match(baseSvg, /id="contour-lines"/);

  const validConfig = await readJson(path.join(site, "trip-config.json"));
  const invalidConfigPath = path.join(privateWork, "invalid-config.json");
  await writeFile(invalidConfigPath, `${JSON.stringify({ ...validConfig, unexpected: true }, null, 2)}\n`);
  const invalidConfigResult = run("validate-generation.mjs", [
    "check", "--root", site, "--config", invalidConfigPath, "--skip-integrity", "--json"
  ], 1);
  assert.match(invalidConfigResult.stdout, /schema\.additionalProperties/);

  const invalidSourcePath = path.join(privateWork, "invalid-source-facts.json");
  await writeFile(invalidSourcePath, `${JSON.stringify({
    schemaVersion: "1.0.0",
    sourceDocuments: [],
    facts: {},
    issues: {},
    confirmations: {
      moduleSelection: { status: "confirmed", selection: validConfig.modules },
      missingMaterials: { status: "confirmed", decision: "preview", issueIds: [] }
    }
  }, null, 2)}\n`);
  const invalidSourceResult = run("validate-generation.mjs", [
    "check", "--root", site, "--source", invalidSourcePath, "--skip-integrity", "--json"
  ], 1);
  assert.match(invalidSourceResult.stdout, /schema\.(?:minItems|required)/);

  const outsideData = await readJson(path.join(FIXTURES, "canonical-trip.json"));
  outsideData.entities.places["place-fixture-east"].geo = { lat: 40, lng: 13 };
  const outsidePath = path.join(privateWork, "outside-place.json");
  await writeFile(outsidePath, `${JSON.stringify(outsideData, null, 2)}\n`);
  const outsideResult = run("generate-map-package.mjs", [
    "--boundary", path.join(FIXTURES, "synthetic-boundary.geojson"),
    "--data", outsidePath,
    "--country", "ZZ",
    "--out", path.join(privateWork, "outside-region.json"),
    "--source", "Synthetic test boundary",
    "--license", "CC0-1.0"
  ], 1);
  assert.match(outsideResult.stderr, /falls outside/);

  const allOffConfig = {
    ...validConfig,
    modules: Object.fromEntries(MODULE_NAMES.map((name) => [name, false]))
  };
  const allOffPath = path.join(privateWork, "all-off-config.json");
  await writeFile(allOffPath, `${JSON.stringify(allOffConfig, null, 2)}\n`);
  const partialDisabledData = await readJson(path.join(FIXTURES, "canonical-trip.json"));
  partialDisabledData.entities.flights["flight-incomplete-fixture"] = { carrierId: "carrier-missing" };
  partialDisabledData.entities.places["place-fixture-west"].address = "Synthetic hidden address";
  partialDisabledData.issues["issue-fixture-hidden"] = {
    title: "Synthetic hidden issue",
    relatedRefs: ["place-fixture-west"]
  };
  const partialPath = path.join(privateWork, "partial-disabled.json");
  await writeFile(partialPath, `${JSON.stringify(partialDisabledData, null, 2)}\n`);
  const allOffOutput = path.join(privateWork, "all-off-output.json");
  run("compile-travel-data.mjs", ["--input", partialPath, "--config", allOffPath, "--out", allOffOutput, "--json"]);
  const allOffCompiled = await readJson(allOffOutput);
  assert.deepEqual(allOffCompiled.flights, []);
  assert.deepEqual(allOffCompiled.ticketPlanning.items, []);
  assert.deepEqual(allOffCompiled.routeMap.regions, []);
  assert.deepEqual(allOffCompiled.places, []);
  assert.deepEqual(allOffCompiled.mapLinks.providedGoogleMapsLinks, []);
  assert.deepEqual(allOffCompiled.mapLinks.navigationPlaces, []);
  assert.deepEqual(allOffCompiled.issuesAndUncertainties, []);
  assert.doesNotMatch(JSON.stringify(allOffCompiled), /Synthetic hidden (?:address|issue)/);

  const placeholderSite = path.join(temporaryRoot, "placeholder-site");
  await mkdir(placeholderSite, { recursive: true });
  const placeholderConfig = {
    ...validConfig,
    modules: Object.fromEntries(MODULE_NAMES.map((name) => [name, name === "flights"]))
  };
  const placeholderConfigPath = path.join(placeholderSite, "trip-config.json");
  await writeFile(placeholderConfigPath, `${JSON.stringify(placeholderConfig, null, 2)}\n`);
  const placeholderCanonical = await readJson(path.join(FIXTURES, "canonical-trip.json"));
  placeholderCanonical.entities.flights["flight-fixture-pending"] = {
    status: "missing",
    title: "Flight information pending",
    missingFields: ["flightNumber", "departurePlace", "departureTime", "arrivalPlace", "arrivalTime"],
    issueIds: ["issue-fixture-flight-materials"]
  };
  placeholderCanonical.issues["issue-fixture-flight-materials"] = {
    kind: "missing-material",
    severity: "warning",
    status: "accepted-for-preview",
    title: "Flight confirmation was not supplied",
    relatedRefs: ["flight-fixture-pending"]
  };
  const placeholderCanonicalPath = path.join(privateWork, "placeholder-canonical.json");
  await writeFile(placeholderCanonicalPath, `${JSON.stringify(placeholderCanonical, null, 2)}\n`);
  run("validate-generation.mjs", [
    "check", "--root", placeholderSite,
    "--data", placeholderCanonicalPath,
    "--skip-integrity", "--profile", "publish", "--json"
  ]);
  const placeholderOutput = path.join(placeholderSite, "travel-data.json");
  run("compile-travel-data.mjs", [
    "--input", placeholderCanonicalPath,
    "--config", placeholderConfigPath,
    "--out", placeholderOutput,
    "--public-edition",
    "--json"
  ]);
  const sourceReference = [{ kind: "document", documentId: "document-fixture-plan", page: 1 }];
  const placeholderSource = {
    schemaVersion: "1.0.0",
    sourceDocuments: [{
      id: "document-fixture-plan",
      mediaType: "text/plain",
      pageCount: 1,
      sha256: "0".repeat(64)
    }],
    facts: {
      trip: { language: "en", primaryDestinationCountries: ["ZZ"], sourceRefs: sourceReference },
      places: {},
      days: [],
      flights: {
        "flight-fixture-pending": {
          status: "missing",
          title: "Flight information pending",
          missingFields: ["flightNumber", "departurePlace", "departureTime", "arrivalPlace", "arrivalTime"],
          issueIds: ["issue-fixture-flight-materials"],
          sourceRefs: sourceReference
        }
      },
      tickets: {},
      transport: {},
      todo: [],
      driving: {}
    },
    issues: {
      "issue-fixture-flight-materials": {
        kind: "missing-material",
        severity: "warning",
        status: "accepted-for-preview",
        title: "Flight confirmation was not supplied",
        relatedRefs: ["flight-fixture-pending"],
        sourceRefs: sourceReference
      }
    },
    confirmations: {
      moduleSelection: { status: "confirmed", selection: placeholderConfig.modules },
      missingMaterials: {
        status: "confirmed",
        decision: "preview",
        issueIds: ["issue-fixture-flight-materials"]
      }
    }
  };
  const placeholderSourcePath = path.join(privateWork, "placeholder-source-facts.json");
  await writeFile(placeholderSourcePath, `${JSON.stringify(placeholderSource, null, 2)}\n`);
  run("validate-generation.mjs", [
    "check", "--root", placeholderSite,
    "--source", placeholderSourcePath,
    "--skip-integrity", "--profile", "publish", "--json"
  ]);
  const placeholderCompiled = await readJson(placeholderOutput);
  assert.deepEqual(placeholderCompiled.flightJourneys[0], {
    id: "journey-fixture-pending",
    status: "missing",
    placeholder: true,
    title: "Flight information pending",
    bookingStatus: "",
    missingFields: ["flightNumber", "departurePlace", "departureTime", "arrivalPlace", "arrivalTime"],
    issueIds: ["issue-fixture-flight-materials"]
  });
  assert.deepEqual(placeholderCompiled.flights[0], {
    id: "flight-fixture-pending",
    journeyId: "journey-fixture-pending",
    sequence: 1,
    status: "missing",
    placeholder: true,
    title: "Flight information pending",
    missingFields: ["flightNumber", "departurePlace", "departureTime", "arrivalPlace", "arrivalTime"],
    issueIds: ["issue-fixture-flight-materials"]
  });

  process.stdout.write("PASS generation pipeline: map → compile → validate, schema negatives, privacy-safe disabled modules, preview placeholders\n");
}

const MODULE_NAMES = ["flights", "overview", "itinerary", "tickets", "todo", "driving", "ledger"];

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
