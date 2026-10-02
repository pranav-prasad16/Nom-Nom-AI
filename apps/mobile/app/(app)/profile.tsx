import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Divider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="headlineSmall" style={styles.heading}>
        {user?.displayName ?? 'Profile'}
      </Text>
      <Text variant="bodyMedium" style={styles.email}>
        {user?.email}
      </Text>

      <Divider style={styles.divider} />

      <Button
        mode="outlined"
        icon="fridge-outline"
        onPress={() => router.push('/(app)/pantry')}
        style={styles.item}
      >
        My Pantry
      </Button>

      <Button
        mode="outlined"
        icon="notebook-outline"
        onPress={() => router.push('/(app)/meal-log')}
        style={styles.item}
      >
        Meal Log
      </Button>

      <Button
        mode="outlined"
        icon="calendar-month-outline"
        onPress={() => router.push('/(app)/meal-plans')}
        style={styles.item}
      >
        Meal Plans
      </Button>

      <Divider style={styles.divider} />

      <Button
        mode="text"
        icon="logout"
        onPress={logout}
        style={styles.logout}
        textColor="#e91e63"
      >
        Sign Out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 12 },
  heading: { fontWeight: 'bold' },
  email: { color: '#666', marginBottom: 8 },
  divider: { marginVertical: 8 },
  item: { justifyContent: 'flex-start' },
  logout: { marginTop: 8 },
});
