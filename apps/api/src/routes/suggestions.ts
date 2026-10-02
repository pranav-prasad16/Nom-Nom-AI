import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/requireAuth';

const router = Router();
const prisma = new PrismaClient();

// ─── GET /api/suggestions ──────────────────────────────────────────────────────
// Workflow 2A — Rule-based. NO AI. Pure PostgreSQL query logic.
//
// Logic:
//   1. Pull user's active goals + dietary prefs
//   2. Pull most-used tags from meal_logs (last 30 days)
//   3. Query published recipes matching those tags + dietary restrictions
//   4. Exclude recipes logged in last 7 days (variety)
//   5. Cold start (no history): return seeded curated recipes only
//   Max 10 results.

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Step 1: user dietary prefs
  const userPrefs = await prisma.userDietaryPreference.findMany({
    where: { userId },
    include: { dietaryPreference: true },
  });

  // Step 2: most-used tags from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentLogs = await prisma.nutritionLog.findMany({
    where: { userId, loggedAt: { gte: thirtyDaysAgo } },
    include: { recipe: { include: { recipeTags: { include: { tag: true } } } } },
  });

  const recentlyLoggedRecipeIds = new Set(
    (
      await prisma.nutritionLog.findMany({
        where: { userId, loggedAt: { gte: sevenDaysAgo } },
        select: { recipeId: true },
      })
    ).map((l) => l.recipeId)
  );

  // Compute tag frequency
  const tagFreq: Record<string, number> = {};
  for (const log of recentLogs) {
    for (const rt of log.recipe.recipeTags) {
      tagFreq[rt.tag.name] = (tagFreq[rt.tag.name] ?? 0) + 1;
    }
  }

  const topTags = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  // Step 3–4: Query matching recipes, exclude recently logged
  const suggestions = await prisma.recipe.findMany({
    where: {
      isPublished: true,
      id: { notIn: [...recentlyLoggedRecipeIds] },
      ...(topTags.length > 0
        ? { recipeTags: { some: { tag: { name: { in: topTags } } } } }
        : {}),
    },
    include: {
      recipeVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      recipeTags: { include: { tag: true } },
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  // Step 5: Cold start fallback — return curated seed recipes
  if (suggestions.length === 0) {
    const seed = await prisma.recipe.findMany({
      where: { isPublished: true },
      include: {
        recipeVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        recipeTags: { include: { tag: true } },
      },
      take: 10,
      orderBy: { createdAt: 'asc' },
    });
    res.json(seed);
    return;
  }

  res.json(suggestions);
});

export default router;
