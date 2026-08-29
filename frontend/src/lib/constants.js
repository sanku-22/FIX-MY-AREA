export const CATEGORIES = {
  pothole: { label: "Pothole", color: "#FF453A", icon: "TriangleAlert" },
  garbage: { label: "Garbage", color: "#FF9F0A", icon: "Trash2" },
  streetlight: { label: "Streetlight", color: "#0A84FF", icon: "Lightbulb" },
  water: { label: "Water", color: "#5AC8FA", icon: "Droplets" },
  signage: { label: "Signage", color: "#AF52DE", icon: "Signpost" },
  other: { label: "Other", color: "#8E8E93", icon: "CircleDot" },
  uncategorized: { label: "General", color: "#8E8E93", icon: "CircleHelp" },
};

export const FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "pothole", label: "Pothole" },
  { key: "garbage", label: "Garbage" },
  { key: "streetlight", label: "Streetlight" },
  { key: "water", label: "Water" },
  { key: "other", label: "Other" },
];

export const STATUS = {
  open: { label: "Open", color: "#E0913A" },
  in_progress: { label: "In Progress", color: "#5E8DBE" },
  resolved: { label: "Resolved", color: "#4E9E74" },
};

export const TIMELINE_STEPS = [
  { key: "reported", label: "Reported" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];

export const DEFAULT_CENTER = [28.4595, 77.0266]; // Gurugram fallback

export function categoryOf(key) {
  return CATEGORIES[key] || CATEGORIES.uncategorized;
}
