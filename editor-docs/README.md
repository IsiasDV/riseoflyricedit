# Editor Docs - Index

Index of files in this folder. Each file is the result of audit 1 (project overview), audit 2 (level representation), audit 3 (placeable types), audit 4 (systems), audit 5 (blockers), audit 6 (unknowns), audit 7 (verification), and designs 1-7 (map editor design).

## Contents

| File | Description |
|------|-------------|
| audit-1-overview.md | Audit 1: Language, framework, build/run, entry points, main loops, state management. |
| audit-2-level-representation.md | Audit 2: How levels are defined today (map modules, createLevel, MAP_DATA, server/maps.js, readiness flags). |
| audit-3a.md | Audit 3 (part 1 of 2): Placeable types table (1-8). |
| audit-3b.md | Audit 3 (part 2 of 2): Placeable types table (9-18) and total count. |
| audit-4-systems.md | Audit 4: Input, camera, rendering, collision, asset loading, game-session level setup, server map data usage. |
| audit-5-blockers.md | Audit 5: What makes loading map data from JSON difficult (file and function names). |
| audit-6-unknowns.md | Audit 6: What could not be determined (files to check). |
| audit-7-verification.md | Audit 7: Cross-checked audit claims against real source code. |
| design-1-data-format.md | Design 1: Field-by-field schema for every editable group, with inline examples. |
| design-2a-verification-decisions.md | Design 2a: V1-V3 code verification (http-server dir, spawn yaw, singleplayer start) and Decision D1 OVERRIDES file format. |
| design-2b-integration.md | Design 2b: Decision D2 applyOverrides in map-data.js plus gun/ammo migration into MAP_DATA. |
| design-3-architecture.md | Design 3: Decision D4 editor location (client/editor/), new vs changed files, saving/publishing flow. |
| design-4-features.md | Design 4: Decision D5 no yaw; camera, raycast, snapping, palette, ghost, select/move/dup/delete, multi-select, property panel, area handles, undo/redo, save/autosave, layers. |
| design-5-testplay.md | Design 5: Decision D3 test-play via applyOverrides + localStorage JSON, auto-start, ready:false bypass. |
| design-6-validation-risks.md | Design 6: Validation rules using CollisionWorld.groundAt/raycast; three failure points and mitigations. |
| design-7-build-order.md | Design 7: Decision D6 milestones A, B, C, D each ending in runnable test steps. |
| README.md | This file. |

## Key Findings

- **Language**: JavaScript, ESM. Three.js r160 vendored locally. Zero npm dependencies.
- **18 types catalogued**: 5 editable groups - player spawn, enemy areas, gun/ammo pickups, interactables (teleporter {at,to}, colorMachine {at}, powerupMachine {at}, barrier {min,max,cost}, lyricMachine {at,cost}, teleporters {a,b,cost}).
- **Levels are JS modules**, not data files. Map data lives in MAP_DATA (client/js/maps/map-data.js), maps.js (client), and server/maps.js (server mirror).

---

*End of editor-docs/README.md*
