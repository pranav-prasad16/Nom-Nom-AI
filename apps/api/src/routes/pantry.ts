import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/requireAuth';

const router: Router = Router();
const prisma = new PrismaClient();

const addItemSchema = z.object({
  ingredientId: z.string(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

const updateItemSchema = z.object({
  quantity: z.number().positive().optional(),
  unit: z.string().optional(),
  expiresAt: z.string().datetime().nullish(),
});

async function getOrCreatePantry(userId: string) {
  const existing = await prisma.pantry.findFirst({ where: { userId } });
  if (existing) return existing;
  return prisma.pantry.create({ data: { userId, name: 'My Pantry' } });
}

// ─── GET /api/pantry ──────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const pantry = await prisma.pantry.findFirst({
    where: { userId: req.user!.id },
    include: {
      pantryItems: {
        include: { ingredient: { include: { ingredientAliases: true } } },
        orderBy: { addedAt: 'desc' },
      },
    },
  });

  res.json(pantry ?? { items: [] });
});

// ─── POST /api/pantry/items ───────────────────────────────────────────────────

router.post('/items', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const pantry = await getOrCreatePantry(req.user!.id);

  const item = await prisma.pantryItem.create({
    data: {
      pantryId: pantry.id,
      ingredientId: parsed.data.ingredientId,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    },
    include: { ingredient: true },
  });

  await prisma.pantryEvent.create({
    data: {
      pantryId: pantry.id,
      ingredientId: parsed.data.ingredientId,
      eventType: 'ADDED',
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,       // copied from PantryItem — makes event log self-contained
    },
  });

  res.status(201).json(item);
});

// ─── PATCH /api/pantry/items/:id ─────────────────────────────────────────────

router.patch('/items/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const item = await prisma.pantryItem.findUnique({ where: { id: req.params.id } });
  if (!item) {
    res.status(404).json({ error: 'Pantry item not found' });
    return;
  }

  const updated = await prisma.pantryItem.update({
    where: { id: req.params.id },
    data: {
      quantity: parsed.data.quantity ?? item.quantity,
      unit: parsed.data.unit ?? item.unit,
      expiresAt: parsed.data.expiresAt !== undefined
        ? (parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null)
        : item.expiresAt,
    },
    include: { ingredient: true },
  });

  await prisma.pantryEvent.create({
    data: {
      pantryId: item.pantryId,
      ingredientId: item.ingredientId,
      eventType: 'USED',
      quantity: parsed.data.quantity ?? item.quantity,
      unit: parsed.data.unit ?? item.unit,  // copied from updated or existing PantryItem
    },
  });

  res.json(updated);
});

// ─── DELETE /api/pantry/items/:id ─────────────────────────────────────────────

router.delete('/items/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const item = await prisma.pantryItem.findUnique({ where: { id: req.params.id } });
  if (!item) {
    res.status(404).json({ error: 'Pantry item not found' });
    return;
  }

  await prisma.pantryItem.delete({ where: { id: req.params.id } });

  await prisma.pantryEvent.create({
    data: {
      pantryId: item.pantryId,
      ingredientId: item.ingredientId,
      eventType: 'REMOVED',
      quantity: item.quantity,
      unit: item.unit,              // copied from the PantryItem being deleted
    },
  });

  res.status(204).send();
});

export default router;
