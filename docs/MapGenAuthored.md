# MapGenAuthored.md

## Purpose

This document defines a second, viable map-rendering strategy for NidoCardBattle: **AI-authored full-map terrain composition**.

It is an alternative to the current per-hex / tiled terrain renderer. Both strategies must remain usable during prototyping so we can compare visual quality, iteration speed, and mobile performance. One strategy may be removed later.

This document owns **presentation architecture only**. Gameplay terrain behavior remains owned by `docs/rules/MapRule.md` and the logical map data.

## Core Principle

The gameplay map remains a normal hex grid even when the terrain is rendered as large authored artwork.

Pathfinding, movement cost, impassable terrain, capture locations, AI, targeting, unit coordinates, and all other gameplay logic must read from the same logical hex map regardless of renderer.

The renderer must never infer gameplay behavior from pixels.

## Rendering Strategies

Support two cleanly switchable rendering modes:

- **Tiled** - the current approach, where terrain is assembled from per-hex textures and overlays.
- **Authored** - a large AI-authored map image composed from broad terrain layers aligned to the same hex grid.

Use one explicit render-mode selection point, for example:

```ts
type MapRenderMode = 'tiled' | 'authored';
```

Do not scatter mode checks throughout gameplay code. The scene should delegate terrain presentation to a renderer/adapter with a shared contract while gameplay consumes the same map model.

## Authored Map Layer Stack

Render authored maps in this order:

1. **Neutral grass base**
   - One large grass texture covering the full playable map.
   - Visually neutral enough to accept every terrain overlay.
   - May be one image or several perfectly aligned chunks if generation/runtime resolution requires it.

2. **Large terrain patches**
   - AI-authored transparent overlays for broad terrain regions.
   - Mountains.
   - Forests.
   - Roads.
   - Rivers / water regions.
   - These are authored as continuous landscape features across many hexes, not repeated one-hex illustrations.
   - Their shapes must follow the predetermined logical hex terrain layout.

3. **Gameplay-location overlays**
   - Forts.
   - Mana Wells.
   - Bridges.
   - Home Keeps and similar explicit map objects.
   - These remain separate transparent assets positioned from logical hex coordinates so they can be changed independently of the terrain painting.

4. **Units**
   - Units are rendered from their logical hex positions above map terrain and location overlays.

5. **Tactical presentation**
   - Selection, movement/attack highlighting, targeting feedback, VFX, and other interaction presentation remain independent of the terrain renderer.

## Why Features Are Split This Way

Large terrain features benefit from being painted as continuous forms. A forest should read as one forest, a mountain chain as one range, and a river as one connected river rather than a sequence of visibly repeated tiles.

Gameplay objects such as Forts, Mana Wells, and Bridges must stay independent because they have explicit gameplay positions, ownership/state, and may change independently of the background art.

Units must never be baked into authored terrain.

## AI Authoring Workflow

1. Design the logical hex map first.
2. Lock map dimensions, hex geometry, camera angle, world bounds, and terrain classification.
3. Export or create a guide image representing the terrain regions accurately.
4. Generate a large neutral grass base.
5. Generate large transparent terrain patches that follow the guide:
   - mountain regions,
   - forest regions,
   - roads,
   - rivers.
6. Keep Forts, Mana Wells, Bridges, Keeps, units, and UI out of those terrain generations.
7. Composite the layers in-game using the fixed world coordinate system.
8. Verify every visual feature against the logical hex map before accepting the art.

The AI is responsible for **rendering an authored layout**, not inventing the gameplay layout.

## Resolution / Chunking

A full map may exceed a practical single-generation or runtime texture size.

If necessary, author the map as multiple large chunks, for example four quadrants.

Chunks are a technical storage/rendering detail only:

- all chunks use exactly the same world scale and camera projection,
- neighboring chunks require overlap during generation/editing so seams can be corrected,
- final chunks must align pixel-perfectly in world space,
- chunk borders must never affect gameplay coordinates,
- chunking must not create independent mini-scenes with different lighting or perspective.

Prefer the smallest number of large images that is visually and technically practical.

## Strict Visual Rules

- Use one consistent distant strategy-game camera across the entire map.
- The hidden logical hex lattice determines where terrain belongs even when no hex borders are painted.
- Terrain scale is globally consistent.
- Mountains visually communicate impassable terrain.
- Rivers form continuous connected water regions.
- Roads form continuous routes.
- Forests read as continuous forest masses rather than circular per-hex clearings.
- Large terrain painting must leave sufficient visual readability for unit sprites.
- Do not bake visible hex outlines into authored terrain.
- Do not bake units, selection states, ownership markers, labels, Forts, Mana Wells, Bridges, or UI into the broad terrain layers.
- Lighting direction, palette, perspective, and detail scale must remain consistent across the whole authored map.

## Renderer Architecture Requirement

Gameplay code must not know whether the terrain is tiled or authored.

Both renderers consume the same logical map definition and world/hex coordinate conversion.

Conceptually:

```ts
interface MapTerrainRenderer {
  preload(): void;
  create(): void;
  destroy(): void;
}
```

The exact API may differ, but the separation is mandatory:

```text
Logical Hex Map
      |
      +-- gameplay / pathfinding / AI / targeting
      |
      +-- TiledMapRenderer
      |
      +-- AuthoredMapRenderer
```

Shared systems such as units, locations, tactical highlights, camera control, input hit-testing, and VFX must not be duplicated between the two map renderers.

## Authored Renderer Data

The authored renderer should use presentation metadata separate from gameplay terrain data, for example:

```ts
{
  base: 'map-grass-base',
  terrainLayers: [
    'map-mountains',
    'map-forest',
    'map-roads',
    'map-river'
  ],
  chunks: 1
}
```

This metadata identifies artwork only. It does not redefine which hexes are forest, mountain, water, road, or passable.

## Prototype Evaluation

Keep both approaches until we can compare them on:

- overall visual quality,
- ability to create a coherent Wesnoth-like landscape,
- unit and tactical readability,
- ease of authoring and revising maps,
- seam/transition quality,
- memory usage and mobile web performance,
- camera zoom quality,
- complexity of adding future maps.

Do not prematurely optimize around either renderer. Keep the boundary clean so removing either implementation later is straightforward.
