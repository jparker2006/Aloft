# Aloft

A browser game about a lone sailor crossing a violent storm in a brigantine. Read `docs/SPEC.md` and `docs/MILESTONES.md` before starting work.

## Build rules

- **Stack.** Three.js `WebGPURenderer` with TSL, Vite and strict TypeScript. The ocean, particles, cloth and rope run in compute shaders. WebGPU only: there is no WebGL fallback.
- **Assets.** Every 3D asset is built by a Python script in `tools/blender/`, run headless (`blender -b -P <script> -- --out public/assets/<name>.glb`), and exported as GLB to `public/assets/`. Scripts must be rerunnable and deterministic. Keep the GLB contract tests in step with the scripts.
- **Visual loop.** After every visual change:
  1. Run `npm run capture`.
  2. Compare the captures against `references/`.
  3. Write a short critique to `docs/critiques/`.
  4. Only then continue.
- **Feel gate.** Any change to physics, controls or game feel needs the user's approval **before committing**. Show the diff and a tuning table, then wait. Feel constants live in `src/game/tuning.ts`.
- **Punctuation.** No em dashes anywhere: code, comments, UI copy, docs or commit messages.
- **Reference clone.** `reference/` is a local clone under a view-only license. Study it, but never copy its code, shaders, assets or visual theme into this repo, and never commit it.
