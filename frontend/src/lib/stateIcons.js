// Flat, monoline icon set for Indian states (drawn white-stroke inside a status-colored pin).
// Extend freely: key = normalized (lowercase) state name -> inner SVG path string.
const LANDMARK = '<path d="M4 21h16"/><path d="M6 21V10l6-4 6 4v11"/><path d="M10 21v-5h4v5"/>';
const ARCH = '<path d="M5 21V9a7 7 0 0 1 14 0v12"/><path d="M5 21h14"/><path d="M9 21v-8a3 3 0 0 1 6 0v8"/>';
const WHEAT = '<path d="M12 21V7"/><path d="M12 9c-2-1-3-3-3-5 2 0 4 1 5 3"/><path d="M12 9c2-1 3-3 3-5-2 0-4 1-5 3"/><path d="M12 14c-2-1-3-3-3-5"/><path d="M12 14c2-1 3-3 3-5"/>';
const ONION_DOME = '<path d="M12 3c2 2 3 4 3 6H9c0-2 1-4 3-6z"/><path d="M7 21V11h10v10"/><path d="M4 21h16"/>';
const FORT = '<path d="M4 21V9h2V7h2v2h2V7h2v2h2V7h2v2h2v12"/><path d="M4 21h16"/>';
const GOPURAM = '<path d="M8 21V9l4-4 4 4v12"/><path d="M9 13h6"/><path d="M10 17h4"/><path d="M6 21h12"/>';
const DOME = '<path d="M6 21v-7a6 6 0 0 1 12 0v7"/><path d="M12 4v3"/><path d="M4 21h16"/>';
const PALM = '<path d="M12 21V10"/><path d="M12 10c-3 0-5-2-6-4 3-1 5 0 6 2"/><path d="M12 10c3 0 5-2 6-4-3-1-5 0-6 2"/><path d="M5 21h14"/>';
const CHARMINAR = '<path d="M5 21V10h14v11"/><path d="M6 10V5M9 10V5M15 10V5M18 10V5"/><path d="M4 21h16"/>';
const TEMPLE = '<path d="M5 21V11l7-5 7 5v10"/><path d="M4 21h16"/><path d="M10 21v-4h4v4"/>';

export const STATE_ICONS = {
  "delhi": ARCH,
  "national capital territory of delhi": ARCH,
  "haryana": WHEAT,
  "punjab": WHEAT,
  "uttar pradesh": ONION_DOME,
  "rajasthan": FORT,
  "maharashtra": ARCH,
  "tamil nadu": GOPURAM,
  "west bengal": DOME,
  "gujarat": TEMPLE,
  "karnataka": TEMPLE,
  "kerala": PALM,
  "telangana": CHARMINAR,
  "andhra pradesh": CHARMINAR,
  "madhya pradesh": TEMPLE,
  "bihar": DOME,
};

export function normalizeState(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function getStateGlyph(state) {
  return STATE_ICONS[normalizeState(state)] || LANDMARK;
}

export function hasStateIcon(state) {
  return !!STATE_ICONS[normalizeState(state)];
}
