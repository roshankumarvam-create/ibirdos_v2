-- iBirdOS Complete Database Schema
-- PostgreSQL 16 with Row-Level Security

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- COMPANIES (Multi-tenant root)
-- ============================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  plan_tier VARCHAR(50) NOT NULL DEFAULT 'solo' CHECK (plan_tier IN ('solo','restaurant','multi_unit','franchise','enterprise')),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'trialing' CHECK (subscription_status IN ('trialing','active','past_due','canceled','unpaid')),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  default_markup_percent DECIMAL(5,2) DEFAULT 150.00,
  default_tax_rate DECIMAL(5,2) DEFAULT 18.00,
  currency VARCHAR(10) DEFAULT 'INR',
  timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
  address TEXT,
  phone VARCHAR(50),
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOCATIONS (Multi-unit support)
-- ============================================================
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  role VARCHAR(50) NOT NULL DEFAULT 'customer' CHECK (role IN (
    'entrepreneur','vp_operations','svp_operations',
    'regional_manager','district_manager','unit_manager',
    'manager','staff','customer'
  )),
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  avatar_url TEXT,
  last_login TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVITE TOKENS
-- ============================================================
CREATE TABLE invite_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id),
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  location_id UUID REFERENCES locations(id),
  is_used BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INGREDIENTS (Global catalog per company)
-- ============================================================
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  unit VARCHAR(50) NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg','g','lb','oz','l','ml','each','case','dozen','bunch')),
  current_price DECIMAL(12,4) NOT NULL DEFAULT 0,
  previous_price DECIMAL(12,4) DEFAULT 0,
  price_updated_at TIMESTAMPTZ DEFAULT NOW(),
  supplier VARCHAR(255),
  supplier_code VARCHAR(100),
  gl_code VARCHAR(50) DEFAULT '5100-COGS',
  allergens TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name, unit)
);

-- ============================================================
-- RECIPES
-- ============================================================
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  cuisine VARCHAR(100),
  portion_size_oz DECIMAL(8,2),
  servings INT DEFAULT 1,
  -- Cost fields (auto-calculated by trigger/worker)
  base_cost DECIMAL(12,4) DEFAULT 0,
  markup_percent DECIMAL(5,2) DEFAULT 150.00,
  selling_price DECIMAL(12,2) DEFAULT 0,
  food_cost_percent DECIMAL(5,2) DEFAULT 0,
  -- Status
  fc_status VARCHAR(20) DEFAULT 'green' CHECK (fc_status IN ('green','yellow','red')),
  allergens TEXT[] DEFAULT '{}',
  haccp_required BOOLEAN DEFAULT false,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  ocr_source_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RECIPE INGREDIENTS (Junction)
-- ============================================================
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity DECIMAL(12,4) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  unit_cost_snapshot DECIMAL(12,4) DEFAULT 0,
  line_cost DECIMAL(12,4) DEFAULT 0,
  notes TEXT,
  UNIQUE(recipe_id, ingredient_id)
);

-- ============================================================
-- INVENTORY
-- ============================================================
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity_on_hand DECIMAL(12,4) DEFAULT 0,
  reorder_threshold DECIMAL(12,4) DEFAULT 0,
  reorder_quantity DECIMAL(12,4) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, ingredient_id)
);

-- ============================================================
-- INVOICES (Supplier invoices)
-- ============================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  supplier VARCHAR(255) NOT NULL,
  invoice_number VARCHAR(100),
  invoice_date DATE,
  total_amount DECIMAL(12,2),
  file_url TEXT,
  file_name VARCHAR(255),
  parse_status VARCHAR(50) DEFAULT 'pending' CHECK (parse_status IN ('pending','processing','done','failed','review')),
  parse_confidence DECIMAL(5,2),
  parsed_at TIMESTAMPTZ,
  parsed_by VARCHAR(50) DEFAULT 'ai',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVOICE ITEMS (OCR-extracted line items)
-- ============================================================
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id),
  raw_name VARCHAR(255) NOT NULL,
  matched_name VARCHAR(255),
  quantity DECIMAL(12,4),
  unit VARCHAR(50),
  unit_price DECIMAL(12,4),
  total_price DECIMAL(12,4),
  previous_unit_price DECIMAL(12,4),
  price_change_percent DECIMAL(5,2),
  alert_triggered BOOLEAN DEFAULT false,
  is_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EVENTS (Catering events / service periods)
-- ============================================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  name VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) DEFAULT 'catering' CHECK (event_type IN ('catering','restaurant','popup','delivery')),
  event_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  guest_count INT DEFAULT 0,
  venue TEXT,
  client_name VARCHAR(255),
  client_phone VARCHAR(50),
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft','confirmed','in_progress','completed','cancelled')),
  -- Financials (auto-calculated)
  total_food_cost DECIMAL(12,2) DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  total_labor_cost DECIMAL(12,2) DEFAULT 0,
  food_cost_percent DECIMAL(5,2) DEFAULT 0,
  gross_profit DECIMAL(12,2) DEFAULT 0,
  profit_percent DECIMAL(5,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EVENT RECIPES
-- ============================================================
CREATE TABLE event_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id),
  servings INT NOT NULL DEFAULT 1,
  selling_price_override DECIMAL(12,2),
  food_cost_at_event DECIMAL(12,2),
  UNIQUE(event_id, recipe_id)
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  event_id UUID REFERENCES events(id),
  customer_id UUID REFERENCES users(id),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  order_type VARCHAR(50) DEFAULT 'dine_in' CHECK (order_type IN ('dine_in','takeout','delivery','online','catering')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','delivered','cancelled')),
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  -- Cost tracking (owner only)
  total_cost DECIMAL(12,2) DEFAULT 0,
  gross_profit DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(50),
  payment_status VARCHAR(50) DEFAULT 'pending',
  table_number VARCHAR(20),
  delivery_address TEXT,
  special_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORDER ITEMS
-- ============================================================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id),
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(12,2) DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  line_cost DECIMAL(12,2) DEFAULT 0,
  special_requests TEXT,
  status VARCHAR(50) DEFAULT 'pending'
);

-- ============================================================
-- PREP LISTS (Auto-generated)
-- ============================================================
CREATE TABLE prep_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  event_id UUID REFERENCES events(id),
  order_id UUID REFERENCES orders(id),
  title VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active','in_progress','completed')),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  due_by TIMESTAMPTZ,
  assigned_to UUID REFERENCES users(id)
);

-- ============================================================
-- PREP LIST ITEMS
-- ============================================================
CREATE TABLE prep_list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prep_list_id UUID NOT NULL REFERENCES prep_lists(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id),
  recipe_id UUID REFERENCES recipes(id),
  ingredient_name VARCHAR(255) NOT NULL,
  recipe_name VARCHAR(255),
  required_quantity DECIMAL(12,4) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  in_stock DECIMAL(12,4) DEFAULT 0,
  to_purchase DECIMAL(12,4) DEFAULT 0,
  estimated_cost DECIMAL(12,2) DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  notes TEXT
);

-- ============================================================
-- WASTE LOG
-- ============================================================
CREATE TABLE waste_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  recipe_id UUID REFERENCES recipes(id),
  event_id UUID REFERENCES events(id),
  quantity DECIMAL(12,4) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  waste_cost DECIMAL(12,2) DEFAULT 0,
  reason VARCHAR(255),
  logged_by UUID REFERENCES users(id),
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ALERTS
-- ============================================================
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  type VARCHAR(100) NOT NULL CHECK (type IN (
    'low_stock','price_increase','price_decrease',
    'high_food_cost','waste_threshold',
    'recipe_cost_changed','trial_ending','payment_failed'
  )),
  severity VARCHAR(20) DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  title VARCHAR(255) NOT NULL,
  body TEXT,
  related_type VARCHAR(50),
  related_id UUID,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HACCP LOGS
-- ============================================================
CREATE TABLE haccp_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  event_id UUID REFERENCES events(id),
  log_type VARCHAR(100) NOT NULL CHECK (log_type IN ('temp_check','cleaning','delivery','storage','cooking')),
  temperature DECIMAL(5,2),
  target_min DECIMAL(5,2),
  target_max DECIMAL(5,2),
  passed BOOLEAN,
  notes TEXT,
  recorded_by UUID REFERENCES users(id),
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GL POSTINGS
-- ============================================================
CREATE TABLE gl_postings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  event_id UUID REFERENCES events(id),
  order_id UUID REFERENCES orders(id),
  invoice_id UUID REFERENCES invoices(id),
  gl_code VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  amount DECIMAL(12,2) NOT NULL,
  posting_type VARCHAR(10) NOT NULL CHECK (posting_type IN ('debit','credit')),
  reference VARCHAR(100),
  posted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ANALYTICS SNAPSHOTS (Pre-computed for performance)
-- ============================================================
CREATE TABLE analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily','weekly','monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  gross_profit DECIMAL(12,2) DEFAULT 0,
  food_cost_percent DECIMAL(5,2) DEFAULT 0,
  total_orders INT DEFAULT 0,
  total_covers INT DEFAULT 0,
  avg_order_value DECIMAL(10,2) DEFAULT 0,
  top_recipes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, location_id, period_type, period_start)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(company_id, role);
CREATE INDEX idx_ingredients_company ON ingredients(company_id);
CREATE INDEX idx_ingredients_name ON ingredients(company_id, name);
CREATE INDEX idx_recipes_company ON recipes(company_id);
CREATE INDEX idx_recipes_category ON recipes(company_id, category);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);
CREATE INDEX idx_inventory_location ON inventory(location_id);
CREATE INDEX idx_inventory_ingredient ON inventory(ingredient_id);
CREATE INDEX idx_orders_company_date ON orders(company_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(company_id, status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_alerts_company_unread ON alerts(company_id, is_read) WHERE is_read = false;
CREATE INDEX idx_alerts_company_type ON alerts(company_id, type);
CREATE INDEX idx_events_company_date ON events(company_id, event_date DESC);
CREATE INDEX idx_invoices_company ON invoices(company_id, created_at DESC);
CREATE INDEX idx_invite_token ON invite_tokens(token) WHERE is_used = false;
CREATE INDEX idx_waste_company_date ON waste_logs(company_id, logged_at DESC);

-- ============================================================
-- TRIGGERS: Auto update timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER: Auto-calculate recipe cost when ingredients change
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
  -- Sum all ingredient line costs
  SELECT COALESCE(SUM(ri.quantity * i.current_price), 0)
  INTO v_base_cost
  FROM recipe_ingredients ri
  JOIN ingredients i ON i.id = ri.ingredient_id
  WHERE ri.recipe_id = p_recipe_id;

  -- Get markup
  SELECT COALESCE(r.markup_percent, c.default_markup_percent, 150)
  INTO v_markup
  FROM recipes r JOIN companies c ON c.id = r.company_id
  WHERE r.id = p_recipe_id;

  -- Calculate derived fields
  v_selling_price := v_base_cost * (1 + v_markup / 100);
  IF v_selling_price > 0 THEN
    v_fc_pct := (v_base_cost / v_selling_price) * 100;
  ELSE
    v_fc_pct := 0;
  END IF;

  -- Color status
  IF v_fc_pct < 30 THEN v_fc_status := 'green';
  ELSIF v_fc_pct <= 45 THEN v_fc_status := 'yellow';
  ELSE v_fc_status := 'red';
  END IF;

  -- Update recipe
  UPDATE recipes SET
    base_cost = v_base_cost,
    selling_price = v_selling_price,
    food_cost_percent = v_fc_pct,
    fc_status = v_fc_status,
    updated_at = NOW()
  WHERE id = p_recipe_id;

  -- Update recipe_ingredients snapshots
  UPDATE recipe_ingredients ri SET
    unit_cost_snapshot = i.current_price,
    line_cost = ri.quantity * i.current_price
  FROM ingredients i
  WHERE ri.ingredient_id = i.id AND ri.recipe_id = p_recipe_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: When ingredient price changes, recalc all recipes
-- ============================================================
CREATE OR REPLACE FUNCTION on_ingredient_price_change()
RETURNS TRIGGER AS $$
DECLARE
  v_recipe_id UUID;
  v_change_pct DECIMAL(5,2);
  v_company_id UUID;
BEGIN
  IF NEW.current_price IS DISTINCT FROM OLD.current_price THEN
    NEW.previous_price := OLD.current_price;
    NEW.price_updated_at := NOW();

    -- Calculate change percent
    IF OLD.current_price > 0 THEN
      v_change_pct := ((NEW.current_price - OLD.current_price) / OLD.current_price) * 100;
    ELSE
      v_change_pct := 0;
    END IF;

    v_company_id := NEW.company_id;

    -- Recalculate all recipes using this ingredient
    FOR v_recipe_id IN
      SELECT DISTINCT ri.recipe_id
      FROM recipe_ingredients ri
      JOIN recipes r ON r.id = ri.recipe_id
      WHERE ri.ingredient_id = NEW.id AND r.company_id = v_company_id
    LOOP
      PERFORM recalculate_recipe_cost(v_recipe_id);
    END LOOP;

    -- Fire alert if change > 5%
    IF ABS(v_change_pct) > 5 THEN
      INSERT INTO alerts (company_id, type, severity, title, body, related_type, related_id, data)
      VALUES (
        v_company_id,
        CASE WHEN v_change_pct > 0 THEN 'price_increase' ELSE 'price_decrease' END,
        CASE WHEN ABS(v_change_pct) > 15 THEN 'critical' WHEN ABS(v_change_pct) > 5 THEN 'warning' ELSE 'info' END,
        CASE WHEN v_change_pct > 0 THEN 'Price increase: ' ELSE 'Price decrease: ' END || NEW.name,
        'Price changed by ' || ROUND(v_change_pct, 1) || '% from ' || OLD.current_price || ' to ' || NEW.current_price || ' per ' || NEW.unit || '. All affected recipes have been recalculated.',
        'ingredient',
        NEW.id,
        jsonb_build_object(
          'ingredient_name', NEW.name,
          'old_price', OLD.current_price,
          'new_price', NEW.current_price,
          'change_percent', ROUND(v_change_pct, 1),
          'unit', NEW.unit
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ingredient_price_change
BEFORE UPDATE ON ingredients
FOR EACH ROW EXECUTE FUNCTION on_ingredient_price_change();

-- ============================================================
-- TRIGGER: High food cost alert after recipe update
-- ============================================================
CREATE OR REPLACE FUNCTION on_recipe_cost_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fc_status = 'red' AND (OLD.fc_status IS DISTINCT FROM 'red') THEN
    INSERT INTO alerts (company_id, type, severity, title, body, related_type, related_id, data)
    VALUES (
      NEW.company_id,
      'high_food_cost',
      'critical',
      'High food cost: ' || NEW.name,
      'Recipe "' || NEW.name || '" has food cost % of ' || ROUND(NEW.food_cost_percent, 1) || '% — above the 45% threshold. Review ingredients or adjust markup.',
      'recipe',
      NEW.id,
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

CREATE TRIGGER trg_recipe_cost_alert
AFTER UPDATE ON recipes
FOR EACH ROW EXECUTE FUNCTION on_recipe_cost_update();

-- ============================================================
-- TRIGGER: Low inventory alert
-- ============================================================
CREATE OR REPLACE FUNCTION on_inventory_update()
RETURNS TRIGGER AS $$
DECLARE v_ingredient_name VARCHAR(255); v_company_id UUID;
BEGIN
  IF NEW.quantity_on_hand < NEW.reorder_threshold AND NEW.quantity_on_hand < OLD.quantity_on_hand THEN
    SELECT i.name, i.company_id INTO v_ingredient_name, v_company_id
    FROM ingredients i WHERE i.id = NEW.ingredient_id;

    INSERT INTO alerts (company_id, location_id, type, severity, title, body, related_type, related_id, data)
    VALUES (
      v_company_id, NEW.location_id,
      'low_stock', 'warning',
      'Low stock: ' || v_ingredient_name,
      v_ingredient_name || ' is below reorder threshold. Current: ' || NEW.quantity_on_hand || ', Threshold: ' || NEW.reorder_threshold,
      'ingredient', NEW.ingredient_id,
      jsonb_build_object('ingredient_id', NEW.ingredient_id, 'on_hand', NEW.quantity_on_hand, 'threshold', NEW.reorder_threshold)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_alert
AFTER UPDATE ON inventory
FOR EACH ROW EXECUTE FUNCTION on_inventory_update();

-- ============================================================
-- AUTO ORDER NUMBER
-- ============================================================
CREATE SEQUENCE order_number_seq START 1000;
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number := 'ORD-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_number
BEFORE INSERT ON orders
FOR EACH ROW WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
EXECUTE FUNCTION generate_order_number();
