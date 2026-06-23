-- ============================================================================
--  seed_pet_species.sql  —  pet catalog seed (PostgreSQL)
-- ============================================================================
--  Target DB : the FastAPI Postgres database (DATABASE_URL). NOT the Node sqlite.
--  Prereq    : tables must already exist -> run `alembic upgrade head` first.
--  Run       : psql "$DATABASE_URL" -f fastapi-server/seeds/seed_pet_species.sql
--  Idempotent: ON CONFLICT (species_id) DO NOTHING -> safe to re-run.
--  Pairs with: seed_lootboxes.sql (run either order; no FK between them).
--  Sprites   : fastapi-server/pet_assets/<species_id>/<behavior>.png must exist
--              (generate with tools/sprite_forge/ascii_to_sprites.py).
--  Rollback  : see the commented DELETE at the bottom of this file.
-- ============================================================================

BEGIN;

INSERT INTO pet_species
    (species_id, display_name, rarity, width, height, default_speed_x100, config, enabled)
VALUES
    ('cat', 'Cat', 'common', 64, 64, 2000, '{"behaviorBag":["idle","wander","wander","follow_cursor","sleep"],"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7},"follow_cursor":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":9},"sleep":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":2}}}'::json, true),
    ('stick_figure', 'Stick Figure', 'common', 64, 64, 200, '{"behaviorBag":["idle","wander","wander","dance","sleep"],"behaviorWeights":{"sleep":0.5},"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7},"dance":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":10},"sleep":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":2}}}'::json, true),
    ('pet_rock', 'Pet Rock', 'common', 64, 64, 5, '{"behaviorBag":["idle","idle","idle","sleep"],"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"sleep":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":2}}}'::json, true),
    ('semicolon', 'Sentient Semicolon', 'common', 64, 64, 100, '{"behaviorBag":["idle","wander","wander","sleep"],"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7},"sleep":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":2}}}'::json, true),
    ('rubber_duck', 'Rubber Duck', 'uncommon', 64, 64, 50, '{"behaviorBag":["idle","wander","follow_cursor","sleep"],"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7},"follow_cursor":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":9},"sleep":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":2}}}'::json, true),
    ('coffee_mug', 'Caffeine Mug', 'uncommon', 64, 64, 1000, '{"behaviorBag":["idle","jitter","jitter","wander","sleep"],"behaviorWeights":{"sleep":0.4},"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"jitter":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":16},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7},"sleep":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":2}}}'::json, true),
    ('desk_gun', 'Desk Gun', 'rare', 64, 64, 200, '{"behaviorBag":["idle","wander","recoil","sleep"],"behaviorWeights":{"recoil":0.6},"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7},"recoil":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":12},"sleep":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":2}}}'::json, true),
    ('ghost_404', '404 Ghost', 'rare', 64, 64, 200, '{"behaviorBag":["idle","wander","teleport","sleep"],"behaviorWeights":{"teleport":0.7},"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7},"teleport":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":10},"sleep":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":2}}}'::json, true),
    ('bonk_hammer', 'Bonk Hammer', 'epic', 64, 64, 300, '{"behaviorBag":["idle","hop","hop","wander"],"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"hop":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":9},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7}}}'::json, true),
    ('disco_ball', 'Disco Ball', 'epic', 64, 64, 500, '{"behaviorBag":["idle","spin","spin","wander"],"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"spin":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":12},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7}}}'::json, true),
    ('loot_goblin', 'Loot Goblin', 'legendary', 64, 64, 2000, '{"behaviorBag":["idle","flee_cursor","flee_cursor","wander","sleep"],"animations":{"idle":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":4},"flee_cursor":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":12},"wander":{"frameWidth":64,"frameHeight":64,"frames":6,"fps":7},"sleep":{"frameWidth":64,"frameHeight":64,"frames":4,"fps":2}}}'::json, true)
ON CONFLICT (species_id) DO NOTHING;

COMMIT;

-- ----------------------------------------------------------------------------
-- Rollback (uncomment to remove exactly these species):
-- BEGIN;
-- DELETE FROM pet_species WHERE species_id IN (
--   'cat','stick_figure','pet_rock','semicolon','rubber_duck','coffee_mug',
--   'desk_gun','ghost_404','bonk_hammer','disco_ball','loot_goblin'
-- );
-- COMMIT;
-- NOTE: will fail if a pet_instances row references one (FK). Delete those first.
