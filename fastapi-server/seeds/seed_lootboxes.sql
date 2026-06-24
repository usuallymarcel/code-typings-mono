-- ============================================================================
--  seed_lootboxes.sql  —  lootbox SKUs + drop tables (PostgreSQL)
-- ============================================================================
--  Target DB : the FastAPI Postgres database (DATABASE_URL).
--  Prereq    : tables exist (`alembic upgrade head`). Species referenced in the
--              drop tables should be seeded too (seed_pet_species.sql) or a roll
--              of that rarity will fail when the box is opened.
--  Run       : psql "$DATABASE_URL" -f fastapi-server/seeds/seed_lootboxes.sql
--  Idempotent: ON CONFLICT (sku) DO NOTHING -> safe to re-run.
--  Note      : drop_table is server-only (never sent to the client). Only the
--              per-rarity odds are exposed. 'disco_fever' ships disabled — flip
--              enabled=true during an event.  pityAfterOpens/pityFloor are inert
--              until pity is restored in app/utils/lootbox_roll.py.
--  Invariant : every key in "rarities" also appears in "speciesByRarity"
--              (otherwise the roll can KeyError). All four boxes satisfy it.
--  Rollback  : see the commented DELETE at the bottom.
-- ============================================================================

BEGIN;

INSERT INTO lootboxes (sku, name, price, drop_table, enabled)
VALUES
    ('starter_crate', 'Starter Crate', 50, '{"rarities":{"common":80,"uncommon":18,"rare":2},"speciesByRarity":{"common":["cat","stick_figure","semicolon","pet_rock"],"uncommon":["rubber_duck","coffee_mug"],"rare":["desk_gun"]}}'::json, true),
    ('office_supplies', 'Office Supplies Crate', 200, '{"rarities":{"common":40,"uncommon":45,"rare":15},"speciesByRarity":{"common":["semicolon","pet_rock"],"uncommon":["rubber_duck","coffee_mug"],"rare":["desk_gun","ghost_404"]}}'::json, true),
    ('cursed_cache', 'Cursed Cache', 450, '{"rarities":{"rare":50,"epic":42,"legendary":8},"speciesByRarity":{"rare":["ghost_404"],"epic":["bonk_hammer"],"legendary":["loot_goblin"]},"pityAfterOpens":25,"pityFloor":"epic"}'::json, true),
    ('disco_fever', 'Disco Fever', 666, '{"rarities":{"epic":100},"speciesByRarity":{"epic":["disco_ball"]}}'::json, false)
ON CONFLICT (sku) DO NOTHING;

COMMIT;

BEGIN;
INSERT INTO lootboxes (sku, name, price, drop_table, enabled)
VALUES ('ai_slop', 'AI_Slop', 50000, '{"rarities":{"common":78,"uncommon":14,"rare":5, "epic":2, "legendary":1},"speciesByRarity":{"common":["cat","stick_figure","semicolon","pet_rock"],"uncommon":["rubber_duck","coffee_mug"],"rare":["desk_gun", "ghost_404"],"epic":["bonk_hammer", "disco_ball"],"legendary":["loot_goblin"]}}'::json, true),
ON CONFLICT (sku) DO NOTHING;

COMMIT;
-- ----------------------------------------------------------------------------
-- Rollback (uncomment to remove exactly these lootboxes):
-- BEGIN;
-- DELETE FROM lootboxes WHERE sku IN
--   ('starter_crate','office_supplies','cursed_cache','disco_fever');
-- COMMIT;
-- (lootbox_opens audit rows are intentionally NOT deleted.)
