/**
 * Shared color constants for flood risk and drainage status levels.
 * Consumed by both map layers (as RGB arrays) and UI components (as hex strings).
 */

// RGB arrays for deck.gl layers
export const RISK_COLORS_RGB = {
  SAFE: [16, 185, 129],
  CAUTION: [245, 158, 11],
  HIGH: [249, 115, 22],
  CRITICAL: [239, 68, 68],
};

export const STATUS_COLORS_RGB = {
  NORMAL: [16, 185, 129],
  WARNING: [245, 158, 11],
  SURCHARGE: [239, 68, 68],
  BACKFLOW: [249, 115, 22],
};

// Hex strings for CSS / inline styles
export const RISK_COLORS_HEX = {
  SAFE: '#10b981',
  CAUTION: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

export const TIER_LABELS = {
  A: 'Verified Municipal',
  B: 'GIS-Derived',
  C: 'Estimated',
};
