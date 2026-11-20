type Box = { x: number; y: number; width: number; height: number };
type OcrNode = {
  text?: unknown;
  boundingBox?: unknown;
  blocks?: unknown;
  lines?: unknown;
  elements?: unknown;
};

type Fragment = { text: string; box: Box; words: Box[]; angle: number | null };
type ProjectedFragment = { text: string; y: number; height: number; left: number; right: number };
type Row = { y: number; fragments: ProjectedFragment[] };

const HALF_TURN = Math.PI;
const QUARTER_TURN = HALF_TURN / 2;
const ANGLE_TOLERANCE = Math.PI / 9;

function node(value: unknown): OcrNode | null {
  return typeof value === 'object' && value !== null ? value : null;
}

function nodes(value: unknown): OcrNode[] {
  if (!Array.isArray(value)) return [];
  return value.map(node).filter((entry) => entry !== null);
}

function readBox(value: unknown): Box | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y, width, height } = value as Partial<Box>;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' ||
      ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function centerX(box: Box): number {
  return box.x + box.width / 2;
}

function centerY(box: Box): number {
  return box.y + box.height / 2;
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

function angleBetween(a: Box, b: Box): number | null {
  const dx = centerX(b) - centerX(a);
  const dy = centerY(b) - centerY(a);
  const characterSize = Math.max(Math.min(a.width, a.height), Math.min(b.width, b.height));
  return Math.hypot(dx, dy) >= 1.5 * characterSize ? Math.atan2(dy, dx) : null;
}

function collectFragment(line: OcrNode): Fragment | null {
  const elements = nodes(line.elements);
  const text = typeof line.text === 'string' && line.text.trim()
    ? line.text.trim()
    : elements.map((entry) => typeof entry.text === 'string' ? entry.text : '').join(' ').trim();
  if (!text || /[\r\n]/.test(text)) return null;

  const words = elements.map((entry) => readBox(entry.boundingBox)).filter((box) => box !== null);
  let box = readBox(line.boundingBox);
  if (!box && words.length) {
    const x = Math.min(...words.map((word) => word.x));
    const y = Math.min(...words.map((word) => word.y));
    box = {
      x, y,
      width: Math.max(...words.map((word) => word.x + word.width)) - x,
      height: Math.max(...words.map((word) => word.y + word.height)) - y,
    };
  }
  if (!box) return null;
  const first = words[0];
  const last = words[words.length - 1];
  const angle = words.length >= 2 ? angleBetween(first, last) : null;
  return { text, box, words, angle };
}

function normalizedAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function dominantAngle(fragments: Fragment[]): number {
  const samples = fragments.flatMap(({ angle }) => angle === null ? [] : [angle]);
  const votes: number[][] = [[], [], [], []];
  for (const angle of samples) {
    const direction = Math.round(angle / QUARTER_TURN);
    votes[(direction + 4) % 4].push(normalizedAngle(angle - direction * QUARTER_TURN));
  }

  let direction = 0;
  for (let i = 1; i < votes.length; i++) {
    if (votes[i].length > votes[direction].length) direction = i;
  }
  // One rotated line can be a logo or a footer rather than the receipt's orientation.
  if (direction !== 0 && votes[direction].length < 2) direction = 0;
  if (direction % 2 !== 0) {
    const shapes = fragments.filter(({ text }) => text.length >= 4).map(({ box }) => box.width / box.height);
    if (shapes.filter((ratio) => ratio >= 1.5).length > shapes.filter((ratio) => ratio <= 1 / 1.5).length) {
      direction = 0;
    }
  }
  return votes[direction].length ? normalizedAngle(direction * QUARTER_TURN + median(votes[direction])) : 0;
}

function project(fragment: Fragment, angle: number): ProjectedFragment {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const boxes = fragment.words.length ? fragment.words : [fragment.box];
  const projected = boxes.map((box) => {
    const x = centerX(box) * cos + centerY(box) * sin;
    const y = centerY(box) * cos - centerX(box) * sin;
    const width = Math.abs(cos) * box.width + Math.abs(sin) * box.height;
    // Limit inflated height from projecting the horizontal span of a tilted word.
    const axisHeight = Math.abs(cos) >= Math.abs(sin) ? box.height : box.width;
    const height = Math.min(Math.abs(sin) * box.width + Math.abs(cos) * box.height,
      axisHeight * 1.2);
    return { y, height, left: x - width / 2, right: x + width / 2 };
  });
  return {
    text: fragment.text,
    y: median(projected.map((box) => box.y)),
    height: median(projected.map((box) => box.height)),
    left: Math.min(...projected.map((box) => box.left)),
    right: Math.max(...projected.map((box) => box.right)),
  };
}

function canJoin(a: ProjectedFragment, b: ProjectedFragment, typicalHeight: number): boolean {
  const tolerance = 0.55 * Math.min(a.height, b.height, typicalHeight * 1.4);
  const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const smallerWidth = Math.min(a.right - a.left, b.right - b.left);
  return Math.abs(a.y - b.y) <= tolerance && overlap <= 0.18 * smallerWidth;
}

/** Rebuild receipt rows from the ML Kit result. An empty result allows a raw-text fallback. */
export function reconstructReceiptLines(result: unknown): string[] {
  const fragments = nodes(node(result)?.blocks).flatMap((block) => {
    const lines = nodes(block.lines);
    return (lines.length ? lines : [block]).map(collectFragment).filter((fragment) => fragment !== null);
  });
  if (!fragments.length) return [];

  const angle = dominantAngle(fragments);
  const spatial = fragments.map((fragment) => ({
    ...project(fragment, angle),
    aligned: fragment.angle === null || Math.abs(normalizedAngle(fragment.angle - angle)) <= ANGLE_TOLERANCE,
  })).sort((a, b) => a.y - b.y || a.left - b.left);
  const typicalHeight = median(spatial.map((fragment) => fragment.height));
  const rows: Row[] = [];

  for (const fragment of spatial) {
    let closest: Row | undefined;
    let distance = Infinity;
    if (!fragment.aligned) continue;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const gap = Math.abs(fragment.y - row.y);
      if (gap > typicalHeight * 0.77) break;
      if (gap < distance && row.fragments.every((other) => canJoin(fragment, other, typicalHeight))) {
        closest = row;
        distance = gap;
      }
    }
    if (closest) closest.fragments.push(fragment);
    else rows.push({ y: fragment.y, fragments: [fragment] });
  }

  return rows.map((row) => row.fragments.sort((a, b) => a.left - b.left).map(({ text }) => text).join(' '));
}
