import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { api } from '../lib/api';

/**
 * DashboardScreen — daily nutrition targets vs consumed.
 *
 * Data source: GET /api/dashboard (computed server-side — no AI, pure query logic)
 *
 * Shows:
 *   - Macro progress (consumed vs target) for calories, protein, carbs, fat, fiber
 *   - Today's logged meals
 *
 * Sub-Task 14 will add MacroProgressBar visual components.
 */

type MacroKey = 'calories' | 'protein' | 'carbohydrates' | 'fat' | 'fiber';

type DashboardData = {
  targets: Partial<Record<MacroKey, number>>;
  consumed: Record<MacroKey, number>;
  remaining: Partial<Record<MacroKey, number>>;
  logs: Array<{
    id: string;
    loggedAt: string;
    mealType?: string;
    servings: number;
    recipe: { id: string; title: string };
    nutrition: Record<MacroKey, number>;
  }>;
};

const MACRO_LABELS: Record<MacroKey, string> = {
  calories: 'Calories (kcal)',
  protein: 'Protein (g)',
  carbohydrates: 'Carbs (g)',
  fat: 'Fat (g)',
  fiber: 'Fiber (g)',
};

export default function DashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await api.dashboard.get() as DashboardData;
      setData(result);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Could not load dashboard. Pull to refresh.</Text>
      </View>
    );
  }

  const macros: MacroKey[] = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber'];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text variant="titleLarge" style={styles.heading}>Today's Nutrition</Text>

      {/* Macro progress — Sub-Task 14 will replace this with MacroProgressBar components */}
      {macros.map((key) => {
        const target = data.targets[key];
        const consumed = data.consumed[key] ?? 0;
        const remaining = data.remaining[key];
        if (target === undefined) return null;
        return (
          <View key={key} style={styles.macroRow}>
            <Text variant="bodyMedium" style={styles.macroLabel}>{MACRO_LABELS[key]}</Text>
            <Text variant="bodySmall" style={styles.macroValues}>
              {consumed} / {target}{remaining !== undefined ? ` · ${remaining} remaining` : ''}
            </Text>
          </View>
        );
      })}

      {/* Today's log entries */}
      {data.logs.length > 0 && (
        <>
          <Text variant="titleMedium" style={styles.sectionHeading}>Today's meals</Text>
          {data.logs.map((log) => (
            <View key={log.id} style={styles.logRow}>
              <Text variant="bodyMedium">{log.recipe.title}</Text>
              <Text variant="bodySmall" style={styles.logMeta}>
                {log.servings} serving{log.servings !== 1 ? 's' : ''}
                {log.mealType ? ` · ${log.mealType}` : ''}
                {' · '}{log.nutrition.calories} kcal
              </Text>
            </View>
          ))}
        </>
      )}

      {data.logs.length === 0 && (
        <Text style={styles.empty}>No meals logged today.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { marginBottom: 12 },
  macroRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  macroLabel: { fontWeight: '600' },
  macroValues: { color: '#57606a', marginTop: 2 },
  sectionHeading: { marginTop: 24, marginBottom: 8 },
  logRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  logMeta: { color: '#666', marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 48, color: '#666' },
});
