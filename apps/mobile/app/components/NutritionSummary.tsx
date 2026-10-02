import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

interface NutritionData {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface NutritionSummaryProps {
  nutrition: NutritionData;
}

/**
 * NutritionSummary — displays calories, protein, carbs, fat in a row.
 * Used on Recipe Detail screen.
 */
export default function NutritionSummary({ nutrition }: NutritionSummaryProps) {
  const items = [
    { label: 'Calories', value: `${nutrition.calories}`, unit: 'kcal' },
    { label: 'Protein', value: `${nutrition.protein}`, unit: 'g' },
    { label: 'Carbs', value: `${nutrition.carbs}`, unit: 'g' },
    { label: 'Fat', value: `${nutrition.fat}`, unit: 'g' },
  ];

  return (
    <View style={styles.container}>
      <Text variant="titleSmall" style={styles.heading}>Nutrition</Text>
      <View style={styles.row}>
        {items.map((item) => (
          <View key={item.label} style={styles.cell}>
            <Text variant="titleMedium" style={styles.value}>
              {item.value}
            </Text>
            <Text variant="labelSmall" style={styles.unit}>
              {item.unit}
            </Text>
            <Text variant="bodySmall" style={styles.label}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 12 },
  heading: { fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fce4ec',
    borderRadius: 8,
    padding: 10,
  },
  value: { fontWeight: 'bold', color: '#c2185b' },
  unit: { color: '#e91e63', fontSize: 10 },
  label: { color: '#666', marginTop: 2 },
});
