import type { Placement } from './steps';

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}
export function placeCoach(
  target: Box,
  card: { width: number; height: number },
  viewport: Box,
  preferred: Placement = 'auto',
): { top: number; left: number; side: Exclude<Placement, 'auto'> } | null {
  const gap = 16;
  const edge = 12;
  const minX = viewport.left + edge;
  const minY = viewport.top + edge;
  const maxX = viewport.left + viewport.width - edge - card.width;
  const maxY = viewport.top + viewport.height - edge - card.height;
  if (maxX < minX || maxY < minY) return null;
  const clampX = (value: number) => Math.max(minX, Math.min(value, maxX));
  const clampY = (value: number) => Math.max(minY, Math.min(value, maxY));
  const sides: Array<Exclude<Placement, 'auto'>> = ['bottom', 'top', 'right', 'left'];
  const order =
    preferred === 'auto' ? sides : [preferred, ...sides.filter((side) => side !== preferred)];
  for (const side of order) {
    const horizontal = side === 'left' || side === 'right';
    const left =
      side === 'left'
        ? target.left - gap - card.width
        : side === 'right'
          ? target.left + target.width + gap
          : clampX(target.left + (target.width - card.width) / 2);
    const top =
      side === 'top'
        ? target.top - gap - card.height
        : side === 'bottom'
          ? target.top + target.height + gap
          : clampY(target.top + (target.height - card.height) / 2);
    if (
      left >= minX &&
      left <= maxX &&
      top >= minY &&
      top <= maxY &&
      (horizontal ||
        top + card.height <= target.top - gap ||
        top >= target.top + target.height + gap)
    )
      return { left, top, side };
  }
  return null;
}
