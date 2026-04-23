# iBirdOS — Audit Gap Analysis
# What the Bubble audit docs revealed as MISSING vs what's already built

## ALREADY BUILT (keep as-is)
- Auth system: register, login, invite tokens, accept-invite ✅
- Multi-tenant with company_id isolation ✅
- RBAC: owner/manager/staff/customer roles ✅
- Recipe engine: manual create, cost calc, markup % ✅
- Invoice upload + OCR queue ✅
- Inventory tracking ✅
- Orders + prep list auto-generation ✅
- Kitchen view for staff ✅
- Analytics: revenue, food cost %, top recipes ✅
- Alerts: price increase, low stock, high food cost ✅
- Customer menu portal ✅
- Docker + .env ✅

## CRITICAL GAPS FROM AUDIT DOCS

### GAP 1: YIELD SYSTEM (completely missing)
- YieldLog model: starting_weight, trim_loss, final_yield, waste_pct
- Photo uploads per yield log
- Yield prediction from historical logs
- Chef role sees yield dashboard

### GAP 2: EVENT BOOKING LIFECYCLE (partial)
- EventTemplate (Thu_132 pattern) - missing
- Booking → confirmed → kitchen packet flow - missing
- Dynamic quotation for clients - missing
- Headcount tracking with cost impact - missing
- Event P&L (full: food + labor + overhead) - missing

### GAP 3: DYNAMIC CLIENT QUOTATION (completely missing)
- Client selects menu items + portion size
- Real-time price calculation
- Quotation PDF generation
- Client approval flow
- Deposit payment via Stripe

### GAP 4: VENDOR HUB (completely missing)
- Vendor directory model
- Vendor connection (OAuth/API key/manual)
- Price comparison across vendors
- 2-3% commission order flow

### GAP 5: PRICE ALERT SYSTEM (partial - needs enhancement)
- Alert threshold: ≥5% OR ≥$0.15 (currently only ≥5%)
- Event impact calculation per alert ("this raises Thursday event by $X")
- Alert links back to invoice line item

### GAP 6: COGS MONITORING DISPLAY (partial)
- COGS % color coding: ≤30% green, 30-35% yellow, >35% red
  (currently using 30/45 thresholds - must fix to spec)
- COGS on event P&L page
- COGS on client quotation

### GAP 7: CHEF ROLE (missing entirely)
- Chef-specific dashboard
- Recipe management (chef can create/edit)
- Yield logging
- Production planning
- Kitchen packet view

### GAP 8: DUPLICATE DATA MODEL RISK (Bubble had Solo* parallel types)
- Our PostgreSQL schema is clean - no duplicates ✅
- But need to add: price_points table for historical price tracking

### GAP 9: INVOICE PIPELINE - "CONFIRM → POST" STEP (missing)
- After AI parsing, user reviews line items
- "Confirm" must: update ingredient prices + create inventory transaction
- Create transaction log (AP ledger entry)
- Bubble had this broken - our code has confirm but needs transaction log

### GAP 10: FINANCE ENGINE (partial)
- Weekly P&L summary - missing
- Labor cost tracking - missing
- Event P&L = food + labor + overhead + margin - partial
- AvT (Actual vs Theoretical) COGS - missing
- GL code posting on every transaction - missing

## BUILD ORDER
1. Fix COGS thresholds (30/35 not 30/45)
2. Add yield system (YieldLog, prediction)
3. Add EventTemplate + full booking lifecycle
4. Add client quotation + Stripe payment
5. Add labor + overhead to event P&L
6. Add price_points table + ≥$0.15 alert threshold
7. Add chef role dashboard
8. Add vendor hub skeleton
9. Add transaction ledger for invoice confirm
10. Add weekly P&L summary
