#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MODULE_NAMES = ["flights", "overview", "itinerary", "tickets", "todo", "driving", "ledger"];

function usage() {
  return `Compile canonical trip facts into the renderer-compatible travel-data.json.

Usage:
  node scripts/compile-travel-data.mjs \\
    --input <canonical-travel-data.json> \\
    --config <trip-config.json> \\
    --out <site/travel-data.json> \\
    [--region <generated-region.json> ...]

Options:
  --region <file>    Map region produced by generate-map-package.mjs; repeat per country
  --public-edition   Mark the output as a publishable, intentionally public fixture
  --json             Print result metadata as JSON
  --help             Show this help

The compiler never reads the bundled Demo travel-data.json and never copies source documents.
`;
}

function parseArgs(argv) {
  const options = { input: null, config: null, out: null, regions: [], publicEdition: false, json: false };
  const args = [...argv];
  while (args.length) {
    const key = args.shift();
    if (key === "--json") options.json = true;
    else if (key === "--public-edition") options.publicEdition = true;
    else if (key === "--help") options.help = true;
    else if (key === "--region") {
      if (!args.length) throw new Error("--region requires a value");
      options.regions.push(path.resolve(args.shift()));
    } else if (["--input", "--config", "--out"].includes(key)) {
      if (!args.length) throw new Error(`${key} requires a value`);
      options[key.slice(2)] = path.resolve(args.shift());
    } else throw new Error(`Unknown option: ${key}`);
  }
  if (options.help) return options;
  for (const key of ["input", "config", "out"]) if (!options[key]) throw new Error(`--${key} is required`);
  return options;
}

async function readJson(filePath) {
  if (!existsSync(filePath)) throw new Error(`File does not exist: ${filePath}`);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`);
  }
}

function entries(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
}

function values(value) {
  return entries(value).map(([, item]) => item);
}

function objectKeys(value) {
  return entries(value).map(([key]) => key);
}

function unique(valuesToFilter) {
  return [...new Set(valuesToFilter.filter(Boolean))];
}

function requireCanonical(data) {
  if (!data || typeof data !== "object" || !data.trip || !data.entities || !Array.isArray(data.days)) {
    throw new Error("Canonical input must contain trip, entities, and days");
  }
  if (!data.entities.places || typeof data.entities.places !== "object" || Array.isArray(data.entities.places)) {
    throw new Error("Canonical input must contain entities.places keyed by stable IDs");
  }
}

function validateConfig(config) {
  if (!config?.modules || !config?.persistence) throw new Error("Config must contain modules and persistence");
  for (const name of MODULE_NAMES) if (typeof config.modules[name] !== "boolean") throw new Error(`Config module ${name} must be boolean`);
  if (!new Set(["local", "d1"]).has(config.persistence.mode)) throw new Error("Config persistence.mode must be local or d1");
  if (config.persistence.mode === "d1") {
    if (!Array.isArray(config.persistence.sharedCollections) || !config.persistence.sharedCollections.length) {
      throw new Error("D1 mode requires an explicit sharedCollections allowlist");
    }
    if (config.persistence.apiBase != null && !/^\/(?!\/)[^\\?#]+$/.test(config.persistence.apiBase)) {
      throw new Error("D1 apiBase must be a same-origin absolute path");
    }
  }
  if (config.modules.tickets && !config.modules.itinerary) throw new Error("tickets requires itinerary");
}

function placeName(place, language) {
  return place?.localizedNames?.[language] || place?.name || "";
}

function countryDisplay(trip, code) {
  const raw = trip.countryNames?.[code]
    || (Array.isArray(trip.countries) ? trip.countries.find((country) => country.code === code) : null);
  if (typeof raw === "string") return { code, nameZh: raw, nameEn: raw };
  return {
    code,
    nameZh: raw?.nameZh || raw?.localizedName || raw?.name || code,
    nameEn: raw?.nameEn || raw?.name || raw?.nameZh || code
  };
}

function placeFor(id, entities, required = true) {
  const place = id ? entities.places?.[id] : null;
  if (!place && required) throw new Error(`Unknown place reference: ${String(id)}`);
  return place || null;
}

function offsetAtInstant(timeZone, instant) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(instant).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return represented - instant.getTime();
}

function utcOffsetFor(localDate, localTime, timeZone) {
  if (!localDate || !localTime || !timeZone) return "+00:00";
  try {
    const [year, month, day] = localDate.split("-").map(Number);
    const [hour, minute, second = 0] = localTime.split(":").map(Number);
    const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    let offset = offsetAtInstant(timeZone, new Date(wallClockUtc));
    offset = offsetAtInstant(timeZone, new Date(wallClockUtc - offset));
    const sign = offset < 0 ? "-" : "+";
    const absoluteMinutes = Math.round(Math.abs(offset) / 60000);
    return `${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, "0")}:${String(absoluteMinutes % 60).padStart(2, "0")}`;
  } catch {
    return "+00:00";
  }
}

function endpointFor(endpoint, entities, language) {
  const place = placeFor(endpoint?.placeId, entities);
  return {
    placeId: endpoint.placeId,
    airportCode: place.codes?.iata || place.codes?.airport || place.codes?.station || "—",
    name: placeName(place, language),
    city: place.city || place.area || placeName(place, language),
    country: place.countryCode || "",
    date: endpoint.localDate,
    time: endpoint.localTime,
    terminal: endpoint.terminal || "",
    timeZone: endpoint.timeZone,
    utcOffset: endpoint.utcOffset || utcOffsetFor(endpoint.localDate, endpoint.localTime, endpoint.timeZone)
  };
}

function compileFlights(data) {
  const { entities, trip } = data;
  const compiledFlights = entries(entities.flights).map(([id, flight]) => {
    if (flight.status === "missing") {
      if (!String(flight.title || "").trim() || !Array.isArray(flight.missingFields) || !flight.missingFields.length || !Array.isArray(flight.issueIds) || !flight.issueIds.length) {
        throw new Error(`Missing flight ${id} requires title, missingFields, and issueIds`);
      }
      return {
        id,
        journeyId: null,
        sequence: 1,
        status: "missing",
        placeholder: true,
        title: flight.title,
        missingFields: unique(flight.missingFields),
        issueIds: unique(flight.issueIds)
      };
    }
    const carrier = entities.carriers?.[flight.carrierId];
    if (!carrier) throw new Error(`Unknown carrier reference: ${flight.carrierId}`);
    return {
      id,
      journeyId: null,
      sequence: 1,
      airline: { name: carrier.name, nameZh: carrier.localizedNames?.[trip.language] || carrier.name },
      flightNumber: flight.flightNumber,
      departure: endpointFor(flight.departure, entities, trip.language),
      arrival: endpointFor(flight.arrival, entities, trip.language),
      connectionFromPrevious: flight.connectionFromPrevious
    };
  });
  const byId = new Map(compiledFlights.map((flight) => [flight.id, flight]));
  const groups = entries(entities.flightGroups);
  const used = new Set();
  const journeys = [];
  for (const [groupId, group] of groups) {
    const flightIds = group.flightIds || [];
    flightIds.forEach((flightId, index) => {
      const flight = byId.get(flightId);
      if (!flight) throw new Error(`Unknown flight reference: ${flightId}`);
      if (used.has(flightId)) throw new Error(`Flight appears in multiple groups: ${flightId}`);
      used.add(flightId);
      flight.journeyId = groupId;
      flight.sequence = index + 1;
    });
    const first = byId.get(flightIds[0]);
    const last = byId.get(flightIds.at(-1));
    const missingFlights = flightIds.map((flightId) => byId.get(flightId)).filter((flight) => flight.placeholder);
    if (missingFlights.length) {
      journeys.push({
        id: groupId,
        status: "missing",
        placeholder: true,
        title: group.title || missingFlights[0].title,
        bookingStatus: group.bookingStatus || "",
        missingFields: unique(missingFlights.flatMap((flight) => flight.missingFields)),
        issueIds: unique(missingFlights.flatMap((flight) => flight.issueIds))
      });
    } else {
      journeys.push({
        id: groupId,
        status: "confirmed",
        route: group.title || (first && last ? `${first.departure.city} → ${last.arrival.city}` : groupId),
        bookingStatus: group.bookingStatus || ""
      });
    }
  }
  compiledFlights.filter((flight) => !used.has(flight.id)).forEach((flight) => {
    const journeyId = `journey-${flight.id.replace(/^flight-/, "")}`;
    flight.journeyId = journeyId;
    if (flight.placeholder) {
      journeys.push({
        id: journeyId,
        status: "missing",
        placeholder: true,
        title: flight.title,
        bookingStatus: "",
        missingFields: flight.missingFields,
        issueIds: flight.issueIds
      });
    } else {
      journeys.push({ id: journeyId, status: "confirmed", route: `${flight.departure.city} → ${flight.arrival.city}`, bookingStatus: "" });
    }
  });
  return { flights: compiledFlights, journeys };
}

function itemPlaceIds(item, entities, modules) {
  const result = [];
  const push = (id) => { if (id && result.at(-1) !== id) result.push(id); };
  push(item.placeId);
  (item.placeIds || []).forEach(push);
  if (item.transportId) {
    const transport = entities.transport?.[item.transportId];
    if (!transport) throw new Error(`Unknown transport reference: ${item.transportId}`);
    push(transport.fromPlaceId);
    (transport.viaPlaceIds || []).forEach(push);
    push(transport.toPlaceId);
  }
  if (item.flightId && modules.flights) {
    const flight = entities.flights?.[item.flightId];
    if (!flight) throw new Error(`Unknown flight reference: ${item.flightId}`);
    push(flight.departure?.placeId);
    push(flight.arrival?.placeId);
  }
  if (item.stayId) push(entities.stays?.[item.stayId]?.placeId);
  if (item.restaurantId) push(entities.restaurants?.[item.restaurantId]?.placeId);
  if (item.rentalId && modules.driving) {
    const rental = entities.rentals?.[item.rentalId];
    push(rental?.pickup?.placeId);
    push(rental?.dropoff?.placeId);
  }
  result.forEach((id) => placeFor(id, entities));
  return result;
}

function itemTime(item, entities) {
  if (typeof item.time === "string") return item.time;
  if (item.time?.kind === "local") return item.time.localTime;
  if (item.time?.kind === "label") return item.time.label;
  if (item.time?.kind === "entity-event") {
    const event = item.time.event;
    if (item.flightId) return entities.flights?.[item.flightId]?.status === "missing" ? "待定" : entities.flights?.[item.flightId]?.[event]?.localTime || event;
    if (item.stayId) return entities.stays?.[item.stayId]?.[event === "check-in" ? "checkIn" : "checkOut"]?.localTime || event;
    if (item.rentalId) return entities.rentals?.[item.rentalId]?.[event === "pickup" ? "pickup" : "dropoff"]?.localTime || event;
  }
  return "待定";
}

function compileDays(data, config) {
  const includeItems = config.modules.itinerary || config.modules.overview;
  return data.days.slice().sort((first, second) => first.sequence - second.sequence).map((day) => {
    const schedule = includeItems ? (day.items || []).map((item) => {
      const placeIds = itemPlaceIds(item, data.entities, config.modules);
      return {
        id: item.id,
        time: itemTime(item, data.entities),
        type: item.type,
        text: item.text || item.title,
        title: item.title,
        ...(placeIds.length === 1 ? { placeId: placeIds[0] } : placeIds.length ? { placeIds } : {}),
        ...(item.flightId && config.modules.flights ? { refId: item.flightId, flightId: item.flightId } : {}),
        ...(item.stayId ? { stayId: item.stayId } : {}),
        ...(item.transportId ? { transportId: item.transportId } : {}),
        ...(item.ticketIds?.length && config.modules.tickets ? { ticketIds: item.ticketIds } : {}),
        ...(item.note ? { note: item.note } : {})
      };
    }) : [];
    const locations = unique(schedule.flatMap((item) => [item.placeId, ...(item.placeIds || [])]))
      .map((placeId) => placeName(placeFor(placeId, data.entities), data.trip.language));
    return {
      id: day.id,
      day: day.sequence,
      date: day.date,
      title: day.title,
      locations,
      ...(day.stayId ? { stayId: day.stayId } : {}),
      schedule,
      costReferences: [],
      notes: day.notes || []
    };
  });
}

function compileTickets(data, days) {
  const itemLocations = new Map();
  for (const day of data.days) for (const item of day.items || []) itemLocations.set(item.id, { day, item });
  return entries(data.entities.tickets).map(([id, ticket]) => {
    const linked = [];
    for (const day of data.days) for (const item of day.items || []) if ((item.ticketIds || []).includes(id)) linked.push({ day, item });
    const first = linked[0];
    const guidanceValue = Array.isArray(ticket.guidance) ? ticket.guidance.join(" · ") : ticket.guidance || (ticket.notes || []).join(" · ");
    const materialStatus = ticket.materialStatus || (ticket.booking?.document ? "provided" : "missing");
    const guidance = guidanceValue || (materialStatus === "missing" ? "票据待补充" : "");
    const document = approvedTicketDocument(ticket.booking?.document);
    const officialUrl = safeHttpUrl(ticket.booking?.officialUrl || ticket.booking?.purchaseUrl || ticket.officialUrl);
    return {
      id,
      ...(first ? { day: first.day.sequence, dayId: first.day.id, date: first.day.date } : {}),
      name: ticket.name,
      attraction: { name: ticket.name, nameZh: ticket.localizedNames?.[data.trip.language] || ticket.name },
      purchaseStatus: ticket.initialStatus === "booked" ? "purchased" : "pending",
      requirement: ticket.requirement || "advance-required",
      scheduleItemIds: linked.map(({ item }) => item.id),
      placeIds: ticket.placeIds || [],
      transportIds: ticket.transportIds || [],
      guidance,
      materialStatus: document ? "provided" : materialStatus === "not-required" ? "not-required" : "missing",
      ...(document ? { document } : {}),
      ...(officialUrl ? { officialUrl } : {})
    };
  });
}

function approvedTicketDocument(document) {
  if (!document || typeof document !== "object" || document.publishApproved !== true) return null;
  const raw = String(document.url || document.path || "").trim().replace(/\\/g, "/");
  if (!raw || raw.startsWith("/") || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    throw new Error("Approved Ticket document must use a repository-relative assets/tickets path");
  }
  const normalized = path.posix.normalize(raw.split(/[?#]/)[0]);
  if (!normalized.startsWith("assets/tickets/") || normalized.includes("../")) {
    throw new Error("Approved Ticket document must stay under assets/tickets/");
  }
  return {
    url: normalized,
    label: document.label || "查看票据",
    type: document.type || "",
    publishApproved: true
  };
}

function safeHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    return new Set(["http:", "https:"]).has(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function compilePlaces(data, placeIds) {
  return entries(data.entities.places).filter(([id]) => placeIds.has(id)).map(([id, place]) => ({
    id,
    name: place.name,
    nameZh: place.localizedNames?.[data.trip.language] || place.name,
    cityOrArea: place.city || place.area || place.countryCode || "",
    countryCode: place.countryCode,
    ...(place.geo ? { geo: place.geo } : {}),
    ...(place.address ? { address: place.address } : {}),
    ...(place.navigation ? { navigation: place.navigation } : {}),
    ...(place.navigation?.url ? { googleMapsUrl: place.navigation.url } : {}),
    category: place.category
  }));
}

function compileStays(data, stayIds) {
  return entries(data.entities.stays).filter(([id]) => stayIds.has(id)).map(([id, stay]) => {
    const place = placeFor(stay.placeId, data.entities);
    return {
      id,
      name: stay.name,
      city: place.city || placeName(place, data.trip.language),
      address: place.address || "",
      checkIn: stay.checkIn?.localDate || "",
      checkOut: stay.checkOut?.localDate || "",
      guestCount: stay.guestCount || data.trip.groupSize || 0
    };
  });
}

function localEvent(event, entities, language) {
  const place = placeFor(event?.placeId, entities);
  return {
    date: event.localDate,
    time: event.localTime,
    timeZoneLabel: event.timeZone,
    location: placeName(place, language),
    address: place.address || "",
    utcOffset: event.utcOffset || utcOffsetFor(event.localDate, event.localTime, event.timeZone)
  };
}

function dayDifference(first, second) {
  const start = new Date(`${first}T12:00:00Z`);
  const end = new Date(`${second}T12:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86400000));
}

function compileGroundTransport(data, { includeTransport, includeRental, transportIds, rentalIds }) {
  const visibleTransport = includeTransport ? entries(data.entities.transport).filter(([id]) => transportIds.has(id)) : [];
  const driveLegs = visibleTransport.filter(([, transport]) => transport.mode === "drive");
  const publicLegs = visibleTransport.filter(([, transport]) => transport.mode !== "drive");
  const base = {
    rentalChecklist: [],
    drivingNotes: [],
    drivingReferenceLinks: [],
    plannedRoadLegs: driveLegs.map(([id, transport]) => ({
      id,
      from: transport.fromPlaceId ? placeName(placeFor(transport.fromPlaceId, data.entities), data.trip.language) : "",
      to: transport.toPlaceId ? placeName(placeFor(transport.toPlaceId, data.entities), data.trip.language) : "",
      duration: transport.durationMinutes ? `${transport.durationMinutes} 分钟` : ""
    })),
    publicTransitAndRail: publicLegs.map(([id, transport]) => ({
      id,
      type: transport.mode,
      from: transport.fromPlaceId ? placeName(placeFor(transport.fromPlaceId, data.entities), data.trip.language) : "",
      to: transport.toPlaceId ? placeName(placeFor(transport.toPlaceId, data.entities), data.trip.language) : "",
      duration: transport.durationMinutes ? `${transport.durationMinutes} 分钟` : ""
    }))
  };
  const rentalEntry = entries(data.entities.rentals).find(([id]) => rentalIds.has(id));
  if (!includeRental || !rentalEntry) return base;
  const [, rental] = rentalEntry;
  const pickup = localEvent(rental.pickup, data.entities, data.trip.language);
  const dropoff = localEvent(rental.dropoff, data.entities, data.trip.language);
  const price = rental.price || {};
  const requirements = rental.requirements || [];
  base.rentalChecklist = requirements;
  base.drivingNotes = rental.notes || [];
  base.rentalCar = {
    company: rental.provider,
    rentalPeriodDays: Math.max(1, dayDifference(pickup.date, dropoff.date)),
    vehicle: {
      example: rental.vehicle?.model || rental.vehicle?.class || "按订单车型",
      class: rental.vehicle?.class || ""
    },
    unlimitedKilometers: rental.vehicle?.unlimitedKilometers === true,
    price: { currency: price.currency || data.trip.baseCurrency || "CNY", payAtCounter: Number(price.amountMinor || 0) / 100 },
    insurance: rental.insurance || [],
    pickup,
    dropoff: {
      ...dropoff,
      vehicleReturnPoint: dropoff.location,
      deadlineWarning: rental.deadlineWarning || "请按订单约定时间还车。",
      recommendedArrivalTime: rental.recommendedArrivalTime || dropoff.time
    }
  };
  return base;
}

function compilePreTrip(data) {
  const authored = entries(data.preTrip?.items).map(([id, item]) => ({ id, text: item.title, completed: false }));
  return {
    packingItems: authored,
    todoItems: authored,
    preparationsExplicitlyMentioned: [],
    missingNote: ""
  };
}

function compileRestaurants(data, restaurantIds) {
  return entries(data.entities.restaurants).filter(([id]) => restaurantIds.has(id)).map(([id, restaurant]) => {
    const place = placeFor(restaurant.placeId, data.entities);
    return {
      id,
      name: placeName(place, data.trip.language),
      city: place.city || place.area || "",
      reservationStatus: restaurant.status || "",
      specialty: (restaurant.specialties || []).join(" · "),
      googleMapsUrl: place.navigation?.url || place.navigation?.query || ""
    };
  });
}

function compileMapLinks(places) {
  return {
    providedGoogleMapsLinks: places.flatMap((place) => place.navigation?.url ? [place.navigation.url] : []),
    note: "地点按钮使用统一 placeId；页内地图仅供查看。",
    cityLevelNavigationDisabled: false,
    navigationPolicy: {
      noNavigationTypes: ["flight", "rest", "note"],
      selfNavigationTypes: ["attraction", "activity", "restaurant", "check-in", "pickup", "dropoff"]
    },
    navigationPlaces: places.map((place, index) => ({
      id: place.id,
      label: place.nameZh || place.name,
      query: place.navigation?.query || place.address || place.name,
      priority: 1,
      matchTerms: unique([place.name, place.nameZh])
    }))
  };
}

function collectVisibleReferences(data, config, regions) {
  const refs = Object.fromEntries(["place", "stay", "flight", "ticket", "transport", "rental", "restaurant", "issue", "visible"].map((name) => [name, new Set()]));
  const addMany = (set, ids) => (ids || []).forEach((id) => { if (id) set.add(id); });
  const addIssues = (entity) => addMany(refs.issue, entity?.issueIds);
  const showDayContent = config.modules.itinerary || config.modules.overview;

  if (showDayContent) {
    for (const day of data.days) {
      refs.visible.add(day.id);
      if (day.stayId) refs.stay.add(day.stayId);
      addIssues(day);
      for (const item of day.items || []) {
        refs.visible.add(item.id);
        if (item.placeId) refs.place.add(item.placeId);
        addMany(refs.place, item.placeIds);
        if (item.stayId) refs.stay.add(item.stayId);
        if (item.transportId) refs.transport.add(item.transportId);
        if (item.restaurantId) refs.restaurant.add(item.restaurantId);
        if (config.modules.flights && item.flightId) refs.flight.add(item.flightId);
        if (config.modules.tickets) addMany(refs.ticket, item.ticketIds);
        if (config.modules.driving && item.rentalId) refs.rental.add(item.rentalId);
        addIssues(item);
      }
    }
  }

  if (config.modules.flights) addMany(refs.flight, objectKeys(data.entities.flights));
  if (config.modules.tickets) addMany(refs.ticket, objectKeys(data.entities.tickets));
  if (config.modules.driving) addMany(refs.rental, objectKeys(data.entities.rentals));
  if (config.modules.overview) {
    for (const region of regions) {
      addMany(refs.place, (region.places || []).map((place) => place.placeId || place.id));
      for (const route of region.routes || []) addMany(refs.place, route.placeIds);
    }
  }

  for (const id of refs.flight) {
    const flight = data.entities.flights?.[id];
    if (!flight) continue;
    if (flight.departure?.placeId) refs.place.add(flight.departure.placeId);
    if (flight.arrival?.placeId) refs.place.add(flight.arrival.placeId);
    addIssues(flight);
    refs.visible.add(id);
  }
  for (const id of refs.ticket) {
    const ticket = data.entities.tickets?.[id];
    if (!ticket) continue;
    addMany(refs.place, ticket.placeIds);
    addMany(refs.transport, ticket.transportIds);
    addIssues(ticket);
    refs.visible.add(id);
  }
  for (const id of refs.transport) {
    const transport = data.entities.transport?.[id];
    if (!transport) continue;
    if (transport.fromPlaceId) refs.place.add(transport.fromPlaceId);
    if (transport.toPlaceId) refs.place.add(transport.toPlaceId);
    addMany(refs.place, transport.viaPlaceIds);
    if (config.modules.driving && transport.rentalId) refs.rental.add(transport.rentalId);
    addIssues(transport);
    refs.visible.add(id);
  }
  for (const id of refs.stay) {
    const stay = data.entities.stays?.[id];
    if (!stay) continue;
    if (stay.placeId) refs.place.add(stay.placeId);
    addIssues(stay);
    refs.visible.add(id);
  }
  for (const id of refs.rental) {
    const rental = data.entities.rentals?.[id];
    if (!rental) continue;
    if (rental.pickup?.placeId) refs.place.add(rental.pickup.placeId);
    if (rental.dropoff?.placeId) refs.place.add(rental.dropoff.placeId);
    addIssues(rental);
    refs.visible.add(id);
  }
  for (const id of refs.restaurant) {
    const restaurant = data.entities.restaurants?.[id];
    if (!restaurant) continue;
    if (restaurant.placeId) refs.place.add(restaurant.placeId);
    addIssues(restaurant);
    refs.visible.add(id);
  }
  refs.place.forEach((id) => refs.visible.add(id));
  for (const [id, issue] of entries(data.issues)) {
    if ((issue.relatedRefs || []).some((ref) => refs.visible.has(ref))) refs.issue.add(id);
  }
  return refs;
}

function validateEnabledModules(data, config, regions, tickets) {
  const checks = {
    flights: entries(data.entities.flights).length > 0,
    overview: regions.length > 0,
    itinerary: data.days.length > 0,
    tickets: entries(data.entities.tickets).length > 0,
    todo: entries(data.preTrip?.items).length > 0,
    driving: entries(data.entities.rentals).length > 0,
    ledger: true
  };
  for (const name of MODULE_NAMES) if (config.modules[name] && !checks[name]) throw new Error(`Enabled module ${name} has no required canonical data`);
  if (config.modules.tickets) {
    tickets.forEach((ticket) => {
      if (!ticket.scheduleItemIds.length) throw new Error(`Enabled Ticket is not linked to a day item: ${ticket.id}`);
    });
  }
  if (config.modules.overview) {
    const coveredCountries = new Set(regions.map((region) => region.countryCode));
    for (const code of data.trip.primaryDestinationCountries || []) if (!coveredCountries.has(code)) throw new Error(`No generated map region covers ${code}`);
  }
}

function compile(data, config, regions, options) {
  requireCanonical(data);
  validateConfig(config);
  const sortedDays = data.days.slice().sort((first, second) => first.sequence - second.sequence);
  if (!sortedDays.length) throw new Error("Canonical trip must contain at least one day");
  const sequenceSet = new Set();
  sortedDays.forEach((day) => {
    if (sequenceSet.has(day.sequence)) throw new Error(`Duplicate day sequence: ${day.sequence}`);
    sequenceSet.add(day.sequence);
  });
  const activeRegions = config.modules.overview ? regions : [];
  const visibleRefs = collectVisibleReferences(data, config, activeRegions);
  const compiledDays = compileDays(data, config);
  const compiledTickets = config.modules.tickets ? compileTickets(data, compiledDays) : [];
  validateEnabledModules(data, config, activeRegions, compiledTickets);
  const { flights, journeys } = config.modules.flights ? compileFlights(data) : { flights: [], journeys: [] };
  const places = compilePlaces(data, visibleRefs.place);
  const countryCodes = unique([
    ...(data.trip.primaryDestinationCountries || []),
    ...places.map((place) => place.countryCode)
  ]);
  const startDate = sortedDays[0].date;
  const endDate = sortedDays.at(-1).date;
  const countries = countryCodes.map((code) => countryDisplay(data.trip, code));
  return {
    schemaVersion: "1.0.0",
    metadata: {
      tripId: data.trip.id,
      title: data.trip.title,
      language: data.trip.language,
      timezonePolicy: "iana-per-event",
      assets: { routeMaps: activeRegions.map((region) => region.baseImage).filter(Boolean) },
      publicEdition: options.publicEdition,
      generatedFrom: options.publicEdition ? "canonical-public-fixture" : "canonical-private-source"
    },
    routeMap: {
      ...(activeRegions[0]?.id ? { defaultRegionId: activeRegions[0].id } : {}),
      regions: activeRegions
    },
    trip: {
      status: data.trip.status || "draft",
      startDate,
      endDate,
      dayCount: sortedDays.length,
      nightCountAway: dayDifference(startDate, endDate),
      countries,
      primaryDestinationCountries: data.trip.primaryDestinationCountries || [],
      citiesAndAreas: unique(places.filter((place) => new Set(["city", "town", "area"]).has(place.category)).map((place) => place.nameZh || place.name)),
      routeSummary: compiledDays.flatMap((day) => day.locations).filter((value, index, all) => index === 0 || value !== all[index - 1]).join(" → "),
      groupSize: data.trip.groupSize || 0,
      groupSizeStatus: data.trip.groupSize ? "confirmed" : "unknown"
    },
    flightJourneys: journeys,
    flights,
    accommodations: (config.modules.itinerary || config.modules.overview) ? compileStays(data, visibleRefs.stay) : [],
    groundTransport: compileGroundTransport(data, {
      includeTransport: config.modules.itinerary || config.modules.overview,
      includeRental: config.modules.driving,
      transportIds: visibleRefs.transport,
      rentalIds: visibleRefs.rental
    }),
    days: compiledDays,
    places,
    restaurants: config.modules.itinerary ? compileRestaurants(data, visibleRefs.restaurant) : [],
    bookingsAndTickets: compiledTickets.map((ticket) => ({ name: ticket.name, day: ticket.day, status: ticket.purchaseStatus })),
    ticketPlanning: { statusStorage: "runtime-adapter", statusStorageNote: "由 trip-config.json 决定本地或可选D1。", items: compiledTickets },
    preTrip: config.modules.todo ? compilePreTrip(data) : { packingItems: [], todoItems: [], preparationsExplicitlyMentioned: [], missingNote: "" },
    mapLinks: compileMapLinks(places),
    issuesAndUncertainties: entries(data.issues)
      .filter(([id]) => visibleRefs.issue.has(id))
      .map(([, issue]) => issue.title || issue.detail)
      .filter(Boolean)
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
  const [data, config, regions] = await Promise.all([
    readJson(options.input),
    readJson(options.config),
    Promise.all(options.regions.map(readJson))
  ]);
  const regionIds = regions.map((region) => region.id);
  if (new Set(regionIds).size !== regionIds.length) throw new Error("Map region IDs must be unique");
  const output = compile(data, config, regions, options);
  await mkdir(path.dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const result = {
    ok: true,
    output: options.out,
    days: output.days.length,
    places: output.places.length,
    flights: output.flights.length,
    tickets: output.ticketPlanning.items.length,
    regions: output.routeMap.regions.length
  };
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`Compiled renderer data: ${result.days} day(s), ${result.places} place(s), ${result.regions} region(s)\n${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
