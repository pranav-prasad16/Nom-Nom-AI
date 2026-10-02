import React, { useEffect, useState } from 'react';
import { ScrollView, View, StyleSheet, Alert } from 'react-native';
import { Text, Chip, Button, Divider, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import NutritionSummary from '../../components/NutritionSummary';
import MealTypeSheet from '../../components/MealTypeSheet';
import { useAuth } from '../../context/AuthContext';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mealSheetVisible, setMealSheetVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.recipes.getById(id) as any;
        setRecipe(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSave = async () => {
    try {
      await api.recipes.save(id);
      Alert.alert('Saved!', 'Recipe added to your saved list.');
    } catch {
      Alert.alert('Error', 'Could not save recipe');
    }
  };

  const handlePublish = async () => {
    try {
      await api.recipes.publish(id);
      Alert.alert('Published!', 'Recipe is now visible in the community feed.');
    } catch {
      Alert.alert('Error', 'Could not publish recipe');
    }
  };

  const handleLogMeal = async (mealType: string) => {
    try {
      await api.mealLog.log({ recipeId: id, mealType });
      Alert.alert('Logged!', `Recipe logged as ${mealType}.`);
    } catch {
      Alert.alert('Error', 'Could not log meal');
    }
  };

  const startCooking = async () => {
    try {
      const session = await api.cooking.startSession(id) as any;
      router.push(`/(app)/cooking/${session.sessionId}`);
    } catch {
      Alert.alert('Error', 'Could not start cooking session');
    }
  };

  if (loading) return <ActivityIndicator style={styles.loader} />;
  if (!recipe) return <Text style={styles.error}>Recipe not found.</Text>;

  const latestVersion = recipe.recipeVersions?.[0];
  const isAuthor = user?.id === recipe.authorId;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="headlineSmall" style={styles.title}>{recipe.title}</Text>

      <Text variant="bodySmall" style={styles.cuisine}>{recipe.cuisineType}</Text>

      {/* Tags */}
      <View style={styles.tags}>
        {(recipe.recipeTags ?? []).map((rt: any) => (
          <Chip key={rt.tagId} compact style={styles.tag}>{rt.tag?.name}</Chip>
        ))}
      </View>

      <Divider style={styles.divider} />

      {/* Description */}
      {latestVersion?.description && (
        <Text variant="bodyMedium" style={styles.description}>
          {latestVersion.description}
        </Text>
      )}

      <Divider style={styles.divider} />

      {/* Ingredients */}
      <Text variant="titleSmall" style={styles.sectionTitle}>Ingredients</Text>
      {(recipe.recipeIngredients ?? []).map((ri: any) => (
        <Text key={ri.id} variant="bodyMedium">
          • {ri.quantity} {ri.unit} {ri.ingredient?.name}
        </Text>
      ))}

      {/* Nutrition */}
      {recipe.nutritionData && <NutritionSummary nutrition={recipe.nutritionData} />}

      <Divider style={styles.divider} />

      {/* Actions */}
      <View style={styles.actions}>
        <Button mode="outlined" icon="bookmark-outline" onPress={handleSave}>
          Save
        </Button>
        <Button mode="outlined" icon="food-fork-drink" onPress={() => setMealSheetVisible(true)}>
          Log Meal
        </Button>
        {isAuthor && !recipe.isPublished && (
          <Button mode="outlined" icon="earth" onPress={handlePublish}>
            Publish
          </Button>
        )}
        <Button mode="contained" icon="chef-hat" onPress={startCooking} style={styles.cookBtn}>
          Start Cooking
        </Button>
      </View>

      {/* Meal type selector */}
      <MealTypeSheet
        visible={mealSheetVisible}
        onDismiss={() => setMealSheetVisible(false)}
        onSelect={(mealType) => {
          setMealSheetVisible(false);
          handleLogMeal(mealType);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, gap: 12 },
  loader: { marginTop: 80 },
  error: { textAlign: 'center', marginTop: 80, color: '#666' },
  title: { fontWeight: 'bold' },
  cuisine: { color: '#888' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {},
  divider: { marginVertical: 8 },
  description: { lineHeight: 22, color: '#333' },
  sectionTitle: { fontWeight: '600', marginBottom: 6 },
  actions: { gap: 10 },
  cookBtn: { backgroundColor: '#e91e63' },
});
