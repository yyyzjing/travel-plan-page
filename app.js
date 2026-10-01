const state = {
  data: null,
  config: null,
  runtimeAdapters: {},
  expandedDay: null,
  countdownTimer: null,
  purchasedTickets: new Set(),
  todos: [],
  entryNotes: {}
};

const MODULE_NAMES = Object.freeze(["flights", "overview", "itinerary", "hotels", "todo", "driving", "ledger"]);
const SHARED_COLLECTIONS = Object.freeze(["todos", "tickets", "ledger"]);

function normalizeTripConfig(raw = {}) {
  if (!raw || typeof raw !== "object" || raw.schemaVersion !== "1.0.0") throw new Error("trip-data.json config.schemaVersion must be 1.0.0");
  if (!raw.modules || typeof raw.modules !== "object") throw new Error("trip-data.json config must contain confirmed module switches");
  const modules = Object.fromEntries(MODULE_NAMES.map((name) => {
    if (typeof raw.modules[name] !== "boolean") throw new Error(`trip-data.json config.modules.${name} must be boolean`);
    return [name, raw.modules[name]];
  }));
  const mode = raw?.persistence?.mode;
  if (mode !== "local" && mode !== "d1") throw new Error("trip-data.json config.persistence.mode must be local or d1");
  const sharedCollections = mode === "d1" ? [...new Set(raw.persistence.sharedCollections || [])] : [];
  if (mode === "d1" && (!sharedCollections.length || sharedCollections.some((name) => !SHARED_COLLECTIONS.includes(name)))) {
    throw new Error("D1 mode requires an explicit sharedCollections allowlist");
  }
  const apiBase = raw.persistence.apiBase || "/api/trip";
  if (mode === "d1" && (!/^\/(?!\/)/.test(apiBase) || apiBase.includes("\\") || /[?#]/.test(apiBase))) {
    throw new Error("D1 apiBase must be a same-origin path");
  }
  return {
    ...raw,
    modules,
    persistence: {
      ...(raw.persistence || {}),
      mode,
      ...(mode === "d1" ? { apiBase, sharedCollections } : {})
    }
  };
}

function moduleEnabled(name) {
  return Boolean(state.config && state.config.modules?.[name] === true);
}

function applyModuleConfig() {
  document.querySelectorAll("[data-module]").forEach((element) => {
    element.hidden = !moduleEnabled(element.dataset.module);
  });
  const visibleTravelLinks = [...document.querySelectorAll(".travel-navigation-menu [data-module]")].filter((link) => !link.hidden);
  const travelNavigation = $("#travel-navigation");
  if (travelNavigation) travelNavigation.hidden = visibleTravelLinks.length === 0;
  document.documentElement.dataset.persistence = state.config.persistence.mode;

  const hashModules = {
    "#flights": "flights", "#route": "overview", "#itinerary": "itinerary", "#hotels": "hotels",
    "#drive": "driving", "#prep": "todo", "#ledger": "ledger", "#ledger-stats": "ledger"
  };
  const requestedModule = hashModules[location.hash];
  if (requestedModule && !moduleEnabled(requestedModule)) {
    const firstVisible = visibleTravelLinks[0]?.getAttribute("href") || "#top";
    history.replaceState({ view: "travel" }, "", firstVisible);
  }
  window.dispatchEvent(new CustomEvent("travel-config:ready", { detail: { config: state.config } }));
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;"
})[character]);

const airportCity = (airport) => airport.city || airport.airportCode;

function localDateTime(date, time, _airportCode, utcOffset = "") {
  return new Date(`${date}T${time}:00${utcOffset || "+00:00"}`);
}

function countdownParts(target, now = new Date()) {
  const difference = target.getTime() - now.getTime();
  if (difference <= 0) return { difference, days: 0, hours: 0, minutes: 0 };
  const totalMinutes = Math.floor(difference / 60000);
  return {
    difference,
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60
  };
}

function countdownText(target, completionText = "已出发") {
  const value = countdownParts(target);
  if (value.difference <= 0) return completionText;
  if (value.days > 0) return `${value.days}天 ${String(value.hours).padStart(2, "0")}小时`;
  if (value.hours > 0) return `${value.hours}小时 ${String(value.minutes).padStart(2, "0")}分`;
  return `${Math.max(1, value.minutes)}分钟`;
}

function preciseCountdownText(target, completionText = "已出发") {
  const difference = target.getTime() - Date.now();
  if (difference <= 0) return completionText;
  const totalSeconds = Math.floor(difference / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  return days > 0 ? `${days}天 ${clock}` : clock;
}

function formatDate(dateString, includeYear = false) {
  const date = new Date(`${dateString}T12:00:00`);
  const options = includeYear
    ? { year: "numeric", month: "long", day: "numeric" }
    : { month: "long", day: "numeric" };
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function formatCompactDate(dateString) {
  const [, month, day] = dateString.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function todayForTrip() {
  const timeZone = state.data?.metadata?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
}

function mapsSearch(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function heroDestinationFor(trip) {
  const destinations = (trip.countries || []).filter((country) => (trip.primaryDestinationCountries || []).includes(country.code));
  const isDomestic = destinations.length > 0 && destinations.every((country) => country.code === "CN");
  const customTitle = String(trip.heroTitle || "").trim();
  if (customTitle) {
    return { title: customTitle, eyebrow: String(trip.heroEyebrow || "").trim(), destinations, isDomestic };
  }
  if (isDomestic) {
    const destination = String(trip.primaryDestinationName || trip.primaryDestinationCity || trip.citiesAndAreas?.[0] || "澳大利亚").trim();
    return {
      title: destination,
      eyebrow: String(trip.primaryDestinationNameEn || trip.primaryDestinationCityEn || "DOMESTIC JOURNEY").trim(),
      destinations,
      isDomestic
    };
  }
  return {
    title: destinations.map((country) => country.nameZh || country.name).join(" × ") || "澳大利亚",
    eyebrow: destinations.map((country) => country.nameEn || country.name).filter(Boolean).join(" × "),
    destinations,
    isDomestic
  };
}

function renderHero() {
  const { trip } = state.data;
  if (trip.status === "uninitialized") {
    document.title = state.data.metadata.title;
    $("#trip-title").textContent = "旅行计划待生成";
    $("#trip-eyebrow").textContent = "READY FOR YOUR JOURNEY";
    $("#wordmark").innerHTML = "TRIP <span>· READY</span>";
    $("#footer-mark").textContent = "TRIP · READY";
    $("#route-day-count").textContent = "0 DAYS";
    $("#trip-date").textContent = "等待旅行资料";
    return;
  }
  const hero = heroDestinationFor(trip);
  const { destinations } = hero;
  const shortMark = destinations.map((country) => country.code).join(" / ");
  const year = trip.startDate.slice(0, 4);
  document.title = state.data.metadata.title;
  $("#trip-title").textContent = hero.title;
  $("#trip-eyebrow").textContent = hero.eyebrow;
  $("#wordmark").innerHTML = `${escapeHtml(shortMark)} <span>· ${escapeHtml(year)}</span>`;
  $("#footer-mark").textContent = `${shortMark} · ${year}`;
  $("#route-day-count").textContent = `${trip.dayCount} DAYS`;
  $("#trip-date").textContent = `${formatCompactDate(trip.startDate)} — ${formatCompactDate(trip.endDate)} · ${trip.dayCount}天`;
}

function journeyFlights(journeyId) {
  return state.data.flights
    .filter((flight) => flight.journeyId === journeyId)
    .sort((first, second) => first.sequence - second.sequence);
}

function journeyStatusAndTarget(flights) {
  const now = new Date();
  for (const flight of flights) {
    const departure = localDateTime(flight.departure.date, flight.departure.time, flight.departure.airportCode, flight.departure.utcOffset);
    const arrival = localDateTime(flight.arrival.date, flight.arrival.time, flight.arrival.airportCode, flight.arrival.utcOffset);
    if (now < departure) return { target: departure, label: flight === flights[0] ? "距离起飞还剩" : "距离下一程起飞还剩", complete: false };
    if (now < arrival) return { target: arrival, label: "飞行中 · 距抵达", complete: false };
  }
  return { target: null, label: "已抵达", complete: true };
}

function relativeFlightDate(date, journeyStartDate) {
  if (date === journeyStartDate) return formatCompactDate(date);
  const difference = Math.round((new Date(`${date}T12:00:00`) - new Date(`${journeyStartDate}T12:00:00}`)) / 86400000);
  return difference === 1 ? "次日" : formatCompactDate(date);
}

function flightStopMarkup(stop, position, journeyStartDate) {
  let timing;
  if (position === 0) {
    timing = `<span>${escapeHtml(relativeFlightDate(stop.departure.date, journeyStartDate))}</span><b>${escapeHtml(stop.departure.time)} 出发</b>`;
  } else if (position === stop.totalStops - 1) {
    timing = `<span>${escapeHtml(relativeFlightDate(stop.arrival.date, journeyStartDate))}</span><b>${escapeHtml(stop.arrival.time)} 抵达</b>`;
  } else {
    const nextFlight = stop.nextFlight;
    const connection = nextFlight.connectionFromPrevious || {};
    const duration = connection.calculatedFromSchedule || connection.durationUsingTicketTimes || connection.plannedDurationText || "中转";
    timing = `
      <span>${escapeHtml(stop.arrival.time)} 抵达</span>
      <em>${escapeHtml(duration)}</em>
      <b>${escapeHtml(relativeFlightDate(nextFlight.departure.date, journeyStartDate))} ${escapeHtml(nextFlight.departure.time)}</b>
      <span>起飞</span>
    `;
  }
  return `
    <div class="flight-stop${position > 0 && position < stop.totalStops - 1 ? " is-transfer" : ""}">
      <span class="flight-stop__code">${escapeHtml(stop.airport.airportCode)}</span>
      <span class="flight-stop__city">${escapeHtml(airportCity(stop.airport))}</span>
      <span class="flight-stop__dot" aria-hidden="true"></span>
      <div class="flight-stop__timing">${timing}</div>
    </div>
  `;
}

function flightMissingFieldLabel(field) {
  return ({
    carrierId: "航空公司",
    flightNumber: "航班号",
    departure: "起飞信息",
    arrival: "抵达信息",
    departurePlace: "出发机场",
    arrivalPlace: "抵达机场",
    departureTime: "起飞时间",
    arrivalTime: "抵达时间",
    timeZone: "当地时区"
  })[field] || String(field || "待补充信息");
}

function flightPlaceholderCard(journey, index) {
  const missingFields = [...new Set(journey.missingFields || [])].map(flightMissingFieldLabel);
  return `
    <article class="flight-card flight-card--placeholder" data-journey="${escapeHtml(journey.id)}">
      <div class="flight-card__top">
        <span>FLIGHT ${String(index + 1).padStart(2, "0")} / ${String(state.data.flightJourneys.length).padStart(2, "0")}</span>
      </div>
      <div class="flight-placeholder">
        <span class="flight-placeholder__eyebrow">资料待补充</span>
        <h3>${escapeHtml(journey.title || "航班信息待补充")}</h3>
        <p>已按第二轮确认继续生成标准预览；系统没有猜测或伪造缺失的航班事实。</p>
        ${missingFields.length ? `<ul>${missingFields.map((field) => `<li>${escapeHtml(field)}</li>`).join("")}</ul>` : ""}
      </div>
      <div class="flight-card__countdown-row">
        <div class="flight-countdown" data-countdown-journey="${escapeHtml(journey.id)}" data-placeholder="true">
          <span>当前状态</span>
          <strong>待补充</strong>
        </div>
      </div>
    </article>
  `;
}

function flightCard(journey, index) {
  const flights = journeyFlights(journey.id);
  if (journey.placeholder || journey.status === "missing" || journey.status === "pending" || !flights.length || flights.some((flight) => flight.placeholder)) {
    return flightPlaceholderCard(journey, index);
  }
  const first = flights[0];
  const last = flights[flights.length - 1];
  const status = journeyStatusAndTarget(flights);
  const countdown = status.complete ? "已完成" : preciseCountdownText(status.target, "即将出发");
  const stops = [
    { airport: first.departure, departure: first.departure },
    ...flights.map((flight, flightIndex) => ({
      airport: flight.arrival,
      arrival: flight.arrival,
      nextFlight: flights[flightIndex + 1]
    }))
  ];
  const routeItems = [];
  stops.forEach((stop, stopIndex) => {
    routeItems.push(flightStopMarkup({ ...stop, totalStops: stops.length }, stopIndex, first.departure.date));
    if (stopIndex < flights.length) {
      const flight = flights[stopIndex];
      routeItems.push(`
        <div class="flight-segment">
          <span>${escapeHtml(flight.flightNumber)}</span>
          <i aria-hidden="true">→</i>
        </div>
      `);
    }
  });
  return `
    <article class="flight-card" data-journey="${escapeHtml(journey.id)}">
      <div class="flight-card__top">
        <span>FLIGHT ${String(index + 1).padStart(2, "0")} / ${String(state.data.flightJourneys.length).padStart(2, "0")}</span>
      </div>
      <div class="flight-card__airlines">${escapeHtml([...new Set(flights.map((flight) => flight.airline.nameZh || flight.airline.name))].join(" · "))}</div>
      <div class="flight-flow" style="--route-columns: ${stops.map((_, stopIndex) => stopIndex < stops.length - 1 ? "minmax(0,1fr) minmax(34px,.5fr)" : "minmax(0,1fr)").join(" ")}">
        ${routeItems.join("")}
      </div>
      <div class="flight-card__countdown-row">
        <div class="flight-countdown" data-countdown-journey="${escapeHtml(journey.id)}">
          <span>${escapeHtml(status.label)}</span>
          <strong>${escapeHtml(countdown)}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderFlights() {
  const journeys = state.data.flightJourneys;
  $("#flight-carousel").innerHTML = journeys.map(flightCard).join("");
  $("#flight-dots").innerHTML = journeys.map((_, index) => `<span class="carousel-dot${index === 0 ? " is-active" : ""}"></span>`).join("");
  $("#flight-index").textContent = `1 / ${journeys.length}`;

  const carousel = $("#flight-carousel");
  let scheduled = false;
  carousel.addEventListener("scroll", () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      const cards = $$(".flight-card", carousel);
      const center = carousel.scrollLeft + carousel.clientWidth / 2;
      let activeIndex = 0;
      let distance = Infinity;
      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        if (Math.abs(cardCenter - center) < distance) {
          distance = Math.abs(cardCenter - center);
          activeIndex = index;
        }
      });
      $$(".carousel-dot", $("#flight-dots")).forEach((dot, index) => dot.classList.toggle("is-active", index === activeIndex));
      $("#flight-index").textContent = `${activeIndex + 1} / ${journeys.length}`;
      scheduled = false;
    });
  }, { passive: true });
}

function updateFlightCountdowns() {
  state.data.flightJourneys.forEach((journey) => {
    const target = $(`[data-countdown-journey="${journey.id}"]`);
    if (!target || target.dataset.placeholder === "true" || journey.placeholder) return;
    const status = journeyStatusAndTarget(journeyFlights(journey.id));
    $("strong", target).textContent = status.complete ? "已完成" : preciseCountdownText(status.target, "即将出发");
    $("span", target).textContent = status.label;
  });
}

function currentTripDay() {
  const today = todayForTrip();
  return state.data.days.find((day) => day.date === today)?.day || null;
}

/* ============================================================
 * Day 区块渲染
 * (1) 行程规划 / (2) 景点介绍 / (3) 美食推荐 /
 * (4) 交通规划 / (5) 购物推荐 / (6) 其他待补充
 * 另附「攻略参考」图片区
 * ============================================================ */

function blockBadge(num, label) {
  return `<span class="day-block__num">${escapeHtml(num)}</span><span class="day-block__label">${escapeHtml(label)}</span>`;
}

/* 行程规划条目 / 景点 / 美食 等条目级笔记 */
function notesForKey(key) {
  if (!state.entryNotes) state.entryNotes = {};
  return state.entryNotes[key] || [];
}

function renderNotesBlock(entryKey) {
  const notes = notesForKey(entryKey);
  const items = notes.map((note, idx) => `
    <li class="entry-notes__item" data-note-idx="${idx}">
      <span>${escapeHtml(note.text || "")}</span>
      <button type="button" class="entry-notes__delete" aria-label="删除备注">×</button>
    </li>`).join("");
  return `
    <div class="entry-notes" data-entry-key="${escapeHtml(entryKey)}">
      <ul class="entry-notes__list">${items}</ul>
      <form class="entry-notes__form">
        <input type="text" placeholder="添加备注…" maxlength="120" data-note-input>
        <button type="submit" aria-label="添加备注">+</button>
      </form>
    </div>`;
}

function renderRoutesBlock(day) {
  if (!Array.isArray(day.routes) || !day.routes.length) return "";
  const items = day.routes.map((route) => {
    const placeItems = (route.places || []).map((place, idx) => {
      const query = (route.placeMap && route.placeMap[place]) || place;
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      return `
        <li class="day-route__place">
          <span class="day-route__place-no">${idx + 1}</span>
          <span class="day-route__place-name">${escapeHtml(place)}</span>
          <a class="day-route__place-map" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在 Google Maps 打开 ${escapeHtml(place)}">📍</a>
        </li>`;
    }).join("");
    return `
      <div class="day-route">
        <h4 class="day-route__name">${escapeHtml(route.name || "")}</h4>
        <ol class="day-route__places">${placeItems}</ol>
      </div>`;
  }).join("");
  return `
    <section class="day-block day-routes">
      <header class="day-block__head">${blockBadge("1", "行程规划")}</header>
      <div class="day-routes__list">${items}</div>
    </section>`;
}

function renderAttractionsBlock(day) {
  if (!Array.isArray(day.attractions) || !day.attractions.length) return "";
  const dayId = day.id || `d-${day.date}`;
  const items = day.attractions.map((attr, idx) => {
    const mapLink = attr.mapQuery
      ? `<a class="day-attraction__map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(attr.mapQuery)}" target="_blank" rel="noopener noreferrer">📍 在 Google Maps 打开</a>`
      : "";
    const entryKey = `${dayId}::a${idx}`;
    const photoUrl = localAssetUrl(attr.image);
    const photo = photoUrl
      ? `<figure class="day-attraction__photo"><img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(attr.name || "景点图片")}" loading="lazy"></figure>`
      : "";
    return `
      <article class="day-attraction">
        <h4 class="day-attraction__name">${escapeHtml(attr.name || "")}</h4>
        <p class="day-attraction__intro">${escapeHtml(attr.intro || "")}</p>
        ${photo}
        ${mapLink}
        ${renderNotesBlock(entryKey)}
      </article>`;
  }).join("");
  return `
    <section class="day-block day-attractions">
      <header class="day-block__head">${blockBadge("2", "景点介绍")}</header>
      <div class="day-attractions__list">${items}</div>
    </section>`;
}

/* (2+) 出片机位 */
function renderPhotoSpotsBlock(day) {
  if (!Array.isArray(day.photoSpots) || !day.photoSpots.length) return "";
  const items = day.photoSpots.map((spot) => `
    <li class="day-photo-spots__item">${escapeHtml(spot)}</li>`).join("");
  return `
    <section class="day-block day-photo-spots">
      <header class="day-block__head">${blockBadge("✦", "出片机位")}</header>
      <ul class="day-photo-spots__list">${items}</ul>
    </section>`;
}

function renderFoodBlock(day) {
  if (!Array.isArray(day.food) || !day.food.length) return "";
  const items = day.food.map((item) => `
    <li class="day-food__item">
      <strong>${escapeHtml(item.name || "")}</strong>
      <span>${escapeHtml(item.note || "")}</span>
    </li>`).join("");
  return `
    <section class="day-block day-food">
      <header class="day-block__head">${blockBadge("3", "美食推荐")}</header>
      <ul class="day-food__list">${items}</ul>
    </section>`;
}

function renderTransportBlock(day) {
  if (!Array.isArray(day.transport) || !day.transport.length) return "";
  const items = day.transport.map((item) => `
    <li class="day-transport__item">
      <strong>${escapeHtml(item.label || "")}</strong>
      <span>${escapeHtml(item.detail || "")}</span>
    </li>`).join("");
  return `
    <section class="day-block day-transport">
      <header class="day-block__head">${blockBadge("4", "交通规划")}</header>
      <ul class="day-transport__list">${items}</ul>
    </section>`;
}

function renderShoppingBlock(day) {
  if (!Array.isArray(day.shopping) || !day.shopping.length) return "";
  const items = day.shopping.map((item) => `
    <li class="day-shopping__item">
      <strong>${escapeHtml(item.name || "")}</strong>
      <span>${escapeHtml(item.note || "")}</span>
    </li>`).join("");
  return `
    <section class="day-block day-shopping">
      <header class="day-block__head">${blockBadge("5", "购物推荐")}</header>
      <ul class="day-shopping__list">${items}</ul>
    </section>`;
}

function renderDayBlocks(day) {
  return [
    renderGuideImagesBlock(day),
    renderRoutesBlock(day),
    renderAttractionsBlock(day),
    renderPhotoSpotsBlock(day),
    renderFoodBlock(day),
    renderTransportBlock(day),
    renderShoppingBlock(day)
  ].filter(Boolean).join("");
}

/* (0) 导览图 —— 横向滑动的图集，未配置时不显示该区块 */
function renderGuideImagesBlock(day) {
  const images = Array.isArray(day.guideImages) ? day.guideImages : [];
  if (!images.length) return "";
  const cards = images.map((item) => {
    const url = localAssetUrl(item.src);
    if (!url) return "";
    const label = item.label || item.caption || "导览图";
    return `
      <figure class="day-guide is-clickable" title="点击查看原图">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy">
        <figcaption>${escapeHtml(label)}</figcaption>
      </figure>`;
  }).join("");
  return `
    <section class="day-block day-guides">
      <header class="day-block__head">${blockBadge("0", "导览图")}</header>
      <div class="day-guides__rail">${cards}</div>
    </section>`;
}

/* 图片灯箱 —— 点击导览图放大查看原图 */
function ensureLightbox() {
  if (document.getElementById("lightbox")) return;
  const el = document.createElement("div");
  el.id = "lightbox";
  el.className = "lightbox";
  el.hidden = true;
  el.innerHTML = `<button type="button" class="lightbox__close" aria-label="关闭">✕</button><img alt="">`;
  document.body.appendChild(el);
  el.addEventListener("click", (event) => {
    if (event.target === el || event.target.closest(".lightbox__close")) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.hidden) closeLightbox();
  });
}

function openLightbox(src, alt) {
  ensureLightbox();
  const el = document.getElementById("lightbox");
  const img = el.querySelector("img");
  img.src = src;
  img.alt = alt || "";
  el.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  const el = document.getElementById("lightbox");
  if (!el) return;
  el.hidden = true;
  el.querySelector("img").src = "";
  document.body.style.overflow = "";
}

/* 事件委托：点击导览图打开灯箱 */
document.addEventListener("click", (event) => {
  const img = event.target.closest(".day-guide.is-clickable img");
  if (img) openLightbox(img.currentSrc || img.src, img.alt);
});

function dayCard(day) {
  const today = todayForTrip();
  const isToday = day.date === today;
  const expanded = state.expandedDay === day.day;
  const blocks = renderDayBlocks(day);
  const notes = [...(day.notes || [])].map((note) => `<p class="detail-note">${escapeHtml(note)}</p>`).join("");
  return `
    <article class="day-card${isToday ? " is-today" : ""}" data-day="${day.day}">
      <span class="day-dot" aria-hidden="true"></span>
      <button class="day-toggle" type="button" aria-expanded="${expanded}" aria-controls="day-detail-${day.day}">
        <span>
          <span class="day-meta">DAY ${String(day.day).padStart(2, "0")} · ${escapeHtml(formatCompactDate(day.date))}${isToday ? " · 今天" : ""}</span>
          <span class="day-title">${escapeHtml(day.title)}</span>
          <span class="day-locations">${escapeHtml((day.locations || []).join(" → "))}</span>
        </span>
        <span class="day-chevron" aria-hidden="true">+</span>
      </button>
      <div class="day-detail" id="day-detail-${day.day}" ${expanded ? "" : "hidden"}>
        ${blocks}
        ${notes}
      </div>
    </article>`;
}

function renderTimeline() {
  const today = currentTripDay();
  state.expandedDay = today;
  $("#day-count").textContent = `${state.data.days.length} DAYS`;
  $("#timeline").innerHTML = state.data.days.map(dayCard).join("");
  const timeline = $("#timeline");
  timeline.onclick = (event) => {
    const noteDelete = event.target.closest(".entry-notes__delete");
    if (noteDelete) {
      const block = noteDelete.closest(".entry-notes");
      const key = block?.dataset.entryKey;
      const item = noteDelete.closest(".entry-notes__item");
      const idx = Number(item.dataset.noteIdx);
      if (key && state.entryNotes[key]) {
        state.entryNotes[key].splice(idx, 1);
        renderTimeline();
      }
      return;
    }
    const toggle = event.target.closest(".day-toggle");
    if (!toggle) return;
    const card = toggle.closest(".day-card");
    const dayNumber = Number(card.dataset.day);
    const wasExpanded = toggle.getAttribute("aria-expanded") === "true";
    $$(".day-toggle", timeline).forEach((button) => button.setAttribute("aria-expanded", "false"));
    $$(".day-detail", timeline).forEach((detail) => { detail.hidden = true; });
    if (!wasExpanded) {
      toggle.setAttribute("aria-expanded", "true");
      $(`#day-detail-${dayNumber}`).hidden = false;
      state.expandedDay = dayNumber;
      requestAnimationFrame(() => {
        card.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    } else {
      state.expandedDay = null;
    }
  };
  timeline.onsubmit = (event) => {
    const form = event.target.closest(".entry-notes__form");
    if (!form) return;
    event.preventDefault();
    const block = form.closest(".entry-notes");
    const key = block?.dataset.entryKey;
    if (!key) return;
    const input = form.querySelector("[data-note-input]");
    const text = (input?.value || "").trim();
    if (!text) return;
    if (!state.entryNotes[key]) state.entryNotes[key] = [];
    state.entryNotes[key].push({ text });
    input.value = "";
    renderTimeline();
  };
}

/* ============================================================
 * 城市地图预览：3 个城市 Google Maps Embed
 * ============================================================ */

function renderCityMaps() {
  const explorer = $("#route-explorer");
  if (!explorer) return;
  const cities = state.data?.map?.cities || [];
  if (!cities.length) {
    explorer.innerHTML = `<p class="route-caption">暂未配置城市地图。</p>`;
    return;
  }
  const cards = cities.map((city) => {
    const daysList = (city.days || []).map((d) => `Day ${d}`).join(" · ");
    const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(city.embedQuery || city.query)}&output=embed`;
    return `
      <article class="city-map">
        <header class="city-map__head">
          <h3>${escapeHtml(city.name)}${city.nameEn ? ` <span>${escapeHtml(city.nameEn)}</span>` : ""}</h3>
          <p class="city-map__days">覆盖 ${escapeHtml(daysList || "")}</p>
        </header>
        <div class="city-map__frame">
          <iframe
            title="${escapeHtml(city.name)} Google Maps"
            src="${escapeHtml(embedSrc)}"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-same-origin allow-forms"
            allowfullscreen></iframe>
        </div>
        <footer class="city-map__foot">
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city.query)}" target="_blank" rel="noopener noreferrer">在 Google Maps 中打开 ↗</a>
        </footer>
      </article>`;
  }).join("");
  explorer.innerHTML = `<div class="city-map-list">${cards}</div>`;
}

/* 酒店信息 —— 按城市列出 */
function renderHotels() {
  const container = $("#hotels-list");
  if (!container) return;
  const list = Array.isArray(state.data?.accommodations) ? state.data.accommodations : [];
  if (!list.length) {
    container.innerHTML = `<p class="hotels-empty">尚未配置酒店信息。</p>`;
    return;
  }
  const cards = list.map((h) => {
    const query = h.hotelNameEn || h.hotelName || h.city || "";
    const mapsUrl = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
    const dateRange = (h.checkIn && h.checkOut)
      ? `${formatCompactDate(h.checkIn)} → ${formatCompactDate(h.checkOut)}`
      : "";
    return `
      <article class="hotel-card">
        <header class="hotel-card__head">
          <p class="hotel-card__kicker">${escapeHtml(h.city || "")}</p>
          <h3 class="hotel-card__name">${escapeHtml(h.hotelName || "")}</h3>
          ${h.hotelNameEn ? `<p class="hotel-card__name-en">${escapeHtml(h.hotelNameEn)}</p>` : ""}
        </header>
        <dl class="hotel-card__meta">
          ${dateRange ? `<div><dt>入住 / 退房</dt><dd>${escapeHtml(dateRange)}</dd></div>` : ""}
          <div>
            <dt>地址</dt>
            <dd>
              ${h.address ? `<span>${escapeHtml(h.address)}</span>` : `<span class="hotel-card__muted">待补充</span>`}
              ${mapsUrl ? `<a class="hotel-card__map" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">📍 Google Maps</a>` : ""}
            </dd>
          </div>
          ${h.notes ? `<div><dt>备注</dt><dd>${escapeHtml(h.notes)}</dd></div>` : ""}
        </dl>
      </article>`;
  }).join("");
  container.innerHTML = `<div class="hotel-card-list">${cards}</div>`;
}

function safeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function localAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  try {
    const url = new URL(raw, location.href);
    return url.origin === location.origin ? url.href : "";
  } catch {
    return "";
  }
}

function loadTodoState() { state.todos = []; }

function createRuntimeAdapters() {
  const storage = window.TravelRuntimeStorage;
  if (!storage?.createAdapter) throw new Error("runtime-storage.js is required");
  const persistence = state.config.persistence || { mode: "local" };
  const sharedCollections = new Set(Array.isArray(persistence.sharedCollections)
    ? persistence.sharedCollections
    : ["todos", "tickets", "ledger"]);
  const tripId = state.data.metadata.tripId;
  const enabledCollections = [
    ...(moduleEnabled("todo") ? ["todos"] : []),
    ...(moduleEnabled("itinerary") ? ["tickets"] : [])
  ];
  const localCollections = enabledCollections.filter((collection) => persistence.mode !== "d1" || !sharedCollections.has(collection));
  const d1Collections = enabledCollections.filter((collection) => persistence.mode === "d1" && sharedCollections.has(collection));
  const localAdapter = localCollections.length ? storage.createAdapter({ mode: "local", tripId, collections: localCollections }) : null;
  const d1Adapter = d1Collections.length ? storage.createAdapter({
    mode: "d1",
    tripId,
    apiBase: persistence.apiBase || "/api/trip",
    collections: d1Collections
  }) : null;
  state.runtimeAdapters = {};
  localCollections.forEach((collection) => { state.runtimeAdapters[collection] = localAdapter; });
  d1Collections.forEach((collection) => { state.runtimeAdapters[collection] = d1Adapter; });
}

async function loadSharedState() {
  const adapters = [...new Set(Object.values(state.runtimeAdapters).filter(Boolean))];
  const todoAdapter = state.runtimeAdapters.todos;
  let hasLocalTodoSnapshot = true;
  if (todoAdapter?.mode === "local" && todoAdapter.storageKey) {
    try { hasLocalTodoSnapshot = localStorage.getItem(todoAdapter.storageKey) !== null; }
    catch { hasLocalTodoSnapshot = false; }
  }
  const snapshots = await Promise.all(adapters.map(async (adapter) => [adapter, await adapter.load()]));
  const snapshotFor = (collection) => snapshots.find(([adapter]) => adapter === state.runtimeAdapters[collection])?.[1] || {};
  const todoSnapshot = snapshotFor("todos");
  state.todos = Array.isArray(todoSnapshot.todos) ? todoSnapshot.todos : [];
  state.purchasedTickets = new Set();
  const authoredTodos = state.data.preTrip?.todoItems || state.data.preTrip?.packingItems || [];
  if (todoAdapter?.mode === "local" && !hasLocalTodoSnapshot && !state.todos.length && authoredTodos.length) {
    state.todos = authoredTodos.map((item, index) => ({
      id: String(item.id || `todo-initial-${index + 1}`),
      text: String(item.text || item.title || "").trim(),
      completed: Boolean(item.completed)
    })).filter((item) => item.text);
    await Promise.all(state.todos.map((todo) => todoAdapter.applyChange("todos", todo, "upsert")));
  }
}

async function saveSharedChange(collection, value, op = "upsert") {
  const adapter = state.runtimeAdapters[collection];
  if (!adapter) return null;
  return adapter.applyChange(collection, value, op);
}

function saveTodoState() { return Promise.all(state.todos.map((todo) => saveSharedChange("todos", todo))); }

function renderTodoList() {
  const completed = state.todos.filter((todo) => todo.completed).length;
  $("#todo-progress").textContent = `${completed} / ${state.todos.length}`;
  $("#todo-list").innerHTML = state.todos.length ? state.todos.map((todo) => `
    <div class="todo-item${todo.completed ? " is-complete" : ""}" data-todo-id="${escapeHtml(todo.id)}">
      <label>
        <input type="checkbox" ${todo.completed ? "checked" : ""} aria-label="完成：${escapeHtml(todo.text)}">
        <span class="todo-check" aria-hidden="true">✓</span>
        <span class="todo-text">${escapeHtml(todo.text)}</span>
      </label>
      <button type="button" class="todo-delete" aria-label="删除：${escapeHtml(todo.text)}">删除</button>
    </div>`).join("") : `<p class="todo-empty">还没有准备事项，添加第一项吧。</p>`;
}

function renderTravelPrep() {
  renderTodoList();
  $("#todo-form").onsubmit = (event) => {
    event.preventDefault();
    const input = $("#todo-input");
    const text = input.value.trim();
    if (!text) return;
    state.todos.push({ id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, completed: false });
    input.value = "";
    saveSharedChange("todos", state.todos.at(-1)).catch(console.error);
    renderTodoList();
  };
  $("#todo-list").onchange = (event) => {
    const item = event.target.closest("[data-todo-id]");
    if (!item || !event.target.matches("input[type='checkbox']")) return;
    const todo = state.todos.find((entry) => entry.id === item.dataset.todoId);
    todo.completed = event.target.checked;
    saveSharedChange("todos", todo).catch(console.error);
    renderTodoList();
  };
  $("#todo-list").onclick = (event) => {
    const button = event.target.closest(".todo-delete");
    if (!button) return;
    const item = button.closest("[data-todo-id]");
    state.todos = state.todos.filter((todo) => todo.id !== item.dataset.todoId);
    saveSharedChange("todos", { id: item.dataset.todoId }, "delete").catch(console.error);
    renderTodoList();
  };
}

function startCountdowns() {
  if (moduleEnabled("flights")) updateFlightCountdowns();
  if (!moduleEnabled("flights")) return;
  state.countdownTimer = window.setInterval(() => {
    if (moduleEnabled("flights")) updateFlightCountdowns();
  }, 1000);
}

async function init() {
  try {
    const response = await fetch("trip-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    state.config = normalizeTripConfig(state.data.config);
    window.TRAVEL_PLAN_CONFIG = state.config;
    window.TRAVEL_PLAN_DATA = state.data;
    document.dispatchEvent(new CustomEvent("travel-data-ready", { detail: state.data }));
    applyModuleConfig();
    renderHero();
    if (moduleEnabled("flights")) renderFlights();
    if (moduleEnabled("overview")) renderCityMaps();
    if (moduleEnabled("hotels")) renderHotels();
    if (moduleEnabled("todo") || moduleEnabled("itinerary")) {
      createRuntimeAdapters();
      try {
        await loadSharedState();
      } catch (error) {
        console.error(`${state.config.persistence.mode === "d1" ? "Shared" : "Local"} runtime data could not be loaded`, error);
        state.todos = [];
        state.purchasedTickets = new Set();
      }
    }
    if (moduleEnabled("itinerary")) renderTimeline();
    if (moduleEnabled("todo")) renderTravelPrep();
    if (moduleEnabled("ledger")) {
      await window.TravelLedger?.init?.({ tripId: state.data.metadata.tripId, config: state.config });
    }
    startCountdowns();
  } catch (error) {
    console.error("Travel data could not be loaded", error);
    const errEl = $("#loading-error");
    if (errEl) {
      errEl.hidden = false;
      const detail = errEl.querySelector(".loading-error__detail");
      if (!detail) {
        const span = document.createElement("span");
        span.className = "loading-error__detail";
        span.style.cssText = "display:block;margin-top:6px;font-size:12px;opacity:0.78;font-family:ui-monospace,monospace;";
        errEl.appendChild(span);
      }
      const span = errEl.querySelector(".loading-error__detail");
      if (span) span.textContent = error.stack || error.message || String(error);
    }
  }
}

document.addEventListener("DOMContentLoaded", init);