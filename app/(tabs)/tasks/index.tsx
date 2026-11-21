import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StatusChip } from '@/components/StatusChip';
import {
  answerAssistantQuery,
  type AssistantResponse,
} from '@/features/assistant/assistantEngine';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCountSessionStore } from '@/features/counting/countSessionStore';
import { useInventoryCatalog } from '@/features/inventory/useInventory';
import { evaluateAllScenarios } from '@/features/scenarios/scenarioEngine';
import { generateOperationalTasks } from '@/features/tasks/taskRules';
import { useTaskStore } from '@/features/tasks/taskStore';
import { useFeatureFlag } from '@/lib/flags';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

type FilterTab = 'all' | 'critical' | 'high' | 'normal' | 'done';

const FILTER_TABS: FilterTab[] = ['all', 'critical', 'high', 'normal', 'done'];

export default function TasksScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuth();
  const catalogQuery = useInventoryCatalog();
  const countSessions = useCountSessionStore((s) => s.sessions);
  const statusById = useTaskStore((s) => s.statusById);
  const markTask = useTaskStore((s) => s.markTask);

  const aiAssistantOn = useFeatureFlag('ai_assistant', profile?.hospital_id, profile?.id);

  const [filter, setFilter] = useState<FilterTab>('all');
  const [question, setQuestion] = useState('');
  const [assistantResult, setAssistantResult] = useState<AssistantResponse | null>(null);

  const snapshot = catalogQuery.data?.snapshot ?? null;

  const tasks = useMemo(() => generateOperationalTasks(snapshot), [snapshot]);
  const scenarios = useMemo(() => evaluateAllScenarios(snapshot), [snapshot]);

  const openTaskCount = useMemo(
    () => tasks.filter((task) => (statusById[task.id] ?? 'todo') !== 'done').length,
    [statusById, tasks],
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const currentStatus = statusById[task.id] ?? 'todo';
      if (filter === 'done') return currentStatus === 'done';
      if (currentStatus === 'done') return false;
      if (filter === 'all') return true;
      return task.priority === filter;
    });
  }, [filter, statusById, tasks]);

  const runAssistant = (promptText: string) => {
    const cleaned = promptText.trim();
    if (!cleaned) return;
    setQuestion(cleaned);
    const response = answerAssistantQuery(cleaned, {
      snapshot,
      scenarios,
      tasks,
      openTaskCount,
      countSessions,
    });
    setAssistantResult(response);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.heading, { color: colors.text }]}>{t('tasks.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('tasks.subtitle')}
        </Text>

        {/* Ask MedPulse Assistant Card (Section 5.9, MP-AST-001..005) */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.assistantHeader}>
            <MaterialCommunityIcons name="robot-outline" size={22} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('assistant.title')}
            </Text>
          </View>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {aiAssistantOn ? t('assistant.subtitle') : t('assistant.disabledMsg')}
          </Text>

          {aiAssistantOn ? (
            <>
              <View style={styles.chipRow}>
                {(
                  [
                    { key: 'expiring', query: 'What is expiring soon?' },
                    { key: 'low', query: 'Show items below PAR' },
                    { key: 'readiness', query: 'Show scenario readiness' },
                    { key: 'tasks', query: 'List open tasks' },
                  ] as const
                ).map((preset) => (
                  <Pressable
                    key={preset.key}
                    testID={`assistant-preset-${preset.key}`}
                    onPress={() => runAssistant(preset.query)}
                    accessibilityRole="button"
                    style={[
                      styles.presetChip,
                      { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.presetChipText, { color: colors.text }]}>
                      {t(`assistant.prompts.${preset.key}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.askRow}>
                <TextInput
                  testID="assistant-input"
                  value={question}
                  onChangeText={setQuestion}
                  placeholder={t('assistant.placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  onSubmitEditing={() => runAssistant(question)}
                  style={[
                    styles.askInput,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceSoft,
                    },
                  ]}
                />
                <Pressable
                  testID="assistant-ask-btn"
                  onPress={() => runAssistant(question)}
                  accessibilityRole="button"
                  style={[styles.askBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.askBtnText, { color: colors.onPrimary }]}>
                    {t('assistant.askBtn')}
                  </Text>
                </Pressable>
              </View>

              {assistantResult ? (
                <View
                  testID="assistant-response"
                  style={[
                    styles.answerCard,
                    { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.answerHeader}>
                    <StatusChip
                      variant="healthy"
                      label={t('assistant.toolBadge', { tool: assistantResult.toolUsed })}
                    />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {t('assistant.asOfLabel', {
                        time: assistantResult.asOf.slice(0, 19).replace('T', ' '),
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.answerText, { color: colors.text }]}>
                    {assistantResult.answer}
                  </Text>
                  {assistantResult.bullets.map((b) => (
                    <Text key={b} style={[styles.bulletText, { color: colors.textSecondary }]}>
                      • {b}
                    </Text>
                  ))}
                  {assistantResult.targetRoute ? (
                    <Pressable
                      onPress={() => router.push(assistantResult.targetRoute as '/(tabs)/inventory')}
                      accessibilityRole="button"
                      style={styles.linkRow}
                    >
                      <Text style={[styles.linkText, { color: colors.link }]}>
                        {t('assistant.openScreenBtn')} →
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        {/* Priority Filter Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTER_TABS.map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                testID={`tasks-filter-${f}`}
                onPress={() => setFilter(f)}
                accessibilityRole="button"
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    { color: active ? colors.onPrimary : colors.text },
                  ]}
                >
                  {t(`tasks.filters.${f}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Task List */}
        {filteredTasks.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {t('tasks.emptyTasks')}
            </Text>
          </View>
        ) : (
          filteredTasks.slice(0, 30).map((task) => {
            const currentStatus = statusById[task.id] ?? 'todo';
            const chipVariant =
              task.priority === 'critical'
                ? 'critical'
                : task.priority === 'high'
                  ? 'warning'
                  : 'healthy';
            const actorRole = profile?.role ?? 'store_manager';

            return (
              <View
                key={task.id}
                testID={`task-card-${task.id}`}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.taskTop}>
                  <View style={styles.flex}>
                    <Text style={[styles.taskTitle, { color: colors.text }]}>{task.title}</Text>
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {t(`roles.${task.role}`)} · {task.locationName}
                    </Text>
                  </View>
                  <StatusChip
                    variant={chipVariant}
                    label={t(`tasks.priorities.${task.priority}`)}
                  />
                </View>

                <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                  {task.reasoning}
                </Text>

                {currentStatus !== 'todo' ? (
                  <StatusChip
                    variant={currentStatus === 'done' ? 'healthy' : 'warning'}
                    label={t(`tasks.statusBadge.${currentStatus}`)}
                  />
                ) : null}

                <View style={styles.taskActions}>
                  {currentStatus === 'done' ? (
                    <Pressable
                      onPress={() => markTask(task.id, 'todo', actorRole)}
                      accessibilityRole="button"
                      style={[styles.actionBtn, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
                    >
                      <Text style={[styles.actionBtnText, { color: colors.text }]}>
                        {t('tasks.reopenBtn')}
                      </Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        testID={`task-done-${task.id}`}
                        onPress={() => markTask(task.id, 'done', actorRole)}
                        accessibilityRole="button"
                        style={[styles.actionBtn, { backgroundColor: colors.healthy, borderColor: colors.healthy }]}
                      >
                        <Text style={[styles.actionBtnText, { color: colors.onHealthy }]}>
                          {t('tasks.doneBtn')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => markTask(task.id, 'snoozed', actorRole)}
                        accessibilityRole="button"
                        style={[styles.actionBtn, { backgroundColor: colors.warning, borderColor: colors.warning }]}
                      >
                        <Text style={[styles.actionBtnText, { color: colors.onWarning }]}>
                          {t('tasks.snoozeBtn')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => markTask(task.id, 'escalated', actorRole)}
                        accessibilityRole="button"
                        style={[styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      >
                        <Text style={[styles.actionBtnText, { color: colors.onPrimary }]}>
                          {t('tasks.escalateBtn')}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: space(2),
    gap: space(1.5),
    paddingBottom: space(4),
  },
  heading: {
    fontSize: type.h1,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: type.small,
    lineHeight: 20,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(1.25),
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
  },
  sectionTitle: {
    fontSize: type.h3,
    fontWeight: '700',
  },
  metaText: {
    fontSize: type.small,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  presetChip: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    justifyContent: 'center',
  },
  filterChip: {
    minHeight: touchTarget.min,
    borderRadius: radius.chip,
    borderWidth: 1,
    paddingHorizontal: space(2),
    justifyContent: 'center',
  },
  presetChipText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  askRow: {
    flexDirection: 'row',
    gap: space(1),
  },
  askInput: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    fontSize: type.body,
  },
  askBtn: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    paddingHorizontal: space(2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  askBtnText: {
    fontSize: type.body,
    fontWeight: '700',
  },
  answerCard: {
    borderRadius: radius.button,
    borderWidth: 1,
    padding: space(1.5),
    gap: space(0.75),
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space(1),
  },
  answerText: {
    fontSize: type.body,
    fontWeight: '700',
  },
  bulletText: {
    fontSize: type.small,
    lineHeight: 20,
  },
  linkRow: {
    marginTop: space(0.5),
  },
  linkText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  taskTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space(1),
  },
  taskTitle: {
    fontSize: type.body,
    fontWeight: '700',
  },
  taskActions: {
    flexDirection: 'row',
    gap: space(1),
  },
  actionBtn: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(1),
  },
  actionBtnText: {
    fontSize: type.small,
    fontWeight: '700',
  },
});
