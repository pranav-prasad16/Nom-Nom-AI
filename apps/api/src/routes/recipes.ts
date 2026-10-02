import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { PrismaClient, CuisineType } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/requireAuth';
import { AIProviderFactory } from '../ai/AIProviderFactory';

const router: Router = Router();
const prisma = new PrismaClient();

const generateSchema = z.object({
  ingredients: z.array(z.string().min(1)).min(1),
  recipeId: z.string().optional(),               // present → regenerate existing recipe (new RecipeVersion)
                                                  // absent  → generate brand new Recipe
  servings: z.number().int().positive().optional(),
  mealType: z.string().optional(),
  tagPreference: z.enum(['QUICK', 'FANCY', 'HEALTHY', 'COMFORT', 'OTHER']).optional(),
  cuisine: z.nativeEnum(CuisineType).optional(),
  calorieTarget: z.number().positive().optional(),
  dietaryConstraints: z.array(z.string()).optional(),
  naturalLanguageRequest: z.string().optional(),
});

// ─── POST /api/recipes/generate ──────────────────────────────────────────────

router.post('/generate', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const ai = AIProviderFactory.getProvider();
  const result = await ai.runRecipeAgent({
    userId: req.user!.id,
    ingredients: parsed.data.ingredients,
    recipeId: parsed.data.recipeId,
    servings: parsed.data.servings,
    mealType: parsed.data.mealType,
    tagPreference: parsed.data.tagPreference,
    cuisine: parsed.data.cuisine,
    calorieTarget: parsed.data.calorieTarget,
    dietaryConstraints: parsed.data.dietaryConstraints,
    naturalLanguageRequest: parsed.data.naturalLanguageRequest,
  });

  // Phase 2 placeholder: add scan_ingredients_from_image camera/vision input here

  // Persist the recipe returned by the agent.
  // The agent's save_recipe tool call is a signal — actual DB write happens here
  // using the structured AgentRecipeResult.
  const tagRecords = await Promise.all(
    result.tags.map((tagName) =>
      prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      })
    )
  );

  // Resolve ingredient IDs for structured ingredient list
  const ingredientRows = await Promise.all(
    result.ingredients.map(async (item) => {
      const ingredient = await prisma.ingredient.findFirst({
        where: { name: { equals: item.ingredient, mode: 'insensitive' } },
      });
      return ingredient ? { ingredientId: ingredient.id, quantity: item.quantity, unit: item.unit } : null;
    })
  );

  const recipe = await prisma.recipe.create({
    data: {
      title: result.name,
      cuisineType: result.cuisineType as CuisineType,
      isPublished: false,
      authorId: req.user!.id,
      recipeVersions: {
        create: {
          versionNumber: 1,
          description: result.description,
          servings: result.servings,    // how many servings this version makes — from agent output
          aiPromptUsed: parsed.data.ingredients.join(', '),
          // Steps are scoped to this RecipeVersion — not to Recipe directly.
          // Each regeneration creates a new RecipeVersion with its own independent steps.
          recipeSteps: {
            create: result.steps.map((s) => ({
              stepNumber: s.step,
              instruction: s.instruction,
            })),
          },
        },
      },
      recipeTags: {
        create: tagRecords.map((tag) => ({ tagId: tag.id })),
      },
      recipeIngredients: {
        create: ingredientRows.filter(Boolean).map((row) => row!),
      },
    },
    include: {
      recipeVersions: {
        include: { recipeSteps: { orderBy: { stepNumber: 'asc' } } },
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
      recipeTags: { include: { tag: true } },
      recipeIngredients: { include: { ingredient: true } },
    },
  });

  res.status(201).json({ ...recipe, nutrition: result.nutrition });
});

// ─── GET /api/recipes/my ─────────────────────────────────────────────────────

router.get('/my', requireAuth, async (req: AuthRequest, res: Response) => {
  const [generated, savedRows] = await Promise.all([
    prisma.recipe.findMany({
      where: { authorId: req.user!.id },
      include: {
        recipeVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        recipeTags: { include: { tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userSavedRecipe.findMany({
      where: { userId: req.user!.id },
      include: {
        recipe: {
          include: {
            recipeVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
            recipeTags: { include: { tag: true } },
            author: { include: { userProfile: true } },
          },
        },
      },
      orderBy: { savedAt: 'desc' },
    }),
  ]);

  res.json({
    generated,
    saved: savedRows.map((row) => ({ ...row.recipe, savedAt: row.savedAt })),
  });
});

// ─── GET /api/recipes/:id ─────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const recipe = await prisma.recipe.findUnique({
    where: { id: req.params.id },
    include: {
      recipeVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      recipeIngredients: { include: { ingredient: true } },
      recipeTags: { include: { tag: true } },
      author: { include: { userProfile: true } },
    },
  });

  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  res.json(recipe);
});

// ─── POST /api/recipes/:id/save ───────────────────────────────────────────────
// Bookmark a recipe. Idempotent — saving an already-saved recipe is a no-op.

router.post('/:id/save', requireAuth, async (req: AuthRequest, res: Response) => {
  const recipe = await prisma.recipe.findUnique({ where: { id: req.params.id } });
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  // upsert: if already saved, do nothing; if not saved, create the row
  await prisma.userSavedRecipe.upsert({
    where: { userId_recipeId: { userId: req.user!.id, recipeId: req.params.id } },
    update: {},   // already saved — no-op
    create: { userId: req.user!.id, recipeId: req.params.id },
  });

  res.status(201).json({ saved: true, recipeId: req.params.id });
});

// ─── DELETE /api/recipes/:id/save ────────────────────────────────────────────
// Remove a bookmark. Idempotent — unsaving a recipe that isn't saved is a no-op.

router.delete('/:id/save', requireAuth, async (req: AuthRequest, res: Response) => {
  await prisma.userSavedRecipe.deleteMany({
    where: { userId: req.user!.id, recipeId: req.params.id },
  });

  res.status(200).json({ saved: false, recipeId: req.params.id });
});

// ─── POST /api/recipes/:id/publish ───────────────────────────────────────────

router.post('/:id/publish', requireAuth, async (req: AuthRequest, res: Response) => {
  const recipe = await prisma.recipe.findUnique({ where: { id: req.params.id } });

  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  if (recipe.authorId !== req.user!.id) {
    res.status(403).json({ error: 'Only the author can publish this recipe' });
    return;
  }

  const updated = await prisma.recipe.update({
    where: { id: req.params.id },
    data: { isPublished: true },
  });

  res.json(updated);
});

export default router;
