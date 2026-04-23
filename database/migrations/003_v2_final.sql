-- iBirdOS v2.0 Database Migration
-- New tables: messages, reminders, admin, staff_rates, recipe_files
-- Fixes: currency USD default, role additions

-- ============================================================
-- ROLE ADDITION: Add 'chef' and 'super_admin' to users check
-- ============================================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'super_admin',
  'entrepreneur','vp_operations','svp_operations',
  'regional_manager','district_manager','unit_manager',
  'manager','chef','staff','customer'
));

-- Update companies default currency to USD
ALTER TABLE companies ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE companies ALTER COLUMN timezone SET DEFAULT 'America/Los_Angeles';

-- ============================================================
-- RECIPE FILES (PDF/image uploads for recipe extraction)
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_type VARCHAR(50),
  parse_status VARCHAR(50) DEFAULT 'pending' CHECK (parse_status IN ('pending','processing','done','failed')),
  extracted_data JSONB DEFAULT '{}',
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recipe_files_company ON recipe_files(company_id);

-- ============================================================
-- MESSAGES (Client ↔ Manager chat on quotations)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id),
  sender_name VARCHAR(255),
  sender_role VARCHAR(50),
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_quotation ON messages(quotation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id, created_at);

-- ============================================================
-- REMINDERS (Events, invoices, low inventory)
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('event','invoice','inventory','custom')),
  title VARCHAR(255) NOT NULL,
  body TEXT,
  related_type VARCHAR(50),
  related_id UUID,
  due_at TIMESTAMPTZ NOT NULL,
  is_sent BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_company_due ON reminders(company_id, due_at) WHERE is_sent = false;

-- ============================================================
-- STAFF RATES (Manager sets hourly pricing per role)
-- ============================================================
CREATE TABLE IF NOT EXISTS staff_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_label VARCHAR(100) NOT NULL,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 25.00,
  currency VARCHAR(10) DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, role_label)
);

-- ============================================================
-- ORDER STAFF ITEMS (Client can add extra staff hours to orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_staff_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  role_label VARCHAR(100) NOT NULL,
  hours DECIMAL(6,2) NOT NULL DEFAULT 1,
  hourly_rate DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL
);

-- ============================================================
-- ADMIN METRICS SNAPSHOT (Super admin only)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  total_companies INT DEFAULT 0,
  active_companies INT DEFAULT 0,
  total_users INT DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  mrr DECIMAL(12,2) DEFAULT 0,
  free_trial_count INT DEFAULT 0,
  paid_count INT DEFAULT 0,
  system_health JSONB DEFAULT '{}'
);

-- ============================================================
-- Remove allergens from recipes (per requirement #13)
-- ============================================================
ALTER TABLE recipes DROP COLUMN IF EXISTS allergens;
ALTER TABLE ingredients DROP COLUMN IF EXISTS allergens;

-- ============================================================
-- Add USD formatting fields
-- ============================================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(5) DEFAULT '$';

-- ============================================================
-- Default staff rates seed
-- ============================================================
-- Will be seeded per company on first setup

-- ============================================================
-- INDEXES for new tables
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reminders_sent ON reminders(is_sent, due_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(company_id, is_read) WHERE is_read = false;

-- ============================================================
-- PLATFORM ADMINS (super admin login — separate from users)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBSCRIPTION PLANS (for admin panel display)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  stripe_lookup_key VARCHAR(100) UNIQUE,
  price_usd DECIMAL(10,2) NOT NULL,
  billing_interval VARCHAR(20) DEFAULT 'month',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO subscription_plans (name, stripe_lookup_key, price_usd, billing_interval) VALUES
('Solo Chef',             'solo_plan_monthly',         99.00, 'month'),
('Solo Chef Annual',      'solo_plan_annual',        1069.00, 'year'),
('Core Restaurant',       'core_restaurant_monthly',  349.00, 'month'),
('Core Restaurant Annual','core_restaurant_annual',  3769.00, 'year'),
('Multi-Unit',            'multi_unit_monthly',       329.00, 'month'),
('Franchise',             'franchise_monthly',        449.00, 'month'),
('Corporate Hub',         'corporate_hub_monthly',   1499.00, 'month')
ON CONFLICT (stripe_lookup_key) DO NOTHING;

-- ============================================================
-- STAFF SCHEDULES (for shift management)
-- ============================================================
CREATE TABLE IF NOT EXISTS staff_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  event_id UUID REFERENCES events(id),
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  role_label VARCHAR(100),
  hourly_rate DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'scheduled',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedules_company_date ON staff_schedules(company_id, shift_date);

-- ============================================================
-- MENU ITEMS (synced from recipes for client menu display)
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(12,2) DEFAULT 0,
  margin_pct DECIMAL(5,2) DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_items_company ON menu_items(company_id, is_available);

-- ============================================================
-- ADD created_by field to reminders if missing
-- ============================================================
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT true;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS is_done BOOLEAN DEFAULT false;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;
-- Rename 'type' to 'reminder_type' if it exists as 'type'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reminders' AND column_name='type') THEN
    ALTER TABLE reminders RENAME COLUMN type TO reminder_type;
  END IF;
EXCEPTION WHEN others THEN NULL;
END$$;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS reminder_type VARCHAR(50) DEFAULT 'general';
