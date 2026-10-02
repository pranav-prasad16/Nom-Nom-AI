import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/requireAuth';

const router = Router();
const prisma = new PrismaClient();

/**
 * Nutrition Log routes — replaces mealLog.ts.
 *
 * Key differences from old meal-log:
 *   - Model is NutritionLog (not MealLog)
 *   - Has servings field (scales nutrition calculation)
 *   - mealType is optional (descriptive label, not planning)
 *   - No mealPlanItemId
 *   - Macro calculation: (food_nutrition.value / basisQty) × ingredient.quantity × servings
 */

const logSchema = z.object({
  recipeId: z.string(),
  servings: z.number().positive().default(1),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']).optional(),
});

const createAndLogSchema = z.object({
  recipeName: z.string().min(1),
  recipeServings: z.number().int().positive(),  // how many servings this recipe makes (RecipeVersion.servings)
  servings: z.number().positive().default(1),   // how many servings the user consumed (NutritionLog.servings)
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']).optional(),
  ingredients: z.array(
    z.object({
      ingredientId: z.string(),
      quantity: z.number().positive(),
      unit: z.string().min(1),
    })
  ).min(1),
});

// ─── POST /api/nutrition-log ──────────────────────────────────────────────────
// Log an existing recipe as consumed.

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const recipe = await prisma.recipe.findUnique({ where: { id: parsed.data.recipeId } });
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  if (parsed.data.servings <= 0) {
    res.status(400).json({ error: 'servings must be greater than 0' });
    return;
  }

  const log = await prisma.nutritionLog.create({
    data: {
      userId: req.user!.id,
      recipeId: parsed.data.recipeId,
      servings: parsed.data.servings,
      mealType: parsed.data.mealType ?? null,
    },
    include: {
      recipe: {
        include: {
          recipeVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
          recipeTags: { include: { tag: true } },
        },
      },
    },
  });

  res.status(201).json(log);
});

// ─── GET /api/nutrition-log ───────────────────────────────────────────────────
// Returns logs grouped by day with daily macro totals.
// Calculation: (food_nutrition.value / basisQty) × ingredient.quantity × log.servings

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const logs = await prisma.nutritionLog.findMany({
    where: { userId: req.user!.id },
    include: {
      recipe: {
        include: {
          recipeVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
          recipeTags: { include: { tag: true } },
          recipeIngredients: {
            include: {
              ingredient: { include: { foodNutrition: true } },
            },
          },
        },
      },
    },
    orderBy: { loggedAt: 'desc' },
  });

  // Group by day and compute macro totals per day
  const grouped: Record<
    string,
    {
      date: string;
      totals: { calories: number; protein: number; carbohydrates: number; fat: number; fiber: number };
      entries: typeof logs;
    }
  > = {};

  for (const log of logs) {
    const day = log.loggedAt.toISOString().split('T')[0];
    if (!grouped[day]) {
      grouped[day] = {
        date: day,
        totals: { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0 },
        entries: [],
      };
    }
    grouped[day].entries.push(log);

    // Sum macros: (nutrition.value / basisQty) × ingredient.quantity × log.servings
    for (const ri of log.recipe.recipeIngredients) {
      const n = ri.ingredient.foodNutrition;
      if (!n) continue;
      const scale = (ri.quantity / n.basisQty) * log.servings;
      grouped[day].totals.calories      += n.calories * scale;
      grouped[day].totals.protein       += n.protein * scale;
      grouped[day].totals.carbohydrates += n.carbs * scale;
      grouped[day].totals.fat           += n.fat * scale;
      grouped[day].totals.fiber         += n.fiber * scale;
    }
  }

  // Round totals
  for (const day of Object.values(grouped)) {
    day.totals.calories      = Math.round(day.totals.calories);
    day.totals.protein       = Math.round(day.totals.protein);
    day.totals.carbohydrates = Math.round(day.totals.carbohydrates);
    day.totals.fat           = Math.round(day.totals.fat);
    day.totals.fiber         = Math.round(day.totals.fiber);
  }

  res.json(Object.values(grouped));
});

// ─── POST /api/nutrition-log/recipe ──────────────────────────────────────────
// Create a USER_CREATED recipe and log it in one atomic flow.
// Used when a user logs something they ate that wasn't AI-generated.

router.post('/recipe', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createAndLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Verify all ingredientIds exist
  const ingredientIds = parsed.data.ingredients.map((i) => i.ingredientId);
  const foundIngredients = await prisma.ingredient.findMany({
    where: { id: { in: ingredientIds } },
    select: { id: true },
  });
  if (foundIngredients.length !== ingredientIds.length) {
    res.status(400).json({ error: 'One or more ingredient IDs not found' });
    return;
  }

  // Single transaction: create Recipe + RecipeIngredients + NutritionLog
  const result = await prisma.$transaction(async (tx) => {
    const recipe = await tx.recipe.create({
      data: {
        title: parsed.data.recipeName,
        cuisineType: 'OTHER',   // USER_CREATED recipes that don't fit a specific cuisine
        sourceType: 'USER_CREATED',
        isPublished: false,
        authorId: req.user!.id,
        recipeVersions: {
          create: {
            versionNumber: 1,
            description: `User-created recipe: ${parsed.data.recipeName}`,
            servings: parsed.data.recipeServings,  // how many servings this recipe makes — required, no default
            aiPromptUsed: null,
          },
        },
        recipeIngredients: {
          create: parsed.data.ingredients.map((i) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            unit: i.unit,
          })),
        },
      },
      include: {
        recipeIngredients: { include: { ingredient: { include: { foodNutrition: true } } } },
      },
    });

    const log = await tx.nutritionLog.create({
      data: {
        userId: req.user!.id,
        recipeId: recipe.id,
        servings: parsed.data.servings,
        mealType: parsed.data.mealType ?? null,
      },
    });

    return { recipe, log };
  });

  res.status(201).json(result);
});

export default router;
