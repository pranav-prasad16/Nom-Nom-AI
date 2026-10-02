/**
 * api.ts — Central API client for Nom Nom AI mobile app.
 *
 * - Reads EXPO_PUBLIC_API_URL for base URL
 * - Automatically attaches Authorization: Bearer <token> when token is present
 * - All screens import from this file — never construct fetch calls directly
 */

import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
export const TOKEN_KEY = 'nom_nom_jwt';

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getToken();

  let url = `${BASE_URL}${path}`;

  if (options.params) {
    const qs = Object.entries(options.params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((errorBody as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    register: (data: { email: string; password: string; displayName: string }) =>
      request<{ token: string; user: { id: string; email: string; displayName: string } }>(
        '/api/auth/register',
        { method: 'POST', body: data }
      ),

    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: { id: string; email: string; displayName?: string } }>(
        '/api/auth/login',
        { method: 'POST', body: data }
      ),

    me: () => request<Record<string, unknown>>('/api/auth/me'),

    addGoal: (data: { goalType: string; targetValue?: number; unit?: string }) =>
      request('/api/auth/goals', { method: 'POST', body: data }),

    getGoals: () => request('/api/auth/goals'),

    setDietaryPreferences: (preferenceIds: string[]) =>
      request('/api/auth/dietary-preferences', { method: 'POST', body: { preferenceIds } }),
  },

  // ─── Recipes ────────────────────────────────────────────────────────────────

  recipes: {
    generate: (data: {
      ingredients: string[];
      servings?: number;
      mealType?: string;
      tagPreference?: string;
      cuisine?: string;
      calorieTarget?: number;
      dietaryConstraints?: string[];
      naturalLanguageRequest?: string;
    }) => request('/api/recipes/generate', { method: 'POST', body: data }),

    getById: (id: string) => request(`/api/recipes/${id}`),

    my: () => request('/api/recipes/my'),

    save: (id: string) => request(`/api/recipes/${id}/save`, { method: 'POST' }),

    unsave: (id: string) => request(`/api/recipes/${id}/save`, { method: 'DELETE' }),

    publish: (id: string) => request(`/api/recipes/${id}/publish`, { method: 'POST' }),
  },

  // ─── Feed ───────────────────────────────────────────────────────────────────

  feed: {
    get: (params?: { page?: number; limit?: number; tag?: string; cuisine?: string }) =>
      request('/api/feed', { params }),
  },

  // ─── Ingredients ────────────────────────────────────────────────────────────

  ingredients: {
    search: (q: string) => request('/api/ingredients/search', { params: { q } }),
  },

  // ─── Pantry ─────────────────────────────────────────────────────────────────

  pantry: {
    get: () => request('/api/pantry'),

    addItem: (data: {
      ingredientId: string;
      quantity: number;
      unit: string;
      expiresAt?: string;
    }) => request('/api/pantry/items', { method: 'POST', body: data }),

    updateItem: (id: string, data: { quantity?: number; unit?: string; expiresAt?: string }) =>
      request(`/api/pantry/items/${id}`, { method: 'PATCH', body: data }),

    deleteItem: (id: string) => request(`/api/pantry/items/${id}`, { method: 'DELETE' }),
  },

  // ─── Nutrition Log ──────────────────────────────────────────────────────────
  // Replaces mealLog — uses NutritionLog model with servings + optional mealType.

  nutritionLog: {
    log: (data: { recipeId: string; servings?: number; mealType?: string }) =>
      request('/api/nutrition-log', { method: 'POST', body: data }),

    get: () => request('/api/nutrition-log'),

    createAndLog: (data: {
      recipeName: string;
      servings?: number;
      mealType?: string;
      ingredients: Array<{ ingredientId: string; quantity: number; unit: string }>;
    }) => request('/api/nutrition-log/recipe', { method: 'POST', body: data }),
  },

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  dashboard: {
    get: () => request('/api/dashboard'),
  },

  // ─── Suggestions ────────────────────────────────────────────────────────────

  suggestions: {
    get: () => request('/api/suggestions'),
  },

  // Meal Plans removed — Meal Planner Agent is out of scope for Phase 1.
  // See plan Section 16 (Out of Scope) and Section 11 (Phase 3 roadmap).

  // ─── Cooking Assistant ───────────────────────────────────────────────────────

  cooking: {
    startSession: (recipeId: string) =>
      request<{ sessionId: string; recipe: { id: string; title: string; totalSteps: number } }>(
        '/api/cooking/sessions',
        { method: 'POST', body: { recipeId } }
      ),

    sendMessage: (sessionId: string, message: string) =>
      request<{ reply: string }>(`/api/cooking/sessions/${sessionId}/message`, {
        method: 'POST',
        body: { message },
      }),

    nextStep: (sessionId: string) =>
      request<{ currentStep: number; completedSteps: number[] }>(
        `/api/cooking/sessions/${sessionId}/step`,
        { method: 'POST' }
      ),

    endSession: (sessionId: string) =>
      request(`/api/cooking/sessions/${sessionId}`, { method: 'DELETE' }),
  },
};
