import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#e91e63',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="globe-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="generate"
        options={{
          title: 'Generate',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-recipes"
        options={{
          title: 'My Recipes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
      {/* Hidden screens — not shown in tab bar */}
      <Tabs.Screen name="pantry" options={{ href: null }} />
      <Tabs.Screen name="nutrition-log" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="recipes/[id]" options={{ href: null }} />
      <Tabs.Screen name="cooking/[sessionId]" options={{ href: null }} />
      {/* meal-log and meal-plans removed — out of scope for Phase 1 */}
    </Tabs>
  );
}
