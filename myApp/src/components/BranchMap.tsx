import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './BranchMap.css';

/**
 * Where the branch sits, and how it is labelled.
 *
 * These are the OpenStreetMap coordinates for the Kauswagan barangay centre in
 * Cagayan de Oro, so the map opens on the right neighbourhood. OSM carries no
 * node for a Pag-Asa Pawnshop inside Kauswagan, so this is the district rather
 * than the storefront: replace the two numbers with the exact position when you
 * have it and nothing else needs to change.
 */
const LATITUDE = 8.4991584;
const LONGITUDE = 124.6390785;

/** Name shown on the overlay label and on the marker's tooltip. */
const BRANCH_NAME = 'Pag-Asa Pawnshop – Kauswagan';

/** The line printed under the map. */
const BRANCH_ADDRESS = 'Kauswagan, Cagayan de Oro City, Misamis Oriental';

/**
 * Google Maps opens on a search for the branch rather than on a pinned
 * coordinate, so a customer tapping through lands on the real listing with its
 * hours and reviews instead of an empty point on the road.
 */
const DIRECTIONS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  'Pag-Asa Pawnshop Kauswagan Cagayan de Oro City'
)}`;

/** How close the map starts. 16 shows the surrounding streets by name. */
const ZOOM = 16;

/**
 * The marker, drawn as HTML rather than an image.
 *
 * Leaflet's stock marker loads three PNGs by relative path, which a bundler
 * rewrites and then fails to find. A divIcon has no assets to lose, and it can
 * carry the site's gold instead of the default blue.
 */
const goldPin = L.divIcon({
  className: 'branch-map-pin',
  html: '<span class="branch-map-pin-dot" aria-hidden="true"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

/**
 * Interactive branch map, drawn with Leaflet over OpenStreetMap tiles.
 *
 * Deliberately plain: one marker, the standard zoom control, and nothing else.
 * Scroll wheel zoom is off so the page still scrolls when a reader passes over
 * the map; clicking the map turns it on for as long as they are working in it.
 */
const BranchMap: React.FC = () => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    // StrictMode runs an effect, tears it down, then runs it again. Leaflet
    // refuses to initialise a container it has already claimed, so any id left
    // on the element from the previous pass is cleared before starting over.
    delete (element as HTMLElement & { _leaflet_id?: number })._leaflet_id;

    const instance = L.map(element, {
      center: [LATITUDE, LONGITUDE],
      zoom: ZOOM,
      // The page owns the scroll until the reader chooses the map.
      scrollWheelZoom: false,
      attributionControl: true,
      // The overlay label sits top left, so the zoom buttons move out from
      // under it rather than covering the branch name.
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(instance);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // OpenStreetMap's licence requires the credit to stay visible.
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);

    L.marker([LATITUDE, LONGITUDE], { icon: goldPin, title: BRANCH_NAME })
      .addTo(instance)
      .bindTooltip(BRANCH_NAME, { direction: 'top', offset: [0, -14] });

    instance.on('click', () => instance.scrollWheelZoom.enable());
    instance.on('mouseout', () => instance.scrollWheelZoom.disable());

    // Leaflet measures the container once, at construction. If the browser has
    // not finished laying the card out by then it reads zero and loads no
    // tiles, which is what leaves the map blank. Re-measuring after the first
    // frame, and again whenever the card is resized, keeps the tile grid
    // matched to the box it is drawn in.
    const remeasure = () => instance.invalidateSize();
    const firstFrame = requestAnimationFrame(remeasure);

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
    observer?.observe(element);

    map.current = instance;

    return () => {
      cancelAnimationFrame(firstFrame);
      observer?.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);

  return (
    <div className="branch-map-card">
      <div className="branch-map-canvas">
        <div className="branch-map-surface" ref={container} role="application" aria-label={`Map of ${BRANCH_NAME}`} />
        <span className="branch-map-badge">
          <i className="branch-map-badge-dot" aria-hidden="true" />
          {BRANCH_NAME}
        </span>
      </div>

      <div className="branch-map-footer">
        <span className="branch-map-address">
          <small>BRANCH LOCATION</small>
          <strong>{BRANCH_ADDRESS}</strong>
        </span>
        <a className="branch-map-directions" href={DIRECTIONS_URL} target="_blank" rel="noreferrer noopener">
          Get Directions
        </a>
      </div>
    </div>
  );
};

export default BranchMap;
