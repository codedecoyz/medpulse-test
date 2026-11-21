import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ReadinessGauge } from '@/components/ReadinessGauge';
import { StatusChip } from '@/components/StatusChip';
import { useAuth } from '@/features/auth/AuthProvider';
import { useInventoryCatalog } from '@/features/inventory/useInventory';
import {
  computeAggregateHospitalReadiness,
  evaluateAllScenarios,
} from '@/features/scenarios/scenarioEngine';
import { useScenarioStore } from '@/features/scenarios/scenarioStore';
import { generateOperationalTasks } from '@/features/tasks/taskRules';
import { useTaskStore } from '@/features/tasks/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

export default function HomeScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { profile, hospital, locations, activeLocationId, setActiveLocationId } = useAuth();
  const catalogQuery = useInventoryCatalog();
  const byScenarioId = useScenarioStore((s) => s.byId);
  const taskStatuses = useTaskStore((s) => s.statusById);

  const snapshot = catalogQuery.data?.snapshot ?? null;

  const scenarioPlans = useMemo(() => {
    const customParams = Object.fromEntries(
      Object.entries(byScenarioId).map(([id, state]) => [id, state.params]),
    );
    return evaluateAllScenarios(snapshot, customParams);
  }, [byScenarioId, snapshot]);

  const aggregate = useMemo(
    () => computeAggregateHospitalReadiness(scenarioPlans),
    [scenarioPlans],
  );

  const tasks = useMemo(() => generateOperationalTasks(snapshot), [snapshot]);
  const openTasksCount = useMemo(
    () => tasks.filter((task) => (taskStatuses[task.id] ?? 'todo') !== 'done').length,
    [taskStatuses, tasks],
  );

  const metrics = useMemo(() => {
    const items = snapshot?.items ?? [];
    const belowParOrOut = items.filter((i) => i.status === 'out' || i.status === 'low').length;
    const expiringSoon = items.filter(
      (i) => i.daysToExpiry !== null && i.daysToExpiry <= 90 && i.totalUsable > 0,
    ).length;
    const priorityAlerts = items
      .filter((i) => i.status !== 'healthy')
      .sort((a, b) => {
        const order = { out: 0, low: 1, expiring: 2, healthy: 3 };
        return order[a.status] - order[b.status];
      })
      .slice(0, 4);

    return { belowParOrOut, expiringSoon, priorityAlerts };
  }, [snapshot]);

  const topScenarios = useMemo(
    () => [...scenarioPlans].sort((a, b) => a.score - b.score).slice(0, 3),
    [scenarioPlans],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.greeting, { color: colors.text }]}>
              {t('home.greeting', { name: profile?.full_name ?? t('app.name') })}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {hospital?.name ?? t('home.hospitalLabel')}
            </Text>
          </View>
          {profile ? (
            <StatusChip variant="healthy" label={t(`roles.${profile.role}`)} />
          ) : null}
        </View>

        {/* Hospital Emergency Readiness Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('home.hospitalReadinessTitle')}
          </Text>
          <View style={styles.gaugeRow}>
            <ReadinessGauge
              score={aggregate.score}
              band={aggregate.band}
              size={116}
              subtitle={t('home.readinessSummary', {
                ready: aggregate.readyCount,
                total: aggregate.totalCount,
              })}
            />
          </View>

          <View style={styles.quickActionRow}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/inventory/count',
                  params: {
                    locationId: activeLocationId ?? locations[0]?.id ?? '',
                    type: 'par',
                    mode: 'blind',
                  },
                })
              }
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.quickBtn,
                { backgroundColor: pressed ? colors.critical : colors.primary },
              ]}
            >
              <MaterialCommunityIcons name="counter" size={18} color={colors.onPrimary} />
              <Text style={[styles.quickBtnText, { color: colors.onPrimary }]}>
                {t('home.quickStartCount')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(tabs)/inventory/movement')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.quickBtn,
                { backgroundColor: pressed ? colors.border : colors.healthy },
              ]}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={18} color={colors.onHealthy} />
              <Text style={[styles.quickBtnText, { color: colors.onHealthy }]}>
                {t('home.quickMovement')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(tabs)/tasks')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.quickBtn,
                { backgroundColor: pressed ? colors.border : colors.surfaceSoft, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <MaterialCommunityIcons name="robot-outline" size={18} color={colors.text} />
              <Text style={[styles.quickBtnText, { color: colors.text }]}>
                {t('home.quickAskAi')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 3 Live KPI Stat Cards */}
        <View style={styles.kpiRow}>
          <Pressable
            onPress={() => router.push('/(tabs)/inventory')}
            accessibilityRole="button"
            style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.kpiValue, { color: colors.critical }]}>
              {metrics.belowParOrOut}
            </Text>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
              {t('home.kpiBelowPar')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/inventory')}
            accessibilityRole="button"
            style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.kpiValue, { color: colors.primary }]}>
              {metrics.expiringSoon}
            </Text>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
              {t('home.kpiExpiring')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/tasks')}
            accessibilityRole="button"
            style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.kpiValue, { color: colors.text }]}>{openTasksCount}</Text>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
              {t('home.kpiOpenTasks')}
            </Text>
          </Pressable>
        </View>

        {/* Active Location Switcher */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('home.activeLocation')}
          </Text>
          {locations.length === 0 ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              {t('home.noLocation')}
            </Text>
          ) : (
            <View style={styles.locationList}>
              {locations.map((loc) => {
                const selected = loc.id === activeLocationId;
                return (
                  <Pressable
                    key={loc.id}
                    onPress={() => setActiveLocationId(loc.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.locationChip,
                      {
                        backgroundColor: selected ? colors.primary : colors.surfaceSoft,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.locationChipText,
                        { color: selected ? colors.onPrimary : colors.text },
                      ]}
                    >
                      {loc.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Priority Stock Alerts */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('home.criticalAlertsTitle')}
          </Text>
          {metrics.priorityAlerts.length === 0 ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              {t('home.noAlertsBody')}
            </Text>
          ) : (
            metrics.priorityAlerts.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/(tabs)/inventory/${item.id}`)}
                accessibilityRole="button"
                style={[styles.rowItem, { borderColor: colors.border }]}
              >
                <View style={styles.rowTextCol}>
                  <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                    {item.sku} · {item.totalUsable} {item.baseUnit} / PAR {item.totalPar}
                  </Text>
                </View>
                <StatusChip
                  variant={item.status === 'out' ? 'critical' : 'warning'}
                  label={t(`inventory.filters.${item.status}`)}
                />
              </Pressable>
            ))
          )}
        </View>

        {/* Top Emergency Scenarios */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('home.topScenariosTitle')}
          </Text>
          {topScenarios.map((plan) => (
            <Pressable
              key={plan.templateId}
              onPress={() => router.push(`/(tabs)/scenarios/${plan.templateId}` as Href)}
              accessibilityRole="button"
              style={[styles.rowItem, { borderColor: colors.border }]}
            >
              <View style={styles.rowTextCol}>
                <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                  {t(`scenarios.templates.${plan.templateId}`)}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {plan.score}% · {t('home.shortfallsCount', { count: plan.shortfalls.length })}
                </Text>
              </View>
              <StatusChip
                variant={
                  plan.band === 'ready'
                    ? 'healthy'
                    : plan.band === 'partially_ready'
                      ? 'warning'
                      : 'critical'
                }
                label={t(`scenarios.bands.${plan.band}`)}
              />
            </Pressable>
          ))}
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
    gap: space(2),
    paddingBottom: space(4),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space(1.5),
  },
  headerText: {
    flex: 1,
    gap: space(0.5),
  },
  greeting: {
    fontSize: type.h2,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: type.small,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(1.5),
  },
  gaugeRow: {
    alignItems: 'center',
  },
  quickActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  quickBtn: {
    flex: 1,
    minWidth: 130,
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(0.75),
    paddingHorizontal: space(1.5),
  },
  quickBtnText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: space(1),
  },
  kpiCard: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(1.5),
    alignItems: 'center',
    gap: space(0.5),
  },
  kpiValue: {
    fontSize: type.h1,
    fontWeight: '800',
  },
  kpiLabel: {
    fontSize: type.small,
    textAlign: 'center',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: type.h3,
    fontWeight: '700',
  },
  bodyText: {
    fontSize: type.body,
    lineHeight: 22,
  },
  locationList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  locationChip: {
    minHeight: touchTarget.min,
    paddingHorizontal: space(2),
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: 'center',
  },
  locationChipText: {
    fontSize: type.small,
    fontWeight: '600',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(1),
    paddingVertical: space(1),
    borderTopWidth: 1,
  },
  rowTextCol: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: type.body,
    fontWeight: '700',
  },
  rowMeta: {
    fontSize: type.small,
  },
});
