import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Card, Chip } from 'react-native-paper';

interface Recipe {
  id: string;
  title: string;
  cuisineType?: string;
  recipeTags?: { tag: { name: string } }[];
  recipeVersions?: { description: string }[];
  nutritionData?: { calories?: number } | null;
}

interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
}

/**
 * RecipeCard — shared card used on Home, Feed, My Recipes, Meal Plan Detail.
 * Shows title, tag badges, cuisine, calorie count, and description excerpt.
 */
export default function RecipeCard({ recipe, onPress }: RecipeCardProps) {
  const description = recipe.recipeVersions?.[0]?.description ?? '';
  const excerpt = description.length > 100 ? description.slice(0, 100) + '…' : description;
  const calories = recipe.nutritionData?.calories;

  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title} numberOfLines={2}>
            {recipe.title}
          </Text>
          {calories != null && (
            <Text variant="bodySmall" style={styles.calories}>
              {calories} kcal
            </Text>
          )}
        </View>

        <Text variant="bodySmall" style={styles.cuisine}>
          {recipe.cuisineType ?? 'Indian'}
        </Text>

        {(recipe.recipeTags ?? []).length > 0 && (
          <View style={styles.tags}>
            {(recipe.recipeTags ?? []).slice(0, 3).map((rt) => (
              <Chip key={rt.tag.name} compact style={styles.chip} textStyle={styles.chipText}>
                {rt.tag.name}
              </Chip>
            ))}
          </View>
        )}

        {excerpt ? (
          <Text variant="bodySmall" style={styles.excerpt} numberOfLines={3}>
            {excerpt}
          </Text>
        ) : null}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { flex: 1, fontWeight: '600', marginRight: 8 },
  calories: { color: '#e91e63', fontWeight: '600' },
  cuisine: { color: '#888', marginTop: 2, marginBottom: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  chip: { height: 22 },
  chipText: { fontSize: 10 },
  excerpt: { color: '#555', lineHeight: 18 },
});
