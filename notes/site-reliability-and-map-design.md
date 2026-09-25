# Map reliability and Newbury Street design notes

## What changed

### More reliable zoom and map behavior

- Replaced the relative percentage readout with the map's actual Leaflet zoom level.
- Disabled the zoom-in and zoom-out buttons at the configured minimum and maximum levels.
- Added a **Fit locations** control that restores the correct view for the active filter.
- Added explicit minimum and maximum zoom settings, calmer scroll-wheel sensitivity, and fixed one-level button increments.
- Recalculate the map canvas when its container changes size so markers and tiles stay aligned on responsive layouts.
- Stop any in-progress pan before selecting or fitting a location, which prevents conflicting view updates.
- Fit bounds account for the desktop location panel and the mobile bottom sheet so markers are not hidden behind the UI.

### Better failure handling

- Check the itinerary data response before parsing it and verify that mapped places and hotels exist.
- Keep the location list and external direction links usable if Leaflet fails to load.
- Use a lightweight grid fallback for individual failed map tiles and show a non-blocking status message.
- Show clear loading, slow-tile, and error states instead of leaving a blank map.

### Newbury Street readability

- Added a **Newbury area** filter and made it the initial view.
- The filter includes mapped locations within 0.9 miles of the center of Newbury Street: Trident, Newbury Street, Blank Street Coffee, Boston Common/Public Garden, and Maverick Suites.
- Map labels appear automatically at neighborhood-level zoom and remain available on hover or keyboard focus.
- Numbered place markers match the location list, including after sorting by distance.
- The route uses a quieter dotted line so markers and labels remain the strongest visual elements.
- Added a responsive bottom-sheet layout on narrow screens to keep more of the map visible.

### Hotel versus place markers

- Hotels use a rust-colored, squared pin with an `H`.
- Other locations use deep-teal circular, numbered pins.
- The list repeats the same color, shape, and Hotel/Place text labels; the distinction does not depend on color alone.
- Added a persistent map legend.
- An itinerary item at the same coordinates as a hotel is merged into the hotel presentation instead of suppressing the hotel marker. This fixes Maverick Suites being shown as an ordinary stop.

## Data and interaction rules

- `hotels` in `itinerary-data.json` is the source of truth for hotel classification.
- A mapped itinerary item within 0.05 miles of a hotel inherits the hotel marker style and hotel name.
- A hotel without a matching itinerary item is added as a standalone mapped row.
- The Newbury-area radius is defined by `NEWBURY_CENTER` and `NEWBURY_RADIUS_MILES` in `script.js`.
- Distance sorting measures each location from the hotel assigned to that day.

## Sunday plan added

- 7:15 a.m.: move from Maverick Suites to The Arcadian Hotel on the Green Line C and leave bags.
- 8:15 a.m.: breakfast at Tatte, 420 Harvard Street.
- 9:30 a.m.: browse Brookline Booksmith when it opens.
- 10:40 a.m.: walk the Riverway at Longwood Avenue Bridge.
- 11:20 a.m.: visit the Isabella Stewart Gardner Museum and finish with lunch or coffee at Café G.
- 1:50 p.m.: return to The Arcadian for bags, targeting 2:30 p.m. and preserving a buffer before 3 p.m.

The Sunday filter now has five mapped markers, including the hotel. Transit steps stay in the itinerary data but do not create duplicate map markers.

## Custom trip stops

- The **Add stop** button opens an accessible dialog for a stop name, address/place, day, time, and Place/Hotel type.
- Address lookup runs only when the form is submitted—there is no autocomplete or background geocoding.
- The first matching U.S. location is pinned immediately and the active filter switches to its selected day.
- Custom stops are stored in `localStorage` and restored after refresh on the same browser.
- Successful address results are cached locally to avoid repeating geocoder requests.
- A custom stop can be removed from its expanded details panel.
- Location search uses the public OpenStreetMap Nominatim endpoint. It is configured in one constant so it can be replaced by a proxy or another provider without changing the form logic.

## Map color update

- Changed the interface from warm beige and violet to a cooler coastal blue-green palette.
- Place markers and route lines now use deep teal; hotel markers remain contrasting coral.
- The OpenStreetMap tiles use a restrained blue-gray treatment, and failed tiles use a matching cool-toned grid.

## Verification checklist

- Parse `itinerary-data.json` and run a JavaScript syntax check.
- Confirm the default Newbury view contains four places and one hotel.
- Confirm the Sunday view contains four places and The Arcadian Hotel.
- Confirm Maverick Suites and The Arcadian Hotel both resolve to the hotel marker type.
- Add a custom place and hotel, refresh, and confirm both remain pinned with the correct marker style.
- Remove a custom stop and confirm it disappears from the map and local storage.
- Confirm all filter buttons, list items, zoom controls, fit control, and previous/next controls have accessible names.
- Check that the zoom label updates after button, wheel, and fitted-view changes.
- Check desktop framing at 1440 × 900 and the bottom-sheet layout near 390 × 844 when a browser is available.
- Check the no-Leaflet and failed-tile states remain readable.

## Maintenance notes

- Leaflet and OpenStreetMap tiles are loaded from third-party services. The page now degrades usefully when either is unavailable, but fully offline base maps would require vendoring Leaflet and hosting map tiles or a static map image.
- If more places are added near Newbury Street, keep coordinates accurate; the area filter is geographic rather than a hand-maintained tag list.
