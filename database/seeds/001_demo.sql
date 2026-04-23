-- iBirdOS Seed Data — Demo company for testing
-- Run AFTER migrations: psql -d ibirdos -f database/seeds/001_demo.sql

-- ============================================================
-- DEMO COMPANY: iBirdChef Catering
-- ============================================================
INSERT INTO companies (id, name, slug, plan_tier, subscription_status, default_markup_percent, default_tax_rate, currency, timezone)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'iBirdChef Catering Co.',
  'ibirdchef',
  'restaurant',
  'active',
  150,
  10,
  'USD',
  'America/Los_Angeles'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DEMO LOCATION
-- ============================================================
INSERT INTO locations (id, company_id, name, address)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Main Kitchen',
  '1 Market St, San Francisco, CA 94105'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DEMO USERS (passwords are "password123")
-- ============================================================
-- Owner
INSERT INTO users (id, company_id, location_id, email, password_hash, full_name, role, email_verified)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'owner@ibirdchef.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj0o.yFsRh2y', -- "password123"
  'Silambarasan R.',
  'unit_manager',
  true
) ON CONFLICT (id) DO NOTHING;

-- Manager
INSERT INTO users (id, company_id, location_id, email, password_hash, full_name, role, email_verified)
VALUES (
  'c0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'manager@ibirdchef.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj0o.yFsRh2y',
  'Ravi Kumar',
  'manager',
  true
) ON CONFLICT (id) DO NOTHING;

-- Staff (chef)
INSERT INTO users (id, company_id, location_id, email, password_hash, full_name, role, email_verified)
VALUES (
  'c0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'chef@ibirdchef.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj0o.yFsRh2y',
  'Kitchen Staff',
  'staff',
  true
) ON CONFLICT (id) DO NOTHING;

-- Customer
INSERT INTO users (id, company_id, location_id, email, password_hash, full_name, role, email_verified)
VALUES (
  'c0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'client@example.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj0o.yFsRh2y',
  'Demo Client',
  'customer',
  true
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DEMO INGREDIENTS (Sysco-style)
-- ============================================================
INSERT INTO ingredients (id, company_id, name, category, unit, current_price, previous_price, supplier, allergens) VALUES
('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Chicken Breast','Protein','lb',4.89,4.46,'Sysco',ARRAY[]::text[]),
('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Basmati Rice','Grain','lb',1.25,1.25,'Sysco',ARRAY[]::text[]),
('d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Yellow Onion','Produce','lb',0.45,0.42,'Restaurant Depot',ARRAY[]::text[]),
('d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','Olive Oil','Oil','l',8.50,8.00,'US Foods',ARRAY[]::text[]),
('d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','Garam Masala','Spice','oz',0.75,0.75,'Sysco',ARRAY[]::text[]),
('d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','Whole Milk','Dairy','l',1.20,1.15,'Sysco',ARRAY['dairy']::text[]),
('d0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','Paneer','Dairy','lb',5.50,5.50,'Chef''s Warehouse',ARRAY['dairy']::text[]),
('d0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','Black Lentils (Urad Dal)','Grain','lb',1.80,1.80,'Sysco',ARRAY[]::text[]),
('d0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','Tomatoes','Produce','lb',0.89,0.95,'Restaurant Depot',ARRAY[]::text[]),
('d0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','Heavy Cream','Dairy','l',4.20,4.00,'Sysco',ARRAY['dairy']::text[])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DEMO RECIPES
-- ============================================================
-- Chicken Biryani (food cost ~28%)
INSERT INTO recipes (id, company_id, location_id, name, category, servings, markup_percent, base_cost, selling_price, food_cost_percent, fc_status, created_by)
VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'Chicken Biryani',
  'Main Course',
  1,
  150,
  5.68,
  14.20,
  28.0,
  'green',
  'c0000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, unit_cost_snapshot, line_cost) VALUES
('e0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',0.5,'lb',4.89,2.445),
('e0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',0.75,'lb',1.25,0.9375),
('e0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003',0.25,'lb',0.45,0.1125),
('e0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000005',0.25,'oz',0.75,0.1875),
('e0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000004',0.02,'l',8.50,0.17)
ON CONFLICT DO NOTHING;

-- Paneer Tikka (food cost ~22%)
INSERT INTO recipes (id, company_id, location_id, name, category, servings, markup_percent, base_cost, selling_price, food_cost_percent, fc_status, created_by)
VALUES (
  'e0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'Paneer Tikka',
  'Starter',
  1,
  150,
  3.12,
  7.80,
  22.0,
  'green',
  'c0000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, unit_cost_snapshot, line_cost) VALUES
('e0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000007',0.5,'lb',5.50,2.75),
('e0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000006',0.1,'l',1.20,0.12),
('e0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000005',0.15,'oz',0.75,0.1125),
('e0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000004',0.015,'l',8.50,0.1275)
ON CONFLICT DO NOTHING;

-- Dal Makhani (food cost ~36% - intentionally HIGH to test alerts)
INSERT INTO recipes (id, company_id, location_id, name, category, servings, markup_percent, base_cost, selling_price, food_cost_percent, fc_status, created_by)
VALUES (
  'e0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'Dal Makhani',
  'Main Course',
  1,
  150,
  3.80,
  9.50,
  36.2,
  'red',
  'c0000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, unit_cost_snapshot, line_cost) VALUES
('e0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000008',0.75,'lb',1.80,1.35),
('e0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000009',0.5,'lb',0.89,0.445),
('e0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000010',0.2,'l',4.20,0.84),
('e0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000004',0.03,'l',8.50,0.255),
('e0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000005',0.12,'oz',0.75,0.09)
ON CONFLICT DO NOTHING;

-- ============================================================
-- DEMO INVENTORY
-- ============================================================
INSERT INTO inventory (company_id, location_id, ingredient_id, quantity_on_hand, reorder_threshold) VALUES
('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',18.5,10),
('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',2.1,5),   -- LOW STOCK
('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003',12.0,4),
('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000007',6.0,3),
('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000008',8.0,4),
('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000010',1.2,2)
ON CONFLICT (location_id, ingredient_id) DO NOTHING;

-- ============================================================
-- DEMO EVENT TEMPLATE: Thursday 132-pax (from audit doc)
-- ============================================================
INSERT INTO event_templates (id, company_id, name, description, headcount_default, event_type, default_labor_pct, default_overhead_pct, default_margin_pct, created_by)
VALUES (
  'f0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Thu_132 — Corporate Lunch',
  'Standard Thursday 132-person corporate catering. Chicken Biryani + Paneer Tikka + Dal Makhani.',
  132,
  'catering',
  25,
  15,
  30,
  'c0000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO event_template_recipes (template_id, recipe_id, servings_per_headcount) VALUES
('f0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',1.0),
('f0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002',0.5),
('f0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000003',1.0)
ON CONFLICT DO NOTHING;

-- ============================================================
-- DEMO ALERTS (pre-seeded so dashboard looks live)
-- ============================================================
INSERT INTO alerts (company_id, type, severity, title, body, related_type, related_id, data) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'price_increase', 'warning',
  'Price increase: Chicken Breast',
  'Chicken Breast price up 9.6% ($4.46 → $4.89/lb). Dal Makhani and Chicken Biryani recalculated.',
  'ingredient', 'd0000000-0000-0000-0000-000000000001',
  '{"old_price": 4.46, "new_price": 4.89, "change_percent": 9.6, "change_abs": 0.43}'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000001',
  'low_stock', 'warning',
  'Low stock: Basmati Rice',
  'Basmati Rice is below reorder threshold. Current: 2.1 lb, Threshold: 5 lb.',
  'ingredient', 'd0000000-0000-0000-0000-000000000002',
  '{"on_hand": 2.1, "threshold": 5}'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000001',
  'high_food_cost', 'critical',
  'COGS too high: Dal Makhani',
  'Dal Makhani COGS is 36.2% — above the 35% threshold. Consider adjusting markup or substituting cream.',
  'recipe', 'e0000000-0000-0000-0000-000000000003',
  '{"food_cost_percent": 36.2, "selling_price": 9.50, "base_cost": 3.80}'::jsonb
);

-- ============================================================
-- PRICE HISTORY for chicken (shows trend)
-- ============================================================
INSERT INTO price_points (company_id, ingredient_id, supplier, price_per_unit, unit, recorded_at) VALUES
('a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Sysco',3.98,'lb', NOW() - INTERVAL '90 days'),
('a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Sysco',4.10,'lb', NOW() - INTERVAL '60 days'),
('a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Sysco',4.46,'lb', NOW() - INTERVAL '30 days'),
('a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Sysco',4.89,'lb', NOW());

-- ============================================================
-- DEMO YIELD LOGS for chicken (shows prediction)
-- ============================================================
INSERT INTO yield_logs (company_id, location_id, ingredient_id, starting_weight_oz, trim_loss_oz, final_yield_oz, waste_pct, yield_pct, cooking_method, logged_by)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  56 + (random() * 8 - 4),
  (56 + (random() * 8 - 4)) * 0.10 + (random() * 0.04 - 0.02),
  NULL,
  NULL,
  NULL,
  'Raw trim before biryani',
  'c0000000-0000-0000-0000-000000000003'
FROM generate_series(1, 8);

SELECT 'Seed complete. Login: owner@ibirdchef.com / password123' AS status;
