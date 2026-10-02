import React, { useEffect, useState } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Text, Divider, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import RecipeCard from '../../components/RecipeCard';

export default function MealPlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.mealPlans.getById(id) as any;
        setPlan(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <ActivityIndicator style={styles.loader} />;
  if (!plan) return <Text style={styles.error}>Meal plan not found.</Text>;

  // Group items by day
  const byDay: Record<string, any[]> = {};
  for (const item of plan.mealPlanItems ?? []) {
    const day = new Date(item.scheduledDate).toISOString().split('T')[0];
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(item);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="headlineSmall" style={styles.title}>{plan.name}</Text>
      <Text variant="bodySmall" style={styles.dates}>
        {new Date(plan.startDate).toLocaleDateString()} – {new Date(plan.endDate).toLocaleDateString()}
      </Text>

      {Object.entries(byDay).map(([day, items]) => (
        <View key={day} style={styles.day}>
          <Text variant="titleMedium" style={styles.dayTitle}>{day}</Text>
          <Text variant="bodySmall" style={styles.dayCalories}>
            {plan.dailyCalorieTotals?.[day] ?? 0} kcal
          </Text>
          <Divider style={styles.divider} />
          {items.map((item: any) => (
            <View key={item.id}>
              <Text variant="labelSmall" style={styles.mealType}>{item.mealType}</Text>
              <RecipeCard
                recipe={item.recipe}
                onPress={() => router.push(`/(app)/recipes/${item.recipe.id}`)}
              />
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 16 },
  loader: { marginTop: 80 },
  error: { textAlign: 'center', marginTop: 80, color: '#666' },
  title: { fontWeight: 'bold' },
  dates: { color: '#888', marginBottom: 8 },
  day: { gap: 4 },
  dayTitle: { fontWeight: '600' },
  dayCalories: { color: '#888' },
  divider: { marginVertical: 4 },
  mealType: { color: '#e91e63', fontWeight: '700', marginBottom: 2 },
});
