import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type NutritionRecord = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  basisQty: number;
  basisUnit: string;
  source: string;
};

// Valid basis unit values the LLM can return in Call 1
type BasisUnit = 'g' | 'ml' | 'piece';

/**
 * Fixed mapping: basisUnit → basisQty.
 *
 * The LLM only decides the unit type (g | ml | piece).
 * The backend deterministically derives basisQty from that.
 *
 * Rationale:
 *   g / ml → 100  (global nutrition DB standard — per 100g or per 100ml)
 *   piece  → 1    (counted ingredients: egg, banana, lemon, bread slice, etc.)
 */
const BASIS_QTY_MAP: Record<BasisUnit, number> = {
  g:     100,
  ml:    100,
  piece: 1,
};

/**
 * NutritionService — ingredient nutrition lookup with two-call LLM Nutrition Resolver.
 *
 * Edamam integration has been removed. The resolution chain is:
 *   1. Check food_nutrition cache by ingredientId — return if found (cache hit).
 *   2. Cache miss → two sequential LLM calls:
 *        Call 1 (Classification): determine basisUnit ("g" | "ml" | "piece")
 *        Call 2 (Nutrition):      fetch macros relative to the determined basis
 *        Validate plausibility → store as source = "llm_estimate"
 *
 * Why two calls instead of one:
 *   - Each call has a single focused job — classification vs factual lookup
 *   - Call 2 asks for macros relative to the correct basis, not always per-100g
 *     (avoids wrong framing for whole-unit ingredients like eggs)
 *   - Errors are isolated — easier to debug if one step fails
 *   - One-time cost per new ingredient — cached forever after
 *
 * The LLM is NEVER called again for the same ingredient after a result is stored.
 * All future requests hit the food_nutrition cache.
 *
 * Phase 2 upgrade path: backfill "llm_estimate" rows with a verified nutrition database.
 * Phase 5 upgrade path: replace with custom ML model (source = "custom_model").
 */

/**
 * Look up nutrition for an ingredient by ID.
 * If not cached, resolve via two-call LLM Nutrition Resolver.
 * Returns null if resolution fails or estimate is implausible.
 */
async function lookupOrResolve(
  ingredientId: string,
  ingredientName: string
): Promise<NutritionRecord | null> {
  // Step 1: Check cache
  const cached = await prisma.foodNutrition.findUnique({ where: { ingredientId } });
  if (cached) return cached;

  // Step 2: Two-call LLM Nutrition Resolver
  return resolveFromLLM(ingredientId, ingredientName);
}

/**
 * Call 1 — Basis Unit Classification.
 *
 * Asks the LLM how this ingredient is typically measured in recipes.
 * Returns one of: "g" | "ml" | "piece"
 *
 * Decision rule for the LLM:
 *   "piece" → always counted as whole units (egg, banana, lemon, bread slice)
 *   "ml"    → liquids measured by volume (milk, oil, coconut milk, lemon juice)
 *   "g"     → everything else (all solids measured by weight)
 *
 * Falls back to "g" if response is unrecognised.
 */
async function classifyBasisUnit(ingredientName: string): Promise<BasisUnit> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content:
            `How is "${ingredientName}" typically measured in recipes?\n` +
            `Reply with exactly one word — no explanation, no punctuation:\n` +
            `- "piece" if it is always counted as whole units (e.g. egg, banana, lemon, bread slice)\n` +
            `- "ml" if it is a liquid measured by volume (e.g. milk, oil, coconut milk)\n` +
            `- "g" if it is a solid measured by weight (e.g. spinach, rice, chicken, paneer)`,
        },
      ],
      temperature: 0,
      max_tokens: 5,  // single word response — no need for more
    });

    const raw = (response.choices[0].message.content ?? 'g').trim().toLowerCase();

    // Validate — only accept known values, fall back to "g" for anything unexpected
    if (raw === 'piece' || raw === 'ml' || raw === 'g') return raw;

    console.warn(
      `[NutritionService] Unexpected basisUnit classification for "${ingredientName}": "${raw}" — defaulting to "g"`
    );
    return 'g';

  } catch (err) {
    console.error(`[NutritionService] Call 1 (classification) failed for "${ingredientName}":`, err);
    return 'g';  // safe fallback
  }
}

/**
 * Two-call LLM Nutrition Resolver.
 *
 * Call 1: classifyBasisUnit  → determines "g" | "ml" | "piece"
 * Backend: maps basisUnit    → basisQty via BASIS_QTY_MAP (LLM never decides the number)
 * Call 2: fetchMacros        → gets macros relative to (basisQty basisUnit)
 *
 * Plausibility validation ranges:
 *   Per-100g / per-100ml basis (basisQty = 100):
 *     calories: 0–900 kcal  (pure fat ceiling ~900, water ~0)
 *     protein / carbs / fat / fiber: 0–100g
 *   Per-piece basis (basisQty = 1):
 *     calories: 0–2000 kcal  (higher ceiling — a whole avocado ~320, large meal item ~800+)
 *     protein / carbs / fat / fiber: 0–500g  (large items like a full banana ~27g carbs)
 *
 * Never stores an implausible result — returns null instead.
 */
async function resolveFromLLM(
  ingredientId: string,
  ingredientName: string
): Promise<NutritionRecord | null> {
  try {
    // ── Call 1: Classify basis unit ──────────────────────────────────────────
    const basisUnit = await classifyBasisUnit(ingredientName);
    const basisQty  = BASIS_QTY_MAP[basisUnit];  // backend derives quantity — LLM never decides this

    console.info(
      `[NutritionService] "${ingredientName}" classified as: basisQty=${basisQty}, basisUnit="${basisUnit}"`
    );

    // ── Call 2: Fetch macros relative to determined basis ────────────────────
    const nutritionPrompt =
      `You are a nutrition database assistant. Provide the approximate macronutrient values ` +
      `for "${ingredientName}" per ${basisQty} ${basisUnit} as raw JSON only — no explanation, no markdown.\n\n` +
      `Return exactly this structure:\n` +
      `{\n` +
      `  "calories": <number, kcal per ${basisQty} ${basisUnit}>,\n` +
      `  "protein":  <number, grams per ${basisQty} ${basisUnit}>,\n` +
      `  "carbs":    <number, grams per ${basisQty} ${basisUnit}>,\n` +
      `  "fat":      <number, grams per ${basisQty} ${basisUnit}>,\n` +
      `  "fiber":    <number, grams per ${basisQty} ${basisUnit}>\n` +
      `}\n\n` +
      `Use typical cooked values where cooking method is ambiguous. All values must be numbers (not strings).`;

    const nutritionResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: nutritionPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const raw = nutritionResponse.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(raw) as {
      calories?: number;
      protein?:  number;
      carbs?:    number;
      fat?:      number;
      fiber?:    number;
    };

    const nutrition: NutritionRecord = {
      calories: Math.round(parsed.calories ?? 0),
      protein:  Math.round(parsed.protein  ?? 0),
      carbs:    Math.round(parsed.carbs    ?? 0),
      fat:      Math.round(parsed.fat      ?? 0),
      fiber:    Math.round(parsed.fiber    ?? 0),
      basisQty,
      basisUnit,
      source: 'llm_estimate',
    };

    // ── Plausibility validation ───────────────────────────────────────────────
    // Ranges differ by basis: per-100g/ml uses tighter food-science bounds;
    // per-piece uses wider bounds since whole items vary greatly in size.
    const isPerWeight = basisUnit === 'g' || basisUnit === 'ml';

    const calorieMax = isPerWeight ? 900  : 2000;
    const macroMax   = isPerWeight ? 100  : 500;

    if (
      nutrition.calories < 0 || nutrition.calories > calorieMax ||
      nutrition.protein  < 0 || nutrition.protein  > macroMax   ||
      nutrition.carbs    < 0 || nutrition.carbs    > macroMax   ||
      nutrition.fat      < 0 || nutrition.fat      > macroMax   ||
      nutrition.fiber    < 0 || nutrition.fiber    > macroMax
    ) {
      console.warn(
        `[NutritionService] Implausible LLM estimate for "${ingredientName}" ` +
        `(basis: ${basisQty} ${basisUnit}) — rejected:`,
        nutrition
      );
      return null;
    }

    // ── Store in cache ────────────────────────────────────────────────────────
    // LLM will not be called again for this ingredient
    await prisma.foodNutrition.upsert({
      where:  { ingredientId },
      update: { ...nutrition },
      create: { ingredientId, ...nutrition },
    });

    console.info(
      `[NutritionService] Resolved "${ingredientName}" — ` +
      `${nutrition.calories} kcal per ${basisQty} ${basisUnit} — cached.`
    );
    return nutrition;

  } catch (err) {
    console.error(`[NutritionService] LLM Nutrition Resolver failed for "${ingredientName}":`, err);
    return null;
  }
}

const NutritionService = { lookupOrResolve };
export default NutritionService;
