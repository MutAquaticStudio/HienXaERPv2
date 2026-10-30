/** Leaflet touches `window` when it loads, so the map pulls it in on the client only. One seam, so tests can swap it. */
export const loadLeaflet = () => import("leaflet");
