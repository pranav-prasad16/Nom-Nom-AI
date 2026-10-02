import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient, GoalType } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/requireAuth';

const router = Router();
const prisma = new PrismaClient();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const goalSchema = z.object({
  goalType: z.nativeEnum(GoalType),
  targetValue: z.number().optional(),
});

const dietaryPrefsSchema = z.object({
  preferenceIds: z.array(z.string()),
});

function signToken(payload: { id: string; email: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  } as jwt.SignOptions);
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────

router.post('/register', async (req, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password, displayName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      userProfile: { create: { displayName } },
    },
    include: { userProfile: true },
  });

  const token = signToken({ id: user.id, email: user.email });
  res.status(201).json({ token, user: { id: user.id, email: user.email, displayName } });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', async (req, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { userProfile: true },
  });

  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = signToken({ id: user.id, email: user.email });
  res.json({
    token,
    user: { id: user.id, email: user.email, displayName: user.userProfile?.displayName },
  });
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      userProfile: true,
      userGoals: { where: { isActive: true } },
      userDietaryPreferences: { include: { dietaryPreference: true } },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    displayName: user.userProfile?.displayName,
    bio: user.userProfile?.bio,
    goals: user.userGoals,
    dietaryPreferences: user.userDietaryPreferences.map((p) => p.dietaryPreference),
  });
});

// ─── POST /api/auth/goals ─────────────────────────────────────────────────────

router.post('/goals', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const goal = await prisma.userGoal.create({
    data: {
      userId: req.user!.id,
      goalType: parsed.data.goalType,
      targetValue: parsed.data.targetValue,
      isActive: true,
    },
  });

  res.status(201).json(goal);
});

// ─── GET /api/auth/goals ──────────────────────────────────────────────────────

router.get('/goals', requireAuth, async (req: AuthRequest, res: Response) => {
  const goals = await prisma.userGoal.findMany({
    where: { userId: req.user!.id, isActive: true },
  });
  res.json(goals);
});

// ─── POST /api/auth/dietary-preferences ─────────────────────────────────────

router.post('/dietary-preferences', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = dietaryPrefsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = req.user!.id;

  // Replace all existing preferences for the user
  await prisma.userDietaryPreference.deleteMany({ where: { userId } });

  const prefs = await prisma.userDietaryPreference.createMany({
    data: parsed.data.preferenceIds.map((dietaryPreferenceId) => ({
      userId,
      dietaryPreferenceId,
    })),
  });

  res.json({ count: prefs.count });
});

export default router;
