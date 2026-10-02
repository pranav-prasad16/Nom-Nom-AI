import React, { useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, IconButton, Chip, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function CookingScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  // End session on unmount
  useEffect(() => {
    return () => {
      api.cooking.endSession(sessionId).catch(() => {});
    };
  }, [sessionId]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.cooking.sendMessage(sessionId, userMsg.content);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const nextStep = async () => {
    try {
      const res = await api.cooking.nextStep(sessionId);
      setStepIndex(res.currentStepIndex);
    } catch (err) {
      console.error(err);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
      <Text
        variant="bodyMedium"
        style={item.role === 'user' ? styles.userText : styles.aiText}
      >
        {item.content}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Step indicator */}
      <View style={styles.stepBar}>
        <Chip icon="counter" compact>Step {stepIndex + 1}</Chip>
        <Chip icon="chevron-right" compact onPress={nextStep} style={styles.nextStepBtn}>
          Next Step
        </Chip>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Ask me anything about this recipe! I'm here to help you cook. 🍳
          </Text>
        }
      />

      {loading && <ActivityIndicator style={styles.loader} />}

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask a question..."
          style={styles.input}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <IconButton
          icon="send"
          mode="contained"
          onPress={sendMessage}
          disabled={loading || !input.trim()}
          containerColor="#e91e63"
          iconColor="#fff"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  stepBar: { flexDirection: 'row', padding: 12, gap: 8, alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee' },
  nextStepBtn: { backgroundColor: '#e91e63' },
  messages: { padding: 16, gap: 8, paddingBottom: 16 },
  bubble: { maxWidth: '80%', borderRadius: 12, padding: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#e91e63' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#f4f4f4' },
  userText: { color: '#fff' },
  aiText: { color: '#1a1a1a' },
  empty: { textAlign: 'center', marginTop: 40, color: '#888', paddingHorizontal: 32 },
  loader: { marginVertical: 8 },
  inputRow: { flexDirection: 'row', padding: 8, gap: 4, borderTopWidth: 1, borderColor: '#eee', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#fff', maxHeight: 120 },
});
