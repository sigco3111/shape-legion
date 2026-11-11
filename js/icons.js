// Pixel bitmap icons ('#' = filled pixel), drawn as SVG rect arrays. No emoji, no images; colour comes from currentColor.
export const BITMAPS = {
  river: ['..##..##.', '.##..##..', '##..##..#', '.........', '..##..##.', '.##..##..', '##..##..#'],
  bridge: ['#########', '#########', '##.###.##', '#...#...#', '#...#...#'],
  wall: ['####.####', '####.####', '.........', '##.######', '##.######', '.........', '####.####'],
  hill: ['....#....', '...###...', '..#####..', '.#######.', '#########'],
  lock: ['..###..', '.#...#.', '.#...#.', '#######', '#######', '###.###', '###.###', '#######'],
  star: ['...#...', '..###..', '#######', '.#####.', '.#####.', '##...##', '#.....#'],
  // unit shapes (same order as UNITS: circle, square, triangle, diamond, pentagon)
  circle: ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'],
  square: ['#######', '#######', '#######', '#######', '#######', '#######', '#######'],
  triangle: ['...#...', '...#...', '..###..', '..###..', '.#####.', '.#####.', '#######'],
  diamond: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  pentagon: ['...#...', '.#####.', '#######', '#######', '#######', '.#####.', '.##.##.'],
};
export const UNIT_SHAPES = ['circle', 'square', 'triangle', 'diamond', 'pentagon'];
const cache = {};
// -> { w, h, rects: [[x, y, w, h], ...] } (horizontal runs per row)
export function iconRects(name) {
  if (cache[name]) return cache[name];
  const rows = BITMAPS[name]; if (!rows) return { w: 0, h: 0, rects: [] };
  const rects = [];
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { if (row[x] !== '#') continue; let e = x; while (e + 1 < row.length && row[e + 1] === '#') e++; rects.push([x, y, e - x + 1, 1]); x = e; } });
  return (cache[name] = { w: rows[0].length, h: rows.length, rects });
}
// px = screen pixels per bitmap pixel (integer keeps edges crisp)
export function iconSvg(name, px = 2, cls = '') {
  const { w, h, rects } = iconRects(name); if (!w) return '';
  return `<svg class="pxi ${cls}" width="${w * px}" height="${h * px}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false">${rects.map((r) => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/>`).join('')}</svg>`;
}
export const unitIcon = (ty, px = 2, cls = '') => iconSvg(UNIT_SHAPES[ty], px, cls);
