import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { Link } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!displayName || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      Alert.alert('Registration failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text variant="headlineMedium" style={styles.title}>
          🍽️ Create Account
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Join Nom Nom AI
        </Text>

        <TextInput
          label="Display Name"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          style={styles.input}
        />

        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />

        <Button
          mode="contained"
          onPress={handleRegister}
          loading={loading}
          disabled={loading}
          style={styles.button}
        >
          Create Account
        </Button>

        <Link href="/(auth)/login" asChild>
          <Button mode="text">Already have an account? Sign In</Button>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { textAlign: 'center', fontWeight: 'bold', marginBottom: 4 },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: 16 },
  input: { backgroundColor: '#fff' },
  button: { marginTop: 8 },
});
