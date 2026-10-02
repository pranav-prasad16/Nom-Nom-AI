import React, { useEffect, useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Text, Card, Divider } from 'react-native-paper';
import { api } from '../lib/api';

/**
 * NutritionLogScreen — replaces meal-log.tsx.
 *
 * Shows logs grouped by day with daily macro totals (calories, protein, carbs, fat, fiber).
 * Data source: GET /api/nutrition-log
 *
 * Sub-Task 15 will add the "Add Food" flow for logging existing or new user-created recipes.
 */

type DayGroup = {
  date: string;
  totals: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
    fiber: number;
  };
  entries: Array<{
    id: string;
    loggedAt: string;
    mealType?: string;
    servings: number;
    recipe: { id: string; title: string };
    nutrition: { calories: number; protein: number; carbohydrates: number; fat: number; fiber: number };
  }>;
};

export default function NutritionLogScreen() {
  const [days, setDays] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await api.nutritionLog.get() as DayGroup[];
      setDays(data);
    } catch (err) {
      console.error('Failed to load nutrition log:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  return (
    <FlatList
      data={days}
      keyExtractor={(item) => item.date}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      renderItem={({ item }) => (
        <View style={styles.dayBlock}>
          <View style={styles.dayHeader}>
            <Text variant="titleMedium">{item.date}</Text>
            <Text variant="bodySmall" style={styles.calories}>
              {item.totals.calories} kcal · {item.totals.protein}g protein
            </Text>
          </View>
          <Divider />
          {item.entries.map((entry) => (
            <Card key={entry.id} style={styles.entryCard}>
              <Card.Content>
                <Text variant="bodyMedium">{entry.recipe?.title}</Text>
                <Text variant="bodySmall" style={styles.meta}>
                  {entry.servings} serving{entry.servings !== 1 ? 's' : ''}
                  {entry.mealType ? ` · ${entry.mealType}` : ''}
                  {' · '}{entry.nutrition.calories} kcal
                </Text>
              </Card.Content>
            </Card>
          ))}
        </View>
      )}
      ListEmptyComponent={
        loading ? null : (
          <Text style={styles.empty}>No nutrition logs yet. Start logging your meals!</Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 16 },
  dayBlock: { gap: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calories: { color: '#888' },
  entryCard: { marginTop: 4 },
  meta: { color: '#666', marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 48, color: '#666' },
});
