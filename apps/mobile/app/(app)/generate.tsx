import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text, Chip } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import IngredientChip from '../components/IngredientChip';

const TAG_OPTIONS = ['QUICK', 'FANCY', 'HEALTHY', 'COMFORT'] as const;
type TagOption = typeof TAG_OPTIONS[number];

export default function GenerateScreen() {
  const router = useRouter();
  const [ingredientInput, setIngredientInput] = useState('');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<TagOption | null>(null);
  const [loading, setLoading] = useState(false);

  const addIngredient = () => {
    const trimmed = ingredientInput.trim();
    if (!trimmed) return;
    if (!ingredients.includes(trimmed)) {
      setIngredients((prev) => [...prev, trimmed]);
    }
    setIngredientInput('');
  };

  const removeIngredient = (name: string) => {
    setIngredients((prev) => prev.filter((i) => i !== name));
  };

  const generate = async () => {
    if (ingredients.length === 0) {
      Alert.alert('Add ingredients', 'Please add at least one ingredient to generate a recipe.');
      return;
    }

    setLoading(true);
    try {
      // Phase 2 placeholder: add camera input button here
      const recipe = await api.recipes.generate({
        ingredients,
        tagPreference: selectedTag ?? undefined,
        cuisine: 'Indian',
      }) as any;

      router.push(`/(app)/recipes/${recipe.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate recipe';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="headlineSmall" style={styles.heading}>
        What ingredients do you have?
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          value={ingredientInput}
          onChangeText={setIngredientInput}
          placeholder="e.g. potato, onion, cumin"
          style={styles.input}
          onSubmitEditing={addIngredient}
          returnKeyType="done"
        />
        <Button mode="contained" onPress={addIngredient} style={styles.addBtn}>
          Add
        </Button>
      </View>

      {/* Ingredient chips */}
      {ingredients.length > 0 && (
        <View style={styles.chips}>
          {ingredients.map((ing) => (
            <IngredientChip key={ing} label={ing} onRemove={() => removeIngredient(ing)} />
          ))}
        </View>
      )}

      <Text variant="titleSmall" style={styles.sectionTitle}>
        Recipe style (optional)
      </Text>

      <View style={styles.tagRow}>
        {TAG_OPTIONS.map((tag) => (
          <Chip
            key={tag}
            selected={selectedTag === tag}
            onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
            style={styles.chip}
          >
            {tag}
          </Chip>
        ))}
      </View>

      <Button
        mode="contained"
        onPress={generate}
        loading={loading}
        disabled={loading || ingredients.length === 0}
        style={styles.generateBtn}
        contentStyle={styles.generateBtnContent}
      >
        {loading ? 'Generating your recipe…' : '✨ Generate Recipe'}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 16 },
  heading: { fontWeight: 'bold', marginBottom: 8 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#fff' },
  addBtn: { marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { marginTop: 8, marginBottom: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {},
  generateBtn: { marginTop: 16, borderRadius: 8 },
  generateBtnContent: { paddingVertical: 8 },
});
