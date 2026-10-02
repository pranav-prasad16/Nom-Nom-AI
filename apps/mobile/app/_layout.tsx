import { Stack } from 'expo-router';
import { AuthProvider } from './context/AuthContext';
import { PaperProvider } from 'react-native-paper';

export default function RootLayout() {
  return (
    <AuthProvider>
      <PaperProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </PaperProvider>
    </AuthProvider>
  );
}
