// utils.js — small helpers shared by every module.

// Turn any string (e.g. an artist name) into a stable 32-bit number.
// Same name -> same number every time, so each plant always looks the same.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Tiny seeded random generator (mulberry32). Returns a function giving 0..1.
// Used instead of p5's random() so each plant has its own independent stream.
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Shortest distance from point (px, py) to the line segment (x1,y1)-(x2,y2).
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  // How far along the segment the closest point is (0 = start, 1 = end).
  const t = lenSq ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const months = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function formatMonthYear(date) {
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDate(isoOrDate) {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate + "T00:00:00") : isoOrDate;
  return `${d.getDate()} ${months[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code) {
  try {
    return regionNames.of(code);
  } catch {
    return code;
  }
}
