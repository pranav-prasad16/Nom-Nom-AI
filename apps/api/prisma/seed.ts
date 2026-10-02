import { PrismaClient, DietaryPreferenceType, IngredientCategory } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Dietary Preferences ──────────────────────────────────────────────────
  // Each row has two separate text fields:
  //   description   → human-readable tooltip shown in the UI preference picker
  //   llmConstraint → explicit FORBIDDEN/ALLOWED list injected into Recipe Agent / Cooking Agent system prompts
  const dietaryPrefData: {
    name: DietaryPreferenceType;
    description: string;
    llmConstraint: string;
  }[] = [
    {
      name: DietaryPreferenceType.VEGETARIAN,
      description:
        'No meat, fish, or eggs. Dairy products like milk, paneer, ghee, and curd are allowed.',
      llmConstraint:
        'VEGETARIAN: FORBIDDEN: meat (chicken, mutton, pork, lamb, goat), fish, seafood (prawns, crabs, shellfish), eggs, any stock or broth made from meat or fish. ALLOWED: dairy (milk, paneer, ghee, curd, butter, cheese), all vegetables, legumes, lentils, grains, fruits, nuts, seeds.',
    },
    {
      name: DietaryPreferenceType.VEGAN,
      description:
        'No animal products at all — no meat, fish, eggs, dairy, or honey.',
      llmConstraint:
        'VEGAN: FORBIDDEN: meat (chicken, mutton, pork, lamb, goat), fish, seafood, eggs, all dairy (milk, paneer, ghee, curd, butter, cheese, cream), honey, any ingredient derived from animals. ALLOWED: all vegetables, legumes, lentils, grains, fruits, nuts, seeds, plant-based oils, plant-based milk (coconut milk, almond milk).',
    },
    {
      name: DietaryPreferenceType.NONVEGETARIAN,
      description:
        'No dietary restrictions — all ingredients including meat (chicken, mutton, pork, lamb, goat), fish, eggs, and dairy are allowed.',
      llmConstraint:
        'NON_VEGETARIAN: No major ingredient restrictions. All ingredients are permitted including meat (chicken, mutton, pork, lamb, goat), fish, seafood, eggs, and dairy. Recipes may use any combination of animal and plant-based ingredients. NOTE: beef is strictly excluded.',
    },
    {
      name: DietaryPreferenceType.PESCATARIAN,
      description:
        'No meat, but fish and seafood are allowed. Eggs and dairy are also included.',
      llmConstraint:
        'PESCATARIAN: FORBIDDEN: meat (chicken, mutton, pork, lamb, goat). ALLOWED: fish, seafood (prawns, crabs, shellfish), eggs, dairy (milk, paneer, ghee, curd, butter, cheese), all vegetables, legumes, lentils, grains, fruits, nuts.',
    },
    {
      name: DietaryPreferenceType.EGGETARIAN,
      description:
        'Vegetarian diet that also includes eggs. No meat or fish.',
      llmConstraint:
        'EGGETARIAN: FORBIDDEN: meat (chicken, mutton, pork, lamb, goat), fish, seafood (prawns, crabs, shellfish). ALLOWED: eggs (in any form — boiled, fried, as ingredient), dairy (milk, paneer, ghee, curd, butter, cheese), all vegetables, legumes, lentils, grains, fruits, nuts.',
    },
    {
      name: DietaryPreferenceType.SATVIC,
      description:
        'A pure plant-based diet that avoids stimulants like onion, garlic, and excessive spice. Rooted in Ayurvedic principles.',
      llmConstraint:
        'SATVIC: FORBIDDEN: meat, fish, seafood, eggs, onion, garlic, leek, shallots, chives, overly spicy ingredients (chilli in excess), stale or reheated food, processed food, alcohol, caffeine. ALLOWED: fresh above-ground vegetables, dairy (milk, ghee, curd), grains (rice, wheat), lentils, fruits, nuts, mild spices (cumin, coriander, turmeric, small amounts of ginger), natural sweeteners (jaggery, honey).',
    },
    {
      name: DietaryPreferenceType.JAIN,
      description:
        'No meat, fish, eggs, or any root vegetables. Only above-ground plant ingredients, following Jain dietary principles.',
      llmConstraint:
        'JAIN: FORBIDDEN: meat, fish, seafood, eggs, all root vegetables (onion, garlic, potato, carrot, beetroot, radish, turnip, sweet potato, yam, ginger root — dry ginger powder is permitted), any ingredient grown underground. ALLOWED: above-ground vegetables (tomato, spinach, bottle gourd, ridge gourd, capsicum, etc.), lentils, legumes (chickpeas, rajma), grains (rice, wheat), dairy (milk, paneer, ghee, curd), fruits, nuts, dry spices including dry ginger powder.',
    },
  ];

  const dietaryPrefs = await Promise.all(
    dietaryPrefData.map((pref) =>
      prisma.dietaryPreference.upsert({
        where: { name: pref.name },
        update: { description: pref.description, llmConstraint: pref.llmConstraint },
        create: pref,
      })
    )
  );

  console.log(`✅ Created ${dietaryPrefs.length} dietary preferences`);

  // ─── Tags ─────────────────────────────────────────────────────────────────
  const tagNames = ['QUICK', 'FANCY', 'HEALTHY', 'COMFORT', 'OTHER'];
  const tags = await Promise.all(
    tagNames.map((name) =>
      prisma.tag.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  console.log(`✅ Created ${tags.length} tags`);

  // ─── Ingredients ──────────────────────────────────────────────────────────
  // Spices (cumin, turmeric, coriander, chili, mustard seeds) are intentionally excluded.
  // They are assumed always available — see Recipe Agent system prompt rule 14.
  // Garlic, ginger, and onion are vegetables (not spices) — they have meaningful macro contribution.
  const ingredientData: { name: string; category: IngredientCategory; aliases: string[] }[] = [
    { name: 'potato',    category: IngredientCategory.VEGETABLE, aliases: ['aloo', 'aalu', 'batata'] },
    { name: 'onion',     category: IngredientCategory.VEGETABLE, aliases: ['pyaaz', 'kanda'] },
    { name: 'tomato',    category: IngredientCategory.VEGETABLE, aliases: ['tamatar', 'tameta'] },
    { name: 'garlic',    category: IngredientCategory.VEGETABLE, aliases: ['lahsun', 'lasun'] },
    { name: 'ginger',    category: IngredientCategory.VEGETABLE, aliases: ['adrak', 'adrakh'] },
    { name: 'spinach',   category: IngredientCategory.VEGETABLE, aliases: ['palak'] },
    { name: 'paneer',    category: IngredientCategory.DAIRY,     aliases: ['cottage cheese', 'fresh cheese'] },
    { name: 'chickpeas', category: IngredientCategory.LEGUME,    aliases: ['chana', 'chole', 'garbanzo'] },
    { name: 'lentils',   category: IngredientCategory.LEGUME,    aliases: ['dal', 'daal', 'masoor'] },
    { name: 'rice',      category: IngredientCategory.GRAIN,     aliases: ['chawal', 'basmati'] },
  ];

  const ingredients: Record<string, string> = {};

  for (const data of ingredientData) {
    const ingredient = await prisma.ingredient.upsert({
      where: { name: data.name },
      update: {},
      create: {
        name: data.name,
        category: data.category,
        ingredientAliases: {
          create: data.aliases.map((alias) => ({ alias })),
        },
      },
    });
    ingredients[data.name] = ingredient.id;
  }

  console.log(`✅ Created ${Object.keys(ingredients).length} ingredients with aliases`);

  // ─── Seed User ────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('seedpassword123', 12);
  const seedUser = await prisma.user.upsert({
    where: { email: 'seed@nomnomapp.ai' },
    update: {},
    create: {
      email: 'seed@nomnomapp.ai',
      passwordHash,
      userProfile: { create: { displayName: 'Nom Nom Chef', bio: 'Curated seed recipes' } },
    },
  });

  console.log(`✅ Created seed user: ${seedUser.email}`);

  // ─── Curated Seed Recipes ─────────────────────────────────────────────────
  const recipes = [
    {
      title: 'Aloo Gobi',
      description:
        'A classic North Indian dry curry made with potatoes and cauliflower. ' +
        'Tempered with cumin seeds in hot oil, then cooked with turmeric, coriander, ' +
        'and green chili until tender. Finished with fresh coriander leaves. ' +
        'Simple, wholesome, and ready in 30 minutes.',
      tag: 'HEALTHY',
      ingredients: ['potato', 'turmeric', 'cumin', 'coriander', 'chili'],
    },
    {
      title: 'Dal Tadka',
      description:
        'Yellow lentils slow-cooked until creamy, then topped with a sizzling tadka of ' +
        'ghee, cumin seeds, garlic, and dried red chili. A staple of Indian home cooking ' +
        'that pairs perfectly with steamed rice or fresh roti.',
      tag: 'COMFORT',
      ingredients: ['lentils', 'garlic', 'onion', 'tomato', 'cumin', 'turmeric'],
    },
    {
      title: 'Palak Paneer',
      description:
        'Fresh cottage cheese cubes nestled in a vibrant, velvety spinach gravy. ' +
        'The spinach is blanched and pureed with ginger and garlic, then enriched with ' +
        'cream and spices. A restaurant favourite that is surprisingly quick to make at home.',
      tag: 'FANCY',
      ingredients: ['paneer', 'spinach', 'garlic', 'ginger', 'onion', 'tomato'],
    },
    {
      title: 'Chana Masala',
      description:
        'Hearty chickpeas simmered in a tangy tomato and onion gravy spiced with chole ' +
        'masala, cumin, and dried mango powder. Bold, flavourful, and protein-packed. ' +
        'Serve with bhature, puri, or plain rice.',
      tag: 'HEALTHY',
      ingredients: ['chickpeas', 'onion', 'tomato', 'garlic', 'ginger', 'cumin', 'coriander'],
    },
    {
      title: 'Jeera Rice',
      description:
        'Fluffy basmati rice toasted with cumin seeds in ghee — the ultimate simple Indian ' +
        'side dish. Ready in under 20 minutes and pairs with almost any dal, curry, or sabzi.',
      tag: 'QUICK',
      ingredients: ['rice', 'cumin', 'mustard seeds'],
    },
    {
      title: 'Masoor Dal',
      description:
        'Red lentils cooked until smooth and tempered with a simple tarka of cumin, mustard ' +
        'seeds, garlic, and fresh tomato. A light, nourishing everyday dal that comes together ' +
        'in 25 minutes. Perfect with rice or chapati.',
      tag: 'QUICK',
      ingredients: ['lentils', 'tomato', 'onion', 'garlic', 'cumin', 'mustard seeds', 'turmeric'],
    },
    {
      title: 'Aloo Sabzi',
      description:
        'A simple North Indian potato stir-fry spiced with cumin, turmeric, and coriander. ' +
        'Diced potatoes are pan-fried until crisp on the outside and fluffy within. ' +
        'A 20-minute comfort dish that works as a side or a quick lunch with roti.',
      tag: 'QUICK',
      ingredients: ['potato', 'onion', 'cumin', 'turmeric', 'coriander', 'mustard seeds'],
    },
  ];

  for (const data of recipes) {
    const tagRecord = await prisma.tag.findUnique({ where: { name: data.tag } });

    await prisma.recipe.create({
      data: {
        title: data.title,
        cuisineType: 'NORTH_INDIAN',  // CuisineType enum value — seed recipes are North Indian
        isPublished: true,
        authorId: seedUser.id,
        recipeVersions: {
          create: {
            versionNumber: 1,
            description: data.description,
            servings: 2,              // seed recipes default to 2 servings — required, no DB default
            aiPromptUsed: null,
          },
        },
        recipeTags: tagRecord
          ? { create: [{ tagId: tagRecord.id }] }
          : undefined,
        recipeIngredients: {
          create: data.ingredients
            .filter((name) => ingredients[name])
            .map((name) => ({
              ingredientId: ingredients[name],
              quantity: 1,
              unit: 'serving',
            })),
        },
      },
    });
  }

  console.log(`✅ Created ${recipes.length} curated seed recipes (all published)`);
  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
