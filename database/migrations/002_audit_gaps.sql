-- iBirdOS Migration 002: Audit Gap Fixes
-- Adds: yield system, event templates, client quotations,
--       vendor hub, transaction ledger, price points, labor tracking

-- ============================================================
-- PRICE POINTS (Historical price tracking per ingredient/supplier)
-- ============================================================
CREATE TABLE price_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  invoice_id UUID REFERENCES invoices(id),
  invoice_item_id UUID REFERENCES invoice_items(id),
  supplier VARCHAR(255),
  price_per_unit DECIMAL(12,4) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_price_points_ingredient ON price_points(ingredient_id, recorded_at DESC);

-- ============================================================
-- TRANSACTION LEDGER (AP + inventory posting audit trail)
-- ============================================================
CREATE TABLE transaction_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
    'invoice_posted','inventory_adjustment','order_sale',
    'waste_write_off','yield_adjustment','labor_cost','overhead_cost'
  )),
  reference_type VARCHAR(50),
  reference_id UUID,
  debit_gl VARCHAR(50),
  credit_gl VARCHAR(50),
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  posted_by UUID REFERENCES users(id),
  posted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ledger_company_date ON transaction_ledger(company_id, posted_at DESC);

-- ============================================================
-- EVENT TEMPLATES (Thu_132 patterns for repeatable events)
-- ============================================================
CREATE TABLE event_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  headcount_default INT DEFAULT 0,
  event_type VARCHAR(50) DEFAULT 'catering',
  default_lead_time_days INT DEFAULT 3,
  default_overhead_pct DECIMAL(5,2) DEFAULT 15.00,
  default_labor_pct DECIMAL(5,2) DEFAULT 25.00,
  default_margin_pct DECIMAL(5,2) DEFAULT 30.00,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EVENT TEMPLATE RECIPES (default recipes per template)
-- ============================================================
CREATE TABLE event_template_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id),
  servings_per_headcount DECIMAL(8,4) DEFAULT 1.0,
  notes TEXT
);

-- ============================================================
-- LABOR ENTRIES (per event)
-- ============================================================
CREATE TABLE labor_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  user_id UUID REFERENCES users(id),
  role_label VARCHAR(100),
  hours DECIMAL(6,2) NOT NULL,
  rate_per_hour DECIMAL(10,2) NOT NULL,
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (hours * rate_per_hour) STORED,
  notes TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_labor_event ON labor_entries(event_id);

-- ============================================================
-- CLIENT QUOTATIONS
-- ============================================================
CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  client_id UUID REFERENCES users(id),
  client_name VARCHAR(255),
  client_email VARCHAR(255),
  client_phone VARCHAR(50),
  quotation_number VARCHAR(50) UNIQUE,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN (
    'draft','sent','viewed','approved','rejected','expired','invoiced'
  )),
  -- Financials
  food_cost DECIMAL(12,2) DEFAULT 0,
  labor_cost DECIMAL(12,2) DEFAULT 0,
  overhead_amount DECIMAL(12,2) DEFAULT 0,
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  deposit_percent DECIMAL(5,2) DEFAULT 50.00,
  deposit_amount DECIMAL(12,2) DEFAULT 0,
  deposit_paid BOOLEAN DEFAULT false,
  deposit_paid_at TIMESTAMPTZ,
  -- Stripe
  stripe_payment_intent_id VARCHAR(255),
  stripe_checkout_session_id VARCHAR(255),
  -- Content
  headcount INT DEFAULT 0,
  event_date TIMESTAMPTZ,
  event_location TEXT,
  notes TEXT,
  terms TEXT,
  valid_until TIMESTAMPTZ,
  -- Approval
  approved_at TIMESTAMPTZ,
  approved_by_client BOOLEAN DEFAULT false,
  client_approval_token VARCHAR(255) UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_quotations_company ON quotations(company_id, created_at DESC);
CREATE INDEX idx_quotations_token ON quotations(client_approval_token);

-- ============================================================
-- QUOTATION ITEMS (what's in each quotation)
-- ============================================================
CREATE TABLE quotation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  quantity INT NOT NULL DEFAULT 1,
  portion_size_oz DECIMAL(8,2),
  unit_price DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(12,2) DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  line_cost DECIMAL(12,2) DEFAULT 0,
  cogs_pct DECIMAL(5,2) DEFAULT 0
);

-- ============================================================
-- YIELD LOGS (Chef role: trim loss, yield tracking, prediction)
-- ============================================================
CREATE TABLE yield_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  event_id UUID REFERENCES events(id),
  recipe_id UUID REFERENCES recipes(id),
  -- Measurements (all in oz by default, normalized)
  starting_weight_oz DECIMAL(10,4) NOT NULL,
  trim_loss_oz DECIMAL(10,4) DEFAULT 0,
  final_yield_oz DECIMAL(10,4),
  waste_pct DECIMAL(5,2),
  yield_pct DECIMAL(5,2),
  -- Context
  cooking_method VARCHAR(100),
  notes TEXT,
  photo_urls TEXT[] DEFAULT '{}',
  -- Who/when
  logged_by UUID REFERENCES users(id),
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-calculate yield/waste pct on insert/update
CREATE OR REPLACE FUNCTION calculate_yield_pcts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.final_yield_oz IS NULL THEN
    NEW.final_yield_oz := NEW.starting_weight_oz - COALESCE(NEW.trim_loss_oz, 0);
  END IF;
  IF NEW.starting_weight_oz > 0 THEN
    NEW.yield_pct := (NEW.final_yield_oz / NEW.starting_weight_oz) * 100;
    NEW.waste_pct := ((NEW.trim_loss_oz / NEW.starting_weight_oz) * 100);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yield_calculate
BEFORE INSERT OR UPDATE ON yield_logs
FOR EACH ROW EXECUTE FUNCTION calculate_yield_pcts();

CREATE INDEX idx_yield_ingredient_date ON yield_logs(ingredient_id, logged_at DESC);
CREATE INDEX idx_yield_company ON yield_logs(company_id, logged_at DESC);

-- ============================================================
-- YIELD PREDICTIONS (ML-lite: rolling avg from yield_logs)
-- ============================================================
CREATE TABLE yield_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  recipe_id UUID REFERENCES recipes(id),
  predicted_yield_pct DECIMAL(5,2) NOT NULL,
  predicted_waste_pct DECIMAL(5,2) NOT NULL,
  confidence_score DECIMAL(5,2),
  sample_count INT DEFAULT 0,
  avg_starting_oz DECIMAL(10,4),
  avg_final_oz DECIMAL(10,4),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, ingredient_id, recipe_id)
);

-- ============================================================
-- VENDORS (Vendor Hub)
-- ============================================================
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  website VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  markets TEXT[] DEFAULT '{}',
  api_type VARCHAR(50) DEFAULT 'manual' CHECK (api_type IN ('oauth','api_key','manual','new_account')),
  commission_pct DECIMAL(5,2) DEFAULT 2.50,
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  delivery_available BOOLEAN DEFAULT true,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMPANY VENDOR CONNECTIONS
-- ============================================================
CREATE TABLE vendor_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  status VARCHAR(50) DEFAULT 'connected' CHECK (status IN ('pending','connected','disconnected')),
  api_key_encrypted TEXT,
  oauth_token_encrypted TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, vendor_id)
);

-- ============================================================
-- FIX: Update COGS alert thresholds in alerts trigger
-- Spec says: ≤30% GREEN, 30-35% YELLOW, >35% RED
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_recipe_cost(p_recipe_id UUID)
RETURNS VOID AS $$
DECLARE
  v_base_cost DECIMAL(12,4);
  v_markup DECIMAL(5,2);
  v_selling_price DECIMAL(12,2);
  v_fc_pct DECIMAL(5,2);
  v_fc_status VARCHAR(20);
BEGIN
  SELECT COALESCE(SUM(ri.quantity * i.current_price), 0)
  INTO v_base_cost
  FROM recipe_ingredients ri
  JOIN ingredients i ON i.id = ri.ingredient_id
  WHERE ri.recipe_id = p_recipe_id;

  SELECT COALESCE(r.markup_percent, c.default_markup_percent, 150)
  INTO v_markup
  FROM recipes r JOIN companies c ON c.id = r.company_id
  WHERE r.id = p_recipe_id;

  v_selling_price := v_base_cost * (1 + v_markup / 100);
  IF v_selling_price > 0 THEN
    v_fc_pct := (v_base_cost / v_selling_price) * 100;
  ELSE
    v_fc_pct := 0;
  END IF;

  -- CORRECTED per audit spec: ≤30 green, 30-35 yellow, >35 red
  IF v_fc_pct <= 30 THEN v_fc_status := 'green';
  ELSIF v_fc_pct <= 35 THEN v_fc_status := 'yellow';
  ELSE v_fc_status := 'red';
  END IF;

  UPDATE recipes SET
    base_cost = v_base_cost,
    selling_price = v_selling_price,
    food_cost_percent = v_fc_pct,
    fc_status = v_fc_status,
    updated_at = NOW()
  WHERE id = p_recipe_id;

  UPDATE recipe_ingredients ri SET
    unit_cost_snapshot = i.current_price,
    line_cost = ri.quantity * i.current_price
  FROM ingredients i
  WHERE ri.ingredient_id = i.id AND ri.recipe_id = p_recipe_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FIX: Price alert threshold: ≥5% OR ≥$0.15 (per audit spec)
-- ============================================================
CREATE OR REPLACE FUNCTION on_ingredient_price_change()
RETURNS TRIGGER AS $$
DECLARE
  v_recipe_id UUID;
  v_change_pct DECIMAL(5,2);
  v_change_abs DECIMAL(12,4);
  v_company_id UUID;
BEGIN
  IF NEW.current_price IS DISTINCT FROM OLD.current_price THEN
    NEW.previous_price := OLD.current_price;
    NEW.price_updated_at := NOW();
    v_company_id := NEW.company_id;

    IF OLD.current_price > 0 THEN
      v_change_pct := ((NEW.current_price - OLD.current_price) / OLD.current_price) * 100;
    ELSE
      v_change_pct := 0;
    END IF;
    v_change_abs := ABS(NEW.current_price - OLD.current_price);

    -- Record price point for history
    INSERT INTO price_points (company_id, ingredient_id, supplier, price_per_unit, unit)
    VALUES (v_company_id, NEW.id, NEW.supplier, NEW.current_price, NEW.unit);

    -- Recalculate all recipes using this ingredient
    FOR v_recipe_id IN
      SELECT DISTINCT ri.recipe_id
      FROM recipe_ingredients ri
      JOIN recipes r ON r.id = ri.recipe_id
      WHERE ri.ingredient_id = NEW.id AND r.company_id = v_company_id
    LOOP
      PERFORM recalculate_recipe_cost(v_recipe_id);
    END LOOP;

    -- Alert threshold: ≥5% OR ≥$0.15 (per audit spec)
    IF ABS(v_change_pct) >= 5 OR v_change_abs >= 0.15 THEN
      INSERT INTO alerts (company_id, type, severity, title, body, related_type, related_id, data)
      VALUES (
        v_company_id,
        CASE WHEN v_change_pct > 0 THEN 'price_increase' ELSE 'price_decrease' END,
        CASE WHEN ABS(v_change_pct) > 15 OR v_change_abs > 1.00 THEN 'critical'
             WHEN ABS(v_change_pct) >= 5 OR v_change_abs >= 0.15 THEN 'warning'
             ELSE 'info' END,
        CASE WHEN v_change_pct > 0 THEN 'Price increase: ' ELSE 'Price decrease: ' END || NEW.name,
        NEW.name || ' price changed ' || ROUND(v_change_pct, 1) || '% ($' || ROUND(v_change_abs, 2) || '/unit). All recipes recalculated.',
        'ingredient', NEW.id,
        jsonb_build_object(
          'ingredient_name', NEW.name,
          'old_price', OLD.current_price,
          'new_price', NEW.current_price,
          'change_percent', ROUND(v_change_pct, 1),
          'change_abs', ROUND(v_change_abs, 2),
          'unit', NEW.unit
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-apply trigger (drop old one first)
DROP TRIGGER IF EXISTS trg_ingredient_price_change ON ingredients;
CREATE TRIGGER trg_ingredient_price_change
BEFORE UPDATE ON ingredients
FOR EACH ROW EXECUTE FUNCTION on_ingredient_price_change();

-- ============================================================
-- UPDATED high food cost alert: >35% (not >45%)
-- ============================================================
CREATE OR REPLACE FUNCTION on_recipe_cost_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Alert when crosses into red zone (>35% per spec)
  IF NEW.fc_status = 'red' AND (OLD.fc_status IS DISTINCT FROM 'red') THEN
    INSERT INTO alerts (company_id, type, severity, title, body, related_type, related_id, data)
    VALUES (
      NEW.company_id, 'high_food_cost', 'critical',
      'COGS too high: ' || NEW.name,
      'Recipe "' || NEW.name || '" COGS is ' || ROUND(NEW.food_cost_percent, 1) || '% — above the 35% threshold. Selling price: ' || NEW.selling_price || '. Adjust markup or ingredients.',
      'recipe', NEW.id,
      jsonb_build_object(
        'recipe_name', NEW.name,
        'food_cost_percent', NEW.food_cost_percent,
        'selling_price', NEW.selling_price,
        'base_cost', NEW.base_cost
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Auto quotation number
-- ============================================================
CREATE SEQUENCE quotation_number_seq START 1000;
CREATE OR REPLACE FUNCTION generate_quotation_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.quotation_number := 'QUO-' || LPAD(nextval('quotation_number_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quotation_number
BEFORE INSERT ON quotations
FOR EACH ROW WHEN (NEW.quotation_number IS NULL OR NEW.quotation_number = '')
EXECUTE FUNCTION generate_quotation_number();

-- ============================================================
-- Seed: Default vendors
-- ============================================================
INSERT INTO vendors (name, category, api_type, markets, commission_pct, description) VALUES
('Sysco', 'Full Range', 'oauth', ARRAY['CA','WA','Nationwide'], 2.5, 'Americas largest foodservice distributor'),
('US Foods', 'Full Range', 'oauth', ARRAY['CA','WA','Nationwide'], 2.5, 'Premium foodservice supplier'),
('Allen Brothers', 'Meat', 'api_key', ARRAY['Nationwide'], 3.0, 'USDA Prime steaks, dry-aged beef, Wagyu'),
('Chef''s Warehouse', 'Specialty', 'oauth', ARRAY['CA','WA'], 2.5, 'Specialty and artisan food products'),
('Nor-Cal Seafood', 'Seafood', 'new_account', ARRAY['Bay Area','CA'], 2.0, 'Fresh local seafood — Bay Area'),
('Restaurant Depot', 'Full Range', 'new_account', ARRAY['Nationwide'], 2.0, 'Wholesale club for food service'),
('Unified Paper', 'Paper/Janitorial', 'new_account', ARRAY['CA'], 2.0, 'Paper products and disposables'),
('S&J Food Distributors', 'Meat/Seafood', 'api_key', ARRAY['WA'], 2.5, 'Meat and seafood — Pacific Northwest')
ON CONFLICT DO NOTHING;
