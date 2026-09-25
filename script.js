const timeline = document.querySelector("#timeline");
const dayFilters = document.querySelector("#day-filters");
const toggleAll = document.querySelector("#toggle-all");

let data;
let day = "all";
let openIds = new Set();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function list(items) {
  if (!items || !items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function sources(items) {
  if (!items || !items.length) return "";
  return `<h3>Sources</h3><ul class="sources">${items
    .map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a></li>`)
    .join("")}</ul>`;
}

function transitBlock(transit) {
  if (!transit) return "";
  const cells = [
    ["Mode", transit.mode],
    ["Line", transit.line],
    ["From", transit.from],
    ["To", transit.to],
    ["Time", transit.minutes],
    ["Fare", transit.fare]
  ];
  return `<div class="transit-grid">${cells
    .map(([label, value]) => `<div><span>${label}</span>${escapeHtml(value)}</div>`)
    .join("")}</div><p>${escapeHtml(transit.note)}</p>`;
}

function card(item) {
  const open = openIds.has(item.id);
  const address = item.address ? `<h3>Location</h3><p>${escapeHtml(item.address)}</p>` : "";
  const hours = item.hours ? `<h3>Hours</h3><p>${escapeHtml(item.hours)}</p>` : "";
  const visit = item.visit ? `<h3>How long to stay</h3><p>${escapeHtml(item.visit)}</p>` : "";
  const map = item.mapUrl
    ? `<p><a href="${escapeHtml(item.mapUrl)}" target="_blank" rel="noopener noreferrer">Open in maps</a></p>`
    : "";

  return `<article class="card" data-kind="${escapeHtml(item.kind)}">
    <div class="when"><strong>${escapeHtml(item.start)}</strong>${escapeHtml(item.end)}</div>
    <div class="rail" aria-hidden="true"><span class="dot"></span></div>
    <div class="panel" data-open="${open ? "true" : "false"}">
      <button class="summary" type="button" aria-expanded="${open ? "true" : "false"}" data-id="${escapeHtml(item.id)}">
        <span class="kicker-row">
          ${item.kicker ? `<span class="kicker">${escapeHtml(item.kicker)}</span>` : ""}
          <span class="pill">${escapeHtml(item.durationFlex)}</span>
          ${item.neighborhood ? `<span class="pill">${escapeHtml(item.neighborhood)}</span>` : ""}
        </span>
        <h2>${escapeHtml(item.title)}</h2>
        <p><span class="time-mobile">${escapeHtml(item.start)}–${escapeHtml(item.end)} · </span>${escapeHtml(item.summary)}</p>
        <span class="chevron" aria-hidden="true"></span>
      </button>
      <div class="details">
        <p>${escapeHtml(item.description)}</p>
        ${item.highlights && item.highlights.length ? `<h3>Highlights</h3>${list(item.highlights)}` : ""}
        ${transitBlock(item.transit)}
        ${address}
        ${hours}
        ${visit}
        ${item.nearby && item.nearby.length ? `<h3>Nearby</h3>${list(item.nearby)}` : ""}
        ${map}
        ${sources(item.sources)}
      </div>
    </div>
  </article>`;
}

function renderFacts() {
  document.querySelector("#title").textContent = data.title;
  document.querySelector("#lede").textContent = data.subtitle + " " + data.flexibility;
  document.querySelector("#premise").textContent = data.premise;
  document.querySelector("#facts").innerHTML = `
    <div><dt>Window</dt><dd>${escapeHtml(data.window.startLabel)} – ${escapeHtml(data.window.endLabel)}</dd></div>
    <div><dt>Length</dt><dd>${escapeHtml(data.window.hours)} hours</dd></div>
    <div><dt>Places</dt><dd>Seven stops</dd></div>`;
}

function renderFilters() {
  const buttons = [
    ["all", "Full weekend"],
    ...data.days.map((entry) => [entry.id, entry.label])
  ];
  dayFilters.innerHTML = buttons
    .map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === day ? "true" : "false"}" data-day="${escapeHtml(id)}">${escapeHtml(label)}</button>`)
    .join("");
}

function renderTimeline() {
  const items = data.items.filter((item) => day === "all" || item.day === day);
  if (!items.length) {
    timeline.innerHTML = `<p class="empty">Nothing in this day.</p>`;
    return;
  }
  timeline.innerHTML = items.map(card).join("");
}

function syncToggle() {
  const visible = data.items.filter((item) => day === "all" || item.day === day);
  const allOpen = visible.every((item) => openIds.has(item.id));
  toggleAll.textContent = allOpen ? "Collapse all" : "Expand all";
  toggleAll.setAttribute("aria-pressed", allOpen ? "true" : "false");
}

dayFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-day]");
  if (!button) return;
  day = button.dataset.day;
  renderFilters();
  renderTimeline();
  syncToggle();
});

timeline.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  const id = button.dataset.id;
  if (openIds.has(id)) openIds.delete(id);
  else openIds.add(id);
  renderTimeline();
  syncToggle();
});

toggleAll.addEventListener("click", () => {
  const visible = data.items.filter((item) => day === "all" || item.day === day);
  const allOpen = visible.every((item) => openIds.has(item.id));
  visible.forEach((item) => {
    if (allOpen) openIds.delete(item.id);
    else openIds.add(item.id);
  });
  renderTimeline();
  syncToggle();
});

fetch("itinerary-data.json")
  .then((response) => {
    if (!response.ok) throw new Error("Could not load itinerary-data.json");
    return response.json();
  })
  .then((json) => {
    data = json;
    renderFacts();
    renderFilters();
    renderTimeline();
    syncToggle();
  })
  .catch((error) => {
    timeline.innerHTML = `<p class="empty">${escapeHtml(error.message)}. Open this page from a local server so the JSON can load.</p>`;
  });
