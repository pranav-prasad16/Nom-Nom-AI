import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';

interface IngredientChipProps {
  label: string;
  onRemove: () => void;
}

/**
 * IngredientChip — removable chip for each ingredient on the Generate screen.
 */
export default function IngredientChip({ label, onRemove }: IngredientChipProps) {
  return (
    <View style={styles.chip}>
      <Text variant="bodyMedium" style={styles.label}>
        {label}
      </Text>
      <TouchableOpacity onPress={onRemove} style={styles.removeBtn} hitSlop={8}>
        <Text style={styles.removeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fce4ec',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  label: { color: '#c2185b', fontSize: 13 },
  removeBtn: { padding: 2 },
  removeText: { color: '#c2185b', fontSize: 12, fontWeight: 'bold' },
});
