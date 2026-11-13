# Editor Docs: Design 4 - Features (Decision D5)

## Decision D5 - Remove yaw

MAP_DATA.spawn is `[x, y, z]` only - there is NO yaw field (verified V2). Yaw is hardcoded to 0 inside
each map module's createLevel. The player controller and camera track their own yaw at runtime, and the
singular teleporter reads `to` as a position (no yaw). Therefore:
- Player Spawn editable fields: x, y, z ONLY (no yaw).
- Teleporter editable fields: at x/y/z, to x/y/z ONLY (no yaw/orientation).
- All other fields unchanged from the prior design.

## Camera
Orbit/fly camera around the map preview scene. Orbit: left-drag rotates, wheel zooms, right-drag pans.
Fly: WASD + Q/E for vertical, shift to speed up. Camera orbits the currently selected item when one is
selected, otherwise orbits the map center.

## Raycast placement
Click on the map surface to place the current palette item. Raycast from camera through click point
against the loaded map geometry (CollisionWorld triangles) plus a ground plane fallback at y=0.
Placement snaps to the hit point y. For enemy areas (min/max boxes), first click sets min corner,
second click sets max corner; a third click cancels. For interactables (at point), single click places
at hit point. Teleporter `to` uses a second click to set destination.

## Snapping
Grid snap toggle: off / 0.5m / 1m / 2m. Position snaps to nearest grid multiple when enabled. Cost snap:
nearest 50. (Yaw snap removed - no yaw in data.)

## Palette
Left rail with item types: Player Spawn, Enemy Area, Enemy Area Open, Gun Spawn, Ammo Spawn, Barrier,
Teleporter, Color Machine, Powerup Machine, Lyric Machine. Click to select the active placement type.
Shows current count of each type placed.

## Placement ghost
Semi-transparent preview of the item at the cursor position before click. For areas, a wireframe box
from min to cursor. For interactables, a small sphere/cylinder at the at point. Ghost follows mouse;
turns red if placement is invalid (outside map bounds, overlapping another area, etc.).

## Select / move / duplicate / delete
Select: click an existing item to select (highlight box). Move: drag selected item on the ground plane
(raycast to floor). Duplicate: ctrl-D copies selected item with offset. Delete: delete key removes
selected item. (No yaw rotation - see D5.)

## Multi-select
Shift-click to add/remove from selection. Drag-select rectangle to select multiple items in the same
group. Property panel shows merged values (cost, etc.) for multi-select; changing a value applies to
all selected.

## Property panel
Right rail. Shows fields for the selected item type:
- Player Spawn: x,y,z
- Enemy Area: min x/y/z, max x/y/z (with box handles in 3D)
- Enemy Area Open: same
- Gun Spawn / Ammo Spawn: x,y,z
- Barrier: min x/y/z, max x/y/z, cost
- Teleporter: at x/y/z, to x/y/z
- Teleporters: a x/y/z, b x/y/z, cost
- Color Machine: at x/y,z
- Powerup Machine: at x/y,z, cost
- Lyric Machine: at x/y,z, cost

Number inputs with up/down arrows. Cost clamped >= 0.

## Enemy-area box handles
When an enemy area is selected, show 8 corner handles + 6 face-center handles in the 3D view. Drag a
handle to resize that dimension; drag a face to move the whole box on that axis. Handles are small cubes
with a distinct color.

## Undo/redo
Command pattern: every edit (place, move, delete, property change) pushes a command onto an undo stack.
Ctrl-Z undoes, Ctrl-Y redoes. Stack capped at 100 entries. Undo/redo disabled when stack empty.

## New / open / save / autosave
- New: clear editor state, start with MAP_DATA defaults for selected map.
- Open: load a previously saved `map-overrides.js` file via file input, apply overrides to editor state.
- Save: download `map-overrides.js` (download-file, design-3).
- Autosave: write editor state to localStorage `editor_draft_<mapId>` on every change (debounced 500ms).
  Restored on page load.

## Layers / visibility
Toggle visibility checkbox per item type (e.g. hide all gun spawns, show only enemy areas). Hidden items
render as ghosted outlines in the preview; cannot be selected while hidden. Layers are per-type only
(no arbitrary layer system).
