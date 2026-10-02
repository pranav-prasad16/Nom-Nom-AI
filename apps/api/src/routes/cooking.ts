import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/requireAuth';
import { AIProviderFactory } from '../ai/AIProviderFactory';
import CookingSessionStore from '../services/CookingSessionStore';

const router = Router();
const prisma = new PrismaClient();

const startSessionSchema = z.object({
  recipeId: z.string(),
});

const messageSchema = z.object({
  message: z.string().min(1),
});

// ─── POST /api/cooking/sessions ───────────────────────────────────────────────

router.post('/sessions', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const recipe = await prisma.recipe.findUnique({
    where: { id: parsed.data.recipeId },
    include: {
      // Fetch latest version with its steps — steps are now version-scoped not recipe-scoped
      recipeVersions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: { recipeSteps: { orderBy: { stepNumber: 'asc' } } },
      },
      recipeIngredients: { include: { ingredient: true } },
    },
  });

  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      userDietaryPreferences: { include: { dietaryPreference: true } },
      userGoals: { where: { isActive: true } },
    },
  });

  const dietaryPreferences = user?.userDietaryPreferences.map(
    (p) => p.dietaryPreference.llmConstraint ?? p.dietaryPreference.name
  ) ?? [];
  const goals: string[] = user?.userGoals.map((g) => g.goalType) ?? [];

  // Steps are always structured (RecipeStep rows on the latest RecipeVersion)
  // Fall back to version description only if no steps exist (e.g. USER_CREATED recipes with no steps)
  const latestVersion = recipe.recipeVersions[0];
  const stepsText = latestVersion?.recipeSteps.length > 0
    ? latestVersion.recipeSteps.map((s) => `Step ${s.stepNumber}: ${s.instruction}`).join('\n')
    : latestVersion?.description ?? 'No instructions available.';

  const ingredientsList = recipe.recipeIngredients
    .map((ri) => `${ri.quantity} ${ri.unit} ${ri.ingredient.name}`)
    .join(', ');

  /**
   * System Prompt (Workflow 3):
   * - Full recipe context
   * - User dietary profile (never suggest violations)
   * - Persona: friendly, encouraging Indian home cook assistant
   * Phase 4 placeholder: add send_photo vision tool here
   */
  const systemPrompt = `
You are a friendly, encouraging Indian home cook assistant helping a user cook the following recipe.

Recipe: ${recipe.title}
Ingredients: ${ingredientsList}

Instructions:
${stepsText}

User's dietary preferences: ${dietaryPreferences.join(', ') || 'None specified'}
User's goals: ${goals.join(', ') || 'None specified'}

Important:
- Never suggest ingredients or substitutions that violate the user's dietary preferences.
- Answer questions about the recipe in a warm, encouraging tone.
- If the user asks something unrelated to cooking this recipe, gently redirect them.
- Current step index will be provided in messages as context.
  `.trim();

  const sessionId = CookingSessionStore.create({
    recipeId: parsed.data.recipeId,
    currentStep: 0,
    completedSteps: [],
    servings: 1,
    sessionStatus: 'active',
    chatHistory: [],
    systemPrompt,
    userContext: { dietaryPreferences, goals },
  });

  res.status(201).json({
    sessionId,
    recipe: {
      id: recipe.id,
      title: recipe.title,
      totalSteps: latestVersion?.recipeSteps.length ?? 0,  // steps are version-scoped, not on Recipe directly
    },
  });
});

// ─── POST /api/cooking/sessions/:id/message ───────────────────────────────────

router.post('/sessions/:id/message', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const session = CookingSessionStore.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  const ai = AIProviderFactory.getProvider();
  const reply = await ai.cookingChat({
    systemPrompt: session.systemPrompt,
    chatHistory: session.chatHistory,
    userMessage: parsed.data.message,
  });

  CookingSessionStore.update(req.params.id, {
    chatHistory: [
      ...session.chatHistory,
      { role: 'user', content: parsed.data.message },
      { role: 'assistant', content: reply },
    ],
  });

  res.json({ reply });
});

// ─── POST /api/cooking/sessions/:id/step ──────────────────────────────────────

router.post('/sessions/:id/step', requireAuth, async (req: AuthRequest, res: Response) => {
  const session = CookingSessionStore.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  const newStep = session.currentStep + 1;
  const completedSteps = [...session.completedSteps, session.currentStep];
  CookingSessionStore.update(req.params.id, {
    currentStep: newStep,
    completedSteps,
  });

  res.json({ currentStep: newStep, completedSteps });
});

// ─── DELETE /api/cooking/sessions/:id ────────────────────────────────────────

router.delete('/sessions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  CookingSessionStore.delete(req.params.id);
  res.status(204).send();
});

export default router;
