import { Router, Response } from 'express';
import { PrismaClient, GoalType } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/requireAuth';

const router: Router = Router();
const prisma = new PrismaClient();

/**
 * Dashboard — computed daily nutrition totals vs UserGoal targets.
 *
 * Workflow 2B (per plan Section 5, Workflow 2):
 *   1. Fetch UserGoal rows: goalType IN (DAILY_CALORIES, DAILY_PROTEIN, DAILY_CARBS, DAILY_FAT, DAILY_FIBER)
 *   2. Fetch today's NutritionLog rows
 *   3. For each log → join RecipeIngredient → join FoodNutrition
 *   4. contribution = (nutrition.value / basisQty) × ingredient.quantity × log.servings
 *   5. Sum across ingredients → recipe total
 *   6. Sum across logs → daily totals
 *   7. Return targets / consumed / remaining
 *
 * No OpenAI in this route — pure deterministic PostgreSQL query logic.
 */

// ─── GET /api/dashboard ───────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Step 1: Build targets from UserGoal rows
  // goalType is a GoalType enum — no fragile string prefix matching needed.
  const DAILY_GOAL_TYPES: GoalType[] = [
    GoalType.DAILY_CALORIES,
    GoalType.DAILY_PROTEIN,
    GoalType.DAILY_CARBS,
    GoalType.DAILY_FAT,
    GoalType.DAILY_FIBER,
  ];

  const goalRows = await prisma.userGoal.findMany({
    where: {
      userId,
      isActive: true,
      goalType: { in: DAILY_GOAL_TYPES },
    },
  });

  // Map GoalType enum → dashboard key (strip "DAILY_" prefix, lowercase)
  // e.g. DAILY_CALORIES → "calories", DAILY_CARBS → "carbs"
  const targets: Record<string, number> = {};
  for (const goal of goalRows) {
    const key = goal.goalType.replace('DAILY_', '').toLowerCase();
    targets[key] = goal.targetValue ?? 0;
  }

  // Step 2: Fetch today's logs
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const logs = await prisma.nutritionLog.findMany({
    where: { userId, loggedAt: { gte: startOfToday } },
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

  // Steps 3–5: Calculate consumed totals
  const consumed = { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0 };

  const logDetails = logs.map((log) => {
    const logNutrition = { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0 };

    for (const ri of log.recipe.recipeIngredients) {
      const n = ri.ingredient.foodNutrition;
      if (!n) continue;
      const scale = (ri.quantity / n.basisQty) * log.servings;
      logNutrition.calories      += n.calories * scale;
      logNutrition.protein       += n.protein * scale;
      logNutrition.carbohydrates += n.carbs * scale;
      logNutrition.fat           += n.fat * scale;
      logNutrition.fiber         += n.fiber * scale;
    }

    // Accumulate into daily consumed
    consumed.calories      += logNutrition.calories;
    consumed.protein       += logNutrition.protein;
    consumed.carbohydrates += logNutrition.carbohydrates;
    consumed.fat           += logNutrition.fat;
    consumed.fiber         += logNutrition.fiber;

    return {
      id: log.id,
      loggedAt: log.loggedAt,
      mealType: log.mealType,
      servings: log.servings,
      recipe: {
        id: log.recipe.id,
        title: log.recipe.title,
        tags: log.recipe.recipeTags.map((rt) => rt.tag.name),
      },
      nutrition: {
        calories:      Math.round(logNutrition.calories),
        protein:       Math.round(logNutrition.protein),
        carbohydrates: Math.round(logNutrition.carbohydrates),
        fat:           Math.round(logNutrition.fat),
        fiber:         Math.round(logNutrition.fiber),
      },
    };
  });

  // Round consumed totals
  const roundedConsumed = {
    calories:      Math.round(consumed.calories),
    protein:       Math.round(consumed.protein),
    carbohydrates: Math.round(consumed.carbohydrates),
    fat:           Math.round(consumed.fat),
    fiber:         Math.round(consumed.fiber),
  };

  // Step 6: Compute remaining
  const remaining: Record<string, number> = {};
  const macroKeys = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber'] as const;
  for (const key of macroKeys) {
    if (targets[key] !== undefined) {
      remaining[key] = Math.max(0, targets[key] - roundedConsumed[key]);
    }
  }

  res.json({
    targets,
    consumed: roundedConsumed,
    remaining,
    logs: logDetails,
  });
});

export default router;
