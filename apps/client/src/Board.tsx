import {
  DIRS,
  toPixel,
  vkey,
  type Placement,
  type Surface,
  type SurfaceTouch,
  type Vec,
} from '@triface/engine';
import { CardView } from './CardView.tsx';
import type { Spot } from './explain.ts';

const SIZE = 30;

/** First of the two triangles that make up each surface (see TRIANGLE_SURFACE). */
const FIRST_TRIANGLE: Record<Surface, number> = { top: 0, face: 2, side: 4 };

interface Props {
  board: Placement[];
  radius: number;
  /** Card being placed, and every spot it might try, legal or not. */
  selected: number | null;
  options: Spot[];
  /** The spot being looked at (hovered, or a blocked spot that was tapped). */
  focus: string | null;
  /** Pointer or keyboard focus entering (key) or leaving (null) a spot. */
  onFocus: (key: string | null) => void;
  onPick: (option: Spot) => void;
}

function points(center: Vec, corners: Vec[], scale = 1): string {
  const c = toPixel(center, SIZE);
  return corners
    .map((d) => toPixel(d, SIZE * scale))
    .map((p) => `${c.x + p.x},${c.y + p.y}`)
    .join(' ');
}

/** Outline of a surface of a placed card: its center and three consecutive corners. */
function SurfaceMark({ board, touch }: { board: Placement[]; touch: SurfaceTouch }) {
  const at = board[touch.ref.placement]!.at;
  const k = FIRST_TRIANGLE[touch.ref.surface];
  const corners = [{ a: 0, b: 0 }, DIRS[k]!, DIRS[k + 1]!, DIRS[(k + 2) % 6]!];
  return <polygon className={`touch touch-${touch.status === 'match' ? 'ok' : 'bad'}`} points={points(at, corners)} />;
}

export function Board({ board, radius, selected, options, focus, onFocus, onPick }: Props) {
  const edge = DIRS.map((d) => toPixel({ a: d.a * radius, b: d.b * radius }, SIZE));
  const shown = selected === null ? [] : options;

  // Zoom to the cards in play (and any spots), with room around them.
  const centers = [...board.map((p) => p.at), ...shown.map((o) => o.at)].map((at) => toPixel(at, SIZE));
  const margin = 2.5 * SIZE;
  const minX = Math.min(...centers.map((c) => c.x)) - margin;
  const maxX = Math.max(...centers.map((c) => c.x)) + margin;
  const minY = Math.min(...centers.map((c) => c.y)) - margin;
  const maxY = Math.max(...centers.map((c) => c.y)) + margin;
  const minSpan = 8 * SIZE;
  const w = Math.max(maxX - minX, minSpan);
  const h = Math.max(maxY - minY, minSpan);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const focused = shown.find((o) => vkey(o.at) === focus);

  return (
    <svg
      className="board"
      viewBox={`${cx - w / 2} ${cy - h / 2} ${w} ${h}`}
      role="img"
      aria-label={`Board with ${board.length} cards`}
    >
      <polygon className="board-edge" points={edge.map((p) => `${p.x},${p.y}`).join(' ')} />
      {board.map((p, i) => (
        <CardView key={i} cardId={p.cardId} at={p.at} size={SIZE} />
      ))}
      {selected !== null &&
        shown.map((option) => {
          const key = vkey(option.at);
          const ok = option.allowed;
          const c = toPixel(option.at, SIZE);
          const look = () => onFocus(key);
          return (
            <g
              key={key}
              className={ok ? 'spot' : 'spot blocked'}
              role="button"
              tabIndex={0}
              aria-label={ok ? 'Place card here' : "Spot where this card can't go"}
              onPointerEnter={look}
              onFocus={look}
              onPointerLeave={() => onFocus(null)}
              onBlur={() => onFocus(null)}
              onClick={() => onPick(option)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(option)}
            >
              {focus === key ? (
                <CardView cardId={selected} at={option.at} size={SIZE} opacity={ok ? 0.92 : 0.45} />
              ) : (
                <polygon className={ok ? 'spot-outline' : 'spot-blocked'} points={points(option.at, [...DIRS], 0.92)} />
              )}
              <circle cx={c.x} cy={c.y} r={SIZE} fill="transparent" />
            </g>
          );
        })}
      {focused && (
        <g className="touches" pointerEvents="none">
          {focused.touches.map((t) => (
            <SurfaceMark key={`${t.ref.placement}:${t.ref.surface}`} board={board} touch={t} />
          ))}
          <polygon
            className={focused.allowed ? 'reach reach-ok' : 'reach reach-bad'}
            points={points(focused.at, [...DIRS])}
          />
        </g>
      )}
    </svg>
  );
}
