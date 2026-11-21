import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StatusChip } from '@/components/StatusChip';
import { useInventoryCatalog } from '@/features/inventory/useInventory';
import { evaluateAllScenarios } from '@/features/scenarios/scenarioEngine';
import { useScenarioStore } from '@/features/scenarios/scenarioStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

export default function ScenariosScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const catalogQuery = useInventoryCatalog();
  const byScenarioId = useScenarioStore((s) => s.byId);

  const snapshot = catalogQuery.data?.snapshot ?? null;

  const plans = useMemo(() => {
    const customParams = Object.fromEntries(
      Object.entries(byScenarioId).map(([id, state]) => [id, state.params]),
    );
    return evaluateAllScenarios(snapshot, customParams);
  }, [byScenarioId, snapshot]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: colors.text }]}>{t('scenarios.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('scenarios.subtitle')}
        </Text>

        <View style={styles.list}>
          {plans.map((plan) => {
            const runtime = byScenarioId[plan.templateId];
            const chipVariant =
              plan.band === 'ready'
                ? 'healthy'
                : plan.band === 'partially_ready'
                  ? 'warning'
                  : 'critical';

            return (
              <Pressable
                key={plan.templateId}
                testID={`scenario-card-${plan.templateId}`}
                onPress={() => router.push(`/(tabs)/scenarios/${plan.templateId}` as Href)}
                accessibilityRole="button"
                accessibilityLabel={t(`scenarios.templates.${plan.templateId}`)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: pressed ? colors.surfaceSoft : colors.card,
                    borderColor: runtime?.isActive ? colors.critical : colors.border,
                    borderWidth: runtime?.isActive ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.topRow}>
                  <View style={[styles.iconBadge, { backgroundColor: colors.surfaceSoft }]}>
                    <MaterialCommunityIcons name={plan.icon} size={24} color={colors.primary} />
                  </View>
                  <View style={styles.titleCol}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {t(`scenarios.templates.${plan.templateId}`)}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {plan.params.casualties} {t('scenarios.casualtiesLabel')} ·{' '}
                      {plan.params.arrivalWindowMin}m
                    </Text>
                  </View>
                  <Text style={[styles.scoreNum, { color: colors.primary }]}>{plan.score}%</Text>
                </View>

                <View style={styles.chipRow}>
                  <StatusChip variant={chipVariant} label={t(`scenarios.bands.${plan.band}`)} />
                  {runtime?.isActive ? (
                    <StatusChip variant="critical" label={t('scenarios.activeBadge')} />
                  ) : null}
                  {plan.shortfalls.length > 0 ? (
                    <Text style={[styles.shortfallHint, { color: colors.textSecondary }]}>
                      {t('home.shortfallsCount', { count: plan.shortfalls.length })} (
                      {plan.shortfalls[0].name})
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
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
  list: {
    gap: space(1.5),
  },
  card: {
    minHeight: touchTarget.counter,
    borderRadius: radius.card,
    padding: space(2),
    gap: space(1.25),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.25),
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: type.h3,
    fontWeight: '700',
  },
  meta: {
    fontSize: type.small,
  },
  scoreNum: {
    fontSize: type.h2,
    fontWeight: '800',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(1),
  },
  shortfallHint: {
    fontSize: type.small,
    flexShrink: 1,
  },
});
