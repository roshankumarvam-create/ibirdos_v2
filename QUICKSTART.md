# iBirdOS v2.0 — QUICKSTART

## 5-step local start

```bash
# 1. Copy env
cp .env.example .env
# Edit .env: set JWT_SECRET (run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
# Optional: add OPENAI_API_KEY. Without it, USE_MOCK_OCR=true uses demo data.

# 2. Start
docker-compose up -d --build

# 3. Wait for healthy (watch logs)
docker-compose logs -f backend
# Wait for: "iBirdOS v2.0 backend running on port 3001"

# 4. Load demo data
docker-compose exec -T postgres psql -U ibirdos -d ibirdos < database/seeds/001_demo.sql

# 5. Open
open http://localhost:3000
```

## Demo logins

| Role | Email | Password | Goes to |
|------|-------|----------|---------|
| Owner | owner@ibirdchef.com | password123 | /dashboard — full P&L |
| Manager | manager@ibirdchef.com | password123 | /dashboard — orders only |
| Chef/Staff | chef@ibirdchef.com | password123 | /kitchen — prep list |
| Customer | client@example.com | password123 | /restaurant/ibirdchef/menu |

## v2.0 New features

- `/dashboard/menu` — Menu page with USD pricing, cost, margin
- `/dashboard/reminders` — Create reminders for events/invoices/inventory
- `/dashboard/recipes` → AI Extract tab — upload PDF/DOCX/photo to extract recipe
- `/admin` — Super admin panel (run `POST /api/admin/setup` first)
- Stripe dev bypass — set `STRIPE_DEV_BYPASS=true` to skip payment in dev
- All prices in **USD**
- Chef role — goes to kitchen, can log yield
- Messages on quotations — client can reply via token link

## Super admin setup (first time)

```bash
curl -X POST http://localhost:3001/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ibirdos.com","password":"strongpass","full_name":"Admin"}'

# Then go to: http://localhost:3000/admin
```

## Auth endpoints (confirmed working)

```
POST http://localhost:3001/api/auth/register   ← create company + owner
POST http://localhost:3001/api/auth/login      ← all roles
GET  http://localhost:3001/health              ← {"status":"ok","version":"2.0.0"}
```

## Port summary

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Backend API | 3001 | http://localhost:3001 |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |

## Critical .env values for Docker

```env
# MUST be localhost — browser cannot resolve Docker container names
NEXT_PUBLIC_API_URL=http://localhost:3001/api
FRONTEND_URL=http://localhost:3000
STRIPE_DEV_BYPASS=true     # skip Stripe locally
USE_MOCK_OCR=true          # skip OpenAI locally (uses demo data)
```
