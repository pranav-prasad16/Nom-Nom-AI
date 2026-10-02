import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ─── GET /api/ingredients/search?q= ──────────────────────────────────────────

router.get('/search', async (req: Request, res: Response) => {
  const q = (req.query.q as string) ?? '';

  if (!q.trim()) {
    res.json([]);
    return;
  }

  const ingredients = await prisma.ingredient.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { ingredientAliases: { some: { alias: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    include: { ingredientAliases: true },
    take: 20,
  });

  res.json(ingredients);
});

export default router;
