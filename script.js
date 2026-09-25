const dayFilters = document.querySelector("#day-filters");
const cardEl = document.querySelector("#place-card");
const mapEl = document.querySelector("#map");
const mapStatus = document.querySelector("#map-status");
const zoomLabel = document.querySelector("#zoom-label");
const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const scrubLabel = document.querySelector("#scrub-label");
const resetViewButton = document.querySelector("#reset-view");
const stopDialog = document.querySelector("#stop-dialog");
const stopForm = document.querySelector("#stop-form");
const formStatus = document.querySelector("#form-status");
const openStopFormButton = document.querySelector("#open-stop-form");

const NEWBURY_CENTER = { lat: 42.3508, lng: -71.0806 };
const NEWBURY_RADIUS_MILES = 0.9;
const HOTEL_MATCH_MILES = 0.05;
const FOCUS_ZOOM = 16;
const CUSTOM_STOPS_KEY = "trip-maker-custom-stops-v1";
const GEOCODE_CACHE_KEY = "trip-maker-geocode-cache-v1";
const GEOCODER_URL = "https://nominatim.openstreetmap.org/search";

let data;
let scope = "newbury";
let sortMode = "time";
let index = 0;
let openId = null;
let map = null;
let markers = [];
let line = null;
let resizeObserver = null;
let customStops = loadCustomStops();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readLocalJson(key, fallback) {
  try {
    const value = window.localStorage?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    if (!window.localStorage) return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function loadCustomStops() {
  const saved = readLocalJson(CUSTOM_STOPS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((stop) => {
      const lat = Number(stop?.location?.lat);
      const lng = Number(stop?.location?.lng);
      return stop?.custom === true
        && typeof stop.id === "string"
        && typeof stop.title === "string"
        && Number.isFinite(lat)
        && Number.isFinite(lng);
    })
    .map((stop) => ({
      ...stop,
      location: { lat: Number(stop.location.lat), lng: Number(stop.location.lng) }
    }));
}

function timeSortValue(item) {
  const dayOffset = item.day === "sunday" ? 24 * 60 : 0;
  const match = String(item.start || "").match(/^(\d{1,2}):(\d{2})\s*([ap])\.m\.$/i);
  if (!match) return dayOffset + (24 * 60) - 1;
  let hour = Number(match[1]) % 12;
  if (match[3].toLowerCase() === "p") hour += 12;
  return dayOffset + (hour * 60) + Number(match[2]);
}

function milesBetween(a, b) {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const halfChord = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(halfChord));
}

function isInScope(item) {
  if (!item.location) return false;
  if (scope === "all") return true;
  if (scope === "newbury") return milesBetween(item.location, NEWBURY_CENTER) <= NEWBURY_RADIUS_MILES;
  return item.day === scope;
}

function matchingHotel(item) {
  return data.hotels.find((hotel) => milesBetween(item.location, hotel.location) < HOTEL_MATCH_MILES);
}

function mappedRows() {
  const itineraryRows = [...data.items, ...customStops]
    .filter((item) => item.location)
    .map((item) => {
      if (item.custom && item.kind === "hotel") return { ...item, markerKind: "hotel" };
      const hotel = matchingHotel(item);
      if (!hotel) return { ...item, markerKind: "place" };
      return {
        ...item,
        markerKind: "hotel",
        title: hotel.name,
        categoryLabel: "Hotel",
        hotelId: hotel.id
      };
    });

  const representedHotels = new Set(itineraryRows.filter((row) => row.hotelId).map((row) => row.hotelId));
  const additionalHotels = data.hotels
    .filter((hotel) => !representedHotels.has(hotel.id))
    .map((hotel) => ({
      id: hotel.id,
      kind: "hotel",
      markerKind: "hotel",
      categoryLabel: "Hotel",
      day: hotel.day,
      title: hotel.name,
      address: hotel.address,
      summary: hotel.note || `${hotel.when} base for the itinerary.`,
      description: hotel.note || `${hotel.name} is the ${hotel.when.toLowerCase()} base.`,
      start: hotel.when,
      end: "",
      durationFlex: "Hotel",
      location: hotel.location,
      mapUrl: `https://maps.google.com/?q=${encodeURIComponent(hotel.address)}`
    }));

  return [...itineraryRows, ...additionalHotels];
}

function visibleRows() {
  return mappedRows()
    .filter(isInScope)
    .sort((a, b) => timeSortValue(a) - timeSortValue(b));
}

function hotelFor(item) {
  return matchingHotel(item)
    || data.hotels.find((hotel) => hotel.day === item.day)
    || data.hotels[0];
}

function listedRows() {
  const rows = visibleRows();
  if (sortMode !== "distance") return rows;
  return rows.slice().sort((a, b) => {
    const aHotel = hotelFor(a);
    const bHotel = hotelFor(b);
    return milesBetween(a.location, aHotel.location) - milesBetween(b.location, bHotel.location);
  });
}

function list(items) {
  if (!items || !items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function scopeLabel() {
  if (scope === "newbury") return "Newbury area";
  if (scope === "all") return "Full route";
  return data.days.find((entry) => entry.id === scope)?.label || "Locations";
}

function renderFilters() {
  const buttons = [
    ["newbury", "Newbury area"],
    ["all", "Full route"],
    ...data.days.map((entry) => [entry.id, entry.label])
  ];
  dayFilters.innerHTML = buttons
    .map(([id, label]) => `<button type="button" aria-pressed="${id === scope}" data-scope="${escapeHtml(id)}">${escapeHtml(label)}</button>`)
    .join("");
}

function renderList(active) {
  const rows = listedRows();
  const hotels = rows.filter((row) => row.markerKind === "hotel").length;
  const places = rows.length - hotels;
  cardEl.hidden = false;
  cardEl.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="panel-kicker">${escapeHtml(scopeLabel())}</p>
        <h2>${rows.length} mapped location${rows.length === 1 ? "" : "s"}</h2>
      </div>
      <div class="sorts" role="group" aria-label="Sort locations">
        <button type="button" data-sort="time" aria-pressed="${sortMode === "time"}">Time</button>
        <button type="button" data-sort="distance" aria-pressed="${sortMode === "distance"}">Distance</button>
      </div>
    </div>
    <p class="location-summary">${places} place${places === 1 ? "" : "s"} · ${hotels} hotel${hotels === 1 ? "" : "s"}</p>
    <p class="sort-note">${sortMode === "distance"
      ? "Distance is measured from each day’s hotel base."
      : scope === "newbury"
        ? "Stops within 0.9 miles of the center of Newbury Street."
        : "Shown in itinerary order, including custom stops at their selected time."}</p>
    <ul class="stop-list">
      ${rows.map((place) => {
        const hotel = hotelFor(place);
        const distance = milesBetween(place.location, hotel.location);
        const isHotel = place.markerKind === "hotel";
        const markerNumber = visibleRows().findIndex((row) => row.id === place.id) + 1;
        const distanceLabel = isHotel
          ? `${place.day === "sunday" ? "Sunday" : "Saturday"} hotel base`
          : `${distance < 0.1 ? "Under 0.1" : distance.toFixed(1)} mi from ${hotel.name}`;
        const selected = Boolean(active && place.id === active.id);
        const open = openId === place.id;
        return `<li class="${selected ? "selected" : ""}" data-kind="${isHotel ? "hotel" : "place"}">
          <button type="button" class="stop-row" data-id="${escapeHtml(place.id)}" aria-expanded="${open}">
            <span class="row-marker ${isHotel ? "row-marker-hotel" : "row-marker-place"}" aria-hidden="true">${isHotel ? "H" : markerNumber}</span>
            <span class="stop-copy">
              <span class="stop-topline">
                <span class="category ${isHotel ? "category-hotel" : "category-place"}">${isHotel ? "Hotel" : "Place"}</span>
                <span class="stop-time">${place.custom ? "Custom · " : ""}${escapeHtml(place.start)}</span>
              </span>
              <strong>${escapeHtml(place.title)}</strong>
              <span class="stop-meta">${escapeHtml(distanceLabel)}</span>
            </span>
          </button>
          ${open ? `<div class="details">
            <p class="details-lede">${escapeHtml(place.summary)}</p>
            <p>${escapeHtml(place.description || "")}</p>
            ${place.address ? `<h3>Address</h3><p>${escapeHtml(place.address)}</p>` : ""}
            ${place.highlights ? `<h3>Highlights</h3>${list(place.highlights)}` : ""}
            ${place.hours ? `<h3>Hours</h3><p>${escapeHtml(place.hours)}</p>` : ""}
            ${place.nearby && place.nearby.length ? `<h3>Nearby</h3>${list(place.nearby)}` : ""}
            ${place.sources ? `<h3>Sources</h3><ul>${place.sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a></li>`).join("")}</ul>` : ""}
            ${place.mapUrl ? `<p><a class="directions" href="${escapeHtml(place.mapUrl)}" target="_blank" rel="noopener noreferrer">Open directions ↗</a></p>` : ""}
            ${place.custom ? `<button class="remove-stop" type="button" data-remove="${escapeHtml(place.id)}">Remove custom stop</button>` : ""}
          </div>` : ""}
        </li>`;
      }).join("")}
    </ul>`;

  if (active) {
    const type = active.markerKind === "hotel" ? "Hotel" : active.day === "sunday" ? "Sunday" : "Saturday";
    scrubLabel.textContent = `${type} · ${active.title}`;
  } else {
    scrubLabel.textContent = scopeLabel();
  }
}

function markerIcon(place, active, position) {
  const isHotel = place.markerKind === "hotel";
  const symbol = isHotel ? "H" : position;
  const markerClass = isHotel ? "map-marker-hotel" : "map-marker-place";
  return L.divIcon({
    className: "marker-shell",
    html: `<div class="map-marker ${markerClass}${active ? " is-active" : ""}"><span>${escapeHtml(symbol)}</span></div><span class="marker-name">${escapeHtml(place.title)}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
}

function clearMapLayers() {
  markers.forEach((marker) => marker.remove());
  markers = [];
  if (line) {
    line.remove();
    line = null;
  }
}

function draw() {
  const rows = visibleRows();
  const active = rows[index] || rows[0] || null;
  index = active ? Math.max(0, rows.findIndex((place) => place.id === active.id)) : 0;
  renderList(active);
  if (!map) return;

  clearMapLayers();
  const itineraryRoute = rows.filter((place) => place.kind !== "hotel");
  if (itineraryRoute.length > 1) {
    line = L.polyline(
      itineraryRoute.map((place) => [place.location.lat, place.location.lng]),
      { color: "#147d79", weight: 4, opacity: 0.72, dashArray: "2 9", lineCap: "round" }
    ).addTo(map);
  }

  rows.forEach((place, rowIndex) => {
    const activeMarker = Boolean(active && place.id === active.id);
    const marker = L.marker([place.location.lat, place.location.lng], {
      icon: markerIcon(place, activeMarker, rowIndex + 1),
      zIndexOffset: activeMarker ? 1000 : place.markerKind === "hotel" ? 600 : 0,
      keyboard: true,
      title: `${place.markerKind === "hotel" ? "Hotel" : "Place"}: ${place.title}`,
      alt: `${place.markerKind === "hotel" ? "Hotel" : "Place"}: ${place.title}`
    });
    marker.on("click", () => select(place.id, true));
    marker.addTo(map);
    markers.push(marker);
  });
}

function setStatus(message, state = "visible") {
  mapStatus.textContent = message;
  mapStatus.dataset.state = state;
}

function updateZoom() {
  if (!map) {
    zoomLabel.textContent = "Zoom —";
    zoomInButton.disabled = true;
    zoomOutButton.disabled = true;
    return;
  }
  const zoom = map.getZoom();
  zoomLabel.textContent = `Zoom ${zoom}`;
  zoomInButton.disabled = zoom >= map.getMaxZoom();
  zoomOutButton.disabled = zoom <= map.getMinZoom();
  mapEl.classList.toggle("show-marker-labels", zoom >= 14);
}

function fitVisible() {
  if (!map) return;
  const rows = visibleRows();
  if (!rows.length) return;
  map.stop();
  map.invalidateSize({ pan: false });
  if (rows.length === 1) {
    map.setView([rows[0].location.lat, rows[0].location.lng], FOCUS_ZOOM, { animate: false });
    return;
  }
  const narrow = window.matchMedia("(max-width: 760px)").matches;
  const panelWidth = narrow ? 0 : Math.min(390, map.getSize().x * 0.4);
  map.fitBounds(rows.map((place) => [place.location.lat, place.location.lng]), {
    paddingTopLeft: [panelWidth + 28, 76],
    paddingBottomRight: [28, narrow ? 292 : 92],
    maxZoom: scope === "newbury" ? 16 : 15,
    animate: false
  });
  updateZoom();
}

function focus(place) {
  if (!map || !place) return;
  map.stop();
  const narrow = window.matchMedia("(max-width: 760px)").matches;
  const point = map.project(L.latLng(place.location.lat, place.location.lng), FOCUS_ZOOM);
  const offset = narrow ? [0, 100] : [120, 30];
  map.setView(map.unproject(point.subtract(offset), FOCUS_ZOOM), FOCUS_ZOOM, { animate: false });
}

function select(id, toggleDetails = false) {
  const rows = visibleRows();
  const next = rows.findIndex((place) => place.id === id);
  if (next < 0) return;
  index = next;
  openId = toggleDetails && openId === id ? null : id;
  draw();
  focus(rows[index]);
}

function fallbackTile() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dcebed"/><path d="M0 64h256M0 128h256M0 192h256M64 0v256M128 0v256M192 0v256" stroke="#bdd2d6" stroke-width="1"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function bootMap() {
  openStopFormButton.disabled = false;
  renderFilters();
  draw();
  if (typeof L === "undefined") {
    mapEl.classList.add("map-unavailable");
    setStatus("The base map could not load. The location list and directions still work.", "error");
    updateZoom();
    return;
  }

  map = L.map("map", {
    zoomControl: false,
    attributionControl: true,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    minZoom: 10,
    maxZoom: 19,
    zoomDelta: 1,
    wheelDebounceTime: 80,
    wheelPxPerZoomLevel: 90,
    trackResize: true
  }).setView([NEWBURY_CENTER.lat, NEWBURY_CENTER.lng], 14);

  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    minZoom: 10,
    maxZoom: 19,
    errorTileUrl: fallbackTile()
  });
  let tileErrors = 0;
  tiles.on("load", () => setStatus("Map ready", "hidden"));
  tiles.on("tileerror", () => {
    tileErrors += 1;
    if (tileErrors === 1) setStatus("Map tiles are loading slowly. Location markers remain available.", "warning");
  });
  tiles.addTo(map);

  map.on("zoomend", updateZoom);
  map.on("moveend", updateZoom);
  draw();
  requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    fitVisible();
  });

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      if (!map) return;
      map.invalidateSize({ pan: false });
    });
    resizeObserver.observe(document.querySelector(".stage"));
  }
}

dayFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scope]");
  if (!button) return;
  scope = button.dataset.scope;
  index = 0;
  openId = null;
  renderFilters();
  draw();
  fitVisible();
});

cardEl.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    const stop = customStops.find((item) => item.id === remove.dataset.remove);
    if (!stop || !window.confirm(`Remove ${stop.title} from this trip?`)) return;
    customStops = customStops.filter((item) => item.id !== stop.id);
    writeLocalJson(CUSTOM_STOPS_KEY, customStops);
    openId = null;
    index = 0;
    draw();
    fitVisible();
    return;
  }
  const sort = event.target.closest("[data-sort]");
  if (sort) {
    sortMode = sort.dataset.sort;
    renderList(visibleRows()[index] || visibleRows()[0]);
    return;
  }
  const row = event.target.closest("[data-id]");
  if (!row || event.target.closest("a")) return;
  select(row.dataset.id, true);
});

function selectAdjacent(delta) {
  const rows = visibleRows();
  if (!rows.length) return;
  index = (index + delta + rows.length) % rows.length;
  openId = null;
  draw();
  focus(rows[index]);
}

function formatFormTime(value) {
  const [hoursText, minutes = "00"] = String(value).split(":");
  const hours = Number(hoursText);
  if (!Number.isFinite(hours)) return "Flexible";
  const suffix = hours >= 12 ? "p.m." : "a.m.";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${suffix}`;
}

async function geocodeAddress(address) {
  const cache = readLocalJson(GEOCODE_CACHE_KEY, {});
  const cacheKey = address.trim().toLowerCase();
  if (cache[cacheKey]) return cache[cacheKey];

  const params = new URLSearchParams({
    q: address,
    format: "jsonv2",
    limit: "1",
    countrycodes: "us"
  });
  const response = await fetch(`${GEOCODER_URL}?${params}`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Location search is temporarily unavailable.");
  const results = await response.json();
  if (!Array.isArray(results) || !results.length) {
    throw new Error("No matching location was found. Try a more complete address.");
  }

  const result = {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    displayName: results[0].display_name || address
  };
  if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
    throw new Error("The location result did not include usable map coordinates.");
  }
  cache[cacheKey] = result;
  writeLocalJson(GEOCODE_CACHE_KEY, cache);
  return result;
}

function closeStopDialog() {
  if (stopDialog.open) stopDialog.close();
  formStatus.textContent = "";
}

openStopFormButton.addEventListener("click", () => {
  formStatus.textContent = "";
  stopDialog.showModal();
  stopForm.elements.title.focus();
});

document.querySelector("#close-stop-form").addEventListener("click", closeStopDialog);
document.querySelector("#cancel-stop-form").addEventListener("click", closeStopDialog);
stopDialog.addEventListener("click", (event) => {
  if (event.target === stopDialog) closeStopDialog();
});

stopForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = stopForm.querySelector('[type="submit"]');
  const formData = new FormData(stopForm);
  const title = String(formData.get("title") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const day = formData.get("day") === "sunday" ? "sunday" : "saturday";
  const kind = formData.get("kind") === "hotel" ? "hotel" : "place";

  submitButton.disabled = true;
  formStatus.textContent = "Finding that location…";
  formStatus.dataset.state = "loading";

  try {
    const result = await geocodeAddress(address);
    const idSuffix = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const stop = {
      id: `custom-${idSuffix}`,
      kind,
      custom: true,
      day,
      start: formatFormTime(formData.get("time")),
      end: "",
      durationFlex: "Custom stop",
      title,
      address: result.displayName,
      summary: `A custom ${kind} added to your ${day} trip.`,
      description: `Pinned from the address “${address}”. This stop is stored only in this browser.`,
      location: { lat: result.lat, lng: result.lng },
      mapUrl: `https://maps.google.com/?q=${encodeURIComponent(result.displayName)}`,
      sources: [{
        label: "Location data © OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/copyright"
      }]
    };

    customStops.push(stop);
    const saved = writeLocalJson(CUSTOM_STOPS_KEY, customStops);
    scope = day;
    openId = stop.id;
    renderFilters();
    index = visibleRows().findIndex((row) => row.id === stop.id);
    draw();
    focus(stop);
    stopForm.reset();
    stopForm.elements.time.value = "09:00";
    closeStopDialog();
    if (!saved) setStatus("The stop is pinned for this session but could not be saved on this device.", "warning");
  } catch (error) {
    formStatus.textContent = error.message || "Could not add this stop.";
    formStatus.dataset.state = "error";
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#prev").addEventListener("click", () => selectAdjacent(-1));
document.querySelector("#next").addEventListener("click", () => selectAdjacent(1));
zoomInButton.addEventListener("click", () => map?.zoomIn());
zoomOutButton.addEventListener("click", () => map?.zoomOut());
resetViewButton.addEventListener("click", fitVisible);

fetch("itinerary-data.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Itinerary request failed with status ${response.status}`);
    return response.json();
  })
  .then((json) => {
    if (!Array.isArray(json.items) || !Array.isArray(json.hotels)) {
      throw new Error("Itinerary data is missing mapped places or hotels");
    }
    data = json;
    bootMap();
  })
  .catch((error) => {
    console.error(error);
    cardEl.hidden = false;
    cardEl.innerHTML = `<div class="load-error"><p class="panel-kicker">Map unavailable</p><h2>Could not load the itinerary</h2><p>Run this site from a local web server, then refresh the page.</p></div>`;
    setStatus("Itinerary data could not load.", "error");
    updateZoom();
  });
