# Nom Nom AI

A cross-platform mobile application where users input ingredients and an AI agent generates recipe ideas tailored to their lifestyle, dietary preferences, and health goals.

---

## Project Structure

```
nom-nom-ai/
├── apps/
│   ├── api/        ← Node.js + Express + Prisma backend
│   └── mobile/     ← React Native + Expo mobile app
├── package.json    ← pnpm workspace root
└── docker-compose.yml
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- [Podman Desktop](https://podman-desktop.io/) (includes Podman CLI)
- `podman-compose` — install via `pip install podman-compose`

---

## Local Development (without Docker)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/api/.env` with your credentials.

### 3. Start PostgreSQL (Podman)

```bash
pnpm podman:postgres
# or directly:
podman-compose up -d postgres
```

### 4. Run database migrations + seed

```bash
pnpm db:migrate
pnpm db:seed
```

### 5. Start the API

```bash
pnpm dev:api
```

API will be available at `http://localhost:3000`. Health check: `GET /health`

### 6. Start the Mobile App

```bash
pnpm dev:mobile
```

Scan the QR code with the Expo Go app.

---

## Local Development (full Podman stack)

```bash
pnpm podman:up
# or directly:
podman-compose up --build
```

This starts:
- `api` — Express API on port 3000
- `postgres` — PostgreSQL on port 5432

---

## Deployment (DigitalOcean)

See **Sub-Task 16** in the plan for full step-by-step deployment instructions.

**Quick reference:**
1. Provision Ubuntu Droplet (smallest tier)
2. Install Podman + podman-compose (`sudo apt install podman && pip install podman-compose`)
3. Clone repo, create `.env` on server (never commit)
4. `podman-compose up -d`
5. `podman exec nom-nom-api npx prisma migrate deploy`
6. `podman exec nom-nom-api npx prisma db seed`
7. Set `EXPO_PUBLIC_API_URL` to your Droplet's public IP

---

## Tech Stack

| Concern | Choice |
|---|---|
| Mobile | React Native + Expo |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (email + password) |
| AI | OpenAI (swappable via AIProvider interface) |
| AI Agents | Recipe Agent + Cooking Assistant (shared AgentRuntime + ToolRegistry) |
| Nutrition | Edamam Nutrition Analysis API → Nutrition Resolver LLM fallback (cached in PostgreSQL) |
| Deployment | Podman + DigitalOcean |

---

## Environment Variables

See `apps/api/.env.example` and `apps/mobile/.env.example`.
