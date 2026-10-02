# Nom Nom AI — Master Plan & Global Context

> This document is the single source of truth for the entire project. Every decision, design choice, rationale, schema, API contract, AI workflow, mobile screen inventory, and roadmap lives here. Read this before touching any sub-task.

---

## Table of Contents

1. [Project Vision & Background](#1-project-vision--background)
2. [Tech Stack & Decisions](#2-tech-stack--decisions)
3. [Architecture Overview](#3-architecture-overview)
4. [Database Schema — Full Phase 1](#4-database-schema--full-phase-1)
5. [AI Workflows](#5-ai-workflows)
6. [API Endpoint Master List](#6-api-endpoint-master-list)
7. [Mobile Screen Inventory](#7-mobile-screen-inventory)
8. [Project Folder Structure](#8-project-folder-structure)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Phase 1 Scope — What's In & Out](#10-phase-1-scope--whats-in--out)
11. [Phased Roadmap](#11-phased-roadmap-future-phases)
12. [Sub-Tasks](#12-sub-tasks)

---

## 1. Project Vision & Background

**App Name:** Nom Nom AI

**Core Idea:** A cross-platform mobile application where users input the ingredients they have on hand and an AI agent generates recipe ideas tailored to their lifestyle, dietary preferences, and health goals.

**Origin Story:**
The user inputs a text list of ingredients → AI returns recipe ideas categorised by type (Quick, Fancy, Healthy, Comfort, etc.) → over time, the app evolves to support image scanning of ingredients, step-by-step recipe photos, video tutorials, and a fully custom AI model.

**Learning Goals (Primary):**
This is a learning project. The primary objective is end-to-end full-stack development and deployment — from database design to mobile UI to AI integration to Docker + VPS deployment. Enterprise-level concerns (CI/CD, scalability, SLAs) are deferred to later phases.

**Target Users (Phase 1):**
- Home cooks who want recipe ideas from what they already have
- Health-conscious users who want to track calories and plan meals
- Community members who want to share recipes they've generated

**Initial Cuisine Focus:** Indian cuisines (Phase 1) — architecture is built to support diverse cuisines later.

**Solo Developer:** Built by one person with intermediate JavaScript / full-stack experience and beginner Python/ML knowledge.

---

## 2. Tech Stack & Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Mobile framework | React Native + Expo | Cross-platform from day one; leverages existing JS skills; Expo simplifies build/deploy |
| Backend | Node.js + Express | Familiar ecosystem; TypeScript throughout; no context-switching from mobile |
| Database | PostgreSQL + Prisma ORM | Relational — ideal for users, recipes, goals, nutrition tracking; Prisma gives type-safe queries |
| Auth | Email + password, JWT | Simple, self-hosted, no third-party dependency; no refresh tokens in Phase 1 |
| AI provider | OpenAI (swappable) | Provider-agnostic abstraction layer; swap by changing `AI_PROVIDER` env var; `MockAIProvider` for local dev |
| AI agent runtime | Tool-calling loop (shared infrastructure) | Recipe Agent and Cooking Assistant share a common agent runtime, LLM client, and tool registry; each has separate system instructions, tools, and state |
| Nutrition data | LLM Nutrition Resolver (sole path) | Lookup order: (1) `food_nutrition` cache → (2) two-call LLM Resolver (classify basisUnit → fetch macros) → stored as `source = "llm_estimate"`. Edamam removed entirely. |
| File storage | None in Phase 1 | No profile pics or recipe images — deferred to Phase 2+ |
| Deployment | Docker + DigitalOcean VPS | Learning-focused; manual deploys fine; Dockerized from the start for portability |
| Navigation | Expo Router (file-based) | Clean file-based routing; maps to screens naturally |
| UI library | NativeWind or React Native Paper | TBD at implementation time — either works |
| Validation | Zod | Schema validation on all API inputs |
| Monorepo | pnpm workspaces | Single repo, two apps: `apps/api` and `apps/mobile` |
| Future AI | pgvector (Phase 2), custom Python model (Phase 5) | Schema already accommodates a `vector` column on `recipes`; no separate vector DB needed |

### Key Design Decisions & Rationale

**AI Abstraction Layer**
The `AIProvider` interface means the entire app doesn't care which LLM is behind it. `AI_PROVIDER=openai` uses OpenAI; `AI_PROVIDER=mock` uses a hardcoded response for local dev. Swapping to Gemini or any other provider in the future requires only a new implementation of the interface — zero changes to business logic.

**Agent Architecture — Agents Reason, Tools Act**
The AI layer uses a two-agent design: a **Recipe Agent** (generates and adapts recipes) and a **Cooking Assistant** (guides step-by-step cooking). Both share common agent infrastructure (runtime, LLM client, tool registry, conversation handling) but have separate system instructions, tool sets, input/output schemas, and state requirements. A max-5-iteration guard on the Recipe Agent prevents infinite tool-calling loops.

**Strict Database Boundary**
The LLM must never query PostgreSQL directly. All data access goes through backend tool calls: `LLM → Tool → Backend Service → Repository → PostgreSQL`. This keeps the AI layer fully replaceable and prevents database logic from becoming entangled with prompts.

**Structured Outputs for Agent Responses**
Any agent response consumed by application code must be structured JSON matching the application's Prisma models and API contracts — not arbitrary text. The LLM generates the recipe structure; nutrition values come from deterministic backend calculations, not LLM inference.

**Tool-Calling Agent vs Simple API Call**
The Recipe Agent uses OpenAI function/tool calling instead of a simple prompt → response. This means the agent can call backend functions (look up user context, fetch nutrition, save to DB, validate constraints) during generation. The result is a recipe already validated against the user's constraints — not something bolted on afterwards. The iterative generate → calculate → validate → modify loop is the primary reason this is an agent rather than a single LLM call.

**FoodNutrition as Nutrition Cache (LLM Nutrition Resolver — sole path)**
`FoodNutrition` is the single source of truth for all ingredient nutrition data. Edamam has been removed entirely. Lookup order: (1) check `food_nutrition` by `ingredientId` — if found, use it; (2) if missing, invoke the **two-call LLM Nutrition Resolver**: Call 1 classifies the ingredient's `basisUnit` (`g` / `ml` / `piece`), backend derives `basisQty` via `BASIS_QTY_MAP`, Call 2 fetches macros relative to that basis. Result stored with `source = "llm_estimate"`. The LLM is **never** called again for the same ingredient — subsequent requests always hit the cache. Phase 2 backfills `llm_estimate` rows with a verified nutrition database. All five Phase 1 macros (calories, protein, carbs, fat, **fiber**) are stored as explicit columns — no JSON — so Prisma can query and sum them efficiently. `basisQty` + `basisUnit` replace the old `per100g` boolean and correctly handle whole-unit ingredients like eggs.

**Pantry is Standalone in Phase 1**
Generation screen ingredients are transient (not saved to pantry). The pantry is a manually managed standalone feature. Phase 2 connects them — "generate a recipe from my pantry" becomes a mode. This keeps Phase 1 scope clean.

**No Meal Planning Tables — NutritionLog Instead**
`MealPlan` and `MealPlanItem` are removed. There is no scheduling/planning system in Phase 1. Instead, `NutritionLog` records pure consumption: "The user ate this recipe, in this quantity, at this time." `mealType` is optional and descriptive (BREAKFAST/LUNCH/DINNER/SNACK) — it labels when something was eaten, not part of a planning workflow. The dashboard is computed at query time from `NutritionLog` + `UserGoal` + recipe nutrition data — no extra tables needed.

**UserProfile Drives Nutrition Calculations**
`UserProfile` now stores `age`, `height`, `weight`, `heightUnit`, `weightUnit`, and `activityLevel`. These four inputs feed standard nutrition calculation formulas (e.g. Mifflin-St Jeor) to derive a user's daily calorie and macro targets — without needing a separate `NutritionTarget` table. `UserGoal` handles both high-level goals (`LOSE_WEIGHT`) and explicit nutrition targets (`DAILY_CALORIES`, `DAILY_PROTEIN`, etc.) in one table using the `GoalType` enum. The `unit` field is removed — it is derived from `goalType` in backend code.

**Spices Excluded from Ingredient System**
Standard Indian spices (cumin, turmeric, coriander powder, chili powder, garam masala, mustard seeds, etc.) are not stored as `Ingredient` rows and have no `FoodNutrition` entries. Rationale: (1) macro contribution is negligible at cooking quantities (2–5g per dish); (2) micronutrients where spices are rich are Phase 2; (3) home cooks are assumed to always have these stocked. The Recipe Agent system prompt includes an explicit spice assumption list — spices appear in recipe descriptions and steps only, never as structured `RecipeIngredient` rows. Garlic, ginger, and onion are classified as `VEGETABLE` (not spices) because they contribute meaningful macros at the quantities used in Indian cooking.

**IngredientCategory Enum**
`Ingredient.category` changed from free-form `String?` to `IngredientCategory` enum. 10 categories covering all macro-contributing food types: `VEGETABLE`, `FRUIT`, `GRAIN`, `LEGUME`, `DAIRY`, `MEAT`, `SEAFOOD`, `EGG`, `NUT_AND_SEED`, `OIL_AND_FAT`. `SPICE` excluded by design. Used for pantry filtering in the UI.

**Micronutrients as JSON, Not Tables**
`FoodNutrition` keeps `calories`, `protein`, `carbs`, `fat` as dedicated columns for fast querying. Vitamins and minerals live in a `micronutrients Json` field (PostgreSQL JSONB). This avoids a `Nutrient`/`FoodNutrient`/`Vitamin`/`Mineral` table explosion while still supporting the full micronutrient spectrum. Example: `{ "vitaminA": 30, "vitaminC": 5, "calcium": 15, "iron": 1.2 }`.

**Recipe sourceType — AI vs User-Created**
`Recipe` now has a `sourceType` enum (`AI_GENERATED` | `USER_CREATED`). Both use the same architecture (`RecipeIngredient`, `RecipeVersion`, etc.). A user-created recipe is born when the user logs "Egg Toast" with custom ingredients — the backend creates the recipe + ingredient rows + calculates nutrition. On future logs the user just selects it and picks servings — no re-entering ingredients.

**No LLM for Arithmetic — All Calculations Are Deterministic Backend Code**
The LLM is used only for recipe generation and ingredient name recognition. Every nutrition calculation — ingredient scaling, recipe totals, serving totals, daily totals, goal progress — is performed in backend TypeScript using the formula: `(food_nutrition.value / food_nutrition.basisQty) × recipe_ingredient.quantity × log.servings`. Summed across ingredients and logs. This is deterministic, testable, and never dependent on LLM availability.

**Multiple Concurrent User Goals**
A user can have multiple active goals simultaneously (e.g. "lose weight" + "increase protein"). There is no single-active constraint. The Recipe Agent and meal planner read all active goals when making decisions.

**Rule-Based Suggestions, Not AI**
Home screen suggestions use pure PostgreSQL query logic — most-used tags from nutrition log history + dietary filter. OpenAI is not invoked for suggestions. This keeps API costs predictable and suggestions fast.

**Cooking Session State in Memory**
Cooking Assistant sessions live in a Node.js `Map` — no DB persistence. Sessions expire after 2 hours of inactivity. If the server restarts, sessions are lost — acceptable for Phase 1. Phase 5 upgrades this to Redis for persistence.

**`recipe_steps` Empty in Phase 1**
The table exists and is ready, but all Phase 1 AI-generated recipes have no steps — just a paragraph description in `recipe_versions.description`. Phase 3 adds structured step-by-step format and populates this table.

---

## 3. Architecture Overview

```
React Native + Expo App
        │
        ▼
Node.js + Express API
        │
   ┌────┴────────────────────────────────┐
   │                                     │
   ▼                                     ▼
PostgreSQL (Prisma ORM)           AI Service Layer
18 tables across 5 domains              │
                         ┌──────────────┼──────────────┐
                         ▼              ▼              ▼
                    Agent Runtime   LLM Client    Tool Registry
                         │              │
                    ┌────┴────┐    ┌────┴────┐
                    ▼         ▼    ▼         ▼
              Recipe      Cooking  OpenAI  MockAI
              Agent       Asst.   Provider Provider
                    │         │
                    └────┬────┘
                         │ Tool Calls
                         ▼
                   Backend Services
                   (NutritionService, RecipeService,
                    PantryService, CookingSessionStore)
                         │
                         ▼
                   PostgreSQL (via Prisma)

Edamam Nutrition Analysis API
(called by NutritionService; results cached in food_nutrition)
```

### AI Layer Boundary — Never Bypass

```
                    AI Layer
                       │
                       │ Tool Calls only
                       ▼
                 Backend Services
                       │
                       ▼
           Repository / Data Access Layer
                       │
                       ▼
                   PostgreSQL
```

The LLM must never hold database credentials or issue Prisma queries directly.
All data reads and writes flow through typed backend tool functions.

### How the Three AI Workflows Fit In

```
Workflow 1 — Recipe Agent (tool-calling loop, max 5 iterations)
  User types ingredients
       ↓
  Express POST /api/recipes/generate
       ↓
  Recipe Agent
       ├── Tool: search_ingredients()         → ingredient lookup
       ├── Tool: get_ingredient()             → ingredient detail
       ├── Tool: get_nutrition()              → nutrition lookup / Edamam / Nutrition Resolver
       ├── Tool: get_user_pantry()            → pantry contents for current user
       ├── Tool: calculate_recipe_nutrition() → deterministic backend calculation
       ├── Tool: validate_recipe()            → check generated recipe meets constraints
       ├── Tool: save_recipe()                → persist to recipes, recipe_versions,
       │                                        recipe_ingredients, recipe_tags
       └── Tool: get_recipe()                 → retrieve persisted recipe
       ↓
  Structured recipe JSON returned (schema in Section 5)
  Nutrition values from backend calculation, not LLM inference

Workflow 1b — Nutrition Resolver (internal, not user-facing)
  Triggered when get_nutrition() finds no entry in food_nutrition
       ↓
  Attempt Edamam lookup
       ↓
  If unavailable → Nutrition Resolver:
       Normalize ingredient name
       → LLM: estimate per-100g macros
       → Validate / normalize result
       → Store in food_nutrition (source = "llm_estimate")
       → Return to Recipe Agent
  Future requests hit food_nutrition cache — LLM not called again

Workflow 2 — Suggestions + Dashboard
  Home screen suggestions (NO AI — rule-based only):
    nutrition_logs history + user goals + dietary prefs → PostgreSQL query → top 10 suggestions

  Dashboard (computed at query time — no extra tables):
    UserGoal (daily targets) + NutritionLog (today's logs) + recipe nutrition
       ↓
    consumed calories/protein/carbs/fat for the day
       ↓
    progress vs daily targets returned to app

Workflow 3 — Cooking Assistant
  User taps "Start Cooking" on a recipe
       ↓
  POST /api/cooking/sessions → session created in memory (Node.js Map)
  System prompt built from: full recipe + user dietary profile + persona
  Session state: { recipeId, currentStep, completedSteps, servings, sessionStatus }
       ↓
  Chat loop: user messages → Cooking Assistant Agent → contextual responses
  "Next Step" button → Tool: update_cooking_progress() → increments currentStep in session
       ↓
  DELETE /api/cooking/sessions/:id when user exits
```

### Data Flow Diagram

```
INGREDIENT "What is it?"
      │
      ├──────────────────────┐
      ▼                      ▼
   PANTRY                 RECIPE
"What I have"          "How to make"
(manual, standalone     (AI_GENERATED or
 in Phase 1)             USER_CREATED)
      │                      │
      │                      ▼
      │               Recipe Detail
      │               Save / Publish / Log
      │
      └──────────────────────┐
                             ▼
                     NUTRITION LOG
                  "The user consumed this
                   recipe, in this quantity,
                   at this time"
                             │
                             ▼
                    DASHBOARD (computed)
                  UserGoal + NutritionLog
                  + recipe nutrition data
                             │
                             ▼
                    Goal Progress Display
               Calories 1570 / 2200 kcal
               Protein    95 / 120 g
               Carbs     170 / 250 g
               Fat        48 / 70 g
```

---

## 4. Database Schema — Full Phase 1

> 18 tables across 5 domains. Removed: `meal_plans`, `meal_plan_items`. Renamed: `meal_logs` → `nutrition_logs`. Modified: `user_profiles`, `food_nutrition`, `recipes`.

### Domain Map

```
USER                       INGREDIENT / NUTRITION
├── users                  ├── ingredients
├── user_profiles          ├── ingredient_aliases
├── user_goals             └── food_nutrition
├── dietary_preferences           (+ micronutrients Json)
└── user_dietary_preferences

RECIPES                    PANTRY
├── recipes                ├── pantries
│   (+ sourceType)         ├── pantry_items
├── recipe_versions        └── pantry_events
├── recipe_ingredients
├── recipe_steps           NUTRITION TRACKING
├── tags                   └── nutrition_logs
└── recipe_tags
```

### USER Domain

| Table | Key Fields | Notes |
|---|---|---|
| `users` | id, email, passwordHash, createdAt | Auth identity only |
| `user_profiles` | userId (FK), displayName, bio, age, height, heightUnit, weight, weightUnit, activityLevel, createdAt | age/height/weight/activityLevel power nutrition target calculations |
| `user_goals` | id, userId (FK), goalType (GoalType enum), targetValue, isActive, createdAt | `unit` removed — derived from `goalType` in backend. Used for BOTH health goals AND nutrition targets |
| `dietary_preferences` | id, name (DietaryPreferenceType enum), description, llmConstraint | `name` changed from String to enum. `llmConstraint` added for AI system prompt injection |
| `user_dietary_preferences` | userId (FK), dietaryPreferenceId (FK) | Junction table — unchanged |

**GoalType enum values and their derived units:**
```
GoalType             targetValue    unit (derived, not stored)
LOSE_WEIGHT          65             kg
MAINTAIN_WEIGHT      72             kg  (copied from UserProfile.weight at creation)
GAIN_WEIGHT          80             kg
DAILY_CALORIES       2200           kcal
DAILY_PROTEIN        120            g
DAILY_CARBS          250            g
DAILY_FAT            70             g
DAILY_FIBER          30             g
```

**DietaryPreferenceType enum values:**
```
VEGETARIAN    — No meat, fish, or eggs. Dairy allowed. (Indian standard — eggs excluded)
VEGAN         — No animal products whatsoever
NONVEGETARIAN — All meats (no beef), fish, eggs, dairy allowed
PESCATARIAN   — No meat; fish, seafood, eggs, dairy allowed
EGGETARIAN    — Vegetarian + eggs; no meat or fish
SATVIC        — Plant-based; no onion, garlic, or stimulants (Ayurvedic)
JAIN          — No meat, fish, eggs, or root vegetables (onion, garlic, potato, etc.)
```

**ActivityLevel enum:**
```
SEDENTARY | LIGHTLY_ACTIVE | MODERATELY_ACTIVE | HIGHLY_ACTIVE
```

### INGREDIENT / NUTRITION Domain

| Table | Key Fields | Notes |
|---|---|---|
| `ingredients` | id, name (unique), category (IngredientCategory enum), createdAt | Canonical ingredient identity. `recipeIngredients` and `pantryEvents` reverse relations removed — navigation always goes Recipe→Ingredient and Pantry→Ingredient, never reverse |
| `ingredient_aliases` | id, ingredientId (FK), alias | Solves "tomato vs tamatar vs roma tomato" — critical for Indian cuisine |
| `food_nutrition` | id, ingredientId (FK), calories, protein, carbs, fat, fiber, basisQty, basisUnit, source, updatedAt | All 5 Phase 1 macros as explicit columns; basisQty+basisUnit replace the old `per100g` boolean |

**FoodNutrition field notes:**
- `basisQty` (default 100) + `basisUnit` (default "g") — the quantity the nutrition values are measured against. Standard is per 100g; whole-unit ingredients like eggs use basisQty=1, basisUnit="piece"
- `fiber` — included in Phase 1 dashboard. No micronutrients (vitamins/minerals) in Phase 1 — that is Phase 2
- `source` values: `"llm_estimate"` | `"manual"` | `"custom_model"` — `"edamam"` removed (Edamam integration dropped)
- **`"llm_estimate"`** — default for all new ingredients: two-call LLM Resolver estimates macros per `basisQty`/`basisUnit` and stores here. Phase 2 backfills these with a verified nutrition database

### RECIPE Domain

| Table | Key Fields | Notes |
|---|---|---|
| `recipes` | id, title, cuisineType (CuisineType enum), sourceType (RecipeSourceType enum), isPublished, authorId (FK), createdAt | `cuisineType` changed from String → enum; user selects at generation time for accurate agent output |
| `recipe_versions` | id, recipeId (FK), versionNumber, description, servings, aiPromptUsed, createdAt | `servings` = how many servings this version makes (version-scoped, not recipe-scoped); `description` = short summary subtitle |
| `recipe_ingredients` | id, recipeId (FK), ingredientId (FK), quantity, unit | Structured ingredient list; unit must match FoodNutrition.basisUnit |
| `recipe_steps` | id, recipeVersionId (FK), stepNumber, instruction | FK changed from Recipe → RecipeVersion — each version has its own independent steps; never overwrites previous version's steps |
| `tags` | id, name | QUICK, FANCY, HEALTHY, COMFORT, OTHER — extensible |
| `recipe_tags` | recipeId (FK), tagId (FK) | Junction table |
| `user_saved_recipes` | userId (FK), recipeId (FK), savedAt | Bookmark junction table — composite PK prevents duplicates; savedAt for recency sort |

**RecipeSourceType enum:**
```
AI_GENERATED | USER_CREATED
```

**CuisineType enum:**
```
Indian regional (all geographic regions):
  NORTH_INDIAN   — Punjab, Delhi, UP, Himachal, Uttarakhand, J&K
  SOUTH_INDIAN   — Tamil Nadu, Kerala, Karnataka, Andhra, Telangana
  EAST_INDIAN    — West Bengal, Odisha, Bihar, Jharkhand, North-East states
  WEST_INDIAN    — Maharashtra, Gujarat, Goa, Rajasthan

Popular international cuisines in India:
  CHINESE        — includes Indo-Chinese (Manchurian, hakka noodles)
  ITALIAN        — pizza, pasta
  MEXICAN        — tacos, burritos
  MIDDLE_EASTERN — shawarma, hummus, falafel
  THAI           — curries, pad thai, stir fries
  CONTINENTAL    — Western European catch-all

Fallback:
  OTHER          — fusion, unclassified, or USER_CREATED recipes
```

Default: `NORTH_INDIAN`. USER_CREATED recipes default to `OTHER`.
User selects cuisine before generation → passed to Recipe Agent → more accurate regional output.
Community feed cuisine filter uses exact enum match — no more case-insensitive string comparison.

**USER_CREATED recipe flow:**
User logs "Egg Toast" with 2 Eggs + 2 Bread slices → backend creates `Recipe` (sourceType=USER_CREATED) + `RecipeIngredient` rows + calculates nutrition → recipe saved permanently → future logs just reference recipeId + servings count, no re-entering ingredients.

### PANTRY Domain

| Table | Key Fields | Notes |
|---|---|---|
| `pantries` | id, userId (FK), name, createdAt | One pantry per user auto-created on first item add |
| `pantry_items` | id, pantryId (FK), ingredientId (FK), quantity, unit, addedAt, expiresAt | expiresAt optional |
| `pantry_events` | id, pantryId (FK), ingredientId (FK), eventType, quantity, createdAt | eventType: ADDED / REMOVED / USED; audit trail |

### NUTRITION TRACKING Domain

| Table | Key Fields | Notes |
|---|---|---|
| `nutrition_logs` | id, userId (FK), recipeId (FK), servings, mealType (optional), loggedAt | Replaces `meal_logs`; records consumption not planning |

> `MealPlan` and `MealPlanItem` are removed. The dashboard is computed at query time — no dedicated table needed.

**Dashboard computation (all arithmetic in backend, no LLM):**
```
Step 1: UserGoal rows where goalType IN (DAILY_CALORIES, DAILY_PROTEIN, DAILY_CARBS, DAILY_FAT, DAILY_FIBER) and isActive = true
        → build targets: { calories: 2200, protein: 120, carbs: 250, fat: 70, fiber: 30 }
        → key derived by: goalType.replace('DAILY_', '').toLowerCase()

Step 2: NutritionLog rows for today (loggedAt >= start of today)

Step 3: For each log → join RecipeIngredient → join FoodNutrition
        For each ingredient:
          contribution = (food_nutrition.value / food_nutrition.basisQty)
                         × recipe_ingredient.quantity
                         × nutrition_log.servings
        Sum contributions across all ingredients → recipe total

Step 4: Sum recipe totals across all logs → daily consumed totals

Step 5: Return:
  targets:   { calories: 2200, protein: 120, carbs: 250, fat: 70, fiber: 30 }
  consumed:  { calories: 1570, protein: 95,  carbs: 170, fat: 48, fiber: 18 }
  remaining: { calories: 630,  protein: 25,  carbs: 80,  fat: 22, fiber: 12 }
  logs: [ { recipe, servings, mealType, loggedAt, nutrition }, ... ]
```

> Phase 1 tracks: calories, protein, carbs, fat, fiber. Phase 2 adds micronutrients.

### Enums

```
MealType:              BREAKFAST | LUNCH | DINNER | SNACK   (optional on NutritionLog)
PantryEventType:       ADDED | REMOVED | USED
ActivityLevel:         SEDENTARY | LIGHTLY_ACTIVE | MODERATELY_ACTIVE | HIGHLY_ACTIVE
RecipeSourceType:      AI_GENERATED | USER_CREATED
CuisineType:           NORTH_INDIAN | SOUTH_INDIAN | EAST_INDIAN | WEST_INDIAN |
                       CHINESE | ITALIAN | MEXICAN | MIDDLE_EASTERN | THAI | CONTINENTAL | OTHER
DietaryPreferenceType: VEGETARIAN | VEGAN | NONVEGETARIAN | PESCATARIAN | EGGETARIAN | SATVIC | JAIN
IngredientCategory:    VEGETABLE | FRUIT | GRAIN | LEGUME | DAIRY | MEAT | SEAFOOD | EGG |
                       NUT_AND_SEED | OIL_AND_FAT
GoalType:              LOSE_WEIGHT | MAINTAIN_WEIGHT | GAIN_WEIGHT |
                       DAILY_CALORIES | DAILY_PROTEIN | DAILY_CARBS | DAILY_FAT | DAILY_FIBER
```

**GoalType → derived unit mapping (unit NOT stored in DB — derived in backend via GoalService.getUnitForGoalType):**
```
LOSE_WEIGHT | MAINTAIN_WEIGHT | GAIN_WEIGHT  →  "kg"
DAILY_CALORIES                               →  "kcal"
DAILY_PROTEIN | DAILY_CARBS | DAILY_FAT | DAILY_FIBER  →  "g"
```

**MAINTAIN_WEIGHT note:** `targetValue` is copied from `UserProfile.weight` at goal-creation time — backend reads the profile and auto-fills it so the user doesn't have to enter their current weight twice.

---

## 5. AI Workflows

### Workflow 1 — Recipe Agent (Tool-Calling)

**Trigger:** User submits ingredients on the generation screen.

**Inputs the agent may receive:**
- User-provided ingredients + quantities
- Number of servings, meal type, cuisine preference
- Dietary preferences / restrictions
- Cooking time, available equipment
- Calorie target, macro targets
- Other natural-language instructions

**How it works:**
```
User → POST /api/recipes/generate
     → AIProviderFactory reads AI_PROVIDER env var
     → OpenAIProvider.runRecipeAgent() starts tool-calling loop (max 5 iterations)
          ├── Tool: search_ingredients(query)           → searches ingredient name AND aliases in one query
          │                                                Returns empty if not found — triggers create flow
          ├── Tool: create_ingredient(name, category, aliases[])
          │                                             → creates new Ingredient + IngredientAlias rows
          │                                                Only called if search_ingredients returned nothing
          │                                                category must be a valid IngredientCategory enum value
          ├── Tool: get_ingredient(id)                  → ingredient detail by ID
          ├── Tool: get_nutrition(ingredientId)         → checks food_nutrition cache first;
          │                                                on miss → LLM Nutrition Resolver → stores result
          │                                                Always call before calculate_recipe_nutrition
          ├── Tool: get_user_pantry(userId)             → pantry contents when user asks to use what they have
          ├── Tool: calculate_recipe_nutrition(ingredients[]) → deterministic backend macro calculation
          ├── Tool: validate_recipe(recipe, constraints)     → checks constraint satisfaction
          │         ↓ if FAIL → agent modifies recipe and calls calculate + validate again
          ├── Tool: save_recipe(recipeData)             → persists to recipes, recipe_versions,
          │                                                recipe_ingredients, recipe_tags
          └── Tool: get_recipe(recipeId)                → retrieve saved recipe for return
     → Structured recipe JSON returned to app
     → Nutrition values from backend calculation (never from LLM inference)
```

**Ingredient resolution flow (new ingredient vs existing):**
```
Agent receives ingredient name from user (e.g. "karela" or "tamatar")
     ↓
search_ingredients("karela")
     → Searches ingredients.name AND ingredient_aliases.alias (single OR query)
     → Found (via name OR alias)? → use existing ingredientId → skip to get_nutrition
     ↓
Not found → Agent applies CANONICAL NAMING RULE (system prompt rule 15):
     → Identifies "karela" as a regional Hindi name
     → Converts to canonical English name: "bitter gourd"
     → Original term becomes an alias

create_ingredient({
  name: "bitter gourd",          ← canonical English name — NEVER "karela"
  category: "VEGETABLE",
  aliases: ["karela", "pavakkai", "hagalkai"]  ← regional terms including user's original input
})
     → Ingredient row created with canonical English name
     → IngredientAlias rows created — future searches for "karela" will resolve to this row
     → Returns new ingredientId
     ↓
get_nutrition(ingredientId)
     → food_nutrition cache miss (just created)
     → LLM Nutrition Resolver called → per-100g macros estimated → stored (source: "llm_estimate")
     → Returns nutrition data
     ↓
Agent proceeds to calculate_recipe_nutrition with ingredientId
```

**Canonical naming examples the agent must follow:**
```
User input    →  name (stored)    →  aliases (stored)
"tamatar"     →  "tomato"         →  ["tamatar", "tameta"]
"aloo"        →  "potato"         →  ["aloo", "aalu", "batata"]
"karela"      →  "bitter gourd"   →  ["karela", "pavakkai", "hagalkai"]
"palak"       →  "spinach"        →  ["palak"]
"chana"       →  "chickpeas"      →  ["chana", "chole", "garbanzo"]
```

**Phase 2 — Server-side canonicalisation (safety net):**
The system prompt rule is the Phase 1 defence. Phase 2 will add a server-side LLM call inside
`handleCreateIngredient()` that independently verifies the name is canonical before writing to DB.
This adds a hard guarantee even if the agent ignores the rule. Not done in Phase 1 because it
requires an extra LLM API call per ingredient creation, which isn't cost-justified until the app
has real usage volume.

**Validation loop:**
```
Generate recipe
      ↓
calculate_recipe_nutrition()
      ↓
validate_recipe()
      ↓
Constraint FAIL? → Modify recipe → calculate again → validate again
      ↓
Constraint PASS → save_recipe() → return structured result
```

**System Prompt Instructions (must include):**
- Return structured JSON matching `AgentRecipeResult` type
- Categorise with tags (QUICK / FANCY / HEALTHY / COMFORT / OTHER)
- Focus on Indian cuisine initially
- Keep description as a readable paragraph
- Respect dietary restrictions found in user context
- Never suggest ingredients that violate dietary preferences
- Do not fabricate nutrition values — use `calculate_recipe_nutrition` tool
- Do not invent pantry items the user has not confirmed
- If a constraint cannot be satisfied, explain and propose an alternative
- **SPICE ASSUMPTION:** Always assume the user has the following standard Indian spices available —
  cumin (jeera), turmeric (haldi), coriander powder (dhaniya), red chili powder (lal mirch),
  garam masala, mustard seeds (rai/sarson), dry red chili, bay leaf (tej patta), cardamom (elaichi),
  cinnamon (dalchini), cloves (laung), black pepper (kali mirch), asafoetida (hing), carom seeds (ajwain).
  Spices are NOT in the ingredient DB and have no `FoodNutrition` rows — do NOT call `get_nutrition`
  or `search_ingredients` for spices. Reference them in recipe description and steps only, never as
  structured `RecipeIngredient` rows. Rationale: spice macro contribution is negligible at cooking
  quantities (2–5g per dish); micronutrients are Phase 2.
- **CANONICAL INGREDIENT NAMING:** When calling `create_ingredient`, the `name` field MUST always be
  the standard English name — never a regional, Hindi, or vernacular term. The user's original term
  must be added to `aliases`, not used as `name`. Examples: `"tamatar"` → name: `"tomato"`, alias:
  `"tamatar"`. `"aloo"` → name: `"potato"`, alias: `"aloo"`. If unsure, use the most widely
  recognised English name. Phase 2 will add server-side LLM canonicalisation as a hard guarantee.

**Structured Output Schema:**
```typescript
AgentRecipeResult: {
  name: string
  description: string
  servings: number
  cuisineType: string
  tags: string[]
  cookingTimeMinutes: number
  ingredients: Array<{
    ingredient: string      // name — resolved via search_ingredients tool
    quantity: number
    unit: string
  }>
  steps: Array<{
    step: number
    instruction: string
  }>
  nutrition: {
    calories: number        // from calculate_recipe_nutrition (backend)
    protein: number
    carbohydrates: number
    fat: number
    fiber: number
  }
}
```

**Key Types:**
```typescript
AIProvider interface:
  runRecipeAgent(params: {
    userId: string
    ingredients: string[]
    servings?: number
    mealType?: string
    tagPreference?: string
    cuisine?: string
    calorieTarget?: number
    dietaryConstraints?: string[]
    naturalLanguageRequest?: string
  }): Promise<AgentRecipeResult>
```

**Phase 2 placeholder:** A `scan_ingredients_from_image(imageBase64)` vision tool will be added here.

---

### Workflow 1b — Nutrition Resolver (Internal AI-Assisted Workflow)

**Trigger:** `get_nutrition(ingredientId)` tool finds no row in `food_nutrition`.

**This is not a user-facing agent.** It is an internal service invoked by NutritionService.lookupOrResolve().

**Edamam has been removed.** The two-call LLM Nutrition Resolver is the sole resolution path. Rationale:
- Removes an external API dependency and its associated cost + latency
- Two focused calls are more reliable than one combined call (classification vs factual lookup)
- Per-piece ingredients (egg, banana, lemon) get accurate basis — not forced into per-100g framing
- Phase 2 will backfill `llm_estimate` rows with a verified nutrition database

**basisUnit → basisQty mapping (backend-determined, LLM never decides the number):**
```
basisUnit   basisQty   When used
"g"         100        Solids measured by weight (spinach, rice, chicken, paneer)
"ml"        100        Liquids measured by volume (milk, oil, coconut milk)
"piece"     1          Whole-unit items counted in recipes (egg, banana, lemon, bread slice)
```

**How it works:**
```
NutritionService.lookupOrResolve(ingredientId, ingredientName)
     ↓
1. Check food_nutrition cache by ingredientId
   → Found? → return cached record (LLM never called again for this ingredient)
     ↓
2. Cache miss →

   Call 1 — Basis Unit Classification (gpt-4o-mini, temperature=0, max_tokens=5):
   Prompt: "How is '{ingredientName}' measured in recipes? Reply: g | ml | piece"
   Response: "g" | "ml" | "piece"
   Backend derives basisQty from BASIS_QTY_MAP — LLM never decides the number
     ↓
   Call 2 — Nutrition Lookup (gpt-4o-mini, temperature=0, json_object format):
   Prompt: "Provide macros for '{ingredientName}' per {basisQty} {basisUnit} as JSON:
            { calories, protein, carbs, fat, fiber }"
   Response: numeric macro values relative to the determined basis
     ↓
3. Validate plausibility (ranges differ by basis):
   Per-100g / per-100ml:  calories 0–900,  protein/carbs/fat/fiber 0–100g
   Per-piece:             calories 0–2000, protein/carbs/fat/fiber 0–500g
   → Implausible? → reject, return null, surface error to agent
     ↓
4. Upsert food_nutrition (source="llm_estimate", basisQty, basisUnit as determined)
     ↓
5. Return stored record
   → All future requests for this ingredientId hit food_nutrition cache
```

**Unit matching rule (Recipe Agent system prompt rule 16):**
The Recipe Agent must express each `RecipeIngredient.quantity` in the same unit as
`FoodNutrition.basisUnit` for that ingredient. The scaling formula only works correctly when units match:
```
scaled_macro = (macro / basisQty) × ingredient_quantity × servings
```
If `basisUnit = "piece"` and the agent saves `quantity: 150, unit: "g"`, the formula gives wrong results.
The agent checks `basisUnit` via `get_nutrition` before calling `save_recipe`.

**Error handling:**
- If Call 1 (classification) fails → defaults to `"g"` as safe fallback
- If Call 2 (nutrition) is implausible → reject, return null, do NOT store bad data
- Never fabricate stored nutrition — prefer `null` over a bad value
- Agent receives `{ error: "Nutrition data could not be resolved" }` and should handle gracefully

---

### Workflow 2 — Suggestions + Dashboard

**Part A — Home Screen Suggestions (Rule-Based, NO AI):**
```
GET /api/suggestions
  → Pull user's active goals + dietary preferences from DB
  → Pull most-used tags from nutrition_logs (last 30 days)
  → Query recipes matching those tags, respecting dietary restrictions
  → Exclude recipes logged in last 7 days (for variety)
  → Merge with curated seed recipes
  → Deduplicate, return up to 10
  → Cold start (no history): return curated seed recipes only
```

**Part B — Daily Dashboard (Computed at query time, NO AI, NO extra tables):**
```
GET /api/dashboard
  → Pull UserGoal rows where goalType IN (DAILY_CALORIES, DAILY_PROTEIN, DAILY_CARBS, DAILY_FAT, DAILY_FIBER)
    and isActive = true — GoalType enum used, no fragile string prefix matching
  → Pull today's NutritionLog rows (loggedAt >= start of today)
  → For each log: join Recipe → RecipeIngredient → FoodNutrition
  → contribution = (food_nutrition.value / basisQty) × ingredient quantity × log servings
  → Sum contributions across all ingredients → recipe total
  → Sum recipe totals across all logs → daily consumed totals
  → Return:
      targets:   { calories: 2200, protein: 120, carbs: 250, fat: 70, fiber: 30 }
      consumed:  { calories: 1570, protein: 95,  carbs: 170, fat: 48, fiber: 18 }
      remaining: { calories: 630,  protein: 25,  carbs: 80,  fat: 22, fiber: 12 }
      logs: [ { recipe, servings, mealType, loggedAt, nutrition }, ... ]
```

> The 7-day meal plan generation (OpenAI) is **removed from Phase 1**. This was the biggest simplification. Home screen suggestions are purely rule-based. OpenAI is not called for planning at all in Phase 1.

**Phase 2 upgrade path:** Add a `vector` column on `recipes`, generate embeddings, use pgvector for semantic similarity — no separate vector DB needed, PostgreSQL handles it.

---

### Workflow 3 — Cooking Assistant (Conversational)

**Trigger:** User taps "Start Cooking" on a Recipe Detail screen.

**Responsibilities:**
- Explain the current cooking step
- Answer questions about the current step
- Explain unfamiliar cooking terms
- Handle reasonable user variations
- Provide timing instructions
- Adapt instructions when user encounters a problem
- Track cooking progress via backend tool (not LLM memory alone)

**Session lifecycle:**
```
POST /api/cooking/sessions (recipeId)
  → Tool: get_recipe(recipeId)            → fetch recipe + steps + ingredients from DB
  → Fetch user dietary profile
  → Build system prompt (see below)
  → Store in CookingSessionStore (Node.js Map, keyed by UUID sessionId)
  → Return sessionId to app

POST /api/cooking/sessions/:id/message (userMessage)
  → Append to chatHistory
  → Cooking Assistant Agent answers using systemPrompt + full chatHistory
  → Append response to chatHistory
  → Return assistant reply

POST /api/cooking/sessions/:id/step
  → Tool: update_cooking_progress(sessionId, step) → increment currentStep in session
  → Tool: get_next_step(sessionId)                 → retrieve next step content
  → Return new step info

DELETE /api/cooking/sessions/:id
  → Remove from Map (called on screen unmount)

TTL: Sessions idle > 2 hours auto-expire (prevents memory leak)
```

**Cooking Assistant Tools:**
```
get_recipe(recipeId)              → load full recipe for session init
get_cooking_session(sessionId)    → retrieve current session state
update_cooking_progress(sessionId, step) → advance current step
get_next_step(sessionId)          → retrieve next step instruction
```

**System Prompt must include:**
- Full recipe: all ingredients with quantities
- All steps (even if empty in Phase 1 — use paragraph description as fallback)
- Current step index
- User's dietary profile ("user is vegetarian — never suggest non-veg substitutions")
- Persona: "You are a friendly, encouraging Indian home cook assistant"
- Instruction: Do not generate new recipes. Do not access pantry or nutrition data.

**Session State shape:**
```typescript
SessionState: {
  recipeId: string
  currentStep: number
  completedSteps: number[]
  servings: number
  sessionStatus: 'active' | 'completed' | 'abandoned'
  chatHistory: { role: 'user' | 'assistant', content: string }[]
  userContext: { dietaryPreferences: string[], goals: string[] }
  lastActivityAt: Date
}
```

**Phase 4 placeholder:** A `send_photo(imageBase64)` vision tool will be added for real-time cooking problem identification.

---

## 6. API Endpoint Master List

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create user + profile, return JWT |
| POST | `/api/auth/login` | Public | Validate credentials, return JWT |
| GET | `/api/auth/me` | Protected | Return current user + profile |
| POST | `/api/auth/goals` | Protected | Add a user goal |
| GET | `/api/auth/goals` | Protected | List all active user goals |
| POST | `/api/auth/dietary-preferences` | Protected | Set dietary preferences (replaces existing) |

### Recipes
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/recipes/generate` | Protected | Invoke Recipe Agent — `recipeId` absent → new Recipe; `recipeId` present → new RecipeVersion under existing recipe |
| GET | `/api/recipes/:id` | Public | Fetch recipe with ingredients, tags, version, nutrition |
| GET | `/api/recipes/my` | Protected | User's generated recipes + bookmarked recipes (sorted by savedAt desc) |
| POST | `/api/recipes/:id/save` | Protected | Bookmark a recipe — idempotent upsert |
| DELETE | `/api/recipes/:id/save` | Protected | Remove bookmark — idempotent delete |
| POST | `/api/recipes/:id/publish` | Protected | Publish recipe to community feed (author only) |

### Ingredients
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/ingredients/search?q=` | Public | Search ingredients + aliases (for pantry add flow) |

### Pantry
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/pantry` | Protected | Fetch user's pantry items |
| POST | `/api/pantry/items` | Protected | Add ingredient to pantry (auto-creates pantry if needed) |
| PATCH | `/api/pantry/items/:id` | Protected | Update quantity/expiry |
| DELETE | `/api/pantry/items/:id` | Protected | Remove item, logs REMOVED event |

### Nutrition Logging
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/nutrition-log` | Protected | Log a recipe as consumed (with servings + optional mealType) |
| GET | `/api/nutrition-log` | Protected | Fetch logs grouped by day with nutrition totals |
| POST | `/api/nutrition-log/recipe` | Protected | Create a USER_CREATED recipe + log it in one flow |

### Community Feed
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/feed` | Public | Paginated published recipes; filterable by `tag` + `cuisine`; default limit=20 |

### Suggestions & Dashboard
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/suggestions` | Protected | Rule-based home screen suggestions (max 10) |
| GET | `/api/dashboard` | Protected | Daily nutrition totals vs UserGoal targets (computed at query time) |

### Cooking Assistant
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/cooking/sessions` | Protected | Start cooking session, return sessionId |
| POST | `/api/cooking/sessions/:id/message` | Protected | Send message, get AI response |
| POST | `/api/cooking/sessions/:id/step` | Protected | Advance to next recipe step |
| DELETE | `/api/cooking/sessions/:id` | Protected | End session, clear from memory |

### Health
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | API health check |

---

## 7. Mobile Screen Inventory

### Route Structure (Expo Router)

```
app/
├── (auth)/
│   ├── login.tsx
│   └── register.tsx
└── (app)/
    ├── _layout.tsx          ← Bottom tab navigator + route guard
    ├── index.tsx            ← Home screen (suggestions)
    ├── feed.tsx             ← Community feed
    ├── generate.tsx         ← Recipe generation screen
    ├── my-recipes.tsx       ← My recipes (Generated + Saved tabs)
    ├── profile.tsx          ← Profile placeholder
    ├── pantry.tsx           ← Pantry management
    ├── nutrition-log.tsx    ← Nutrition log (daily grouped, replaces meal-log)
    ├── dashboard.tsx        ← Daily nutrition dashboard (targets vs consumed)
    ├── recipes/
    │   └── [id].tsx         ← Recipe detail screen
    └── cooking/
        └── [sessionId].tsx  ← Cooking assistant chat screen
```

> `meal-plans/` directory is removed. `meal-log.tsx` is replaced by `nutrition-log.tsx`. `dashboard.tsx` is new.

### Screen Summary

| Screen | Route | API calls | Key components |
|---|---|---|---|
| Login | `(auth)/login` | POST /api/auth/login | Form, AuthContext.login() |
| Register | `(auth)/register` | POST /api/auth/register | Form, AuthContext.register() |
| Home | `(app)/index` | GET /api/suggestions | RecipeCard (list), FAB "Generate" |
| Community Feed | `(app)/feed` | GET /api/feed | RecipeCard (paginated), filter chips |
| Generate Recipe | `(app)/generate` | POST /api/recipes/generate | Ingredient chips, tag pills, loading spinner |
| My Recipes | `(app)/my-recipes` | GET /api/recipes/my | RecipeCard (tabs: AI Generated, User Created, Saved) |
| Pantry | `(app)/pantry` | GET/POST/PATCH/DELETE /api/pantry | Ingredient list, search bar |
| Nutrition Log | `(app)/nutrition-log` | GET /api/nutrition-log | Day-grouped list, daily macro totals |
| Dashboard | `(app)/dashboard` | GET /api/dashboard | Macro progress bars/rings, today's logs, remaining targets |
| Recipe Detail | `(app)/recipes/[id]` | GET /api/recipes/:id | Full recipe, nutrition, Save/Log/Publish/Start Cooking |
| Cooking Assistant | `(app)/cooking/[sessionId]` | POST /api/cooking/sessions/:id/message | Chat UI, Next Step button |

### Shared Components

| Component | Used in | Description |
|---|---|---|
| `RecipeCard` | Home, Feed, My Recipes | Title, tag badges, cuisine, sourceType badge, calories, excerpt, tap → Recipe Detail |
| `AuthContext` | All screens | user, token, login(), logout(), register() |
| `api.ts` | All screens | Central API client, attaches JWT automatically, reads EXPO_PUBLIC_API_URL |
| `IngredientChip` | Generate screen | Removable chip for each added ingredient |
| `NutritionSummary` | Recipe Detail, Dashboard | calories / protein / carbs / fat display |
| `MacroProgressBar` | Dashboard | Visual progress bar for each macro vs daily target |
| `LogFoodSheet` | Recipe Detail, Nutrition Log | Bottom sheet: servings input + optional mealType selector |

### Navigation Flow

```
Splash (token check)
  ├── No token → Login → Register
  └── Has token → Bottom Tab Navigator
        ├── Home (suggestions + FAB)
        │     └── tap RecipeCard → Recipe Detail → Start Cooking → Cooking Assistant
        ├── Feed (community) → Recipe Detail
        ├── Generate (centre button) → Recipe Detail
        ├── My Recipes (AI Generated / User Created / Saved tabs) → Recipe Detail
        └── Profile (placeholder)

Dashboard (accessible from Home header or Profile)
Nutrition Log (accessible from Profile or navigation drawer)
Pantry (accessible from Profile or navigation drawer)
```

---

## 8. Project Folder Structure

```
nom-nom-ai/                          ← monorepo root
├── package.json                     ← pnpm workspaces config
├── pnpm-workspace.yaml
├── docker-compose.yml               ← API + PostgreSQL services
├── .env.example                     ← root env reference
├── .gitignore
├── README.md                        ← setup + deployment docs
│
├── apps/
│   ├── api/                         ← Node.js + Express backend
│   │   ├── Dockerfile               ← multi-stage production build
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── .env.example
│   │   ├── prisma/
│   │   │   ├── schema.prisma        ← all 18 models
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── index.ts             ← Express app entry point
│   │       ├── middleware/
│   │       │   └── requireAuth.ts
│   │       ├── routes/
│   │       │   ├── auth.ts
│   │       │   ├── recipes.ts
│   │       │   ├── ingredients.ts
│   │       │   ├── pantry.ts
│   │       │   ├── nutritionLog.ts      ← replaces mealLog.ts
│   │       │   ├── feed.ts
│   │       │   ├── dashboard.ts         ← new; replaces mealPlans.ts
│   │       │   ├── suggestions.ts
│   │       │   └── cooking.ts
│   │       ├── ai/
│   │       │   ├── AIProvider.ts          ← interface + shared types (AgentRecipeResult, etc.)
│   │       │   ├── AIProviderFactory.ts   ← reads AI_PROVIDER env var, returns provider
│   │       │   ├── MockAIProvider.ts       ← hardcoded responses, no API key needed
│   │       │   ├── OpenAIProvider.ts       ← real LLM client (swappable)
│   │       │   ├── AgentRuntime.ts         ← shared tool-calling loop, max-iteration guard
│   │       │   ├── ToolRegistry.ts         ← registers backend tool functions for agent use
│   │       │   ├── agents/
│   │       │   │   ├── RecipeAgent.ts      ← system prompt + tool set for recipe generation
│   │       │   │   └── CookingAssistant.ts ← system prompt + tool set for cooking guidance
│   │       │   └── tools/
│   │       │       ├── ingredientTools.ts  ← search_ingredients, get_ingredient
│   │       │       ├── nutritionTools.ts   ← get_nutrition, calculate_recipe_nutrition
│   │       │       ├── pantryTools.ts      ← get_user_pantry
│   │       │       ├── recipeTools.ts      ← validate_recipe, save_recipe, get_recipe
│   │       │       └── cookingTools.ts     ← get_cooking_session, update_cooking_progress, get_next_step
│   │       ├── services/
│   │       │   ├── NutritionService.ts     ← Edamam lookup + Nutrition Resolver fallback
│   │       │   ├── NutritionResolver.ts    ← internal: normalize → Edamam → LLM estimate → store
│   │       │   ├── RecipeNutritionService.ts ← deterministic recipe macro calculation
│   │       │   ├── RecipeValidationService.ts ← constraint validation (calories, macros, etc.)
│   │       │   └── CookingSessionStore.ts  ← Node.js Map, TTL expiry, session CRUD
│   │       └── types/
│   │           └── index.ts
│   │
│   └── mobile/                      ← React Native + Expo app
│       ├── package.json
│       ├── app.json                 ← Expo config
│       ├── tsconfig.json
│       └── app/                     ← Expo Router file-based routing
│           ├── (auth)/
│           │   ├── login.tsx
│           │   └── register.tsx
│           └── (app)/
│               ├── _layout.tsx
│               ├── index.tsx
│               ├── feed.tsx
│               ├── generate.tsx
│               ├── my-recipes.tsx
│               ├── profile.tsx
│               ├── pantry.tsx
│               ├── nutrition-log.tsx    ← replaces meal-log.tsx
│               ├── dashboard.tsx        ← new
│               ├── recipes/
│               │   └── [id].tsx
│               ├── cooking/
│               │   └── [sessionId].tsx
│               ├── context/
│               │   └── AuthContext.tsx
│               ├── lib/
│               │   └── api.ts       ← central API client
│               └── components/
│                   ├── RecipeCard.tsx
│                   ├── IngredientChip.tsx
│                   ├── NutritionSummary.tsx
│                   └── MealTypeSheet.tsx
```

---

## 9. Environment Variables Reference

### `apps/api/.env`

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/nomnomdb

# Auth
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# AI Provider
AI_PROVIDER=openai          # openai | mock
OPENAI_API_KEY=sk-...

# Nutrition
EDAMAM_APP_ID=your-edamam-app-id
EDAMAM_APP_KEY=your-edamam-app-key

# Server
PORT=3000
NODE_ENV=development
```

### `apps/mobile/.env`

```env
EXPO_PUBLIC_API_URL=http://localhost:3000    # local dev
# EXPO_PUBLIC_API_URL=https://your-vps-ip   # production
```

---

## 10. Phase 1 Scope — What's In & Out

### IN SCOPE (Phase 1)

- Text-based ingredient input on generation screen
- AI-generated recipe as a paragraph of text
- Recipe categorisation via tags (QUICK, FANCY, HEALTHY, COMFORT, OTHER)
- Indian cuisine focus
- Calorie + macronutrient data via Edamam per recipe
- User registration / login / JWT auth
- User goals (multiple active) and dietary preferences
- Pantry management (manual add/remove, standalone feature)
- Save recipes to personal list
- Publish recipes to community feed
- Browse community feed (paginated, filterable)
- Log food consumption with servings + optional meal type
- View nutrition log grouped by day with daily macro totals
- Daily dashboard: consumed vs target for calories, protein, carbs, fat
- Rule-based home screen recipe suggestions
- User-created recipes (manually entered, logged permanently)
- Conversational cooking assistant (in-memory session, per recipe)
- Docker + VPS deployment to DigitalOcean

### OUT OF SCOPE (Phase 1)

- Image/camera-based ingredient scanning
- Step-by-step recipe with photos (`recipe_steps` table is empty)
- Video tutorial generation
- User profile pictures or any file storage
- Custom/self-hosted AI model
- pgvector / semantic embeddings for recommendations
- Meal planning / scheduling (MealPlan, MealPlanItem removed entirely)
- OpenAI-powered meal plan generation
- Persistent cooking sessions (lost on server restart)
- CI/CD pipeline
- Micronutrient (vitamin/mineral) dashboard display — data stored, UI deferred to Phase 2
- Diverse cuisines beyond Indian

---

## 11. Phased Roadmap (Future Phases)

| Phase | Feature |
|---|---|
| **Phase 2** | Camera-based ingredient scanning — vision model, pantry auto-population from photos |
| **Phase 2** | pgvector + embeddings on `recipes` for semantic recommendations (no separate vector DB) |
| **Phase 2** | Pantry → Generation connection ("use what's in my pantry" mode) |
| **Phase 2** | Micronutrient dashboard — vitamin/mineral breakdown display (data already stored in Phase 1) |
| **Phase 3** | Step-by-step recipe with generated images per step; populate `recipe_steps` |
| **Phase 3** | AI-powered meal planning / schedule generation (MealPlan, MealPlanItem tables reintroduced) |
| **Phase 4** | Video tutorial generation for recipes |
| **Phase 4** | Vision model in Cooking Assistant for real-time cooking problem identification |
| **Phase 5** | Replace OpenAI with custom self-hosted Python/ML model |
| **Phase 5** | Redis for cooking session persistence (resume cooking after server restart) |
| **Phase 6** | Weekly nutrition charts — calorie/macro trends over time |
| **Phase 7** | Diverse cuisines beyond Indian; per-user cuisine preference settings |

---

## 12. Sub-Tasks

> Implementation is broken into 16 independent sub-tasks. Each sub-task is designed to be executed one at a time in Agent mode.

---

### Sub-Task 1 — Project Scaffolding & Monorepo Setup

**Intent**
Establish the foundational project structure so both the mobile app and backend can be developed, run, and deployed from a single repository with clear separation of concerns.

**Expected Outcomes**
- A monorepo with two workspaces: `apps/mobile` and `apps/api`
- Shared `package.json` at root with workspace scripts
- `.gitignore`, `README.md`, `.env.example` in place
- `Dockerfile` + `docker-compose.yml` for API + PostgreSQL
- API boots and returns a health-check response; Expo app boots to a blank screen

**Todo List**
1. Initialize monorepo root with `pnpm workspaces`
2. Scaffold `apps/api` — Express + TypeScript, `GET /health` endpoint, `dotenv`
3. Scaffold `apps/mobile` — Expo blank TypeScript template
4. Add `Dockerfile` for `apps/api` — multi-stage Node alpine, non-root user, health check
5. Add `docker-compose.yml` — API + PostgreSQL, persistent volume, restart policies
6. Add `.env.example` for `apps/api` (all vars from Section 9)
7. Add root `README.md` — local dev + Docker run instructions

**Relevant Context**
- See Section 8 for full folder structure
- See Section 9 for all required env vars
- Stack: Node.js 20+, Express 4, TypeScript, Expo SDK latest stable

**Status** — `[ ] pending`

---

### Sub-Task 2 — Database Schema & Prisma Setup

**Intent**
Define and migrate the complete Phase 1 database schema.

**Expected Outcomes**
- Prisma client connected to Docker PostgreSQL
- All 18 tables migrated and verified
- Seed script: 5–10 curated Indian recipes (sourceType=AI_GENERATED), sample ingredients + aliases, nutrition data, dietary preference reference rows

**Todo List**
1. Install + configure Prisma in `apps/api`
2. Define all 18 models per Section 4 in `schema.prisma`
3. Add enums: `MealType`, `PantryEventType`, `ActivityLevel`, `RecipeSourceType`
4. `recipe_steps` has no required constraint — empty in Phase 1
5. Run `prisma migrate dev --name init`
6. Write seed script — dietary prefs, ingredients, aliases, food_nutrition, recipes + tags + recipe_ingredients
7. Verify with `prisma db seed`

**Relevant Context**
- Full schema in Section 4
- `user_goals`: serves BOTH health goals and nutrition targets — see Section 4 examples
- `user_profiles`: now includes age/height/weight/activityLevel for nutrition calculation inputs
- `food_nutrition.micronutrients`: Json field (JSONB) — see Section 4 for example structure
- `recipes.sourceType`: AI_GENERATED | USER_CREATED
- `nutrition_logs`: replaces meal_logs; no mealPlanItemId; has servings field
- No `meal_plans` or `meal_plan_items` tables

**Status** — `[ ] pending`

---

### Sub-Task 3 — Authentication API

**Intent**
Register, login, JWT auth, goals, dietary preferences — the user identity foundation everything else depends on.

**Expected Outcomes**
- `POST /api/auth/register` — creates `users` + `user_profiles` (with optional age/height/weight/activityLevel), returns JWT
- `POST /api/auth/login` — validates, returns JWT
- `GET /api/auth/me` — protected, returns user + profile
- `POST /api/auth/goals`, `GET /api/auth/goals`
- `POST /api/auth/dietary-preferences`
- `requireAuth` middleware reusable everywhere

**Todo List**
1. Install `bcrypt`, `jsonwebtoken`, `zod` + types
2. `POST /api/auth/register` — zod validation, bcrypt hash, transaction creates users + user_profiles (accept optional age, height, heightUnit, weight, weightUnit, activityLevel), return JWT
3. `POST /api/auth/login` — find by email, compare hash, return JWT
4. `requireAuth` middleware — verify JWT, attach `req.user` (id, email)
5. `GET /api/auth/me` — join users + user_profiles
6. `POST /api/auth/goals` — add goal row
7. `GET /api/auth/goals` — list active goals
8. `POST /api/auth/dietary-preferences` — replace all existing prefs for user

**Relevant Context**
- JWT_SECRET and JWT_EXPIRES_IN from env (Section 9)
- No refresh tokens Phase 1
- Goals + prefs needed by Recipe Agent (Sub-Task 4) — implement before Sub-Task 4

**Status** — `[ ] pending`

---

### Sub-Task 4 — AI Abstraction Layer & Recipe Agent (Workflow 1)

**Intent**
Shared agent infrastructure + Recipe Agent. The core AI feature of the app. This sub-task builds the reusable layer that the Cooking Assistant (Sub-Task 10) will also depend on.

**Expected Outcomes**
- `AIProvider` interface, `MockAIProvider`, `OpenAIProvider`, `AIProviderFactory`
- `AgentRuntime` — shared tool-calling loop, max 5 iteration guard
- `ToolRegistry` — registers typed backend tool functions
- `RecipeAgent` — system instructions + 8 tools (see Section 5, Workflow 1)
- All 8 tools implemented as typed backend functions (see Section 8 `tools/` folder)
- Structured output: response matches `AgentRecipeResult` schema (see Section 5)
- Validation loop: generate → `calculate_recipe_nutrition` → `validate_recipe` → modify if needed
- `POST /api/recipes/generate` — protected, invokes Recipe Agent, returns persisted structured recipe
- `AI_PROVIDER=openai|mock` controls provider

**Todo List**
1. Define `AIProvider` interface and `AgentRecipeResult` structured output type (Section 5, Workflow 1)
2. Implement `AgentRuntime` — shared tool-calling loop, max 5 iteration guard, tool dispatch
3. Implement `ToolRegistry` — registers tool name → backend function mapping
4. Implement ingredient tools: `search_ingredients`, `get_ingredient` (Section 8)
5. Implement nutrition tools: `get_nutrition`, `calculate_recipe_nutrition` (Section 8)
6. Implement pantry tool: `get_user_pantry` (Section 8)
7. Implement recipe tools: `validate_recipe`, `save_recipe`, `get_recipe` (Section 8)
8. Implement `RecipeAgent` — system prompt (Section 5), register all 8 tools, configure for recipe generation
9. Implement `MockAIProvider` — hardcoded Indian recipe, simulates tool calls, uses AgentRuntime
10. Implement `OpenAIProvider` — delegates to AgentRuntime with real LLM
11. Implement `AIProviderFactory`
12. Implement `POST /api/recipes/generate` — validate input, run RecipeAgent, return AgentRecipeResult
13. Leave comment placeholder for Phase 2 `scan_ingredients_from_image` vision tool

**Relevant Context**
- Full workflow + tool list + structured output schema in Section 5, Workflow 1
- Full folder layout in Section 8 (`ai/agents/`, `ai/tools/`)
- Depends on Sub-Task 3 (requireAuth), Sub-Task 5 (NutritionService + RecipeNutritionService + RecipeValidationService)
- `get_nutrition` calls NutritionService which internally invokes the Nutrition Resolver on cache miss
- Nutrition values in the final recipe must come from `calculate_recipe_nutrition` — never from LLM inference
- `AgentRuntime` and `ToolRegistry` are also used by Sub-Task 10 (Cooking Assistant)

**Status** — `[ ] pending`

---

### Sub-Task 5 — Nutrition Service, Nutrition Resolver & Recipe Calculation Services

**Intent**
All deterministic backend services that support the Recipe Agent's tools. This sub-task provides the services that Sub-Task 4's tool functions will call.

**Expected Outcomes**
- `NutritionService` — ingredient nutrition lookup with Edamam → Nutrition Resolver fallback chain
- `NutritionResolver` — internal AI-assisted workflow: normalize ingredient → Edamam → LLM estimate → validate → store
- `RecipeNutritionService` — deterministic per-recipe macro calculation using `food_nutrition` data
- `RecipeValidationService` — validates a generated recipe against user constraints (calories, macros, dietary)
- All results upserted/stored in `food_nutrition`; LLM never called twice for the same ingredient

**Todo List**
1. `NutritionService.lookupOrResolve(ingredientId)` — check `food_nutrition` cache first; if missing, invoke NutritionResolver
2. `NutritionResolver.resolve(ingredientName)`:
   - Normalize ingredient name (resolve alias → canonical ingredient)
   - Call Edamam; if found: normalize units, validate, upsert (`source='edamam'`), return
   - If Edamam unavailable: call LLM for per-100g estimate
   - Validate result plausibility (calories 0–900/100g; protein+carbs+fat ≤ 105g/100g)
   - If valid: normalize, upsert (`source='llm_estimate'`), return
   - If invalid: return null, do not store
3. `RecipeNutritionService.calculate(ingredients[])` — for each ingredient: `(nutrition.value / basisQty) × quantity × servings`; sum across all ingredients; return `{ calories, protein, carbohydrates, fat, fiber }`
4. `RecipeValidationService.validate(recipe, constraints)` — check generated recipe satisfies calorie target, macro targets, dietary restrictions; return `{ passed: boolean, failures: string[] }`
5. Add `EDAMAM_APP_ID`, `EDAMAM_APP_KEY` to `.env.example`
6. Graceful failure throughout — NutritionService returns `null` if all resolution paths fail; recipe still saves

**Relevant Context**
- `food_nutrition.source` values: `'edamam'` | `'llm_estimate'` | `'manual'` | `'custom_model'`
- Full Nutrition Resolver flow in Section 5, Workflow 1b
- `RecipeNutritionService` is called by the `calculate_recipe_nutrition` tool (Sub-Task 4)
- `RecipeValidationService` is called by the `validate_recipe` tool (Sub-Task 4)
- Builds ML training dataset for Phase 5

**Status** — `[ ] pending`

---

### Sub-Task 6 — Recipe Management API

**Intent**
Retrieve, save, and publish recipes.

**Expected Outcomes**
- `GET /api/recipes/:id` — full recipe with latest version, ingredients, tags, nutrition
- `GET /api/recipes/my` — generated + saved in two sections
- `POST/DELETE /api/recipes/:id/save` — toggle
- `POST /api/recipes/:id/publish` — author only

**Todo List**
1. `GET /api/recipes/:id` — join recipes, recipe_versions (latest), recipe_ingredients, recipe_tags, food_nutrition
2. `GET /api/recipes/my` — two sections: authorId=user and saved
3. `POST /api/recipes/:id/save` — upsert
4. `DELETE /api/recipes/:id/save` — remove
5. `POST /api/recipes/:id/publish` — check authorId = req.user.id

**Relevant Context**
- All endpoints in Section 6 (API Master List — Recipes section)
- `isPublished` controls community feed visibility

**Status** — `[ ] pending`

---

### Sub-Task 7 — Pantry API

**Intent**
Manual pantry management. Standalone in Phase 1.

**Expected Outcomes**
- Full CRUD on pantry items with pantry_events audit trail
- `GET /api/ingredients/search?q=` for ingredient lookup

**Todo List**
1. Auto-create `pantries` row on first item add
2. `GET /api/pantry` — items with ingredient names + aliases
3. `POST /api/pantry/items` — resolve ingredient by name or id (via ingredient_aliases), add item
4. `DELETE /api/pantry/items/:id` — delete, log REMOVED event
5. `PATCH /api/pantry/items/:id` — update, log ADDED or USED
6. `GET /api/ingredients/search?q=` — search ingredients + aliases

**Relevant Context**
- Generation screen ingredients are transient — NOT saved to pantry
- Phase 2 connects pantry to generation screen
- `ingredient_aliases` solves multilingual ingredient names

**Status** — `[ ] pending`

---

### Sub-Task 8 — Nutrition Logging & Community Feed API

**Intent**
Implement nutrition logging (what the user consumed, with servings) and the community recipe feed. Also implement the user-created recipe flow — allowing users to log food they ate that wasn't generated by the AI.

**Expected Outcomes**
- `POST /api/nutrition-log` — log a recipe as consumed (recipeId, servings, optional mealType)
- `GET /api/nutrition-log` — logs grouped by day, daily macro totals (calories/protein/carbs/fat)
- `POST /api/nutrition-log/recipe` — create a USER_CREATED recipe + log it in one atomic flow
- `GET /api/feed` (paginated, filterable)

**Todo List**
1. `POST /api/nutrition-log` — validate recipeId exists, servings > 0, mealType optional; insert NutritionLog row
2. `GET /api/nutrition-log` — join recipe + recipe_ingredients + food_nutrition; compute daily macro totals by multiplying nutrition × quantity × servings; group by day
3. `POST /api/nutrition-log/recipe` — in a single transaction: create Recipe (sourceType=USER_CREATED) + RecipeIngredient rows + call NutritionService for each ingredient + insert NutritionLog; return recipe + log
4. `GET /api/feed` — pagination (page, limit=20), tag + cuisine filters, join user_profiles for displayName
5. Seeded curated recipes must be published (so feed is non-empty on launch)

**Relevant Context**
- Feed is public (no auth required)
- USER_CREATED recipe flow: ingredients entered once → recipe persisted → future logs just need recipeId + servings
- `nutrition_logs` has no `mealPlanItemId` — simpler than old `meal_logs`
- Macro computation: `calories_consumed = sum(food_nutrition.calories * recipe_ingredient.quantity / 100 * log.servings)` per ingredient, summed across all ingredients in the recipe

**Status** — `[ ] pending`

---

### Sub-Task 9 — Suggestions & Dashboard API (Workflow 2)

**Intent**
Rule-based home suggestions + computed daily nutrition dashboard. No OpenAI in this sub-task — pure database query logic.

**Expected Outcomes**
- `GET /api/suggestions` — rule-based, max 10, cold-start handled
- `GET /api/dashboard` — daily nutrition consumed vs UserGoal targets, computed at query time

**Todo List**
1. `GET /api/suggestions` — full logic in Section 5, Workflow 2 Part A (uses nutrition_logs, not meal_logs)
2. `GET /api/dashboard`:
   - Fetch user's UserGoal rows where goalType IN (DAILY_CALORIES, DAILY_PROTEIN, DAILY_CARBS, DAILY_FAT, DAILY_FIBER)
   - Fetch today's NutritionLog rows (loggedAt >= start of current day)
   - For each log: join Recipe → RecipeIngredient → FoodNutrition
   - Compute consumed totals: `sum(nutrition.macroValue * ingredient.quantity / 100 * log.servings)` per macro
   - Return `{ targets, consumed, remaining, logs }`
3. Include micronutrient totals in dashboard response if `food_nutrition.micronutrients` is populated (graceful — not all ingredients will have it)

**Relevant Context**
- No OpenAI in this sub-task — pure query logic
- No ML/embeddings — Phase 2 upgrade path via pgvector
- Full dashboard computation logic in Section 4 (NUTRITION TRACKING domain) and Section 5, Workflow 2 Part B
- `user_goals.goalType` (GoalType enum) drives which targets appear on the dashboard — a user with no DAILY_CALORIES goal gets no calorie target shown
- `unit` is no longer stored on `user_goals` — it is derived from `goalType` via `GoalService.getUnitForGoalType()` in the backend
- `dietary_preferences.llmConstraint` is injected into AI system prompts instead of `name` — the Recipe Agent and Cooking Agent receive explicit FORBIDDEN/ALLOWED lists, not enum identifiers

**Status** — `[ ] pending`

---

### Sub-Task 10 — Cooking Assistant API (Workflow 3)

**Intent**
Cooking Assistant agent — in-memory session scoped to a single recipe, with structured state managed by the backend.

**Expected Outcomes**
- `CookingSessionStore` — Node.js Map, full `SessionState` shape (Section 5, Workflow 3)
- Cooking Assistant agent with its own system instructions and restricted tool set
- `POST /api/cooking/sessions` — returns sessionId
- `POST /api/cooking/sessions/:id/message` — conversational reply from Cooking Assistant
- `POST /api/cooking/sessions/:id/step` — advance step via backend tool, return new step
- `DELETE /api/cooking/sessions/:id` — end session
- 2-hour TTL auto-expiry

**Todo List**
1. `CookingSessionStore` — Node.js Map; implement `SessionState` shape (Section 5, Workflow 3): `recipeId`, `currentStep`, `completedSteps`, `servings`, `sessionStatus`, `chatHistory`, `userContext`, `lastActivityAt`
2. Implement cooking tools: `get_cooking_session`, `update_cooking_progress`, `get_next_step` (Section 8)
3. Implement `CookingAssistant` agent — system instructions (Section 5, Workflow 3), register only cooking tools + `get_recipe`; explicitly restricted from recipe generation and nutrition tools
4. `POST /api/cooking/sessions` — call `get_recipe` tool to load recipe + steps + ingredients, fetch user dietary profile, build system prompt, create session, store, return UUID sessionId
5. `POST /api/cooking/sessions/:id/message` — append user message to chatHistory, run CookingAssistant with systemPrompt + chatHistory, append response, return reply
6. `POST /api/cooking/sessions/:id/step` — call `update_cooking_progress` tool (increments `currentStep`, adds to `completedSteps`), call `get_next_step` tool, return new step
7. `DELETE /api/cooking/sessions/:id` — set `sessionStatus = 'abandoned'`, remove from Map
8. TTL mechanism — setInterval checks `lastActivityAt`; auto-expire sessions idle > 2 hours
9. Leave comment placeholder for Phase 4 `send_photo(imageBase64)` vision tool

**Relevant Context**
- Cooking Assistant uses the same `AgentRuntime` and `ToolRegistry` built in Sub-Task 4 — do not duplicate
- `recipe_steps` is empty Phase 1 — fall back to `recipe_versions.description` paragraph as step content
- Sessions lost on server restart — acceptable Phase 1 (Phase 5 upgrades to Redis)
- Session IDs: UUIDs
- Full session state shape and tool list in Section 5, Workflow 3

**Status** — `[ ] pending`

---

### Sub-Task 11 — Mobile App: Navigation & Auth Screens

**Intent**
Expo Router setup, route guards, AuthContext, central API client, Login + Register screens.

**Expected Outcomes**
- `(auth)` + `(app)` route groups; protected app group
- JWT in expo-secure-store
- `AuthContext` + `api.ts` in place (all later tasks depend on these)

**Todo List**
1. Install Expo Router, expo-secure-store, UI library (NativeWind or React Native Paper)
2. `api.ts` — central client, reads EXPO_PUBLIC_API_URL, attaches Authorization: Bearer JWT
3. `AuthContext` — user, token, login(), logout(), register()
4. Login screen — form → login() → navigate to (app)
5. Register screen — form → register() → navigate to (app)
6. Route guard in `(app)/_layout.tsx`
7. Splash/loading state during token check

**Relevant Context**
- See Section 7 for route structure and screen inventory
- `api.ts` and `AuthContext` are dependencies for ALL subsequent mobile sub-tasks

**Status** — `[ ] pending`

---

### Sub-Task 12 — Mobile App: Home Screen & Recipe Generation Screen

**Intent**
Home screen (suggestions) and generation screen (core feature). Most important UX in Phase 1.

**Expected Outcomes**
- Home: suggestions list, RecipeCard, pull-to-refresh, Generate FAB
- Generate: ingredient chips, tag pills, loading spinner, error state, navigates to Recipe Detail
- Shared `RecipeCard` component built here (reused everywhere)

**Todo List**
1. `RecipeCard` component — title, tag badges, cuisine, calories, excerpt, tap → Recipe Detail
2. Home screen — fetch /api/suggestions, FlatList, pull-to-refresh, skeleton loading, FAB
3. Generation screen:
   - Ingredient chip input (add + remove)
   - Tag preference pills (QUICK, FANCY, HEALTHY, COMFORT)
   - Generate button with spinner
   - Error handling
   - Success → navigate to Recipe Detail
   - Comment placeholder for Phase 2 camera button

**Relevant Context**
- RecipeCard reused in Sub-Tasks 13, 14, 15
- See Section 7 for shared components list

**Status** — `[ ] pending`

---

### Sub-Task 13 — Mobile App: Recipe Detail Screen

**Intent**
Full recipe display with all actions: save, log, publish, start cooking.

**Expected Outcomes**
- Title, tags, cuisine, AI paragraph, ingredient list, nutrition summary
- Save toggle, Log as Meal bottom sheet, Publish button (author only), Start Cooking button

**Todo List**
1. Fetch GET /api/recipes/:id on mount
2. Display full content + NutritionSummary component
3. Save toggle — optimistic update
4. Log as Meal — MealTypeSheet bottom sheet → POST /api/meal-log
5. Publish to Feed — visible if author + unpublished → POST /api/recipes/:id/publish
6. Start Cooking button → navigate to Cooking Assistant screen with recipeId

**Relevant Context**
- Reached from Home, Feed, My Recipes, Meal Plan Detail — must handle any recipe generically
- "Start Cooking" initiates Sub-Task 15 Cooking Assistant flow

**Status** — `[ ] pending`

---

### Sub-Task 14 — Mobile App: Feed, My Recipes, Pantry, Nutrition Log & Dashboard Screens

**Intent**
Remaining core screens + bottom tab navigator wiring everything together. Includes the new Dashboard screen and the Nutrition Log screen (replaces Meal Log).

**Expected Outcomes**
- Community Feed: paginated, filters, infinite scroll
- My Recipes: AI Generated / User Created / Saved tabs
- Pantry: list + add/remove with search
- Nutrition Log: day-grouped, daily macro totals (calories/protein/carbs/fat per day)
- Dashboard: macro progress bars/rings (consumed vs target), today's log list
- Bottom tab navigator: Home, Feed, Generate (centre), My Recipes, Profile

**Todo List**
1. Community Feed — paginated FlatList, tag + cuisine filter chips, pull-to-refresh, infinite scroll
2. My Recipes — three tabs: AI Generated, User Created, Saved; all use RecipeCard
3. Pantry — list items, search bar (GET /api/ingredients/search), add/remove
4. Nutrition Log screen — fetch GET /api/nutrition-log; day-grouped list showing recipe title, mealType badge, servings, macro totals per day
5. Dashboard screen — fetch GET /api/dashboard; display MacroProgressBar for each of calories/protein/carbs/fat; show today's log entries below
6. Bottom tab navigator in `(app)/_layout.tsx` — 5 tabs, Generate centre button navigates to generate screen; Dashboard accessible from Home header icon or Profile tab

**Relevant Context**
- All list screens use RecipeCard (Sub-Task 12)
- "Generate" centre tab is not a tab screen — it navigates to generate.tsx directly
- `MacroProgressBar` and `LogFoodSheet` are shared components (see Section 7)
- Dashboard data is computed on the server — the screen just renders what the API returns

**Status** — `[ ] pending`

---

### Sub-Task 15 — Mobile App: Cooking Assistant Screen & Log Food Flow

**Intent**
The Cooking Assistant chat screen and the user-created recipe / log food flow (the path where a user logs something they ate that wasn't AI-generated).

**Expected Outcomes**
- Cooking Assistant: chat UI, Next Step button, session lifecycle managed
- "Log Food" flow: user can log a previously saved recipe or create a new user-created recipe and log it in one shot

**Todo List**
1. Implement "Log Food" flow on Nutrition Log screen:
   - "Add Food" button → modal: "Select existing recipe" OR "Create new"
   - "Select existing": search/browse saved recipes → pick one → LogFoodSheet (servings + optional mealType) → POST /api/nutrition-log
   - "Create new": enter recipe name + ingredients (IngredientChip) + servings → POST /api/nutrition-log/recipe → logged immediately
2. Implement Cooking Assistant screen:
   - On mount: POST /api/cooking/sessions with recipeId, store sessionId
   - Chat UI: message list, text input, send button
   - Next Step button: POST /api/cooking/sessions/:id/step, updates displayed step
   - On unmount: DELETE /api/cooking/sessions/:id to clean up session
3. "Start Cooking" button on Recipe Detail screen (Sub-Task 13 revisit) → navigates to `cooking/[sessionId]`

**Relevant Context**
- Session state in-memory on server — lost on restart, acceptable Phase 1
- `recipe_steps` empty Phase 1 — "Next Step" button hidden when steps array is empty
- USER_CREATED recipe flow backend is in Sub-Task 8; this sub-task is the mobile UI only

**Status** — `[ ] pending`

---

### Sub-Task 16 — Dockerization & VPS Deployment

**Intent**
Package backend for production, deploy to DigitalOcean, connect mobile app.

**Expected Outcomes**
- Production Docker image builds and runs
- docker-compose: API + PostgreSQL, persistent volume
- Backend live at public URL on DigitalOcean Droplet
- Expo app connected via EXPO_PUBLIC_API_URL
- Migrations + seed run against production DB

**Todo List**
1. Finalize Dockerfile — multi-stage, non-root user, health check on /health
2. Finalize docker-compose.yml — persistent volume, restart policies, .env injection
3. Provision DigitalOcean Droplet (Ubuntu, smallest tier)
4. Install Docker + Docker Compose on Droplet
5. Clone repo, create .env on server (never commit), docker-compose up -d
6. prisma migrate deploy inside API container
7. Run seed script inside API container
8. Set EXPO_PUBLIC_API_URL to live server URL
9. (Recommended) Configure nginx reverse proxy for port 80/443
10. Document full server setup in README.md under "Deployment" section

**Relevant Context**
- No CI/CD Phase 1 — manual deploys fine for learning
- .env on server contains all secrets — never commit to git
- docker-compose.yml scaffolded in Sub-Task 1, finalized here
- See Section 9 for all env vars needed on production server

**Status** — `[ ] pending`
