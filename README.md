# iBirdOS — Complete Setup & Test Guide
> Production SaaS: Booking → Menu → Recipe → Invoice → Inventory → Yield → Finance → P&L

## DEMO CREDENTIALS (after seeding)
| Role | Email | Password |
|------|-------|----------|
| Owner | owner@ibirdchef.com | password123 |
| Manager | manager@ibirdchef.com | password123 |
| Staff/Chef | chef@ibirdchef.com | password123 |
| Customer | client@example.com | password123 |

## QUICKSTART
```bash
git clone <repo> && cd ibirdos
cp .env.example .env  # set OPENAI_API_KEY + JWT_SECRET at minimum
docker-compose up -d
docker exec -i ibirdos-postgres-1 psql -U ibirdos -d ibirdos < database/seeds/001_demo.sql
open http://localhost:3000
```

## WHAT TO TEST FIRST
1. Owner login → Invoices → Upload Sysco PDF → wait 30s → confirm items → check recipes auto-recalculated
2. Owner → Events → Templates → Thu_132 → Create event → Staff login → Kitchen → see prep list
3. Owner → Quotations → New → Add items → Preview pricing (real-time COGS) → Send → client link → approve → deposit
4. Owner → Yield → Log chicken trim → 3+ logs → prediction generated automatically
5. Owner → Finance → COGS Overview → Dal Makhani is RED (36.2% > 35% threshold)

## ALL FIXES FROM BUBBLE AUDIT (10 docs)
| Bubble Problem | This Codebase |
|---------------|---------------|
| Invoice parse stuck at "Pending Review" | BullMQ worker completes full async parse cycle |
| Recipe costs not recalculating after price change | PostgreSQL trigger auto-cascades to ALL recipes |
| COGS threshold wrong (45%) | Fixed: ≤30% green, 30-35% yellow, >35% red per spec |
| Price alert only on % | Now: ≥5% OR ≥$0.15 triggers alert |
| Duplicate Solo* models causing broken workflows | Single unified schema, zero duplication |
| Missing event P&L | Full P&L: food + labor + waste + overhead |
| Missing yield system | Complete yield log + AI weighted prediction |
| Missing client quotation | Dynamic pricing + Stripe deposit checkout |
| Auth signup not saving users | Standard bcrypt/JWT, fully tested |
| File uploads lost after upload | S3 URL saved immediately to DB record |

## PAGE MAP
- /auth/login → all roles
- /dashboard → owner/manager (role-filtered)
- /dashboard/recipes → ingredients + cost calc
- /dashboard/invoices → upload + AI parse + confirm
- /dashboard/events → templates + full P&L
- /dashboard/quotations → create + send + stripe deposit
- /dashboard/yield → log trim loss + AI prediction
- /dashboard/finance → weekly P&L + COGS overview + event P&L
- /kitchen → staff only (prep list + waste log)
- /restaurant/:slug/menu → customer portal (public)
- /quotation/:token → client review + approve + pay

## DOCKER SERVICES
- postgres:5432 (persistent, auto-migrates)
- redis:6379
- backend:3001 (Express API)
- worker (BullMQ — invoice parsing, recipe recalc)
- frontend:3000 (Next.js)
