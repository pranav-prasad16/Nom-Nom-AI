/**
 * meal-log.tsx — DEPRECATED.
 *
 * This screen has been replaced by nutrition-log.tsx.
 * The route /app/meal-log is no longer registered in _layout.tsx.
 *
 * Per plan Section 10 (Phase 1 Scope): meal_logs → nutrition_logs.
 * The NutritionLog model has a servings field and optional mealType —
 * no mealPlanItemId.
 *
 * This file is kept to avoid breaking any cached navigation state.
 * It will be deleted once Sub-Task 14 mobile screens are fully implemented.
 */

import { Redirect } from 'expo-router';

export default function MealLogRedirect() {
  return <Redirect href="/(app)/nutrition-log" />;
}
