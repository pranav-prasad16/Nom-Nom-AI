import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, View, StyleSheet, RefreshControl } from 'react-native';
import { Text, FAB } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import RecipeCard from '../components/RecipeCard';

export default function HomeScreen() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    try {
      const data = await api.suggestions.get() as unknown[];
      setSuggestions(data);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSuggestions();
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={suggestions}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item as any}
            onPress={() => router.push(`/(app)/recipes/${(item as any).id}`)}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>No suggestions yet. Start cooking!</Text>
          )
        }
      />
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/(app)/generate')}
        label="Generate Recipe"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 16, paddingBottom: 80 },
  empty: { textAlign: 'center', marginTop: 48, color: '#666' },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: '#e91e63' },
});
