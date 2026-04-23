# iBirdOS — Full Platform Architecture & Implementation Blueprint
**AI Operating System for Food Service**
ANS Corporation | Q2 2026 | Confidential

---

## EXECUTIVE SUMMARY

iBirdOS is a multi-tenant, role-based SaaS platform that turns food-service operations into real-time profit visibility systems. Built for solo chefs through enterprise contract dining operators (Compass, Aramark, Sodexo scale). This document is the authoritative technical blueprint.

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                        iBirdOS Platform                          │
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  Next.js 14  │    │  Node/Express │    │   PostgreSQL 16  │   │
│  │  Frontend    │◄──►│  API Layer   │◄──►│   + Redis Cache  │   │
│  │  (Vercel)    │    │  (Railway)   │    │   (Supabase)     │   │
│  └─────────────┘    └──────────────┘    └──────────────────┘   │
│         │                  │                      │              │
│  ┌──────▼──────┐   ┌───────▼──────┐   ┌─────────▼────────┐    │
│  │  Stripe     │   │  OpenAI GPT  │   │  AWS S3 / R2     │    │
│  │  Payments   │   │  4o (OCR +   │   │  File Storage    │    │
│  │  17 products│   │  AI Brain)   │   │  (PDFs, images)  │    │
│  └─────────────┘   └──────────────┘   └──────────────────┘    │
│                                                                  │
│  External: Sysco API | Square/Toast POS | Wave/QuickBooks        │
│            Twilio/WhatsApp | Mailchimp | Owner.com               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. MULTI-TENANT DATA MODEL

### Tenant Isolation Strategy
- Every table has `company_id` foreign key
- Row-level security (RLS) enforced at PostgreSQL level
- API middleware validates company scope on every request
- Zero cross-tenant data leakage guaranteed

### Subscription Tiers (Stripe Product Catalog)
| Tier | Plan | Monthly | Annual | Included |
|------|------|---------|--------|----------|
| T1 | Solo Chef | $99 | $1,069 | 1 location, 3 staff, 5 recipes |
| T2 | Core Restaurant | $349 | $3,769 | 1 location, 5 staff, unlimited recipes |
| T2+ | Multi-Unit | $329/loc | $3,553/loc | Multi-location, POS sync |
| T3 | Franchise | $449/loc | $4,849/loc | Franchise controls, HACCP |
| T4 | Corporate Hub | $1,499 | $16,189 | Full enterprise, all integrations |

### Add-On Products
- extra_pos_monthly: $75/mo
- phone_line_monthly: $25/mo
- kiosk_seat_monthly: $20/mo
- extra_staff_seat: $15/mo per seat above 5
- customer_portal_fee: $0.99/active customer above 100

---

## 3. ROLE-BASED ACCESS CONTROL (RBAC)

### Organizational Hierarchy (5:1 Span of Control)
```
Entrepreneur/Founder
    └── VP Development & Operations
            └── SVP Operations & Regions
                    └── Regional Manager (RM) [oversees 5 DMs]
                            └── District Manager (DM) [oversees 5 units]
                                    └── Unit Manager & Chef
```

### Role Permission Matrix
| Permission | Entrepreneur | Regional Mgr | District Mgr | Unit Mgr | Staff | Customer |
|-----------|-------------|--------------|--------------|----------|-------|----------|
| Full P&L + Profit | ✅ | ✅ (regional) | ✅ (district) | ✅ (unit) | ❌ | ❌ |
| Ingredient costs | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Sales & orders | ✅ | ✅ | ✅ | ✅ | ✅ | Own only |
| Prep lists | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Menu & ordering | ✅ | ✅ | ✅ | ✅ | View | ✅ |
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Invite staff | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Analytics | All | Regional | District | Unit | None | None |
| HACCP logs | ✅ | ✅ | ✅ | ✅ | View | ❌ |

### CEO Dashboard (Restricted View)
CEO sees ONLY:
- Total revenue (not ingredient breakdown)
- Food cost % (target: 28–32%)
- Labor hours / revenue per hour
- Friction alerts today
- iBirdOS improvement score
- Energy score (1–10)

---

## 4. DATABASE SCHEMA (PostgreSQL 16)

```sql
-- COMPANIES (multi-tenant root)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  plan_tier VARCHAR(50) NOT NULL DEFAULT 'solo',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOCATIONS (for multi-unit)
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  timezone VARCHAR(100) DEFAULT 'America/New_York',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- USERS
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN (
    'entrepreneur','vp_operations','svp_operations',
    'regional_manager','district_manager','unit_manager',
    'staff','customer'
  )),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INGREDIENTS (global catalog per company)
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) NOT NULL, -- kg, lb, oz, each, ml, l
  current_price DECIMAL(10,4) NOT NULL DEFAULT 0,
  previous_price DECIMAL(10,4),
  price_updated_at TIMESTAMPTZ DEFAULT NOW(),
  supplier VARCHAR(255),
  gl_code VARCHAR(50) DEFAULT '5100-COGS',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name, unit)
);

-- RECIPES
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  portion_size_oz DECIMAL(8,2),
  servings INT DEFAULT 1,
  base_cost DECIMAL(10,4) DEFAULT 0, -- auto-calculated
  markup_percent DECIMAL(5,2) DEFAULT 150, -- default 150% = 2.5x
  selling_price DECIMAL(10,2) DEFAULT 0, -- auto-calculated
  food_cost_percent DECIMAL(5,2) DEFAULT 0, -- auto-calculated
  allergens TEXT[], -- array of allergen flags
  haccp_required BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  ocr_source VARCHAR(255), -- if created via OCR
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RECIPE INGREDIENTS (junction)
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id),
  quantity DECIMAL(10,4) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  unit_cost DECIMAL(10,4), -- snapshot at recipe creation
  line_cost DECIMAL(10,4) -- quantity * unit_cost
);

-- INVENTORY
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  ingredient_id UUID REFERENCES ingredients(id),
  quantity_on_hand DECIMAL(10,4) DEFAULT 0,
  reorder_threshold DECIMAL(10,4) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, ingredient_id)
);

-- INVOICES (supplier invoices)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  supplier VARCHAR(255) NOT NULL,
  invoice_number VARCHAR(100),
  invoice_date DATE,
  total_amount DECIMAL(10,2),
  file_url TEXT, -- S3/R2 URL
  parse_status VARCHAR(50) DEFAULT 'pending', -- pending|processing|done|failed
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVOICE ITEMS (extracted via OCR/AI)
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id),
  item_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(10,4),
  unit VARCHAR(50),
  unit_price DECIMAL(10,4),
  total_price DECIMAL(10,4),
  previous_price DECIMAL(10,4),
  price_change_percent DECIMAL(5,2),
  alert_triggered BOOLEAN DEFAULT false
);

-- EVENTS (catering events / restaurant service periods)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  name VARCHAR(255) NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  guest_count INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'draft', -- draft|confirmed|in_progress|completed|cancelled
  total_food_cost DECIMAL(10,2) DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  food_cost_percent DECIMAL(5,2) DEFAULT 0,
  gross_profit DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EVENT RECIPES
CREATE TABLE event_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id),
  servings INT NOT NULL,
  food_cost_at_event DECIMAL(10,2)
);

-- ORDERS
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  event_id UUID REFERENCES events(id),
  customer_id UUID REFERENCES users(id),
  order_number VARCHAR(50) UNIQUE,
  status VARCHAR(50) DEFAULT 'pending', -- pending|confirmed|preparing|ready|delivered|cancelled
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDER ITEMS
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(10,2) NOT NULL
);

-- PREP LISTS (auto-generated from events/orders)
CREATE TABLE prep_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  order_id UUID REFERENCES orders(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'active'
);

-- PREP LIST ITEMS
CREATE TABLE prep_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_list_id UUID REFERENCES prep_lists(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id),
  recipe_name VARCHAR(255),
  ingredient_name VARCHAR(255) NOT NULL,
  required_quantity DECIMAL(10,4) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  in_stock DECIMAL(10,4) DEFAULT 0,
  to_purchase DECIMAL(10,4) DEFAULT 0,
  is_completed BOOLEAN DEFAULT false
);

-- ALERTS
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  type VARCHAR(100) NOT NULL, -- low_stock|price_increase|high_food_cost|haccp_overdue
  severity VARCHAR(50) DEFAULT 'warning', -- info|warning|critical
  title VARCHAR(255) NOT NULL,
  body TEXT,
  related_id UUID, -- references any related record
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HACCP LOGS
CREATE TABLE haccp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  log_type VARCHAR(100) NOT NULL,
  recorded_by UUID REFERENCES users(id),
  temperature DECIMAL(5,2),
  notes TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- GL CODE POSTINGS
CREATE TABLE gl_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  event_id UUID REFERENCES events(id),
  order_id UUID REFERENCES orders(id),
  gl_code VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  posting_type VARCHAR(50), -- debit|credit
  posted_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_recipes_company ON recipes(company_id);
CREATE INDEX idx_inventory_location ON inventory(location_id);
CREATE INDEX idx_orders_company_date ON orders(company_id, created_at DESC);
CREATE INDEX idx_alerts_company_unread ON alerts(company_id, is_read) WHERE is_read = false;
CREATE INDEX idx_events_company_date ON events(company_id, event_date DESC);

-- ROW LEVEL SECURITY
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
```

---

## 5. API ROUTES

### Authentication
```
POST /api/auth/register       — Owner signup + Stripe checkout
POST /api/auth/login          — Email/password → JWT
POST /api/auth/refresh        — Refresh token
POST /api/auth/invite         — Invite staff/customer by email
GET  /api/auth/me             — Current user + permissions
```

### Recipes
```
GET    /api/recipes           — List (role-filtered)
POST   /api/recipes           — Create manual recipe
PUT    /api/recipes/:id       — Update recipe
DELETE /api/recipes/:id       — Soft delete
POST   /api/recipes/ocr       — Upload PDF/image → AI parse
GET    /api/recipes/:id/cost  — Get cost breakdown (owner only)
POST   /api/recipes/:id/scale — Scale recipe to N servings
```

### Inventory
```
GET    /api/inventory                — List all stock
PUT    /api/inventory/:ingredientId  — Update stock level
POST   /api/inventory/upload         — Upload Sysco/vendor PDF
GET    /api/inventory/alerts         — Low stock alerts
```

### Invoices
```
POST   /api/invoices/upload  — Upload supplier invoice PDF
GET    /api/invoices         — List invoices
GET    /api/invoices/:id     — Invoice detail + parsed items
GET    /api/invoices/alerts  — Price change alerts (>5%)
```

### Events & Orders
```
POST   /api/events           — Create event
GET    /api/events           — List events
GET    /api/events/:id/pl    — Event P&L (owner only)
POST   /api/events/:id/prep  — Generate prep list
POST   /api/orders           — Place order (customer)
GET    /api/orders           — List orders (role-filtered)
PUT    /api/orders/:id/status — Update status (staff)
```

### Kitchen / Prep
```
GET    /api/kitchen/queue    — Today's prep tasks (staff view)
PUT    /api/kitchen/prep/:itemId/complete — Mark item done
GET    /api/kitchen/haccp    — HACCP log form
POST   /api/kitchen/haccp    — Submit temperature log
```

### Analytics (owner/manager only)
```
GET    /api/analytics/revenue        — Revenue by period
GET    /api/analytics/food-cost      — Food cost % trends
GET    /api/analytics/top-recipes    — Best sellers
GET    /api/analytics/profit         — Gross profit (owner only)
GET    /api/analytics/ceo-dashboard  — Restricted CEO view
```

### Stripe / Billing
```
POST   /api/billing/checkout     — Create Stripe checkout session
POST   /api/billing/portal       — Customer billing portal
POST   /api/billing/webhook      — Stripe webhook handler
GET    /api/billing/subscription  — Current plan details
POST   /api/billing/addon         — Add/remove add-ons
```

---

## 6. OCR / AI INVOICE PARSING

### Flow
1. User uploads supplier PDF → stored in S3/R2
2. Backend sends to OpenAI GPT-4o with vision:
   ```
   "Extract all line items from this supplier invoice.
    For each item return: item_name, quantity, unit, unit_price, total_price.
    Normalize units (lb, kg, oz, each, case).
    Return JSON only."
   ```
3. Parse JSON response → match to existing ingredients
4. Compare prices to previous → flag >5% changes
5. Auto-update ingredient prices
6. Trigger recipe cost recalculation
7. Fire alerts for price spikes

### Fallback
- Tesseract OCR for scanned/handwritten PDFs
- Confidence scoring — low confidence flagged for manual review

---

## 7. PROFIT CALCULATION ENGINE

```javascript
// Core formula
const baseCost = recipe_ingredients.reduce((sum, ri) => 
  sum + (ri.quantity * ri.unit_cost), 0);

const markupMultiplier = 1 + (markup_percent / 100); // default: 2.5x
const sellingPrice = baseCost * markupMultiplier;
const foodCostPercent = (baseCost / sellingPrice) * 100;

// Food cost % color coding
// < 30% → Green (optimal)
// 30-45% → Yellow (monitor)
// > 50% → Red (must fix)

// GL posting
// Purchase: DR 5100-COGS-FOOD / CR Accounts Payable
// Revenue: DR Cash/AR / CR 4100-REV-[EVENT_TYPE]
```

---

## 8. AUTO PREP LIST GENERATION

```javascript
// When event confirmed with N guests:
for each recipe in event:
  for each ingredient in recipe:
    required = ingredient.quantity_per_serving * event.guest_count
    in_stock = inventory.quantity_on_hand
    to_purchase = max(0, required - in_stock)
    
    prep_list_item = {
      ingredient, required, in_stock, to_purchase,
      estimated_cost: to_purchase * ingredient.current_price
    }

// Shopping list = prep_list_items where to_purchase > 0
// Total event food cost = sum of all ingredient costs
// Food cost % = total_cost / (selling_price * guest_count) * 100
```

---

## 9. ALERT SYSTEM

| Alert Type | Trigger | Severity | Who Notified |
|-----------|---------|---------|-------------|
| low_stock | inventory < reorder_threshold | warning | Owner, Manager |
| price_increase | invoice price > previous + 5% | warning | Owner |
| high_food_cost | event food_cost_percent > 50% | critical | Owner |
| haccp_overdue | temperature log not submitted | critical | Owner, Manager |
| trial_ending | 3 days before trial end | info | Owner |

Delivery: In-app bell + Twilio SMS/WhatsApp (T2+) + Slack (Enterprise)

---

## 10. STRIPE INTEGRATION (Bubble + Direct)

### Checkout Flow
1. Owner signs up → select plan on pricing page
2. `POST /api/billing/checkout` → Stripe Checkout Session
3. Card collected → 30-day trial begins (not charged until day 31)
4. Webhook `customer.subscription.created` → provision workspace
5. Staff invite flow unlocked → 5 free seats included
6. Add-ons purchasable from billing settings

### Key Lookup Keys (all confirmed live)
- solo_plan_monthly / solo_plan_annual
- core_restaurant_monthly / core_restaurant_annual
- multi_unit_monthly / multi_unit_annual
- franchise_monthly / franchise_annual
- corporate_hub_monthly / corporate_hub_annual
- extra_staff_seat ($15/mo from seat #6)
- customer_portal_fee ($0.99 graduated above 100 customers)
- franchise_setup_fee ($3,500 one-time)

---

## 11. FOLDER STRUCTURE

```
ibirdos/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── recipes.js
│   │   │   ├── inventory.js
│   │   │   ├── invoices.js
│   │   │   ├── orders.js
│   │   │   ├── events.js
│   │   │   ├── kitchen.js
│   │   │   ├── analytics.js
│   │   │   └── billing.js
│   │   ├── middleware/
│   │   │   ├── auth.js         — JWT validation
│   │   │   ├── rbac.js         — Role permission checks
│   │   │   ├── tenant.js       — Company scope enforcement
│   │   │   └── rateLimit.js
│   │   ├── services/
│   │   │   ├── ocr.js          — OpenAI vision + Tesseract
│   │   │   ├── profit.js       — Cost calculation engine
│   │   │   ├── prep.js         — Prep list generator
│   │   │   ├── alerts.js       — Alert system
│   │   │   ├── stripe.js       — Stripe integration
│   │   │   └── gl.js           — GL code postings
│   │   ├── models/
│   │   │   └── *.js            — DB query functions
│   │   └── utils/
│   │       ├── logger.js
│   │       └── validators.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── pages/
│   │   ├── login.jsx
│   │   ├── dashboard/
│   │   │   ├── index.jsx       — Role-aware dashboard
│   │   │   ├── owner.jsx
│   │   │   ├── manager.jsx
│   │   │   └── ceo.jsx
│   │   ├── recipes/
│   │   ├── inventory/
│   │   ├── events/
│   │   ├── orders/
│   │   ├── kitchen/            — Staff-only view
│   │   ├── menu/               — Customer-facing
│   │   └── settings/
│   ├── components/
│   │   ├── FoodCostBadge.jsx   — Color-coded % indicator
│   │   ├── PrepList.jsx
│   │   ├── AlertBell.jsx
│   │   ├── RecipeBuilder.jsx
│   │   └── InvoiceUpload.jsx
│   └── lib/
│       ├── api.js
│       ├── auth.js
│       └── permissions.js
├── database/
│   ├── schema.sql
│   ├── seeds.sql
│   └── migrations/
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
└── .env.example
```

---

## 12. ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/ibirdos
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# OpenAI
OPENAI_API_KEY=sk-...

# AWS S3 / Cloudflare R2
S3_BUCKET=ibirdos-files
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# App
APP_URL=https://workspace.ibirdos.com
NODE_ENV=production
```

---

## 13. DEPLOYMENT

### Docker Compose
```yaml
version: '3.8'
services:
  backend:
    build: ./docker/Dockerfile.backend
    env_file: .env
    ports: ["3001:3001"]
    depends_on: [postgres, redis]
  
  frontend:
    build: ./docker/Dockerfile.frontend
    env_file: .env
    ports: ["3000:3000"]
  
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ibirdos
      POSTGRES_USER: ibirdos
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: [postgres_data:/var/lib/postgresql/data]
  
  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]
```

### Recommended Stack
- **Frontend**: Vercel (Next.js native)
- **Backend**: Railway or Render
- **Database**: Supabase (PostgreSQL + RLS built-in)
- **Files**: Cloudflare R2 (S3-compatible, cheaper)
- **Redis**: Upstash (serverless Redis)

---

## 14. SECURITY CHECKLIST

- [x] JWT auth with refresh tokens
- [x] Row-level security in PostgreSQL (company isolation)
- [x] RBAC middleware on every route
- [x] Input validation with Zod
- [x] SQL injection: parameterized queries only (no string concat)
- [x] XSS: Content-Security-Policy headers + React auto-escaping
- [x] Rate limiting on auth endpoints (5 req/min)
- [x] File upload: type validation + size limits (10MB max)
- [x] Stripe webhook signature verification
- [x] Secrets in environment variables (never in code)
- [x] HTTPS enforced (redirect from HTTP)
- [x] CORS: whitelist app domains only

---

## 15. 13-PHASE ROADMAP

| Phase | Name | Key Deliverables |
|-------|------|-----------------|
| 1 | Foundation | Auth, multi-tenant, RBAC, Stripe checkout |
| 2 | Recipe Engine | Manual + OCR recipe builder, profit calculator |
| 3 | Inventory | Stock tracking, Sysco PDF upload, alerts |
| 4 | Event System | Event creation, prep list generation |
| 5 | Orders | Customer ordering, menu, cart, confirmation |
| 6 | Kitchen Mode | Prep queue, station tasks, timers |
| 7 | Analytics | Owner P&L, manager sales, CEO dashboard |
| 8 | Customer Portal | Client profiles, order history, portal fee |
| 9 | Production Mode | HACCP logs, compliance docs, allergen labels |
| 10 | Delivery Layer | Driver profiles, route tracking, ETA SMS |
| 11 | AI Automation | Lead pipeline, Clow AI, marketing drip |
| 12 | Enterprise Controls | Corporate approvals, GL export, Wave/QBO |
| 13 | Integrations | HubSpot CRM, Zapier, multi-language |

**Phase 1-4: MVP target Q2 2026**
**Phase 5-9: Full product Q3 2026**
**Phase 10-13: Enterprise Q4 2026**
