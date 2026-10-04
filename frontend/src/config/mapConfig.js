/**
 * Map configuration: initial viewport, Chennai pilot area centre,
 * and the Google Maps map ID for vector tile styling.
 *
 * VITE_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY must be set in .env
 * VITE_GOOGLE_MAPS_MAP_ID is optional; enables photorealistic vector 3D features.
 */

export const CHENNAI_TNAGAR_CENTER = {
  lat: 13.0410,
  lng: 80.2355,
};

export const INITIAL_MAP_OPTIONS = {
  center: CHENNAI_TNAGAR_CENTER,
  zoom: 16,
  tilt: 65,
  heading: -15,
  mapTypeId: 'hybrid', // Real Satellite Imagery + Vector Road Overlay
  tiltControl: true,
  headingControl: true,
  rotateControl: true,
  mapTypeControl: true,
  streetViewControl: false,
};

export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  import.meta.env.GOOGLE_MAPS_API_KEY ||
  '';

export const GOOGLE_MAPS_MAP_ID =
  import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ||
  import.meta.env.GOOGLE_MAPS_MAP_ID ||
  '';

