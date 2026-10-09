# Jungle GT

A late-90s, Gran Turismo-flavoured night race in the browser. You drive a
sky-blue GT-R against five AI cars (JUNGLIST, RIDDIM, SUBZERO, AMEN, REESE)
around a floodlit speedway. Three laps, finishing position read-out, local
leaderboard, and a live-synthesised 170 BPM jungle soundtrack.

Vite + React + TypeScript for the shell, three.js for the 3D, Web Audio for
sound. No assets to download: the car, track, textures and music are all
generated in code.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs dist/
npm run typecheck
```

Bun works too: `bun install`, `bun run dev`, `bun run build`.

## Controls

| Key | Action |
| --- | --- |
| Left / Right | Steer |
| Space (or Up) | Accelerate |
| **Z** (or Down) | Brake; hold at a standstill to reverse |
| C | Camera: chase, far chase, bumper |
| M / N | Music on-off / next track |
| Esc | Pause |
| R | Restart race |

Z is the brake because it sits under your left hand, beside the thumb that is
already resting on the space bar.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo whose default branch is `main`.
2. In the repo go to **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` type-checks, builds and
   publishes automatically (the type-check step is advisory until you remove `continue-on-error`). The site appears at `https://<you>.github.io/<repo>/`.

`vite.config.ts` uses `base: './'`, so no repo name needs configuring. After your
first local `npm install`, commit `package-lock.json`, then switch the workflow
to `npm ci` and add `cache: npm` (the comment in the file shows where).

## The PS1 look

- Renders at 240 lines into an off-screen target, then scales up with
  `image-rendering: pixelated`.
- Vertices are snapped to the pixel grid in a patched vertex shader
  (`patchPSX` in `src/game/psx.ts`), giving the characteristic wobble.
- A post pass reduces colour to 15-bit with a 4x4 ordered dither.
- Lighting is baked into vertex colours. Lamp pools on the asphalt, the
  headlight pools and blob shadows are all fake, as they were on the PS1.
- The GT-R is about 130 triangles, lofted from nine cross-sections.

## Tuning

| Want | Edit |
| --- | --- |
| Longer / shorter / wider track | `STRAIGHT`, `RADIUS`, `ROAD_HALF` in `src/game/track.ts` |
| Car power, braking, grip | `PLAYER_SPEC` in `src/game/race.ts` |
| Harder / easier AI | `skill` values in `AI_DEFS` (`race.ts`); lower is slower |
| Number of laps | `LAPS` in `race.ts` |
| Rubber banding | `rubberBand` block in `src/game/ai.ts` |

## Music

By default the game synthesises its own jungle (amen-style chopped break,
rolling hats, Reese and sub bass, pads). `N` cycles three keys/tempos.

To use real royalty-free tracks, drop them in `public/music/` and list them in
`playlist.json`. See `public/music/README.md` for the format and licensing notes.

## Leaderboard

Times are saved in `localStorage`, so the board is per browser. GitHub Pages is
static hosting and has no server to share scores through. `src/leaderboard.ts`
is small and self-contained: to make it global, swap its four functions for
calls to a hosted backend (Supabase, Firebase, a Cloudflare Worker) and make
the callers `async`.

## Layout

```
src/game/track.ts     track maths: centreline, projection, lateral offset
src/game/car.ts       arcade physics, walls, engine model
src/game/ai.ts        pure-pursuit drivers with corner-speed planning
src/game/race.ts      grid, countdown, laps, standings, car-car collisions
src/game/scene.ts     night speedway, stands, gantry, skyline
src/game/carModel.ts  low-poly GT-R, wheels, shadow, headlight pool
src/game/psx.ts       low-res target, vertex snapping, dithered post pass
src/game/audio.ts     engine, tyres, impacts, music routing
src/game/jungle.ts    procedural jungle drum & bass
src/game/Game.ts      loop, camera, HUD snapshots
src/components/       React UI: title, HUD, results, leaderboard, controls
```
