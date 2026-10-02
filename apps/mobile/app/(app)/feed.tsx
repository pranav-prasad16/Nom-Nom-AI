import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, View, StyleSheet, RefreshControl } from 'react-native';
import { Text, Chip } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import RecipeCard from '../components/RecipeCard';

const TAGS = ['QUICK', 'FANCY', 'HEALTHY', 'COMFORT'];
const CUISINES = ['Indian'];

export default function FeedScreen() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<unknown[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [selectedCuisine, setSelectedCuisine] = useState<string | undefined>();

  const fetchFeed = useCallback(async (nextPage = 1, reset = false) => {
    try {
      const res = await api.feed.get({
        page: nextPage,
        tag: selectedTag,
        cuisine: selectedCuisine,
      }) as any;

      const items = res.data ?? [];
      setRecipes((prev) => reset ? items : [...prev, ...items]);
      setPage(nextPage);
      setHasMore(nextPage < res.pagination?.totalPages);
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [selectedTag, selectedCuisine]);

  useEffect(() => { fetchFeed(1, true); }, [fetchFeed]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeed(1, true);
  };

  const loadMore = () => {
    if (hasMore) fetchFeed(page + 1);
  };

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <View style={styles.filters}>
        {TAGS.map((tag) => (
          <Chip
            key={tag}
            selected={selectedTag === tag}
            onPress={() => setSelectedTag(selectedTag === tag ? undefined : tag)}
            style={styles.chip}
            compact
          >
            {tag}
          </Chip>
        ))}
      </View>

      <FlatList
        data={recipes}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item as any}
            onPress={() => router.push(`/(app)/recipes/${(item as any).id}`)}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={<Text style={styles.empty}>No recipes in the feed yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  chip: { marginRight: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', marginTop: 48, color: '#666' },
});
