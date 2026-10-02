import { AgentRecipeResult, RecipeGenerateParams } from '../types';

/**
 * AIProvider — provider-agnostic interface for all AI operations.
 * Swap the implementation by setting AI_PROVIDER env var.
 *
 * Architecture rule: Agents reason. Tools retrieve or modify data.
 * Backend services enforce business logic. PostgreSQL stores the source of truth.
 *
 * Two agents are implemented in Phase 1:
 *   1. Recipe Agent    — generates/adapts recipes via tool-calling loop
 *   2. Cooking Assistant — guides cooking via conversational session
 *
 * generateMealPlan (Workflow 2) is OUT OF SCOPE for Phase 1 (removed).
 */
export interface AIProvider {
  /**
   * Workflow 1 — Recipe Agent (tool-calling loop, max 5 iterations).
   * Tools: search_ingredients, get_ingredient, get_nutrition, get_user_pantry,
   *        calculate_recipe_nutrition, validate_recipe, save_recipe, get_recipe.
   * Returns structured AgentRecipeResult — nutrition from backend calculation, not LLM.
   */
  runRecipeAgent(params: RecipeGenerateParams): Promise<AgentRecipeResult>;

  /**
   * Workflow 3 — Cooking Assistant chat turn.
   * Takes system prompt + full chat history, returns assistant reply.
   * The agent is restricted to cooking guidance — no recipe generation or nutrition tools.
   */
  cookingChat(params: {
    systemPrompt: string;
    chatHistory: { role: 'user' | 'assistant'; content: string }[];
    userMessage: string;
  }): Promise<string>;
}
