# Triface

A browser card game where hexagonal cards look like cubes and stack in pseudo-3D. Match a card's
**color** on the top, its **number** on the side or its **shape** on the face, and be the first to empty your hand.

Full rules: [RULES.md](RULES.md)

> Inspired by **STACCS** by Sticcy. Triface is an independent game with its own rules and art and is not
> affiliated with Sticcy. If you like stacking cubes, **[buy the physical game from its creator at sticcy.cc](https://sticcy.cc/)**.

## Status

- [x] Rules engine with tests (`packages/engine`)
- [x] Pass-the-device prototype in the browser (`apps/client`)
- [ ] Online play, peer-to-peer (no server)
- [ ] GitHub Pages deploy and a single-file download build

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # start the game at http://localhost:5173
npm test           # run the engine tests
npm run typecheck  # type-check the engine and the client
npm run build      # production build in apps/client/dist
```

## Layout

```
packages/engine   Pure TypeScript rules: board geometry, cards, turns, scoring. No UI.
apps/client       React + SVG front end.
RULES.md          The rules, which the engine implements.
```

### How the board works

The board is a triangular lattice. Each card is the hexagon made of the 6 triangles around one lattice
point, and its triangles pair up into three surfaces: top, side and face. To place a card you cover one
or more of the surfaces that are still fully visible, and every surface you cover has to match. See
[`geometry.ts`](packages/engine/src/geometry.ts) and [`board.ts`](packages/engine/src/board.ts).

## License

MIT for code. Art, once added, will be CC-BY 4.0.
