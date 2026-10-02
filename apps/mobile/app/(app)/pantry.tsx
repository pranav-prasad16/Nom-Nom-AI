import React, { useEffect, useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import { Text, FAB, Searchbar, List, IconButton } from 'react-native-paper';
import { api } from '../lib/api';

export default function PantryScreen() {
  const [items, setItems] = useState<unknown[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  const fetchPantry = useCallback(async () => {
    try {
      const pantry = await api.pantry.get() as any;
      setItems(pantry.pantryItems ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPantry(); }, [fetchPantry]);

  const onSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    const results = await api.ingredients.search(q) as unknown[];
    setSearchResults(results);
  };

  const addItem = async (ingredient: any) => {
    try {
      await api.pantry.addItem({
        ingredientId: ingredient.id,
        quantity: 1,
        unit: 'unit',
      });
      setSearchQuery('');
      setSearchResults([]);
      fetchPantry();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add item');
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await api.pantry.deleteItem(id);
      setItems((prev) => (prev as any[]).filter((i: any) => i.id !== id));
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to remove item');
    }
  };

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search ingredients to add..."
        value={searchQuery}
        onChangeText={onSearch}
        style={styles.search}
      />

      {searchResults.length > 0 && (
        <View style={styles.searchResults}>
          {(searchResults as any[]).map((r: any) => (
            <List.Item
              key={r.id}
              title={r.name}
              description={r.category}
              onPress={() => addItem(r)}
              right={(props) => <List.Icon {...props} icon="plus" />}
            />
          ))}
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }: { item: any }) => (
          <List.Item
            title={item.ingredient?.name}
            description={`${item.quantity} ${item.unit}`}
            right={() => (
              <IconButton icon="delete-outline" onPress={() => deleteItem(item.id)} />
            )}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : <Text style={styles.empty}>Your pantry is empty.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  search: { margin: 16 },
  searchResults: { backgroundColor: '#f9f9f9', marginHorizontal: 16, borderRadius: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 80 },
  empty: { textAlign: 'center', marginTop: 48, color: '#666' },
});
