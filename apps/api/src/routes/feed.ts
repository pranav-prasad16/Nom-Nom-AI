import { Router, Request, Response } from 'express';
import { PrismaClient, CuisineType, Prisma } from '@prisma/client';

const router: Router = Router();
const prisma = new PrismaClient();

// ─── GET /api/feed ────────────────────────────────────────────────────────────
// Public. Paginated published recipes; filterable by tag + cuisine.

router.get('/', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const tag = req.query.tag as string | undefined;
  const cuisine = req.query.cuisine as string | undefined;

  // cuisineType is now a CuisineType enum — exact match, no case-insensitive needed
  const validCuisine = Object.values(CuisineType).includes(cuisine as CuisineType)
    ? (cuisine as CuisineType)
    : undefined;

  const where: Prisma.RecipeWhereInput = {
    isPublished: true,
    ...(validCuisine ? { cuisineType: validCuisine } : {}),
    ...(tag
      ? { recipeTags: { some: { tag: { name: { equals: tag, mode: 'insensitive' } } } } }
      : {}),
  };

  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where,
      include: {
        recipeVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        recipeTags: { include: { tag: true } },
        author: { include: { userProfile: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.recipe.count({ where }),
  ]);

  res.json({
    data: recipes,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export default router;
