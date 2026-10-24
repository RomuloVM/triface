import { DIRS, card, toPixel, type Color, type Shape, type Special, type Vec } from '@triface/engine';

const SHADES: Record<Color, { top: string; side: string; face: string }> = {
  red: { top: '#ff8a8f', side: '#e5484d', face: '#b3343a' },
  blue: { top: '#8fb4ff', side: '#3e7bfa', face: '#2a5bc4' },
  green: { top: '#7fd6a8', side: '#30a46c', face: '#1f7a4f' },
  gold: { top: '#ffd27a', side: '#f5a524', face: '#c2800f' },
};

/** Blank surfaces: silver for a Mirror's side and face, slate for a Bridge. */
const MIRROR = { side: '#c3cbe6', face: '#8f99bf' };
const BRIDGE = { top: '#b9bcdc', side: '#8a8eb9', face: '#676b98' };

/** Glyph for a blank surface: shine lines on a Mirror, an arch on a Bridge. */
function BlankGlyph({ special }: { special: Special }) {
  if (special === 'mirror') {
    return (
      <g stroke="white" strokeLinecap="round" opacity={0.85}>
        <line x1={22} y1={62} x2={62} y2={22} strokeWidth={10} />
        <line x1={46} y1={80} x2={80} y2={46} strokeWidth={6} />
      </g>
    );
  }
  return (
    <>
      <path d="M16 78 Q50 6 84 78" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={17} strokeLinecap="round" />
      <path d="M16 78 Q50 6 84 78" fill="none" stroke="white" strokeWidth={11} strokeLinecap="round" />
    </>
  );
}

// DIRS indexes: 0=30°, 1=90°, 2=150°, 3=210°, 4=270°, 5=330°.
const D30 = DIRS[0]!;
const D90 = DIRS[1]!;
const D150 = DIRS[2]!;
const D210 = DIRS[3]!;
const D270 = DIRS[4]!;
const D330 = DIRS[5]!;

const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 === 0 ? 36 : 15;
  const t = (Math.PI / 5) * i - Math.PI / 2;
  return `${50 + r * Math.cos(t)},${54 + r * Math.sin(t)}`;
}).join(' ');

export function ShapeGlyph({ shape }: { shape: Shape }) {
  const style = { fill: 'white', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 3 };
  switch (shape) {
    case 'ring':
      return (
        <>
          <circle cx={50} cy={50} r={26} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={17} />
          <circle cx={50} cy={50} r={26} fill="none" stroke="white" strokeWidth={12} />
        </>
      );
    case 'spike':
      return <polygon points="50,16 84,80 16,80" {...style} />;
    case 'block':
      return <rect x={22} y={22} width={56} height={56} {...style} />;
    case 'star':
      return <polygon points={STAR} {...style} />;
  }
}

interface Props {
  cardId: number;
  at: Vec;
  size: number;
  opacity?: number;
}

/** A card drawn as an isometric cube: colored top, numbered side, shaped face. */
export function CardView({ cardId, at, size, opacity = 1 }: Props) {
  const c = card(cardId);
  const shade =
    c.special === 'bridge' ? BRIDGE : c.special === 'mirror' ? { ...SHADES[c.color!], ...MIRROR } : SHADES[c.color!];
  const center = toPixel(at, size);
  const pt = (d: { a: number; b: number }) => {
    const p = toPixel(d, size);
    return { x: center.x + p.x, y: center.y + p.y };
  };
  const vec = (d: { a: number; b: number }) => toPixel(d, size);
  const poly = (...ds: { a: number; b: number }[]) =>
    ds.map((d) => pt(d)).map((p) => `${p.x},${p.y}`).join(' ');
  const O = { a: 0, b: 0 };

  // Maps a 100×100 box onto a surface: origin, then the u and v edge vectors.
  const surface = (origin: { a: number; b: number }, u: { a: number; b: number }, v: { a: number; b: number }) => {
    const o = pt(origin);
    const uu = vec(u);
    const vv = vec(v);
    return `matrix(${uu.x / 100} ${uu.y / 100} ${vv.x / 100} ${vv.y / 100} ${o.x} ${o.y})`;
  };

  return (
    <g opacity={opacity} strokeLinejoin="round">
      <polygon points={poly(O, D30, D90, D150)} fill={shade.top} stroke="#14142b" strokeWidth={1.5} />
      <polygon points={poly(O, D270, D330, D30)} fill={shade.side} stroke="#14142b" strokeWidth={1.5} />
      <polygon points={poly(O, D150, D210, D270)} fill={shade.face} stroke="#14142b" strokeWidth={1.5} />
      <g transform={surface(D150, D30, D330)}>
        <rect x={30} y={30} width={40} height={40} fill="white" opacity={0.35} />
      </g>
      <g transform={surface(O, D30, D270)}>
        {c.num === null ? (
          <BlankGlyph special={c.special!} />
        ) : (
          <text
            x={50}
            y={52}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={70}
            fontWeight={800}
            fill="white"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={3}
            fontFamily="system-ui, sans-serif"
          >
            {c.num}
          </text>
        )}
      </g>
      <g transform={surface(D150, D330, D270)}>
        {c.shape ? <ShapeGlyph shape={c.shape} /> : <BlankGlyph special={c.special!} />}
      </g>
    </g>
  );
}

/** A standalone card for the hand, in its own SVG. */
export function CardIcon({ cardId, size = 34 }: { cardId: number; size?: number }) {
  const w = Math.sqrt(3) * size;
  const h = 2 * size;
  return (
    <svg width={w + 4} height={h + 4} viewBox={`${-w / 2 - 2} ${-h / 2 - 2} ${w + 4} ${h + 4}`} aria-hidden>
      <CardView cardId={cardId} at={{ a: 0, b: 0 }} size={size} />
    </svg>
  );
}
