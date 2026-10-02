// Shared TypeScript types for the Nom Nom AI API

// ─── AI / Recipe Agent ──────────────────────────────────────────────────────

export interface NutritionData {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
}

/**
 * Structured output returned by the Recipe Agent.
 * Schema is aligned with the Prisma models and API contracts.
 * Nutrition values MUST come from backend,
 * never from LLM inference.
 */
export interface AgentRecipeResult {
  name: string;
  description: string;
  servings: number;
  cuisineType: string;
  tags: string[];               // QUICK | FANCY | HEALTHY | COMFORT | OTHER
  cookingTimeMinutes: number;
  ingredients: Array<{
    ingredient: string;         // canonical name — resolved via search_ingredients tool
    quantity: number;
    unit: string;
  }>;
  steps: Array<{
    step: number;
    instruction: string;
  }>;
  nutrition: NutritionData;     // from calculate_recipe_nutrition, not LLM inference
}

export interface RecipeGenerateParams {
  userId: string;
  ingredients: string[];
  recipeId?: string;             // if provided → regenerate existing recipe (new RecipeVersion)
                                 // if absent  → generate brand new Recipe
  servings?: number;
  mealType?: string;
  tagPreference?: string;
  cuisine?: string;
  calorieTarget?: number;
  dietaryConstraints?: string[];
  naturalLanguageRequest?: string;
}

// ─── Cooking Session ────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Session state for Workflow 3 (Cooking Assistant).
 * Stored in Node.js Map (CookingSessionStore).
 * currentStep and completedSteps are managed by backend tools,
 * not tracked solely in LLM conversation memory.
 */
export interface SessionState {
  recipeId: string;
  currentStep: number;
  completedSteps: number[];
  servings: number;
  sessionStatus: 'active' | 'completed' | 'abandoned';
  chatHistory: ChatMessage[];
  systemPrompt: string;
  userContext: {
    dietaryPreferences: string[];
    goals: string[];
  };
  lastActivityAt: Date;
}

// ─── Express Augmentation ───────────────────────────────────────────────────

import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
}
