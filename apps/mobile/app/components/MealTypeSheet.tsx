import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Modal, Portal, Text, List, Divider } from 'react-native-paper';

type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

interface MealTypeSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (mealType: MealType) => void;
}

const MEAL_TYPES: { value: MealType; label: string; icon: string }[] = [
  { value: 'BREAKFAST', label: 'Breakfast', icon: 'weather-sunny' },
  { value: 'LUNCH', label: 'Lunch', icon: 'weather-partly-cloudy' },
  { value: 'DINNER', label: 'Dinner', icon: 'weather-night' },
  { value: 'SNACK', label: 'Snack', icon: 'food-apple-outline' },
];

/**
 * MealTypeSheet — bottom sheet modal for selecting BREAKFAST / LUNCH / DINNER / SNACK.
 * Used on Recipe Detail to log a meal.
 */
export default function MealTypeSheet({ visible, onDismiss, onSelect }: MealTypeSheetProps) {
  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
      >
        <Text variant="titleMedium" style={styles.heading}>Log as which meal?</Text>
        <Divider style={styles.divider} />
        {MEAL_TYPES.map((mt) => (
          <List.Item
            key={mt.value}
            title={mt.label}
            left={(props) => <List.Icon {...props} icon={mt.icon} />}
            onPress={() => onSelect(mt.value)}
          />
        ))}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 24,
    marginBottom: 40,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  heading: { padding: 16, fontWeight: '600' },
  divider: {},
});
