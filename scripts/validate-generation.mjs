#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");
const MODULE_NAMES = ["flights", "overview", "itinerary", "tickets", "todo", "driving", "ledger"];
const SHARED_COLLECTIONS = new Set(["todos", "tickets", "ledger"]);
const ID_PATTERNS = {
  day: /^day-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  item: /^item-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  place: /^place-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  stay: /^stay-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  flight: /^flight-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  ticket: /^ticket-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  transport: /^transport-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  rental: /^rental-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  restaurant: /^restaurant-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  carrier: /^carrier-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  issue: /^issue-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  document: /^document-[a-z0-9]+(?:-[a-z0-9]+)*$/
};
const SOURCE_ARTIFACT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]);
const DEPLOYMENT_ID_KEYS = /^(?:account_?id|database_?id|d1_?database_?id|api_?token|cloudflare_?api_?token|private_?key|secret)$/i;
const PRIVATE_DATA_KEYS = /^(?:pnr|confirmation(?:number)?|booking(?:reference|number)|passportnumber|ticketnumber|email|phone)$/i;

function usage() {
  return `Travel generation validator

Usage:
  node scripts/validate-generation.mjs check [options]
  node scripts/validate-generation.mjs freeze [options]

Options:
  --root <dir>       Publishable template root (default: parent of scripts/)
  --config <file>    Module config, relative to root (default: trip-config.json)
  --data <file>      Generated trip data, relative to root (default: travel-data.json)
  --source <file>    Optional private source-facts.json; absolute paths are recommended
  --manifest <file>  Generic-capability hash manifest (default: schemas/core-integrity.json)
  --profile <name>   preview or publish (default: preview)
  --skip-integrity   Skip immutable generic-capability verification during check
  --json             Print deterministic JSON instead of text
  --help             Show this help
`;
}

function parseArgs(argv) {
  const args = [...argv];
  let command = "check";
  if (args[0] && !args[0].startsWith("-")) command = args.shift();
  if (!new Set(["check", "freeze", "help"]).has(command)) throw new Error(`Unknown command: ${command}`);
  const options = {
    command,
    root: DEFAULT_ROOT,
    config: "trip-config.json",
    data: "travel-data.json",
    source: null,
    manifest: "schemas/core-integrity.json",
    profile: "preview",
    json: false,
    skipIntegrity: false
  };
  while (args.length) {
    const key = args.shift();
    if (key === "--json") options.json = true;
    else if (key === "--skip-integrity") options.skipIntegrity = true;
    else if (key === "--help") options.command = "help";
    else if (["--root", "--config", "--data", "--source", "--manifest", "--profile"].includes(key)) {
      if (!args.length) throw new Error(`${key} requires a value`);
      options[key.slice(2)] = args.shift();
    } else throw new Error(`Unknown option: ${key}`);
  }
  options.root = path.resolve(options.root);
  if (!new Set(["preview", "publish"]).has(options.profile)) throw new Error("--profile must be preview or publish");
  return options;
}

function createReporter() {
  const diagnostics = [];
  const add = (severity, code, location, message) => diagnostics.push({ severity, code, path: location, message });
  return {
    diagnostics,
    error: (code, location, message) => add("error", code, location, message),
    warn: (code, location, message) => add("warning", code, location, message)
  };
}

async function loadJson(filePath, label, reporter) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    reporter.error("json.invalid", label, `Cannot read valid JSON: ${error.message}`);
    return null;
  }
}

function schemaTypeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function sameJsonValue(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function schemaLocation(parent, key) {
  return /^[A-Za-z_$][\w$-]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function resolveLocalRef(rootSchema, reference) {
  if (!reference.startsWith("#/")) throw new Error(`Only local JSON Schema refs are supported: ${reference}`);
  return reference.slice(2).split("/").reduce((value, token) => value?.[token.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema);
}

function schemaProblems(value, schema, rootSchema, location = "$") {
  if (schema === true) return [];
  if (schema === false) return [{ keyword: "falseSchema", path: location, message: "Value is not allowed." }];
  if (!schema || typeof schema !== "object") return [{ keyword: "schema", path: location, message: "Invalid schema node." }];
  const problems = [];
  const add = (keyword, currentPath, message) => problems.push({ keyword, path: currentPath, message });
  if (schema.$ref) {
    const target = resolveLocalRef(rootSchema, schema.$ref);
    if (!target) add("$ref", location, `Unresolved schema reference: ${schema.$ref}`);
    else problems.push(...schemaProblems(value, target, rootSchema, location));
  }
  if (schema.allOf) schema.allOf.forEach((child) => problems.push(...schemaProblems(value, child, rootSchema, location)));
  if (schema.anyOf) {
    const matches = schema.anyOf.map((child) => schemaProblems(value, child, rootSchema, location)).filter((items) => items.length === 0).length;
    if (!matches) add("anyOf", location, "Value does not match any allowed schema branch.");
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.map((child) => schemaProblems(value, child, rootSchema, location)).filter((items) => items.length === 0).length;
    if (matches !== 1) add("oneOf", location, `Value must match exactly one schema branch; matched ${matches}.`);
  }
  if (schema.if) {
    const matches = schemaProblems(value, schema.if, rootSchema, location).length === 0;
    const branch = matches ? schema.then : schema.else;
    if (branch) problems.push(...schemaProblems(value, branch, rootSchema, location));
  }
  if (schema.const !== undefined && !sameJsonValue(value, schema.const)) add("const", location, `Expected ${JSON.stringify(schema.const)}.`);
  if (schema.enum && !schema.enum.some((candidate) => sameJsonValue(value, candidate))) add("enum", location, `Expected one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}.`);
  const allowedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (allowedTypes.length && !allowedTypes.some((type) => schemaTypeMatches(value, type))) {
    add("type", location, `Expected ${allowedTypes.join(" or ")}.`);
    return problems;
  }
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) add("minLength", location, `Expected at least ${schema.minLength} character(s).`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) add("pattern", location, `Value does not match ${schema.pattern}.`);
    if (schema.format === "date") {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const valid = match && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
      if (!valid) add("format", location, "Expected a real YYYY-MM-DD date.");
    }
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) add("minimum", location, `Expected at least ${schema.minimum}.`);
    if (schema.maximum != null && value > schema.maximum) add("maximum", location, `Expected at most ${schema.maximum}.`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) add("minItems", location, `Expected at least ${schema.minItems} item(s).`);
    if (schema.uniqueItems) {
      const encoded = value.map((item) => JSON.stringify(item));
      if (new Set(encoded).size !== encoded.length) add("uniqueItems", location, "Array items must be unique.");
    }
    if (schema.items) value.forEach((item, index) => problems.push(...schemaProblems(item, schema.items, rootSchema, `${location}[${index}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties != null && keys.length < schema.minProperties) add("minProperties", location, `Expected at least ${schema.minProperties} properties.`);
    (schema.required || []).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) add("required", location, `Missing required property: ${key}`);
    });
    for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) problems.push(...schemaProblems(value[key], propertySchema, rootSchema, schemaLocation(location, key)));
    }
    if (schema.propertyNames) keys.forEach((key) => problems.push(...schemaProblems(key, schema.propertyNames, rootSchema, schemaLocation(location, key))));
    const known = new Set(Object.keys(schema.properties || {}));
    const unknown = keys.filter((key) => !known.has(key));
    if (schema.additionalProperties === false) unknown.forEach((key) => add("additionalProperties", schemaLocation(location, key), "Unexpected property."));
    else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      unknown.forEach((key) => problems.push(...schemaProblems(value[key], schema.additionalProperties, rootSchema, schemaLocation(location, key))));
    }
  }
  return problems;
}

function validateJsonSchema(value, schema, label, reporter) {
  if (!value || !schema) return;
  for (const problem of schemaProblems(value, schema, schema)) {
    reporter.error(`schema.${problem.keyword}`, `${label}${problem.path.slice(1)}`, problem.message);
  }
}

function objectEntries(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
}

function objectKeys(value) {
  return objectEntries(value).map(([key]) => key);
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function nonEmptyObject(value) {
  return objectKeys(value).length > 0;
}

function validateId(value, kind, location, reporter, required = true) {
  if (value == null && !required) return;
  if (typeof value !== "string" || !ID_PATTERNS[kind]?.test(value)) {
    reporter.error("id.invalid", location, `Expected a stable ${kind}- ID.`);
  }
}

function uniqueValues(values, location, code, reporter) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) reporter.error(code, location, `Duplicate value: ${value}`);
    seen.add(value);
  }
}

function expectReference(value, targets, location, kind, reporter, optional = false) {
  if (value == null && optional) return;
  if (typeof value !== "string" || !targets.has(value)) {
    reporter.error("reference.unresolved", location, `Unknown ${kind} reference: ${String(value)}`);
  }
}

function expectReferences(values, targets, location, kind, reporter) {
  if (values == null) return;
  if (!Array.isArray(values)) {
    reporter.error("reference.invalid-list", location, `Expected an array of ${kind} references.`);
    return;
  }
  values.forEach((value, index) => expectReference(value, targets, `${location}[${index}]`, kind, reporter));
}

function validateConfig(config, reporter) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return;
  if (config.schemaVersion !== "1.0.0") reporter.error("config.schema-version", "trip-config.json.schemaVersion", "Expected 1.0.0.");
  if (!config.modules || typeof config.modules !== "object" || Array.isArray(config.modules)) {
    reporter.error("config.modules", "trip-config.json.modules", "The seven module flags are required.");
  } else {
    MODULE_NAMES.forEach((name) => {
      if (typeof config.modules[name] !== "boolean") reporter.error("config.module-flag", `trip-config.json.modules.${name}`, "Expected boolean.");
    });
    objectKeys(config.modules).filter((name) => !MODULE_NAMES.includes(name)).forEach((name) => {
      reporter.error("config.unknown-module", `trip-config.json.modules.${name}`, "Unknown module flag.");
    });
  }
  const persistence = config.persistence;
  if (!persistence || !new Set(["local", "d1"]).has(persistence.mode)) {
    reporter.error("config.persistence-mode", "trip-config.json.persistence.mode", "Expected local or d1.");
    return;
  }
  const allowedKeys = persistence.mode === "local" ? new Set(["mode"]) : new Set(["mode", "apiBase", "sharedCollections"]);
  objectKeys(persistence).filter((key) => !allowedKeys.has(key)).forEach((key) => {
    reporter.error("config.persistence-key", `trip-config.json.persistence.${key}`, "Persistence settings may not contain deployment identities or credentials.");
  });
  if (persistence.mode === "d1" && persistence.apiBase != null && !/^\/(?!\/)[^\\?#]+$/.test(persistence.apiBase)) {
    reporter.error("config.d1-api-base", "trip-config.json.persistence.apiBase", "D1 apiBase must be a same-origin absolute path such as /api/trip.");
  }
  if (persistence.mode === "d1" && persistence.sharedCollections == null) {
    reporter.error("config.shared-collections", "trip-config.json.persistence.sharedCollections", "D1 mode requires an explicit non-empty collection allowlist.");
  } else if (persistence.sharedCollections != null) {
    if (!Array.isArray(persistence.sharedCollections) || !persistence.sharedCollections.length) {
      reporter.error("config.shared-collections", "trip-config.json.persistence.sharedCollections", "Expected a non-empty array when present.");
    } else {
      uniqueValues(persistence.sharedCollections, "trip-config.json.persistence.sharedCollections", "config.shared-collection-duplicate", reporter);
      persistence.sharedCollections.forEach((name, index) => {
        if (!SHARED_COLLECTIONS.has(name)) reporter.error("config.shared-collection", `trip-config.json.persistence.sharedCollections[${index}]`, "Expected todos, tickets, or ledger.");
      });
    }
  }
  if (config.modules?.tickets === true && config.modules?.itinerary !== true) {
    reporter.error("config.ticket-needs-itinerary", "trip-config.json.modules", "tickets requires itinerary because Ticket cards are rendered inside daily items.");
  }
}

function validateModuleData(config, data, reporter) {
  if (!config?.modules || !data) return;
  const canonical = data.entities && typeof data.entities === "object";
  const checks = {
    flights: canonical ? nonEmptyObject(data.entities.flights) : nonEmptyArray(data.flights),
    overview: canonical
      ? nonEmptyObject(data.map?.regions) || nonEmptyArray(data.routeMap?.regions)
      : nonEmptyArray(data.routeMap?.regions),
    itinerary: nonEmptyArray(data.days),
    tickets: canonical ? nonEmptyObject(data.entities.tickets) : nonEmptyArray(data.ticketPlanning?.items),
    todo: canonical ? nonEmptyObject(data.preTrip?.items) : nonEmptyArray(data.preTrip?.packingItems),
    driving: canonical ? nonEmptyObject(data.entities.rentals) : Boolean(data.groundTransport?.rentalCar),
    ledger: true
  };
  for (const name of MODULE_NAMES) {
    if (config.modules[name] && !checks[name]) {
      reporter.error("module.missing-data", `travel-data.json.${name}`, `Module ${name} is enabled but its required data is missing.`);
    }
  }
  if (config.modules.tickets && Array.isArray(data.ticketPlanning?.items)) {
    data.ticketPlanning.items.forEach((ticket, index) => {
      if (ticket.day == null && ticket.dayId == null) reporter.error("ticket.missing-day-reference", `ticketPlanning.items[${index}]`, "Enabled Ticket must reference a stable dayId or renderer day number.");
      if (!nonEmptyArray(ticket.scheduleItemIds) && !nonEmptyArray(ticket.itemIds) && nonEmptyArray(ticket.scheduleMatchTerms)) {
        reporter.warn("ticket.legacy-text-match", `ticketPlanning.items[${index}].scheduleMatchTerms`, "Text matching is fragile; compile Ticket relations to stable scheduleItemIds.");
      }
    });
  }
  const collectionToModule = { todos: "todo", tickets: "tickets", ledger: "ledger" };
  for (const collection of config.persistence?.sharedCollections || []) {
    const moduleName = collectionToModule[collection];
    if (moduleName && config.modules[moduleName] === false) {
      reporter.warn("module.hidden-shared-collection", `trip-config.json.persistence.sharedCollections`, `${collection} is configured for sharing while ${moduleName} is hidden.`);
    }
  }
}

function validateCanonical(data, root, reporter, config) {
  const entities = data.entities || {};
  const maps = {
    place: entities.places || {}, stay: entities.stays || {}, flight: entities.flights || {},
    ticket: entities.tickets || {}, transport: entities.transport || {}, rental: entities.rentals || {},
    restaurant: entities.restaurants || {}, carrier: entities.carriers || {}, issue: data.issues || {}
  };
  const ids = {};
  for (const [kind, collection] of Object.entries(maps)) {
    ids[kind] = new Set(objectKeys(collection));
    objectKeys(collection).forEach((id) => validateId(id, kind, `travel-data.json.${kind}.${id}`, reporter));
  }
  const allEntityIds = new Map();
  for (const [kind, values] of Object.entries(ids)) {
    for (const id of values) {
      if (allEntityIds.has(id)) reporter.error("id.cross-entity-duplicate", `travel-data.json.entities.${kind}.${id}`, `ID is already used by ${allEntityIds.get(id)}.`);
      allEntityIds.set(id, kind);
    }
  }

  objectEntries(entities.stays).forEach(([id, stay]) => expectReference(stay.placeId, ids.place, `entities.stays.${id}.placeId`, "place", reporter));
  objectEntries(entities.flights).forEach(([id, flight]) => {
    if (flight.status === "missing") {
      if (!String(flight.title || "").trim() || !nonEmptyArray(flight.missingFields) || !nonEmptyArray(flight.issueIds)) {
        reporter.error("flight.invalid-placeholder", `entities.flights.${id}`, "Missing flight placeholders require title, missingFields, and issueIds.");
      }
      expectReferences(flight.issueIds, ids.issue, `entities.flights.${id}.issueIds`, "issue", reporter);
      return;
    }
    expectReference(flight.carrierId, ids.carrier, `entities.flights.${id}.carrierId`, "carrier", reporter);
    expectReference(flight.departure?.placeId, ids.place, `entities.flights.${id}.departure.placeId`, "place", reporter);
    expectReference(flight.arrival?.placeId, ids.place, `entities.flights.${id}.arrival.placeId`, "place", reporter);
  });
  objectEntries(entities.flightGroups).forEach(([id, group]) => expectReferences(group.flightIds, ids.flight, `entities.flightGroups.${id}.flightIds`, "flight", reporter));
  objectEntries(entities.tickets).forEach(([id, ticket]) => {
    expectReferences(ticket.placeIds, ids.place, `entities.tickets.${id}.placeIds`, "place", reporter);
    expectReferences(ticket.transportIds, ids.transport, `entities.tickets.${id}.transportIds`, "transport", reporter);
    expectReferences(ticket.issueIds, ids.issue, `entities.tickets.${id}.issueIds`, "issue", reporter);
  });
  objectEntries(entities.transport).forEach(([id, transport]) => {
    expectReference(transport.fromPlaceId, ids.place, `entities.transport.${id}.fromPlaceId`, "place", reporter, true);
    expectReference(transport.toPlaceId, ids.place, `entities.transport.${id}.toPlaceId`, "place", reporter, true);
    expectReferences(transport.viaPlaceIds, ids.place, `entities.transport.${id}.viaPlaceIds`, "place", reporter);
    expectReference(transport.operatorId, ids.carrier, `entities.transport.${id}.operatorId`, "carrier", reporter, true);
    expectReference(transport.rentalId, ids.rental, `entities.transport.${id}.rentalId`, "rental", reporter, true);
    expectReferences(transport.issueIds, ids.issue, `entities.transport.${id}.issueIds`, "issue", reporter);
  });
  objectEntries(entities.rentals).forEach(([id, rental]) => {
    expectReference(rental.pickup?.placeId, ids.place, `entities.rentals.${id}.pickup.placeId`, "place", reporter);
    expectReference(rental.dropoff?.placeId, ids.place, `entities.rentals.${id}.dropoff.placeId`, "place", reporter);
  });
  objectEntries(entities.restaurants).forEach(([id, restaurant]) => expectReference(restaurant.placeId, ids.place, `entities.restaurants.${id}.placeId`, "place", reporter));

  const dayIds = new Set();
  const sequences = [];
  const itemIds = new Set();
  for (const [dayIndex, day] of (data.days || []).entries()) {
    validateId(day.id, "day", `days[${dayIndex}].id`, reporter);
    if (dayIds.has(day.id)) reporter.error("id.duplicate-day", `days[${dayIndex}].id`, `Duplicate day ID: ${day.id}`);
    dayIds.add(day.id);
    sequences.push(day.sequence);
    expectReference(day.stayId, ids.stay, `days[${dayIndex}].stayId`, "stay", reporter, true);
    for (const [itemIndex, item] of (day.items || []).entries()) {
      const base = `days[${dayIndex}].items[${itemIndex}]`;
      validateId(item.id, "item", `${base}.id`, reporter);
      if (itemIds.has(item.id)) reporter.error("id.duplicate-item", `${base}.id`, `Duplicate item ID: ${item.id}`);
      itemIds.add(item.id);
      expectReference(item.placeId, ids.place, `${base}.placeId`, "place", reporter, true);
      expectReferences(item.placeIds, ids.place, `${base}.placeIds`, "place", reporter);
      expectReference(item.stayId, ids.stay, `${base}.stayId`, "stay", reporter, true);
      expectReference(item.flightId, ids.flight, `${base}.flightId`, "flight", reporter, true);
      expectReferences(item.ticketIds, ids.ticket, `${base}.ticketIds`, "ticket", reporter);
      expectReference(item.transportId, ids.transport, `${base}.transportId`, "transport", reporter, true);
      expectReference(item.rentalId, ids.rental, `${base}.rentalId`, "rental", reporter, true);
      expectReference(item.restaurantId, ids.restaurant, `${base}.restaurantId`, "restaurant", reporter, true);
      expectReferences(item.issueIds, ids.issue, `${base}.issueIds`, "issue", reporter);
    }
  }
  uniqueValues(sequences, "travel-data.json.days[].sequence", "day.duplicate-sequence", reporter);
  validateCanonicalMap(data.map, { ...ids, day: dayIds, item: itemIds }, reporter);
  if (Array.isArray(data.routeMap?.regions)) {
    const dayNumbers = new Set(sequences);
    const dayByNumber = new Map((data.days || []).map((day) => [day.sequence, { ...day, schedule: day.items || [] }]));
    const rendererMapView = {
      ...data,
      places: objectEntries(entities.places).map(([id, place]) => ({ id, ...place })),
      days: [...dayByNumber.values()]
    };
    validateRendererMap(rendererMapView, dayNumbers, dayByNumber, root, reporter, config?.modules?.overview === true);
  }
}

function validateCanonicalMap(map, ids, reporter) {
  if (!map || typeof map !== "object") return;
  const regionIds = new Set(objectKeys(map.regions));
  const routeIds = new Set(objectKeys(map.routes));
  const segmentIds = new Set(objectKeys(map.segments));
  objectEntries(map.routes).forEach(([id, route]) => {
    expectReference(route.regionId, regionIds, `map.routes.${id}.regionId`, "map region", reporter);
    expectReference(route.dayId, ids.day, `map.routes.${id}.dayId`, "day", reporter, true);
    expectReferences(route.segmentIds, segmentIds, `map.routes.${id}.segmentIds`, "map segment", reporter);
  });
  objectEntries(map.segments).forEach(([id, segment]) => {
    expectReference(segment.fromPlaceId, ids.place, `map.segments.${id}.fromPlaceId`, "place", reporter, true);
    expectReference(segment.toPlaceId, ids.place, `map.segments.${id}.toPlaceId`, "place", reporter, true);
    expectReferences(segment.transportIds, ids.transport, `map.segments.${id}.transportIds`, "transport", reporter);
  });
  const layout = map.customLayout;
  if (!layout) return;
  objectEntries(layout.placeFeatures).forEach(([id, feature]) => {
    expectReference(feature.placeId, ids.place, `map.customLayout.placeFeatures.${id}.placeId`, "place", reporter);
    expectReferences(feature.interactionPlaceIds, ids.place, `map.customLayout.placeFeatures.${id}.interactionPlaceIds`, "place", reporter);
  });
  objectEntries(layout.transportPins).forEach(([id, pin]) => expectReferences(pin.transportIds, ids.transport, `map.customLayout.transportPins.${id}.transportIds`, "transport", reporter));
}

function validateRendererData(data, root, reporter, config) {
  const flightValues = (data.flights || []).map((item) => item.id).filter(Boolean);
  const stayValues = (data.accommodations || []).map((item) => item.id).filter(Boolean);
  const placeValues = (data.places || []).map((item) => item.id).filter(Boolean);
  const ticketValues = (data.ticketPlanning?.items || []).map((item) => item.id).filter(Boolean);
  const flights = new Set(flightValues);
  const journeys = new Set((data.flightJourneys || []).map((item) => item.id).filter(Boolean));
  const stays = new Set(stayValues);
  const places = new Set(placeValues);
  const tickets = new Set(ticketValues);
  const transportValues = [
    ...(data.groundTransport?.plannedRoadLegs || []),
    ...(data.groundTransport?.publicTransitAndRail || [])
  ].map((item) => item.id).filter(Boolean);
  const transports = new Set(transportValues);
  [[flights, "flight"], [stays, "stay"], [places, "place"], [tickets, "ticket"]].forEach(([set, kind]) => {
    set.forEach((id) => validateId(id, kind, `${kind}.${id}`, reporter));
  });
  uniqueValues(flightValues, "travel-data.json.flights", "id.duplicate-flight", reporter);
  uniqueValues(stayValues, "travel-data.json.accommodations", "id.duplicate-stay", reporter);
  uniqueValues(placeValues, "travel-data.json.places", "id.duplicate-place", reporter);
  uniqueValues(ticketValues, "travel-data.json.ticketPlanning.items", "id.duplicate-ticket", reporter);
  uniqueValues(transportValues, "travel-data.json.groundTransport", "id.duplicate-transport", reporter);
  transports.forEach((id) => validateId(id, "transport", `transport.${id}`, reporter));
  (data.flights || []).forEach((flight, index) => expectReference(flight.journeyId, journeys, `flights[${index}].journeyId`, "journey", reporter));
  (data.flightJourneys || []).forEach((journey, index) => {
    if (!journey.placeholder) return;
    if (!new Set(["missing", "pending"]).has(journey.status) || !String(journey.title || "").trim() || !nonEmptyArray(journey.missingFields)) {
      reporter.error("flight.invalid-placeholder", `flightJourneys[${index}]`, "Placeholder journey requires missing/pending status, title, and missingFields.");
    }
  });

  const dayNumbers = new Set();
  const dayIds = new Set();
  const dayByNumber = new Map();
  const itemIds = new Set();
  for (const [dayIndex, day] of (data.days || []).entries()) {
    if (!Number.isInteger(day.day) || day.day < 1) reporter.error("day.invalid-number", `days[${dayIndex}].day`, "Expected a positive integer.");
    if (dayNumbers.has(day.day)) reporter.error("day.duplicate-number", `days[${dayIndex}].day`, `Duplicate day: ${day.day}`);
    dayNumbers.add(day.day);
    dayByNumber.set(day.day, day);
    if (day.id != null) {
      validateId(day.id, "day", `days[${dayIndex}].id`, reporter);
      if (dayIds.has(day.id)) reporter.error("id.duplicate-day", `days[${dayIndex}].id`, `Duplicate day ID: ${day.id}`);
      dayIds.add(day.id);
    }
    expectReference(day.stayId, stays, `days[${dayIndex}].stayId`, "stay", reporter, true);
    for (const [itemIndex, item] of (day.schedule || []).entries()) {
      const base = `days[${dayIndex}].schedule[${itemIndex}]`;
      if (item.id != null) {
        validateId(item.id, "item", `${base}.id`, reporter);
        if (itemIds.has(item.id)) reporter.error("id.duplicate-item", `${base}.id`, `Duplicate item ID: ${item.id}`);
        itemIds.add(item.id);
      }
      if (item.refId != null) {
        const allKnown = new Set([...flights, ...stays, ...places, ...tickets]);
        expectReference(item.refId, allKnown, `${base}.refId`, "entity", reporter);
      }
      expectReference(item.placeId, places, `${base}.placeId`, "place", reporter, true);
      expectReferences(item.placeIds, places, `${base}.placeIds`, "place", reporter);
      expectReferences(item.ticketIds, tickets, `${base}.ticketIds`, "ticket", reporter);
      expectReference(item.transportId, transports, `${base}.transportId`, "transport", reporter, true);
    }
  }
  (data.ticketPlanning?.items || []).forEach((ticket, index) => {
    if (ticket.day != null && !dayNumbers.has(ticket.day)) reporter.error("ticket.unknown-day", `ticketPlanning.items[${index}].day`, `Unknown day: ${ticket.day}`);
    if (ticket.dayId != null) expectReference(ticket.dayId, dayIds, `ticketPlanning.items[${index}].dayId`, "day", reporter);
    expectReferences(ticket.itemIds, itemIds, `ticketPlanning.items[${index}].itemIds`, "item", reporter);
    expectReferences(ticket.scheduleItemIds, itemIds, `ticketPlanning.items[${index}].scheduleItemIds`, "item", reporter);
    expectReferences(ticket.placeIds, places, `ticketPlanning.items[${index}].placeIds`, "place", reporter);
    expectReferences(ticket.transportIds, transports, `ticketPlanning.items[${index}].transportIds`, "transport", reporter);
  });
  validateRendererMap(data, dayNumbers, dayByNumber, root, reporter, config?.modules?.overview === true);
}

function validViewport(viewport, canvas) {
  const values = [viewport?.x, viewport?.y, viewport?.width, viewport?.height].map(Number);
  if (!values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) return null;
  const [x, y, width, height] = values;
  if (x < 0 || y < 0 || x + width > canvas.width + 0.01 || y + height > canvas.height + 0.01) return null;
  return { x, y, width, height };
}

function pointInsideViewport(point, viewport) {
  return point.x >= viewport.x - 0.01 && point.x <= viewport.x + viewport.width + 0.01
    && point.y >= viewport.y - 0.01 && point.y <= viewport.y + viewport.height + 0.01;
}

function validateRendererMap(data, dayNumbers, dayByNumber, root, reporter, requireCoverage = true) {
  const regions = data.routeMap?.regions;
  if (!Array.isArray(regions)) return;
  const regionIds = new Set();
  const countryCodes = new Set();
  const mappedDays = new Set();
  let sawLegacyRoutePaths = false;
  let sawLegacyItemIndexes = false;
  for (const [regionIndex, region] of regions.entries()) {
    const base = `routeMap.regions[${regionIndex}]`;
    if (regionIds.has(region.id)) reporter.error("map.duplicate-region", `${base}.id`, `Duplicate region ID: ${region.id}`);
    regionIds.add(region.id);
    if (!/^[A-Z]{2}$/.test(region.countryCode || "")) reporter.error("map.country-code", `${base}.countryCode`, "Expected ISO alpha-2 country code.");
    countryCodes.add(region.countryCode);
    const canvas = region.canvas || {};
    if (Number(canvas.width) !== 1448 || Number(canvas.height) !== 1086) reporter.error("map.canvas", `${base}.canvas`, "Generated map canvas must be 1448×1086.");
    const rawBaseImage = String(region.baseImage || "").replace(/\\/g, "/");
    const normalizedBaseImage = path.posix.normalize(rawBaseImage.split(/[?#]/)[0]);
    if (!rawBaseImage || rawBaseImage.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(rawBaseImage) || normalizedBaseImage.includes("../") || !normalizedBaseImage.startsWith("assets/maps/")) {
      reporter.error("map.base-image-path", `${base}.baseImage`, "baseImage must be a repository-relative path under assets/maps/.");
    } else if (!existsSync(path.resolve(root, normalizedBaseImage))) {
      reporter.error("map.base-image-missing", `${base}.baseImage`, `Map base asset does not exist: ${normalizedBaseImage}`);
    }
    const modernRegion = (region.routes || []).some((route) => nonEmptyArray(route.placeIds))
      || (region.places || []).some((place) => Boolean(place.placeId))
      || Boolean(region.projection);
    if (modernRegion) {
      const provenance = region.provenance || {};
      if (!String(provenance.boundarySource || "").trim()) reporter.error("map.provenance-source", `${base}.provenance.boundarySource`, "Generated map must record its authorized boundary source.");
      if (!String(provenance.boundaryLicense || "").trim()) reporter.error("map.provenance-license", `${base}.provenance.boundaryLicense`, "Generated map must record its boundary license.");
      if (!/^[a-f0-9]{64}$/.test(provenance.boundarySha256 || "")) reporter.error("map.provenance-sha256", `${base}.provenance.boundarySha256`, "Generated map must record the boundary SHA-256.");
      if (provenance.generator !== "scripts/generate-map-package.mjs") reporter.error("map.provenance-generator", `${base}.provenance.generator`, "Unexpected or missing map generator identity.");
      if (rawBaseImage && !rawBaseImage.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(rawBaseImage) && !normalizedBaseImage.includes("../")) {
        const baseAssetPath = path.resolve(root, normalizedBaseImage);
        if (path.extname(normalizedBaseImage).toLowerCase() !== ".svg") {
          reporter.error("map.generated-base-type", `${base}.baseImage`, "Generated map packages must use the deterministic SVG base asset.");
        } else if (existsSync(baseAssetPath)) {
          const svg = readFileSync(baseAssetPath, "utf8");
          if (!/<svg\b/i.test(svg) || !/viewBox=["']0 0 1448 1086["']/i.test(svg)) {
            reporter.error("map.generated-base-content", `${base}.baseImage`, "Generated map SVG must contain the frozen 1448×1086 canvas.");
          }
          if (!svg.includes(`"boundarySha256":"${provenance.boundarySha256}"`) || !svg.includes('"generator":"generate-map-package.mjs"')) {
            reporter.error("map.generated-base-provenance", `${base}.baseImage`, "Generated map SVG metadata does not match the region provenance.");
          }
          if (/<script\b|\bon\w+\s*=|(?:href|xlink:href)\s*=/i.test(svg)) {
            reporter.error("map.generated-base-active-content", `${base}.baseImage`, "Generated map SVG must not contain scripts, event handlers, or external references.");
          }
        }
      }
      const projection = region.projection || {};
      if (projection.type !== "equirectangular-fit") reporter.error("map.projection-type", `${base}.projection.type`, "Expected equirectangular-fit.");
      if (!Array.isArray(projection.bounds) || projection.bounds.length !== 4 || !projection.bounds.every(Number.isFinite)
        || !(projection.bounds[2] > projection.bounds[0]) || !(projection.bounds[3] > projection.bounds[1])) {
        reporter.error("map.projection-bounds", `${base}.projection.bounds`, "Expected [west,south,east,north] numeric bounds.");
      }
      if (!Number.isFinite(projection.scale) || projection.scale <= 0 || !Number.isFinite(projection.offset?.x) || !Number.isFinite(projection.offset?.y)) {
        reporter.error("map.projection-fit", `${base}.projection`, "Projection must record positive scale and numeric offset.");
      }
    }
    uniqueValues(region.days || [], `${base}.days`, "map.duplicate-day", reporter);
    (region.days || []).forEach((day) => {
      mappedDays.add(day);
      if (!dayNumbers.has(day)) reporter.error("map.unknown-day", `${base}.days`, `Unknown day: ${day}`);
    });
    const mapPlaceIds = new Set();
    const mapPoints = new Map();
    for (const [placeIndex, place] of (region.places || []).entries()) {
      const mapPlaceId = place.id || place.placeId;
      if (!mapPlaceId || mapPlaceIds.has(mapPlaceId)) reporter.error("map.duplicate-place", `${base}.places[${placeIndex}]`, `Missing or duplicate map place ID: ${String(mapPlaceId)}`);
      mapPlaceIds.add(mapPlaceId);
      if (place.placeId && !new Set((data.places || []).map((entry) => entry.id)).has(place.placeId)) {
        reporter.error("map.place-reference", `${base}.places[${placeIndex}].placeId`, `Unknown canonical place: ${place.placeId}`);
      }
      if (modernRegion) {
        const point = { x: Number(place.x), y: Number(place.y) };
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > 1448 || point.y > 1086) {
          reporter.error("map.place-coordinate", `${base}.places[${placeIndex}]`, "Generated map place must have finite x/y inside the 1448×1086 canvas.");
        } else mapPoints.set(mapPlaceId, point);
        if (![place.tx, place.ty, place.size].every((value) => Number.isFinite(Number(value))) || !new Set(["start", "middle", "end"]).has(place.anchor)) {
          reporter.error("map.label-layout", `${base}.places[${placeIndex}]`, "Generated map place must have deterministic tx/ty/size/anchor label layout.");
        }
      }
    }
    const routePlacesByDay = new Map();
    for (const [routeIndex, route] of (region.routes || []).entries()) {
      if (!dayNumbers.has(route.day)) reporter.error("map.route-unknown-day", `${base}.routes[${routeIndex}].day`, `Unknown day: ${route.day}`);
      if (!(region.days || []).includes(route.day)) reporter.error("map.route-outside-region", `${base}.routes[${routeIndex}].day`, `Day ${route.day} is not assigned to this region.`);
      if (!Array.isArray(route.placeIds) || !route.placeIds.length) {
        if (nonEmptyArray(route.paths)) sawLegacyRoutePaths = true;
        else reporter.error("map.route-missing-places", `${base}.routes[${routeIndex}]`, "A route needs stable placeIds or legacy paths.");
      } else {
        const routePlaces = routePlacesByDay.get(route.day) || new Set();
        route.placeIds.forEach((placeId, placeIndex) => {
          if (!mapPlaceIds.has(placeId)) reporter.error("map.route-unknown-place", `${base}.routes[${routeIndex}].placeIds[${placeIndex}]`, `Unknown map place: ${placeId}`);
          routePlaces.add(placeId);
        });
        routePlacesByDay.set(route.day, routePlaces);
      }
    }
    for (const [dayKey, layout] of objectEntries(region.dailyLayouts)) {
      const day = Number(dayKey);
      if (!Number.isInteger(day) || !dayNumbers.has(day)) reporter.error("map.layout-unknown-day", `${base}.dailyLayouts.${dayKey}`, `Unknown day: ${dayKey}`);
      if (!(region.days || []).includes(day)) reporter.error("map.layout-outside-region", `${base}.dailyLayouts.${dayKey}`, `Day ${dayKey} is not assigned to this region.`);
      (layout.places || []).forEach((placeId, index) => {
        if (!mapPlaceIds.has(placeId)) reporter.error("map.layout-unknown-place", `${base}.dailyLayouts.${dayKey}.places[${index}]`, `Unknown map place: ${placeId}`);
      });
      objectKeys(layout.labels).forEach((placeId) => {
        if (!mapPlaceIds.has(placeId)) reporter.error("map.label-unknown-place", `${base}.dailyLayouts.${dayKey}.labels.${placeId}`, `Unknown map place: ${placeId}`);
      });
      const scheduleLength = dayByNumber.get(day)?.schedule?.length || 0;
      const stableItems = new Set((dayByNumber.get(day)?.schedule || []).map((item) => item.id).filter(Boolean));
      (layout.transport || []).forEach((pin, pinIndex) => {
        (pin.itemIds || []).forEach((itemId, itemOffset) => {
          if (!stableItems.has(itemId)) reporter.error("map.transport-item-reference", `${base}.dailyLayouts.${dayKey}.transport[${pinIndex}].itemIds[${itemOffset}]`, `Unknown schedule item: ${itemId}`);
        });
        (pin.items || []).forEach((itemIndex, itemOffset) => {
          sawLegacyItemIndexes = true;
          if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= scheduleLength) {
            reporter.error("map.transport-item-index", `${base}.dailyLayouts.${dayKey}.transport[${pinIndex}].items[${itemOffset}]`, `Schedule index ${itemIndex} is outside day ${day}'s ${scheduleLength} items.`);
          }
        });
      });
      if (layout.viewport != null) {
        const viewport = validViewport(layout.viewport, { width: Number(canvas.width), height: Number(canvas.height) });
        if (!viewport) reporter.error("map.daily-viewport", `${base}.dailyLayouts.${dayKey}.viewport`, "Viewport must be positive and contained by the map canvas.");
        else {
          const points = [
            ...(layout.places || []).map((placeId) => mapPoints.get(placeId)).filter(Boolean),
            ...(layout.transport || []).map((pin) => ({ x: Number(pin.x), y: Number(pin.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
          ];
          points.forEach((point) => {
            if (!pointInsideViewport(point, viewport)) reporter.error("map.viewport-misses-point", `${base}.dailyLayouts.${dayKey}.viewport`, "Daily viewport does not contain every visible place/transport point.");
          });
        }
      } else if (modernRegion && Object.prototype.hasOwnProperty.call(region.dailyLayouts || {}, dayKey)) {
        reporter.error("map.daily-viewport-missing", `${base}.dailyLayouts.${dayKey}`, "Generated daily layout must include its deterministic viewport.");
      }
    }
    for (const day of region.days || []) {
      const knownPlaceIds = new Set((dayByNumber.get(day)?.schedule || []).flatMap((item) => [item.placeId, ...(item.placeIds || [])]).filter(Boolean));
      const routePlaces = routePlacesByDay.get(day) || new Set();
      knownPlaceIds.forEach((placeId) => {
        if (mapPlaceIds.has(placeId) && !routePlaces.has(placeId)) reporter.error("map.day-place-uncovered", `${base}.routes`, `Day ${day} route does not cover known place ${placeId}.`);
      });
    }
    if (nonEmptyArray(region.layoutWarnings)) {
      reporter.warn("map.label-layout-risk", `${base}.layoutWarnings`, `${region.layoutWarnings.length} label(s) need visual review or a trip-owned layout override.`);
    }
  }
  const defaultRegion = data.routeMap?.defaultRegionId;
  if (defaultRegion && !regionIds.has(defaultRegion)) reporter.error("map.default-region", "routeMap.defaultRegionId", `Unknown default region: ${defaultRegion}`);
  if (requireCoverage) {
    for (const countryCode of data.trip?.primaryDestinationCountries || []) {
      if (!countryCodes.has(countryCode)) reporter.error("map.destination-uncovered", "trip.primaryDestinationCountries", `No map region covers ${countryCode}.`);
    }
    for (const day of dayNumbers) {
      if (!mappedDays.has(day)) reporter.warn("map.day-uncovered", "routeMap.regions[].days", `Day ${day} is not covered by any region map.`);
    }
  }
  if (sawLegacyRoutePaths) reporter.warn("map.legacy-route-paths", "routeMap.regions[].routes", "Legacy authored SVG paths cannot prove place coverage; generated routes should use stable placeIds.");
  if (sawLegacyItemIndexes) reporter.warn("map.legacy-item-index", "routeMap.regions[].dailyLayouts", "Legacy schedule indexes are fragile; generate stable itemIds instead.");
}

function validateTravelData(data, config, root, reporter) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  if (!Array.isArray(data.days)) reporter.error("data.days", "travel-data.json.days", "Expected an array.");
  if (data.entities && typeof data.entities === "object") validateCanonical(data, root, reporter, config);
  else validateRendererData(data, root, reporter, config);
  validateModuleData(config, data, reporter);
}

function validateSourceFacts(source, sourcePath, root, config, reporter) {
  if (!source) return;
  if (path.resolve(sourcePath).startsWith(`${root}${path.sep}`) || path.resolve(sourcePath) === root) {
    reporter.error("privacy.source-inside-publish-root", sourcePath, "Private source-facts must stay outside the publishable template directory.");
  }
  const documents = new Set();
  (source.sourceDocuments || []).forEach((document, index) => {
    validateId(document.id, "document", `sourceDocuments[${index}].id`, reporter);
    if (documents.has(document.id)) reporter.error("id.duplicate-document", `sourceDocuments[${index}].id`, `Duplicate document ID: ${document.id}`);
    documents.add(document.id);
    if (document.privatePath) {
      const resolvedDocument = path.resolve(path.dirname(sourcePath), document.privatePath);
      if (resolvedDocument === root || resolvedDocument.startsWith(`${root}${path.sep}`)) {
        reporter.error("privacy.source-document-inside-publish-root", `sourceDocuments[${index}].privatePath`, "Raw private documents must stay outside the publishable template directory.");
      }
    }
  });
  walkObject(source, (key, value, location) => {
    if (key !== "sourceRefs" || !Array.isArray(value)) return;
    value.forEach((reference, index) => {
      if (reference?.kind === "document") expectReference(reference.documentId, documents, `${location}[${index}].documentId`, "source document", reporter);
    });
  });
  const facts = source.facts || {};
  const factIds = {
    place: new Set(objectKeys(facts.places)),
    flight: new Set(objectKeys(facts.flights)),
    ticket: new Set(objectKeys(facts.tickets)),
    transport: new Set(objectKeys(facts.transport))
  };
  const issues = source.issues || {};
  const issueIds = new Set(objectKeys(issues));
  issueIds.forEach((id) => validateId(id, "issue", `issues.${id}`, reporter));
  Object.entries(factIds).forEach(([kind, ids]) => ids.forEach((id) => validateId(id, kind, `facts.${kind}.${id}`, reporter)));
  objectEntries(facts.flights).forEach(([id, flight]) => {
    if (flight.status !== "missing") return;
    if (!String(flight.title || "").trim() || !nonEmptyArray(flight.missingFields) || !nonEmptyArray(flight.issueIds)) {
      reporter.error("flight.invalid-placeholder", `facts.flights.${id}`, "Missing flight facts require title, missingFields, and issueIds.");
    }
    expectReferences(flight.issueIds, issueIds, `facts.flights.${id}.issueIds`, "issue", reporter);
  });
  objectEntries(facts.transport).forEach(([id, transport]) => {
    expectReference(transport.fromPlaceId, factIds.place, `facts.transport.${id}.fromPlaceId`, "place", reporter, true);
    expectReference(transport.toPlaceId, factIds.place, `facts.transport.${id}.toPlaceId`, "place", reporter, true);
    expectReferences(transport.viaPlaceIds, factIds.place, `facts.transport.${id}.viaPlaceIds`, "place", reporter);
  });
  objectEntries(facts.tickets).forEach(([id, ticket]) => {
    expectReferences(ticket.placeIds, factIds.place, `facts.tickets.${id}.placeIds`, "place", reporter);
    expectReferences(ticket.transportIds, factIds.transport, `facts.tickets.${id}.transportIds`, "transport", reporter);
  });
  const dayIds = new Set();
  const itemIds = new Set();
  const sequences = [];
  (facts.days || []).forEach((day, dayIndex) => {
    validateId(day.id, "day", `facts.days[${dayIndex}].id`, reporter);
    if (dayIds.has(day.id)) reporter.error("id.duplicate-day", `facts.days[${dayIndex}].id`, `Duplicate day ID: ${day.id}`);
    dayIds.add(day.id);
    sequences.push(day.sequence);
    (day.items || []).forEach((item, itemIndex) => {
      const base = `facts.days[${dayIndex}].items[${itemIndex}]`;
      validateId(item.id, "item", `${base}.id`, reporter);
      if (itemIds.has(item.id)) reporter.error("id.duplicate-item", `${base}.id`, `Duplicate item ID: ${item.id}`);
      itemIds.add(item.id);
      expectReference(item.placeId, factIds.place, `${base}.placeId`, "place", reporter, true);
      expectReferences(item.placeIds, factIds.place, `${base}.placeIds`, "place", reporter);
      expectReference(item.flightId, factIds.flight, `${base}.flightId`, "flight", reporter, true);
      expectReferences(item.ticketIds, factIds.ticket, `${base}.ticketIds`, "ticket", reporter);
      expectReference(item.transportId, factIds.transport, `${base}.transportId`, "transport", reporter, true);
    });
  });
  uniqueValues(sequences, "facts.days[].sequence", "day.duplicate-sequence", reporter);
  const moduleConfirmation = source.confirmations?.moduleSelection;
  if (moduleConfirmation?.status !== "confirmed") reporter.error("confirmation.modules-pending", "confirmations.moduleSelection", "Round 1 module selection must be confirmed before generation.");
  if (moduleConfirmation?.status === "confirmed") {
    MODULE_NAMES.forEach((name) => {
      if (moduleConfirmation.selection?.[name] !== config?.modules?.[name]) {
        reporter.error("confirmation.module-mismatch", `confirmations.moduleSelection.selection.${name}`, "Confirmed module selection does not match trip-config.json.");
      }
    });
  }
  const materialConfirmation = source.confirmations?.missingMaterials;
  if (materialConfirmation?.status !== "confirmed") reporter.error("confirmation.materials-pending", "confirmations.missingMaterials", "Round 2 missing-material decision must be confirmed before generation.");
  for (const [index, id] of (materialConfirmation?.issueIds || []).entries()) {
    expectReference(id, issueIds, `confirmations.missingMaterials.issueIds[${index}]`, "issue", reporter);
  }
  if (materialConfirmation?.decision === "supplement") {
    objectEntries(issues).forEach(([id, issue]) => {
      if (issue.kind === "missing-material" && issue.status === "open") reporter.error("confirmation.material-still-open", `issues.${id}`, "Supplement was selected but this material is still open.");
    });
  }
  if (materialConfirmation?.decision === "preview") {
    objectEntries(issues).forEach(([id, issue]) => {
      if (issue.kind === "missing-material" && !new Set(["accepted-for-preview", "resolved"]).has(issue.status)) {
        reporter.error("confirmation.preview-not-accepted", `issues.${id}`, "Preview-selected missing material must be accepted-for-preview or resolved.");
      }
    });
  }
}

function walkObject(value, visit, location = "$") {
  if (Array.isArray(value)) value.forEach((child, index) => walkObject(child, visit, `${location}[${index}]`));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child, `${location}.${key}`);
      walkObject(child, visit, `${location}.${key}`);
    }
  }
}

async function collectFiles(directory, relative = "") {
  const result = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    if (new Set([".git", "node_modules", ".DS_Store"]).has(entry.name)) continue;
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await collectFiles(directory, rel));
    else if (entry.isFile()) result.push(rel);
  }
  return result.sort((a, b) => a.localeCompare(b, "en"));
}

async function validatePrivacy(root, config, data, profile, reporter) {
  walkObject(config, (key, _value, location) => {
    if (DEPLOYMENT_ID_KEYS.test(key)) reporter.error("privacy.deployment-identity", `trip-config.json${location.slice(1)}`, `Forbidden deployment or credential field: ${key}`);
  });
  const publicEdition = profile === "publish" || data?.metadata?.publicEdition === true || data?.publication?.visibility === "public";
  if (publicEdition) {
    walkObject(data, (key, value, location) => {
      if (DEPLOYMENT_ID_KEYS.test(key)) reporter.error("privacy.deployment-identity", `travel-data.json${location.slice(1)}`, `Forbidden deployment or credential field: ${key}`);
      if (PRIVATE_DATA_KEYS.test(key) && value != null && value !== "" && value !== "REDACTED") {
        reporter.error("privacy.private-field", `travel-data.json${location.slice(1)}`, `Public data contains a populated sensitive field: ${key}`);
      }
      if (typeof value === "string" && (/^(?:file:\/\/|\/(?:Users|home|private|var\/folders|tmp)\/)/i.test(value) || /^[A-Z]:\\/i.test(value))) {
        reporter.error("privacy.absolute-local-path", `travel-data.json${location.slice(1)}`, "Publishable data must not contain a local absolute path.");
      }
    });
  }
  const approvedTicketAssets = new Set();
  const ticketDocuments = [
    ...(data?.ticketPlanning?.items || []).map((ticket) => ({ id: ticket.id, document: ticket.document || ticket.booking?.document })),
    ...objectEntries(data?.entities?.tickets).map(([id, ticket]) => ({ id, document: ticket.booking?.document || ticket.document }))
  ];
  for (const { id, document } of ticketDocuments) {
    if (!document || typeof document !== "object") continue;
    const raw = String(document.url || document.path || "").trim().replace(/\\/g, "/");
    if (!raw) continue;
    if (raw.startsWith("/") || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      reporter.error("privacy.ticket-document-location", `ticket.${id}.document`, "Ticket documents must use a repository-relative assets/tickets path; use officialUrl for external pages.");
      continue;
    }
    const normalized = path.posix.normalize(raw.split(/[?#]/)[0]);
    if (!normalized.startsWith("assets/tickets/") || normalized.includes("../")) {
      reporter.error("privacy.ticket-document-location", `ticket.${id}.document`, "Ticket documents must stay under assets/tickets/.");
      continue;
    }
    if (document.publishApproved !== true) {
      const report = profile === "publish" ? reporter.error : reporter.warn;
      report("privacy.ticket-not-approved", `ticket.${id}.document`, "Set publishApproved=true only after the user explicitly authorizes this local ticket asset.");
      continue;
    }
    approvedTicketAssets.add(normalized);
  }
  const files = await collectFiles(root);
  for (const relative of approvedTicketAssets) {
    if (!files.includes(relative)) reporter.error("privacy.ticket-asset-missing", relative, "Approved Ticket document is referenced but missing.");
  }
  for (const relative of files) {
    const basename = path.basename(relative);
    const extension = path.extname(relative).toLowerCase();
    if (/^(?:\.env(?:\..+)?|\.dev\.vars)$/i.test(basename) || new Set([".pem", ".key", ".p12", ".pfx"]).has(extension)) {
      reporter.error("privacy.secret-file", relative, "Secret-bearing files must not be inside the publishable template.");
    }
    const normalized = relative.split(path.sep).join("/");
    const controlledTicketAsset = /^assets\/tickets\/.*\.(?:pdf|png|jpe?g|webp|gif|svg)$/i.test(normalized);
    if (controlledTicketAsset && !approvedTicketAssets.has(normalized)) {
      const report = profile === "publish" ? reporter.error : reporter.warn;
      report("privacy.unreferenced-ticket-asset", relative, "Ticket assets must be explicitly referenced with publishApproved=true.");
    } else if (SOURCE_ARTIFACT_EXTENSIONS.has(extension) && !controlledTicketAsset) {
      const report = profile === "publish" ? reporter.error : reporter.warn;
      report("privacy.source-artifact", relative, "Raw source/order documents should remain outside the publishable template.");
    }
    if (/^(?:wrangler\.(?:toml|jsonc?)|\.dev\.vars)$/i.test(basename)) {
      const content = await readFile(path.join(root, relative), "utf8");
      const concreteIdentity = /(?:database_id|account_id|api_token)\s*[:=]\s*["']?(?!\$\{|replace|your-|<)[a-z0-9_-]{12,}/i;
      if (concreteIdentity.test(content)) reporter.error("privacy.bound-cloudflare-identity", relative, "Concrete Cloudflare/D1 identity detected; keep only user-owned environment configuration instructions.");
    }
  }
}

function isTripOwnedOutput(relative) {
  const normalized = relative.split(path.sep).join("/");
  if (new Set(["travel-data.json", "trip-config.json", "schemas/core-integrity.json"]).has(normalized)) return true;
  if (normalized.startsWith("reports/")) return true;
  if (/^assets\/maps\/[a-z]{2}-base\.svg$/i.test(normalized)) return true;
  if (/^assets\/maps\/[a-z]{2}-region\.json$/i.test(normalized)) return true;
  if (/^assets\/tickets\/.*\.(?:png|jpe?g|webp|gif|svg|pdf)$/i.test(normalized)) return true;
  return false;
}

async function listCoreFiles(root) {
  return (await collectFiles(root)).filter((relative) => !isTripOwnedOutput(relative));
}

async function hashFile(filePath) {
  const buffer = await readFile(filePath);
  return { sha256: createHash("sha256").update(buffer).digest("hex"), bytes: buffer.byteLength };
}

async function makeManifest(root) {
  const files = {};
  for (const relative of await listCoreFiles(root)) files[relative] = await hashFile(path.join(root, relative));
  return { schemaVersion: "1.0.0", algorithm: "sha256", files };
}

async function validateIntegrity(root, manifestPath, reporter) {
  if (!existsSync(manifestPath)) {
    reporter.error("integrity.manifest-missing", path.relative(root, manifestPath), "Run `node scripts/validate-generation.mjs freeze` after approved generic-capability changes.");
    return;
  }
  const manifest = await loadJson(manifestPath, path.relative(root, manifestPath), reporter);
  if (!manifest) return;
  const currentFiles = await listCoreFiles(root);
  const expectedFiles = objectKeys(manifest.files).sort((a, b) => a.localeCompare(b, "en"));
  currentFiles.filter((file) => !expectedFiles.includes(file)).forEach((file) => reporter.error("integrity.untracked-core", file, "Generic capability file is not frozen in the manifest."));
  expectedFiles.filter((file) => !currentFiles.includes(file)).forEach((file) => reporter.error("integrity.missing-core", file, "Frozen generic capability file is missing."));
  for (const file of expectedFiles.filter((candidate) => currentFiles.includes(candidate))) {
    const actual = await hashFile(path.join(root, file));
    const expected = manifest.files[file];
    if (actual.sha256 !== expected?.sha256 || actual.bytes !== expected?.bytes) reporter.error("integrity.core-modified", file, "Frozen generic capability file changed during trip generation.");
  }
}

function resolveFromRoot(root, target) {
  return path.isAbsolute(target) ? target : path.resolve(root, target);
}

async function runChecks(options, skipIntegrity = options.skipIntegrity) {
  const reporter = createReporter();
  const configPath = resolveFromRoot(options.root, options.config);
  const dataPath = resolveFromRoot(options.root, options.data);
  const manifestPath = resolveFromRoot(options.root, options.manifest);
  const [config, data, configSchema, dataSchema, sourceSchema] = await Promise.all([
    loadJson(configPath, options.config, reporter),
    loadJson(dataPath, options.data, reporter),
    loadJson(path.join(DEFAULT_ROOT, "schemas/trip-config.schema.json"), "schemas/trip-config.schema.json", reporter),
    loadJson(path.join(DEFAULT_ROOT, "schemas/travel-data.schema.json"), "schemas/travel-data.schema.json", reporter),
    loadJson(path.join(DEFAULT_ROOT, "schemas/source-facts.schema.json"), "schemas/source-facts.schema.json", reporter)
  ]);
  validateJsonSchema(config, configSchema, options.config, reporter);
  validateJsonSchema(data, dataSchema, options.data, reporter);
  validateConfig(config, reporter);
  validateTravelData(data, config, options.root, reporter);
  if (options.source) {
    const sourcePath = resolveFromRoot(options.root, options.source);
    const source = await loadJson(sourcePath, options.source, reporter);
    validateJsonSchema(source, sourceSchema, options.source, reporter);
    validateSourceFacts(source, sourcePath, options.root, config, reporter);
  }
  await validatePrivacy(options.root, config, data, options.profile, reporter);
  if (!skipIntegrity) await validateIntegrity(options.root, manifestPath, reporter);
  reporter.diagnostics.sort((a, b) => `${a.severity}\0${a.code}\0${a.path}\0${a.message}`.localeCompare(`${b.severity}\0${b.code}\0${b.path}\0${b.message}`, "en"));
  return reporter.diagnostics;
}

function makeResult(command, diagnostics, extra = {}) {
  const errors = diagnostics.filter((item) => item.severity === "error").length;
  const warnings = diagnostics.filter((item) => item.severity === "warning").length;
  return { ok: errors === 0, command, errors, warnings, diagnostics, ...extra };
}

function printResult(result, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  result.diagnostics.forEach((item) => process.stdout.write(`${item.severity.toUpperCase()} ${item.code} ${item.path}: ${item.message}\n`));
  if (result.command === "freeze" && result.manifest) process.stdout.write(`Frozen generic-capability manifest: ${result.manifest}\n`);
  process.stdout.write(`${result.ok ? "PASS" : "FAIL"}: ${result.errors} error(s), ${result.warnings} warning(s)\n`);
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
  if (options.command === "help") {
    process.stdout.write(usage());
    return;
  }
  if (!existsSync(options.root)) {
    process.stderr.write(`Root does not exist: ${options.root}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.command === "freeze") {
    const diagnostics = await runChecks(options, true);
    const preflight = makeResult("freeze", diagnostics);
    if (!preflight.ok) {
      printResult(preflight, options.json);
      process.exitCode = 1;
      return;
    }
    const manifestPath = resolveFromRoot(options.root, options.manifest);
    const manifest = await makeManifest(options.root);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const result = makeResult("freeze", diagnostics, { manifest: path.relative(options.root, manifestPath), files: objectKeys(manifest.files).length });
    printResult(result, options.json);
    return;
  }
  const result = makeResult("check", await runChecks(options));
  printResult(result, options.json);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 2;
});
