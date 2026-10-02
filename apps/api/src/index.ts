import 'dotenv/config';
import express, { Application } from 'express';
import cors from 'cors';

import authRouter from './routes/auth';
import recipesRouter from './routes/recipes';
import ingredientsRouter from './routes/ingredients';
import pantryRouter from './routes/pantry';
import nutritionLogRouter from './routes/nutritionLog';
import dashboardRouter from './routes/dashboard';
import feedRouter from './routes/feed';
import suggestionsRouter from './routes/suggestions';
import cookingRouter from './routes/cooking';

const app: Application = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/ingredients', ingredientsRouter);
app.use('/api/pantry', pantryRouter);
app.use('/api/nutrition-log', nutritionLogRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/feed', feedRouter);
app.use('/api/suggestions', suggestionsRouter);
app.use('/api/cooking', cookingRouter);

// Removed routes (out of scope per plan):
//   /api/meal-log    → replaced by /api/nutrition-log
//   /api/meal-plans  → removed (Meal Planner Agent is out of scope for Phase 1)

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🍽️  Nom Nom AI API running on http://localhost:${PORT}`);
});

export default app;
