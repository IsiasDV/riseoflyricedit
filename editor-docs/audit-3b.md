# Editor Docs: Audit 3b - Placeable Types (Part 2 of 2)

## Placeable Type Table (Part 2 of 2)

| # | Name | Creating File and Function | Parameters | Data Source | Editable? |
|---|------|---------------------------|------------|-------------|-----------|
| 9 | Interactables / Priced Machines | createMapProps({data, mapId, getCollision}) (client/js/maps/map-props.js) | barrier {min,max,cost}, teleporters {a,b,cost}, colorMachine {at,cost}, powerupMachine {at,cost}, lyricMachine {at,cost} | MAP_DATA | Yes |
| 10 | Powerup Drops (Orbs on Ground) | PowerupDirector (client/js/game/powerups.js) | world (for groundAt), rng; drops {id,kind,x,y,z,ttl} | GameSession state | No (runtime drops) |
| 11 | Lyric NPC | LyricNpc (client/js/game/lyric.js) | {x,y,z, world, rng} | Lyric powerup pickup | No (spawned by powerup pickup) |
| 12 | Bullets / Projectiles | ProjectileSystem (client/js/game/projectiles.js) | origin, dir, speed, range, owner, color | GameSession state | No (runtime projectiles) |
| 13 | Weapons | WEAPONS (client/js/game/weapons.js); WeaponController (client/js/game/weapon-controller.js) | hand (melee), gun (projectile) | WEAPONS constants | No (hardcoded weapon definitions) |
| 14 | Combat Hit Resolution | findSlapTarget, findSlapEnemies, instaTouches (client/js/game/combat.js) | attacker {x,y,z,yaw}, others/targets, range/arcDeg/maxDy | Pure functions (no data) | No (logic only) |
| 15 | Characters / Avatars (Playable) | CHARACTERS (client/js/game/characters.js) | model, health, sfx, yawOffset, scale | CHARACTERS constants | No (hardcoded character definitions) |
| 16 | Camera / Sky / Environment | createCamera() (client/js/render/camera.js); createNightSky (client/js/maps/night-sky.js); createStorm (client/js/maps/storm.js) | FOV 70, near 0.1, far 1000; moonDir, etc. | Constants + runtime construction | No (runtime only) |
| 17 | Music / Audio | bgm.js (client/js/ui/bgm.js); spatial-audio.js; announcer.js (AnnounceDead/Lyric/Nuke); sfx.js | bgm.m4a, loadingAudio, secret.opus | Asset files in client/assets/ | No (audio assets) |
| 18 | Rounds / Scoring / Stats / Perks | RoundSystem (client/js/game/rounds.js); scoring.js; MatchStats; PERKS (perks.js) | round N spawns playerCount x N enemies | Constants + runtime state | No (gameplay mechanics) |

---

## Total Placeable Types: 18

This is the complete count of placeable, spawnable, or interactable types in the game. The table contains all 18 types (10 in this file, 8 in audit-3a.md).

---
*End of audit-3b.md*