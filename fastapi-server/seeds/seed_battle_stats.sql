-- ============================================================================
--  seed_battle_stats.sql  —  battle-stat backfill for EVERY pet in the DB
-- ============================================================================
--  Target DB : the FastAPI Postgres database (DATABASE_URL). NOT the Node sqlite.
--  Run       : psql "$DATABASE_URL" -f fastapi-server/seeds/seed_battle_stats.sql
--  What it does:
--    Adds the auto-battler keys (baseAttack, baseHealth, special) into each
--    species' existing pet_species.config JSON. These reach the client for free
--    via the **s.config spread in /pets/species, and the simulator reads them
--    straight from config.
--  Coverage : ALL 51 species currently seeded —
--               * 11 base roster        (seeds/seed_pet_species.sql)
--               * 40 bonus-box pets     (seeds/custom/seed_custom_pet_species.sql)
--  Idempotent: uses jsonb concat (||), which OVERWRITES only these three keys
--    and leaves behaviorBag / animations / behaviorWeights intact. Safe to re-run.
--  Note: config is a `json` column, so we cast to jsonb to merge, then back to json.
--  Balance rules (docs/pet_battle.md §7a):
--    rarity budget (baseAttack+baseHealth): common 5, uncommon 7, rare 9,
--    epic 12, legendary 15 — redistributable for personality (atk>=1, hp>=1).
--    special magnitude is set by rarity: uncommon 1, rare 2, epic 3, legendary 4
--    (effective in battle = magnitude * level). Commons get no special (null).
--  Prereq: the pet_species rows must already exist
--    (run seed_pet_species.sql AND custom/seed_custom_pet_species.sql first).
-- ============================================================================

-- -------------------------------------------------------------------------
--  Base roster (11)  — docs/pet_battle.md §7b
-- -------------------------------------------------------------------------
BEGIN;

-- commons: no special; pet_rock is the tank (1/4).
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'cat';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'stick_figure';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'semicolon';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":1,"baseHealth":4,"special":null}'::jsonb)::json WHERE species_id = 'pet_rock';

-- uncommons
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":4,"special":{"id":"pep_talk","name":"Rubber Duck Debugging","description":"Start of battle: the ally directly behind gains +m attack and +m health.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'rubber_duck';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":3,"special":{"id":"adrenaline","name":"Caffeine Spike","description":"When hurt and surviving: permanently gain +m attack.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'coffee_mug';

-- rares
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":7,"baseHealth":2,"special":{"id":"recoil_blast","name":"Recoil Blast","description":"Before attacking: also deal m splash damage to the enemy directly behind the front.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'desk_gun';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":5,"special":{"id":"snipe","name":"404: Pet Not Found","description":"Start of battle: deal 2*m damage to the enemy with the lowest current health.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'ghost_404';

-- epics
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":6,"baseHealth":6,"special":{"id":"summon_token","name":"Shatterstrike","description":"On faint: summon a (2*level)/(2*level) shard at the front of this line.","tier":3,"magnitude":3}}'::jsonb)::json WHERE species_id = 'bonk_hammer';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":5,"baseHealth":7,"special":{"id":"jackpot","name":"Disco Fever","description":"Start of battle: give ALL allies +m attack and +ceil(m/2) health.","tier":3,"magnitude":3}}'::jsonb)::json WHERE species_id = 'disco_ball';

-- legendary
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":6,"baseHealth":9,"special":{"id":"jackpot","name":"Drop the Loot","description":"Start of battle: give ALL allies +m attack and +ceil(m/2) health.","tier":4,"magnitude":4}}'::jsonb)::json WHERE species_id = 'loot_goblin';

COMMIT;

-- -------------------------------------------------------------------------
--  Breakfast Brigade (10)
-- -------------------------------------------------------------------------
BEGIN;

-- commons (no special)
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":2,"special":null}'::jsonb)::json WHERE species_id = 'angry_toast';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":1,"baseHealth":4,"special":null}'::jsonb)::json WHERE species_id = 'soggy_cereal';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'lil_pancake';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":2,"special":null}'::jsonb)::json WHERE species_id = 'bean_buddy';
-- uncommons
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":5,"special":{"id":"guard_stance","name":"Crispy Guard","description":"Start of battle: give the ally in front +m health (or itself if it is the front).","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'sir_bacon';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":3,"special":{"id":"splash_damage","name":"Yolk Splatter","description":"On faint: deal m damage to the current enemy front pet.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'eggward';
-- rares
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":5,"special":{"id":"pep_talk","name":"Royal Decree","description":"Start of battle: the ally directly behind gains +m attack and +m health.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'waffle_lord';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":5,"baseHealth":4,"special":{"id":"splash_damage","name":"Sour Spray","description":"On faint: deal m damage to the current enemy front pet.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'milk_gone_bad';
-- epic
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":5,"baseHealth":7,"special":{"id":"jackpot","name":"Avocado Rally","description":"Start of battle: give ALL allies +m attack and +ceil(m/2) health.","tier":3,"magnitude":3}}'::jsonb)::json WHERE species_id = 'captain_avocado';
-- legendary
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":6,"baseHealth":9,"special":{"id":"jackpot","name":"Most Important Meal","description":"Start of battle: give ALL allies +m attack and +ceil(m/2) health.","tier":4,"magnitude":4}}'::jsonb)::json WHERE species_id = 'the_big_breakfast';

COMMIT;

-- -------------------------------------------------------------------------
--  Cryptid Corner (10)
-- -------------------------------------------------------------------------
BEGIN;

-- commons (no special)
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'smol_foot';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'derp_nessie';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'mothboi';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":2,"special":null}'::jsonb)::json WHERE species_id = 'goblino';
-- uncommons
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":3,"special":{"id":"adrenaline","name":"Jackrabbit Rush","description":"When hurt and surviving: permanently gain +m attack.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'jackalope';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":4,"special":{"id":"pep_talk","name":"Pack Howl","description":"Start of battle: the ally directly behind gains +m attack and +m health.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'chupa_pup';
-- rares
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":6,"special":{"id":"guard_stance","name":"Frozen Bulwark","description":"Start of battle: give the ally in front +m health (or itself if it is the front).","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'yeti_cube';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":5,"baseHealth":4,"special":{"id":"snipe","name":"Omen Strike","description":"Start of battle: deal 2*m damage to the enemy with the lowest current health.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'mini_mothman';
-- epic
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":6,"baseHealth":6,"special":{"id":"summon_token","name":"Spawnling","description":"On faint: summon a (2*level)/(2*level) token at the front of this line.","tier":3,"magnitude":3}}'::jsonb)::json WHERE species_id = 'lake_lizard';
-- legendary
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":5,"baseHealth":10,"special":{"id":"second_wind","name":"Ancient Resurfacing","description":"On faint: the first time, revive at half health (once per battle).","tier":4,"magnitude":4}}'::jsonb)::json WHERE species_id = 'the_ogopogo';

COMMIT;

-- -------------------------------------------------------------------------
--  Haunted Hardware (10)
-- -------------------------------------------------------------------------
BEGIN;

-- commons (no special)
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'floppy_disk';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'usb_stick';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":1,"baseHealth":4,"special":null}'::jsonb)::json WHERE species_id = 'dead_battery';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":2,"special":null}'::jsonb)::json WHERE species_id = 'angry_router';
-- uncommons
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":4,"special":{"id":"splash_damage","name":"Debris Field","description":"On faint: deal m damage to the current enemy front pet.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'roomba_lost';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":3,"special":{"id":"adrenaline","name":"Static Surge","description":"When hurt and surviving: permanently gain +m attack.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'crt_goblin';
-- rares
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":5,"baseHealth":4,"special":{"id":"snipe","name":"Fatal Exception","description":"Start of battle: deal 2*m damage to the enemy with the lowest current health.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'bsod_ghost';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":6,"baseHealth":3,"special":{"id":"recoil_blast","name":"Spring Launch","description":"Before attacking: also deal m splash damage to the enemy directly behind the front.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'toasted_toaster';
-- epic
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":7,"baseHealth":5,"special":{"id":"recoil_blast","name":"Paper Jam Blast","description":"Before attacking: also deal m splash damage to the enemy directly behind the front.","tier":3,"magnitude":3}}'::jsonb)::json WHERE species_id = 'printer_jam';
-- legendary
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":6,"baseHealth":9,"special":{"id":"summon_token","name":"Fork Process","description":"On faint: summon a (2*level)/(2*level) token at the front of this line.","tier":4,"magnitude":4}}'::jsonb)::json WHERE species_id = 'the_mainframe';

COMMIT;

-- -------------------------------------------------------------------------
--  Barnyard Blunders (10)
-- -------------------------------------------------------------------------
BEGIN;

-- commons (no special)
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":2,"special":null}'::jsonb)::json WHERE species_id = 'confused_goose';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":1,"baseHealth":4,"special":null}'::jsonb)::json WHERE species_id = 'round_pigeon';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":2,"special":null}'::jsonb)::json WHERE species_id = 'screaming_goat';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'derpy_duckling';
-- uncommons
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":5,"special":{"id":"guard_stance","name":"Chonk Wall","description":"Start of battle: give the ally in front +m health (or itself if it is the front).","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'chonk_capybara';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":4,"special":{"id":"pep_talk","name":"Tiny Pep","description":"Start of battle: the ally directly behind gains +m attack and +m health.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'shrimp_fella';
-- rares
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":6,"special":{"id":"second_wind","name":"Regenerate","description":"On faint: the first time, revive at half health (once per battle).","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'axolotl_pal';
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":5,"special":{"id":"adrenaline","name":"Drama Fuel","description":"When hurt and surviving: permanently gain +m attack.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'llama_drama';
-- epic
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":8,"special":{"id":"guard_stance","name":"Cattle Guard","description":"Start of battle: give the ally in front +m health (or itself if it is the front).","tier":3,"magnitude":3}}'::jsonb)::json WHERE species_id = 'cow_unbalanced';
-- legendary
UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":8,"baseHealth":7,"special":{"id":"snipe","name":"Honk of Doom","description":"Start of battle: deal 2*m damage to the enemy with the lowest current health.","tier":4,"magnitude":4}}'::jsonb)::json WHERE species_id = 'the_goose_prime';

COMMIT;

-- ----------------------------------------------------------------------------
-- Verify (uncomment to eyeball every species' battle stats):
-- SELECT species_id, rarity,
--        config->>'baseAttack' AS atk,
--        config->>'baseHealth' AS hp,
--        config->'special'->>'id' AS special
-- FROM pet_species ORDER BY
--   array_position(ARRAY['common','uncommon','rare','epic','legendary'], rarity),
--   species_id;
--
-- Sanity: every species should now have non-null baseAttack/baseHealth.
-- SELECT count(*) AS missing FROM pet_species WHERE config->>'baseAttack' IS NULL;
--
-- Rollback (uncomment to strip the battle keys back out of ALL rows — these keys
-- are only ever set by this file, so a blanket strip is safe):
-- BEGIN;
-- UPDATE pet_species SET config = (config::jsonb - 'baseAttack' - 'baseHealth' - 'special')::json;
-- COMMIT;
