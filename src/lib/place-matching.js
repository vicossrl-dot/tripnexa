// Shared by the editor and backend; Google IDs take precedence when both exist.
export function normalizePlaceName(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function samePlace(a, b) {
  if (a.place_id && b.place_id) return a.place_id === b.place_id;
  const names = p => [p.name, ...(p.aliases || [])].map(normalizePlaceName).filter(Boolean);
  return names(a).some(left => names(b).some(right => {
    if (left === right) return true;
    // Recognize a location suffix or an activity at the same attraction.
    const shorter = left.length < right.length ? left : right;
    const longer = left.length < right.length ? right : left;
    return shorter.length >= 5 && (` ${longer} `).includes(` ${shorter} `);
  }));
}
