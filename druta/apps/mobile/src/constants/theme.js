// Druta — Quantum Black Design System
export const COLORS = {
  // Core blacks
  black: "#000000",
  bg: "#050505",
  surface: "#0C0C0E",
  surfaceLight: "#141416",
  surfaceElevated: "#1A1A1E",

  // Electric blue accent
  accent: "#2D7AFF",
  accentDim: "rgba(45,122,255,0.25)",
  accentGlow: "rgba(45,122,255,0.12)",
  accentMuted: "rgba(45,122,255,0.08)",

  // Secondary accents
  cyan: "#00D4FF",
  cyanDim: "rgba(0,212,255,0.2)",
  orange: "#FF6B35",
  orangeDim: "rgba(255,107,53,0.2)",
  red: "#FF3B5C",
  redDim: "rgba(255,59,92,0.15)",
  green: "#00E676",
  greenDim: "rgba(0,230,118,0.15)",
  purple: "#8B5CF6",
  purpleDim: "rgba(139,92,246,0.15)",
  gold: "#FFCA28",
  goldDim: "rgba(255,202,40,0.15)",

  // Typography
  white: "#FFFFFF",
  textPrimary: "#FAFAFA",
  textSecondary: "rgba(255,255,255,0.6)",
  textTertiary: "rgba(255,255,255,0.35)",
  textDisabled: "rgba(255,255,255,0.18)",

  // Borders & dividers
  border: "rgba(255,255,255,0.06)",
  borderLight: "rgba(255,255,255,0.10)",
  borderAccent: "rgba(45,122,255,0.20)",

  // Cards
  card: "rgba(255,255,255,0.04)",
  cardHover: "rgba(255,255,255,0.07)",
  cardBorder: "rgba(255,255,255,0.06)",

  // Legacy mappings (so nothing breaks)
  navy: "#050505",
  navyLight: "#0C0C0E",
  navyMid: "#141416",
  teal: "#2D7AFF",
  tealDim: "rgba(45,122,255,0.25)",
  tealGlow: "rgba(45,122,255,0.12)",
  gray100: "rgba(255,255,255,0.9)",
  gray200: "rgba(255,255,255,0.7)",
  gray300: "rgba(255,255,255,0.5)",
  gray400: "rgba(255,255,255,0.35)",
  gray500: "rgba(255,255,255,0.18)",
  gray600: "rgba(255,255,255,0.08)",
  gray700: "rgba(255,255,255,0.04)",
  danger: "#FF3B5C",
  success: "#00E676",
};

export const GRID_SIZE_METERS = 200;

export function latLngToGrid(lat, lng) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const gridLat = Math.floor((lat * metersPerDegreeLat) / GRID_SIZE_METERS);
  const gridLng = Math.floor((lng * metersPerDegreeLng) / GRID_SIZE_METERS);
  return { gridLat, gridLng };
}

export function gridToLatLng(gridLat, gridLng, refLat) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((refLat * Math.PI) / 180);
  const lat = (gridLat * GRID_SIZE_METERS) / metersPerDegreeLat;
  const lng = (gridLng * GRID_SIZE_METERS) / metersPerDegreeLng;
  const latEnd = ((gridLat + 1) * GRID_SIZE_METERS) / metersPerDegreeLat;
  const lngEnd = ((gridLng + 1) * GRID_SIZE_METERS) / metersPerDegreeLng;
  return { lat, lng, latEnd, lngEnd };
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatPace(kmPerHour) {
  if (!kmPerHour || kmPerHour <= 0) return "--:--";
  const minPerKm = 60 / kmPerHour;
  const mins = Math.floor(minPerKm);
  const secs = Math.floor((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const TERRITORY_COLORS = [
  "#2D7AFF",
  "#FF6B35",
  "#8B5CF6",
  "#FFCA28",
  "#FF3B5C",
  "#00D4FF",
  "#EC4899",
  "#00E676",
  "#F97316",
  "#6366F1",
];

export function getOwnerColor(ownerId) {
  if (!ownerId) return "rgba(255,255,255,0.1)";
  const raw = String(ownerId);
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return TERRITORY_COLORS[Math.abs(hash) % TERRITORY_COLORS.length];
}
