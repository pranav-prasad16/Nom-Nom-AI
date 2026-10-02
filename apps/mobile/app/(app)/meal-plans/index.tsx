/**
 * meal-plans/index.tsx — OUT OF SCOPE for Phase 1.
 *
 * The Meal Planner Agent and AI-powered meal plan generation are removed from Phase 1.
 * See plan Section 16 (Explicitly Out of Scope) and Section 11 (Phase 3 roadmap).
 *
 * This file is kept as a stub to prevent import errors.
 * Phase 3 will reintroduce MealPlan, MealPlanItem tables and this screen.
 */

import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

export default function MealPlansStub() {
  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.text}>
        Meal Planning is coming in Phase 3.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  text: { textAlign: 'center', color: '#57606a' },
});
