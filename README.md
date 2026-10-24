# Triface

A browser card game where hexagonal cards look like cubes and stack in pseudo-3D. Match a card's
**color** on the top, its **number** on the side or its **shape** on the face, and be the first to empty your hand.

**▶ Play now: https://romulovm.github.io/triface/**

Enter your name, click **Host a game** and send your friends the link. They can also type the 5-letter room
code. There are no accounts and no server: browsers connect to each other directly. You can also play on one
shared screen with **Pass-the-device game**.

Full rules: [RULES.md](RULES.md)

> Inspired by **STACCS** by Sticcy. Triface is an independent game with its own rules and art and is not
> affiliated with Sticcy. If you like stacking cubes, **[buy the physical game from its creator at sticcy.cc](https://sticcy.cc/)**.

## Status

- [x] Rules engine with tests (`packages/engine`)
- [x] Pass-the-device prototype in the browser (`apps/client`)
- [x] Online play, peer-to-peer (no server)
- [x] GitHub Pages deploy (tests run on every push)
- [ ] Single-file download build

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

### How online play works

The host's browser runs the game. It checks every move with the engine and sends each player only their
own view, so other players' hands never reach your browser. Guests send their moves to the host.
[Trystero](https://github.com/dmotz/trystero) connects the browsers over WebRTC, using public Nostr relays
only to find each other. See [`apps/client/src/net`](apps/client/src/net).

- **Reloading is safe.** Each tab keeps a player token, so a guest who reloads gets their seat back. The
  host's game is saved in their browser, so a host reload resumes the game.
- **If the host closes their tab, the game pauses** until they come back.
- **Some strict networks**, like some office, school or mobile networks, block direct connections. Fixing that
  needs a relay server (called a TURN server), which this project doesn't have.
- The host could read everyone's hands with developer tools. Play with friends.

### How the board works

The board is a triangular lattice. Each card is the hexagon made of the 6 triangles around one lattice
point, and its triangles pair up into three surfaces: top, side and face. To place a card you cover one
or more of the surfaces that are still fully visible, and every surface you cover has to match. See
[`geometry.ts`](packages/engine/src/geometry.ts) and [`board.ts`](packages/engine/src/board.ts).

## License

MIT for code. Art, once added, will be CC-BY 4.0.
