import { useState } from 'react';
import { DIRS, toPixel, vkey, type Placement, type Vec } from '@triface/engine';
import { CardView } from './CardView.tsx';

const SIZE = 30;

interface Props {
  board: Placement[];
  radius: number;
  /** Card being placed, and where it may go. */
  selected: number | null;
  spots: Vec[];
  onPlace: (at: Vec) => void;
}

export function Board({ board, radius, selected, spots, onPlace }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const edge = DIRS.map((d) => toPixel({ a: d.a * radius, b: d.b * radius }, SIZE));

  // Zoom to the cards in play (and any highlighted spots), with room around them.
  const centers = [...board.map((p) => p.at), ...(selected === null ? [] : spots)].map((at) => toPixel(at, SIZE));
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
        spots.map((at) => {
          const key = vkey(at);
          const c = toPixel(at, SIZE);
          const outline = DIRS.map((d) => toPixel(d, SIZE * 0.92))
            .map((p) => `${c.x + p.x},${c.y + p.y}`)
            .join(' ');
          return (
            <g
              key={key}
              className="spot"
              role="button"
              aria-label="Place card here"
              onPointerEnter={() => setHover(key)}
              onPointerLeave={() => setHover((h) => (h === key ? null : h))}
              onClick={() => onPlace(at)}
            >
              {hover === key ? (
                <CardView cardId={selected} at={at} size={SIZE} opacity={0.92} />
              ) : (
                <polygon className="spot-outline" points={outline} />
              )}
              <circle cx={c.x} cy={c.y} r={SIZE} fill="transparent" />
            </g>
          );
        })}
    </svg>
  );
}
