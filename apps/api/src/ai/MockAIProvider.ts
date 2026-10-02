import { AIProvider } from './AIProvider';
import { AgentRecipeResult, RecipeGenerateParams } from '../types';

/**
 * MockAIProvider — used when AI_PROVIDER=mock.
 * Returns hardcoded responses so the app works without an OpenAI key.
 * All tool-call side effects (nutrition lookup, DB save) are skipped —
 * the route handler is responsible for persisting the returned data.
 */
export class MockAIProvider implements AIProvider {
  async runRecipeAgent(params: RecipeGenerateParams): Promise<AgentRecipeResult> {
    console.log('[MockAIProvider] runRecipeAgent called with:', params.ingredients);

    return {
      name: 'Quick Aloo Sabzi',
      description:
        'A simple and comforting Indian potato stir-fry made with everyday spices. ' +
        'Diced potatoes are tempered in cumin and mustard seeds, then tossed with ' +
        'turmeric, coriander, and a squeeze of lemon. Ready in under 20 minutes.',
      servings: params.servings ?? 1,
      cuisineType: params.cuisine ?? 'NORTH_INDIAN',  // must be a valid CuisineType enum value
      tags: [params.tagPreference ?? 'QUICK'],
      cookingTimeMinutes: 20,
      ingredients: params.ingredients.length > 0
        ? params.ingredients.map((name) => ({ ingredient: name, quantity: 100, unit: 'g' }))
        : [
            { ingredient: 'potato', quantity: 300, unit: 'g' },
            { ingredient: 'onion', quantity: 100, unit: 'g' },
            { ingredient: 'tomato', quantity: 100, unit: 'g' },
            // cumin and turmeric removed — spices are excluded from the ingredient system
            // (assumed always available; see Recipe Agent system prompt rule 14)
          ],
      steps: [
        { step: 1, instruction: 'Dice potatoes and onions into small pieces.' },
        { step: 2, instruction: 'Heat oil in a pan and add cumin seeds until they splutter.' },
        { step: 3, instruction: 'Add onions and cook until golden, then add tomatoes and spices.' },
        { step: 4, instruction: 'Add potatoes, cover and cook on medium heat for 15 minutes.' },
        { step: 5, instruction: 'Season with salt and garnish with fresh coriander.' },
      ],
      // Mock nutrition — in production this comes from calculate_recipe_nutrition (backend)
      nutrition: {
        calories: 210,
        protein: 4,
        carbohydrates: 38,
        fat: 6,
        fiber: 3,
      },
    };
  }

  async cookingChat(params: {
    systemPrompt: string;
    chatHistory: { role: 'user' | 'assistant'; content: string }[];
    userMessage: string;
  }): Promise<string> {
    console.log('[MockAIProvider] cookingChat called');
    return `That's a great question! For this recipe, I'd suggest taking it step by step. What else would you like to know?`;
  }
}
