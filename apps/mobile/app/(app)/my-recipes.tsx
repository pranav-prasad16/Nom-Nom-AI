import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text, SegmentedButtons } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import RecipeCard from '../components/RecipeCard';

export default function MyRecipesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'generated' | 'saved'>('generated');
  const [generated, setGenerated] = useState<unknown[]>([]);
  const [saved, setSaved] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.recipes.my() as any;
        setGenerated(res.generated ?? []);
        setSaved(res.saved ?? []);
      } catch (err) {
        console.error('Failed to load my recipes:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const data = tab === 'generated' ? generated : saved;

  return (
    <View style={styles.container}>
      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as 'generated' | 'saved')}
        buttons={[
          { value: 'generated', label: 'Generated' },
          { value: 'saved', label: 'Saved' },
        ]}
        style={styles.tabs}
      />

      <FlatList
        data={data}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item as any}
            onPress={() => router.push(`/(app)/recipes/${(item as any).id}`)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>
              {tab === 'generated' ? 'No generated recipes yet.' : 'No saved recipes yet.'}
            </Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  tabs: { margin: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', marginTop: 48, color: '#666' },
});
