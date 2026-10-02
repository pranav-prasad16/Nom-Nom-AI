import OpenAI from 'openai';
import { AIProvider } from './AIProvider';
import { AgentRecipeResult, RecipeGenerateParams } from '../types';
import { PrismaClient, IngredientCategory } from '@prisma/client';
import NutritionService from '../services/NutritionService';

const prisma = new PrismaClient();

/**
 * OpenAIProvider — production AI provider using OpenAI's API.
 *
 * Workflow 1 (Recipe Agent) uses tool-calling (max 5 iterations):
 *   Tool 1: search_ingredients        — ingredient lookup by name/alias
 *   Tool 2: get_ingredient            — ingredient detail
 *   Tool 3: get_nutrition             — nutrition lookup (Edamam / Nutrition Resolver fallback)
 *   Tool 4: get_user_pantry           — pantry contents for current user
 *   Tool 5: calculate_recipe_nutrition — deterministic backend macro calculation
 *   Tool 6: validate_recipe           — check generated recipe meets constraints
 *   Tool 7: save_recipe               — persist recipe to DB
 *   Tool 8: get_recipe                — retrieve persisted recipe
 *
 * Architecture rule: The LLM must never query PostgreSQL directly.
 * All data access goes through these tool functions → backend services → Prisma → PostgreSQL.
 *
 * generateMealPlan is removed — out of scope for Phase 1.
 *
 * Workflow 3 (Cooking Assistant) is a plain chat turn — no tool-calling.
 * The agent is restricted via system prompt from generating recipes or accessing nutrition.
 *
 * Phase 2 placeholder: add scan_ingredients_from_image vision tool in runRecipeAgent.
 */
export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // ─── Workflow 1: Recipe Agent ──────────────────────────────────────────────

  async runRecipeAgent(params: RecipeGenerateParams): Promise<AgentRecipeResult> {
    const {
      userId,
      ingredients,
      recipeId,
      servings,
      tagPreference,
      cuisine,
      calorieTarget,
      dietaryConstraints,
      naturalLanguageRequest,
    } = params;

    const systemPrompt = `
You are a creative Indian home-cooking AI assistant.

Your job is to generate a single recipe based on the user's available ingredients and constraints.

Rules:
1. Use search_ingredients and get_ingredient to resolve ingredient names to canonical DB entries.
2. Use get_user_pantry when the user wants to cook from what they already have.
3. Use get_nutrition to fetch nutrition data for each ingredient.
4. Generate the recipe structure (name, description, ingredients, steps, servings, cooking time).
5. Use calculate_recipe_nutrition to compute the final macro values — NEVER invent nutrition values.
6. Use validate_recipe to check the recipe meets the user's constraints.
   If validation fails, adjust the recipe and recalculate until it passes (max 5 iterations total).
7. Use save_recipe to persist the validated recipe to the database.
8. Use get_recipe to retrieve the saved recipe and return it.
9. Set cuisineType to one of these exact values matching the user's request or the recipe style:
   NORTH_INDIAN, SOUTH_INDIAN, EAST_INDIAN, WEST_INDIAN,
   CHINESE, ITALIAN, MEXICAN, MIDDLE_EASTERN, THAI, CONTINENTAL, OTHER
   Default to NORTH_INDIAN if no cuisine is specified or inferable.
   ${recipeId ? `REGENERATION MODE: You are creating a new version of an existing recipe (recipeId: ${recipeId}). Keep the same general dish identity but apply the new requirements. The branch logic (new RecipeVersion vs new Recipe) is handled by the backend — your job is only to generate the improved recipe content.` : 'FRESH GENERATION MODE: Generate a completely new recipe from the provided ingredients.'}
10. Tag with one or more of: QUICK, FANCY, HEALTHY, COMFORT, OTHER.
11. Never suggest ingredients that violate dietary preferences.
12. If a constraint cannot be satisfied, explain the limitation and propose an alternative.
13. Do not fabricate nutrition values, pantry items, or database records.
14. SPICE ASSUMPTION: Always assume the user has the following standard Indian spices available —
    cumin (jeera), turmeric (haldi), coriander powder (dhaniya), red chili powder (lal mirch),
    garam masala, mustard seeds (rai/sarson), dry red chili, bay leaf (tej patta), cardamom (elaichi),
    cinnamon (dalchini), cloves (laung), black pepper (kali mirch), asafoetida (hing), carom seeds (ajwain).
    Do NOT include spices as structured RecipeIngredient rows — mention them only in the recipe description
    and steps. Do NOT call get_nutrition or search_ingredients for spices.
15. CANONICAL INGREDIENT NAMING: When calling create_ingredient, the "name" field MUST always be the
    standard English name of the ingredient — never a regional, Hindi, or vernacular term.
    Examples of correct canonical naming:
      "tamatar" → name: "tomato",   aliases: ["tamatar", "tameta"]
      "aloo"    → name: "potato",   aliases: ["aloo", "aalu", "batata"]
      "karela"  → name: "bitter gourd", aliases: ["karela", "pavakkai", "hagalkai"]
      "palak"   → name: "spinach",  aliases: ["palak"]
    The user's original term (e.g. "tamatar") must be added to the aliases list, NOT used as the name.
    If unsure whether a term is canonical, use the most widely recognised English name.
16. UNIT MATCHING: When building the ingredients list for save_recipe, always express each
    ingredient's quantity in the same unit as that ingredient's FoodNutrition.basisUnit.
    The basisUnit is returned by get_nutrition — check it before calling save_recipe.
    Examples:
      egg       → basisUnit: "piece" → quantity: 3,   unit: "piece"  (NOT 150g)
      milk      → basisUnit: "ml"    → quantity: 200,  unit: "ml"    (NOT 200g)
      spinach   → basisUnit: "g"     → quantity: 100,  unit: "g"
      paneer    → basisUnit: "g"     → quantity: 200,  unit: "g"
    If you save a quantity in a different unit than basisUnit, the nutrition scaling
    formula (macro / basisQty × quantity × servings) will produce wrong values.

Final response must be a JSON object matching this exact shape:
{
  "name": string,
  "description": string,
  "servings": number,
  "cuisineType": string,
  "tags": string[],
  "cookingTimeMinutes": number,
  "ingredients": [{ "ingredient": string, "quantity": number, "unit": string }],
  "steps": [{ "step": number, "instruction": string }],
  "nutrition": { "calories": number, "protein": number, "carbohydrates": number, "fat": number, "fiber": number }
}
    `.trim();

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'search_ingredients',
          description:
            'Search for an ingredient by name or regional alias (e.g. "karela", "tamatar", "bitter gourd"). ' +
            'Searches both ingredient names and all known aliases in one query. ' +
            'ALWAYS call this before create_ingredient — only create if this returns no results.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Ingredient name or alias to search for' },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_ingredient',
          description:
            'Create a new ingredient in the database. Only call this if search_ingredients returned no results. ' +
            'The "name" field MUST be the standard English name — never a regional/Hindi/vernacular term. ' +
            'If the user typed a regional name (e.g. "tamatar"), convert it to its English name ("tomato") ' +
            'and add the regional name as an alias. This ensures the DB always uses canonical English names.',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description:
                  'Standard English name only (e.g. "tomato", "potato", "bitter gourd"). ' +
                  'NEVER use regional names like "tamatar", "aloo", "karela" as the ingredient name — ' +
                  'put those in the aliases array instead.',
              },
              category: {
                type: 'string',
                enum: Object.values(IngredientCategory),
                description: 'Category from IngredientCategory enum. Choose what the ingredient physically is.',
              },
              aliases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Known regional/Hindi/vernacular names (e.g. ["karela", "pavakkai", "hagalkai"])',
              },
            },
            required: ['name', 'category'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_ingredient',
          description: 'Get full details for a specific ingredient by its ID.',
          parameters: {
            type: 'object',
            properties: {
              ingredientId: { type: 'string', description: 'The ingredient ID' },
            },
            required: ['ingredientId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_nutrition',
          description:
            'Get per-100g macro nutrition data for an ingredient by ID. ' +
            'If not cached, triggers the LLM Nutrition Resolver which estimates macros and stores the result. ' +
            'Always call this after search_ingredients or create_ingredient before calculate_recipe_nutrition.',
          parameters: {
            type: 'object',
            properties: {
              ingredientId: { type: 'string', description: 'The ingredient ID' },
            },
            required: ['ingredientId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_user_pantry',
          description: 'Fetch the current user\'s pantry contents.',
          parameters: {
            type: 'object',
            properties: {
              userId: { type: 'string', description: 'The user\'s ID' },
            },
            required: ['userId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'calculate_recipe_nutrition',
          description: 'Deterministically calculate macro totals for a recipe using stored food_nutrition data. Always call this instead of estimating nutrition yourself.',
          parameters: {
            type: 'object',
            properties: {
              ingredients: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ingredientId: { type: 'string' },
                    quantity: { type: 'number' },
                    unit: { type: 'string' },
                  },
                  required: ['ingredientId', 'quantity', 'unit'],
                },
                description: 'Ingredient list with quantities',
              },
              servings: { type: 'number', description: 'Number of servings the recipe makes' },
            },
            required: ['ingredients', 'servings'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'validate_recipe',
          description: 'Validate that the generated recipe satisfies the user\'s constraints (calorie target, dietary restrictions, macros). Returns { passed: boolean, failures: string[] }.',
          parameters: {
            type: 'object',
            properties: {
              recipe: {
                type: 'object',
                description: 'The recipe object to validate',
              },
              constraints: {
                type: 'object',
                properties: {
                  calorieTarget: { type: 'number' },
                  dietaryPreferences: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            required: ['recipe', 'constraints'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'save_recipe',
          description: 'Save the finalized and validated recipe to the database. Call only after validate_recipe passes.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              servings: { type: 'number' },
              cuisineType: {
                type: 'string',
                enum: ['NORTH_INDIAN', 'SOUTH_INDIAN', 'EAST_INDIAN', 'WEST_INDIAN',
                       'CHINESE', 'ITALIAN', 'MEXICAN', 'MIDDLE_EASTERN', 'THAI', 'CONTINENTAL', 'OTHER'],
                description: 'Must be one of the valid CuisineType enum values',
              },
              tags: { type: 'array', items: { type: 'string' } },
              cookingTimeMinutes: { type: 'number' },
              ingredients: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ingredient: { type: 'string' },
                    quantity: { type: 'number' },
                    unit: { type: 'string' },
                  },
                },
              },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    step: { type: 'number' },
                    instruction: { type: 'string' },
                  },
                },
              },
            },
            required: ['name', 'description', 'servings', 'cuisineType', 'tags', 'ingredients'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_recipe',
          description: 'Retrieve a saved recipe by ID.',
          parameters: {
            type: 'object',
            properties: {
              recipeId: { type: 'string', description: 'The recipe ID' },
            },
            required: ['recipeId'],
          },
        },
      },
    ];

    let userContent = `Generate a recipe using these ingredients: ${ingredients.join(', ')}.`;
    if (servings) userContent += ` Servings: ${servings}.`;
    if (tagPreference) userContent += ` Preferred style: ${tagPreference}.`;
    if (cuisine) userContent += ` Cuisine: ${cuisine}.`;
    if (calorieTarget) userContent += ` Target: under ${calorieTarget} kcal.`;
    if (dietaryConstraints?.length) userContent += ` Dietary: ${dietaryConstraints.join(', ')}.`;
    if (naturalLanguageRequest) userContent += ` Additional: ${naturalLanguageRequest}`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    let calculatedNutrition: AgentRecipeResult['nutrition'] | null = null;
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    // Tool-calling loop
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];

      if (choice.finish_reason === 'stop') {
        // Model is done — parse final structured JSON
        const content = choice.message.content ?? '{}';
        try {
          const parsed = JSON.parse(content) as AgentRecipeResult;
          // Prefer backend-calculated nutrition over anything in the JSON
          if (calculatedNutrition) {
            parsed.nutrition = calculatedNutrition;
          }
          return parsed;
        } catch {
          throw new Error(`OpenAI returned non-JSON final response: ${content}`);
        }
      }

      if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
        messages.push(choice.message);

        for (const toolCall of choice.message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          let toolResult: string;

          switch (toolCall.function.name) {
            case 'search_ingredients':
              toolResult = await this.handleSearchIngredients(args.query);
              break;
            case 'create_ingredient':
              toolResult = await this.handleCreateIngredient(args.name, args.category, args.aliases ?? []);
              break;
            case 'get_ingredient':
              toolResult = await this.handleGetIngredient(args.ingredientId);
              break;
            case 'get_nutrition':
              toolResult = await this.handleGetNutrition(args.ingredientId);
              break;
            case 'get_user_pantry':
              toolResult = await this.handleGetUserPantry(args.userId ?? userId);
              break;
            case 'calculate_recipe_nutrition': {
              const result = await this.handleCalculateRecipeNutrition(args.ingredients, args.servings);
              calculatedNutrition = result;
              toolResult = JSON.stringify(result);
              break;
            }
            case 'validate_recipe':
              toolResult = await this.handleValidateRecipe(args.recipe, args.constraints);
              break;
            case 'save_recipe':
              toolResult = await this.handleSaveRecipe({ ...args, userId });
              break;
            case 'get_recipe':
              toolResult = await this.handleGetRecipe(args.recipeId);
              break;
            default:
              toolResult = JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` });
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }
    }

    throw new Error('Recipe Agent exceeded maximum iterations without completing');
  }

  // ─── Tool Handlers ─────────────────────────────────────────────────────────

  private async handleSearchIngredients(query: string): Promise<string> {
    const ingredients = await prisma.ingredient.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { ingredientAliases: { some: { alias: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: { ingredientAliases: true },
      take: 10,
    });
    return JSON.stringify(ingredients.map((i) => ({ id: i.id, name: i.name, category: i.category })));
  }

  private async handleGetIngredient(ingredientId: string): Promise<string> {
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      include: { ingredientAliases: true, foodNutrition: true },
    });
    if (!ingredient) return JSON.stringify({ error: 'Ingredient not found' });
    return JSON.stringify(ingredient);
  }

  private async handleCreateIngredient(
    name: string,
    category: string,
    aliases: string[]
  ): Promise<string> {
    try {
      // Guard: check if it already exists (name or alias) before creating
      const existing = await prisma.ingredient.findFirst({
        where: {
          OR: [
            { name: { equals: name, mode: 'insensitive' } },
            { ingredientAliases: { some: { alias: { equals: name, mode: 'insensitive' } } } },
          ],
        },
      });
      if (existing) {
        return JSON.stringify({ id: existing.id, name: existing.name, alreadyExisted: true });
      }

      const ingredient = await prisma.ingredient.create({
        data: {
          name: name.toLowerCase().trim(),
          category: category as IngredientCategory,
          ingredientAliases: aliases.length > 0
            ? { create: aliases.map((alias) => ({ alias: alias.toLowerCase().trim() })) }
            : undefined,
        },
        include: { ingredientAliases: true },
      });

      return JSON.stringify({ id: ingredient.id, name: ingredient.name, created: true });
    } catch (err) {
      console.error('[create_ingredient] Failed:', err);
      return JSON.stringify({ error: 'Failed to create ingredient' });
    }
  }

  private async handleGetNutrition(ingredientId: string): Promise<string> {
    // Check cache first — NutritionService also checks but this avoids an extra DB round-trip
    const cached = await prisma.foodNutrition.findUnique({ where: { ingredientId } });
    if (cached) return JSON.stringify(cached);

    // Cache miss — invoke LLM Nutrition Resolver via NutritionService
    const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ingredient) return JSON.stringify({ error: 'Ingredient not found' });

    const result = await NutritionService.lookupOrResolve(ingredientId, ingredient.name);
    return JSON.stringify(result ?? { error: 'Nutrition data could not be resolved for this ingredient' });
  }

  private async handleGetUserPantry(userId: string): Promise<string> {
    const pantry = await prisma.pantry.findFirst({
      where: { userId },
      include: {
        pantryItems: {
          include: { ingredient: true },
        },
      },
    });
    if (!pantry) return JSON.stringify({ items: [] });
    return JSON.stringify({
      items: pantry.pantryItems.map((item) => ({
        ingredient: item.ingredient.name,
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        unit: item.unit,
        expiresAt: item.expiresAt,
      })),
    });
  }

  private async handleCalculateRecipeNutrition(
    ingredients: Array<{ ingredientId: string; quantity: number; unit: string }>,
    servings: number
  ): Promise<AgentRecipeResult['nutrition']> {
    let calories = 0, protein = 0, carbohydrates = 0, fat = 0, fiber = 0;

    for (const item of ingredients) {
      const nutrition = await prisma.foodNutrition.findUnique({
        where: { ingredientId: item.ingredientId },
      });
      if (!nutrition) continue;

      const scale = (item.quantity / nutrition.basisQty) / servings;
      calories     += nutrition.calories * scale;
      protein      += nutrition.protein * scale;
      carbohydrates += nutrition.carbs * scale;
      fat          += nutrition.fat * scale;
      fiber        += nutrition.fiber * scale;
    }

    return {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbohydrates: Math.round(carbohydrates),
      fat: Math.round(fat),
      fiber: Math.round(fiber),
    };
  }

  private async handleValidateRecipe(
    recipe: { nutrition?: { calories?: number }; ingredients?: Array<{ ingredient: string }> },
    constraints: { calorieTarget?: number; dietaryPreferences?: string[] }
  ): Promise<string> {
    const failures: string[] = [];

    if (constraints.calorieTarget && recipe.nutrition?.calories) {
      if (recipe.nutrition.calories > constraints.calorieTarget) {
        failures.push(`Calorie target exceeded: ${recipe.nutrition.calories} > ${constraints.calorieTarget} kcal`);
      }
    }

    return JSON.stringify({
      passed: failures.length === 0,
      failures,
    });
  }

  private async handleSaveRecipe(args: {
    userId: string;
    name: string;
    description: string;
    servings: number;
    cuisineType: string;
    tags: string[];
    cookingTimeMinutes?: number;
    ingredients: Array<{ ingredient: string; quantity: number; unit: string }>;
    steps?: Array<{ step: number; instruction: string }>;
  }): Promise<string> {
    // Actual DB save happens in the route handler after the agent returns.
    // This tool call is a signal to the model that the recipe is finalized.
    // The route handler receives the AgentRecipeResult and persists it.
    return JSON.stringify({ status: 'recipe_finalized', name: args.name });
  }

  private async handleGetRecipe(recipeId: string): Promise<string> {
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        recipeVersions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        recipeIngredients: { include: { ingredient: true } },
        recipeTags: { include: { tag: true } },
      },
    });
    if (!recipe) return JSON.stringify({ error: 'Recipe not found' });
    return JSON.stringify(recipe);
  }

  // ─── Workflow 3: Cooking Assistant ────────────────────────────────────────

  async cookingChat(params: {
    systemPrompt: string;
    chatHistory: { role: 'user' | 'assistant'; content: string }[];
    userMessage: string;
  }): Promise<string> {
    const { systemPrompt, chatHistory, userMessage } = params;

    // Phase 4 placeholder: add send_photo(imageBase64) vision tool here

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
        { role: 'user', content: userMessage },
      ],
    });

    return response.choices[0].message.content ?? '';
  }
}
