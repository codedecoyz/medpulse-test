import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ReadinessGauge } from '@/components/ReadinessGauge';
import { StatusChip } from '@/components/StatusChip';
import { useAuth } from '@/features/auth/AuthProvider';
import { useInventoryCatalog } from '@/features/inventory/useInventory';
import {
  evaluateScenarioPlan,
  getScenarioTemplate,
  type ScenarioTemplateId,
} from '@/features/scenarios/scenarioEngine';
import { useScenarioStore } from '@/features/scenarios/scenarioStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

const CASUALTY_PRESETS = [10, 25, 50, 100] as const;
const WINDOW_PRESETS = [15, 30, 60] as const;

export default function ScenarioDetailScreen() {
  const params = useLocalSearchParams<{ templateId?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuth();
  const catalogQuery = useInventoryCatalog();

  const templateDef = getScenarioTemplate(params.templateId ?? 'road_accident');
  const templateId = templateDef.id as ScenarioTemplateId;

  const runtime = useScenarioStore((s) => s.byId[templateId]);
  const setParams = useScenarioStore((s) => s.setParams);
  const approvePlan = useScenarioStore((s) => s.approvePlan);
  const activatePlan = useScenarioStore((s) => s.activatePlan);
  const cycleTaskStatus = useScenarioStore((s) => s.cycleTaskStatus);
  const toggleEmergencyMode = useScenarioStore((s) => s.toggleEmergencyMode);
  const standDownPlan = useScenarioStore((s) => s.standDownPlan);

  const [tab, setTab] = useState<'plan' | 'board'>(runtime.isActive ? 'board' : 'plan');
  const [standDownReason, setStandDownReason] = useState('');

  const snapshot = catalogQuery.data?.snapshot ?? null;

  const plan = useMemo(
    () => evaluateScenarioPlan(templateId, runtime.params, snapshot),
    [runtime.params, snapshot, templateId],
  );

  const canCoordinate = profile ? ['admin', 'coordinator'].includes(profile.role) : true;
  const completedSteps = plan.timeline.filter(
    (step) => (runtime.taskStatuses[step.id] ?? 'todo') === 'done',
  ).length;
  const boardProgress =
    plan.timeline.length > 0 ? Math.round((completedSteps / plan.timeline.length) * 100) : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {runtime.isActive && runtime.emergencyMode ? (
          <View style={[styles.emergencyBanner, { backgroundColor: colors.critical }]}>
            <MaterialCommunityIcons name="alarm-light-outline" size={22} color={colors.onCritical} />
            <Text style={[styles.emergencyBannerText, { color: colors.onCritical }]}>
              {t('scenarios.emergencyModeBanner')}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.heading, { color: colors.text }]}>
          {t(`scenarios.templates.${templateId}`)}
        </Text>

        {/* View switch: Plan & Readiness | Activation Board */}
        <View style={[styles.segmentBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['plan', 'board'] as const).map((key) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                testID={`scenario-tab-${key}`}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[
                  styles.segmentButton,
                  { backgroundColor: active ? colors.primary : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: active ? colors.onPrimary : colors.text },
                  ]}
                >
                  {t(key === 'plan' ? 'scenarios.planTab' : 'scenarios.boardTab')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'plan' ? (
          <>
            {/* Readiness Gauge + Parameter Steppers (MP-SEN-001, MP-SEN-003) */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ReadinessGauge
                score={plan.score}
                band={plan.band}
                confidence={plan.confidence}
              />

              <Text style={[styles.paramLabel, { color: colors.text }]}>
                {t('scenarios.casualtiesLabel')}: {runtime.params.casualties}
              </Text>
              <View style={styles.chipRow}>
                <Pressable
                  onPress={() =>
                    setParams(templateId, { casualties: runtime.params.casualties - 5 })
                  }
                  accessibilityRole="button"
                  style={[styles.paramChip, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
                >
                  <Text style={[styles.paramChipText, { color: colors.text }]}>−5</Text>
                </Pressable>
                {CASUALTY_PRESETS.map((n) => {
                  const selected = runtime.params.casualties === n;
                  return (
                    <Pressable
                      key={n}
                      testID={`scenario-casualties-${n}`}
                      onPress={() => setParams(templateId, { casualties: n })}
                      accessibilityRole="button"
                      style={[
                        styles.paramChip,
                        {
                          backgroundColor: selected ? colors.primary : colors.surfaceSoft,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.paramChipText,
                          { color: selected ? colors.onPrimary : colors.text },
                        ]}
                      >
                        {n}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() =>
                    setParams(templateId, { casualties: runtime.params.casualties + 5 })
                  }
                  accessibilityRole="button"
                  style={[styles.paramChip, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
                >
                  <Text style={[styles.paramChipText, { color: colors.text }]}>+5</Text>
                </Pressable>
              </View>

              <Text style={[styles.paramLabel, { color: colors.text }]}>
                {t('scenarios.arrivalLabel')}: {runtime.params.arrivalWindowMin}m
              </Text>
              <View style={styles.chipRow}>
                {WINDOW_PRESETS.map((win) => {
                  const selected = runtime.params.arrivalWindowMin === win;
                  return (
                    <Pressable
                      key={win}
                      onPress={() => setParams(templateId, { arrivalWindowMin: win })}
                      accessibilityRole="button"
                      style={[
                        styles.paramChip,
                        {
                          backgroundColor: selected ? colors.healthy : colors.surfaceSoft,
                          borderColor: selected ? colors.healthy : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.paramChipText,
                          { color: selected ? colors.onHealthy : colors.text },
                        ]}
                      >
                        {win}m
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Summary & Planning Assumptions */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scenarios.summaryTitle')}
              </Text>
              <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{plan.summary}</Text>

              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scenarios.assumptionsTitle')}
              </Text>
              {plan.assumptions.map((line) => (
                <Text key={line} style={[styles.bulletText, { color: colors.textSecondary }]}>
                  • {line}
                </Text>
              ))}
            </View>

            {/* Resources Needed vs Live Stock (MP-SEN-004, MP-SEN-011) */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scenarios.resourcesTitle')}
              </Text>
              {plan.resources.map((res) => {
                const variant =
                  res.shortfallQty === 0
                    ? 'healthy'
                    : res.shortfallSeverity === 'critical'
                      ? 'critical'
                      : 'warning';
                return (
                  <View key={res.sku} style={[styles.resourceRow, { borderColor: colors.border }]}>
                    <View style={styles.flex}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>
                        {res.name} ({res.sku})
                      </Text>
                      <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                        {t('scenarios.neededVsAvail', {
                          need: res.requiredQty,
                          unit: res.unit,
                          avail: res.availableQty,
                          loc: res.pickRouteLocationName,
                        })}
                      </Text>
                    </View>
                    <View style={styles.resourceRight}>
                      {res.unmapped ? (
                        <StatusChip variant="warning" label={t('scenarios.unmappedBadge')} />
                      ) : (
                        <StatusChip
                          variant={variant}
                          label={
                            res.shortfallQty > 0
                              ? t('scenarios.shortfallLabel', { qty: res.shortfallQty })
                              : t('scenarios.bands.ready')
                          }
                        />
                      )}
                      {res.shortfallQty > 0 && res.itemId ? (
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: '/(tabs)/inventory/movement',
                              params: {
                                type: 'receive',
                                itemId: res.itemId ?? '',
                                qty: String(res.shortfallQty),
                              },
                            })
                          }
                          accessibilityRole="button"
                          style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                        >
                          <Text style={[styles.smallBtnText, { color: colors.onPrimary }]}>
                            {t('scenarios.restockBtn')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Staffing + Timeline + External Support */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scenarios.staffTitle')}
              </Text>
              <View style={styles.chipRow}>
                {plan.staff.map((st) => (
                  <View
                    key={st.role}
                    style={[styles.staffPill, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
                  >
                    <Text style={[styles.staffText, { color: colors.text }]}>
                      {t(`roles.${st.role}`)}: {st.count}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scenarios.timelineTitle')}
              </Text>
              {plan.timeline.map((step) => (
                <Text key={step.id} style={[styles.bulletText, { color: colors.textSecondary }]}>
                  • T+{step.tOffsetMin}m [{t(`roles.${step.ownerRole}`)}]: {step.action}
                </Text>
              ))}

              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scenarios.externalSupportTitle')}
              </Text>
              {plan.externalSupport.map((sup) => (
                <Text key={sup} style={[styles.bulletText, { color: colors.textSecondary }]}>
                  • {sup}
                </Text>
              ))}
            </View>

            {/* Human Approval Gate & Activate Button (MP-SEN-008) */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {runtime.approvalStatus === 'approved' ? (
                <StatusChip
                  variant="healthy"
                  label={t('scenarios.approvedByLabel', {
                    name: runtime.approvedByName ?? t('roles.coordinator'),
                  })}
                />
              ) : (
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {t('scenarios.approveGateHint')}
                </Text>
              )}

              <Pressable
                testID="scenario-approve-btn"
                onPress={() =>
                  approvePlan(templateId, profile?.full_name ?? t('roles.coordinator'))
                }
                disabled={!canCoordinate || runtime.approvalStatus === 'approved'}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor:
                      runtime.approvalStatus === 'approved'
                        ? colors.surfaceSoft
                        : pressed
                          ? colors.border
                          : colors.healthy,
                    opacity: canCoordinate ? 1 : 0.6,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.primaryBtnText,
                    {
                      color:
                        runtime.approvalStatus === 'approved'
                          ? colors.textSecondary
                          : colors.onHealthy,
                    },
                  ]}
                >
                  {t('scenarios.approveBtn')}
                </Text>
              </Pressable>

              <Pressable
                testID="scenario-activate-btn"
                onPress={() => {
                  activatePlan(
                    templateId,
                    plan.timeline.map((step) => step.id),
                  );
                  setTab('board');
                }}
                disabled={runtime.approvalStatus !== 'approved'}
                accessibilityRole="button"
                accessibilityState={{ disabled: runtime.approvalStatus !== 'approved' }}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor:
                      runtime.approvalStatus !== 'approved'
                        ? colors.border
                        : pressed
                          ? colors.critical
                          : colors.primary,
                    opacity: runtime.approvalStatus === 'approved' ? 1 : 0.65,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.primaryBtnText,
                    {
                      color:
                        runtime.approvalStatus === 'approved'
                          ? colors.onPrimary
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {runtime.approvalStatus === 'approved'
                    ? t('scenarios.activateBtn')
                    : t('scenarios.activateDisabled')}
                </Text>
              </Pressable>
            </View>
          </>
        ) : !runtime.isActive ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('scenarios.boardNotActiveTitle')}
            </Text>
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              {t('scenarios.boardNotActiveBody')}
            </Text>
          </View>
        ) : (
          <>
            {/* Live Activation Board (MP-ACT-001..005) */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ReadinessGauge
                score={boardProgress}
                band={boardProgress >= 85 ? 'ready' : boardProgress >= 50 ? 'partially_ready' : 'not_ready'}
                subtitle={`${completedSteps} / ${plan.timeline.length}`}
              />
              <Pressable
                onPress={() => toggleEmergencyMode(templateId)}
                accessibilityRole="button"
                style={[styles.primaryBtn, { backgroundColor: colors.warning }]}
              >
                <Text style={[styles.primaryBtnText, { color: colors.onWarning }]}>
                  {t('scenarios.toggleEmergencyMode')}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scenarios.checklistTitle')}
              </Text>
              {plan.timeline.map((step) => {
                const state = runtime.taskStatuses[step.id] ?? 'todo';
                const variant =
                  state === 'done' ? 'healthy' : state === 'in_progress' ? 'warning' : 'critical';
                return (
                  <Pressable
                    key={step.id}
                    onPress={() => cycleTaskStatus(templateId, step.id)}
                    accessibilityRole="button"
                    style={[styles.resourceRow, { borderColor: colors.border }]}
                  >
                    <View style={styles.flex}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>
                        T+{step.tOffsetMin}m · {step.action}
                      </Text>
                      <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                        {t(`roles.${step.ownerRole}`)}
                      </Text>
                    </View>
                    <StatusChip variant={variant} label={t(`scenarios.taskStates.${state}`)} />
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scenarios.shortfallsTrackerTitle')}
              </Text>
              {plan.shortfalls.length === 0 ? (
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                  {t('scenarios.noShortfallsMsg')}
                </Text>
              ) : (
                plan.shortfalls.map((s) => (
                  <View key={s.sku} style={[styles.resourceRow, { borderColor: colors.border }]}>
                    <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>
                      {s.name}
                    </Text>
                    <StatusChip
                      variant={s.shortfallSeverity === 'critical' ? 'critical' : 'warning'}
                      label={t('scenarios.shortfallLabel', { qty: s.shortfallQty })}
                    />
                  </View>
                ))
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scenarios.standDownTitle')}
              </Text>
              <TextInput
                value={standDownReason}
                onChangeText={setStandDownReason}
                placeholder={t('scenarios.standDownReasonPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
                ]}
              />
              <Pressable
                onPress={() => {
                  standDownPlan(templateId, standDownReason);
                  setStandDownReason('');
                  setTab('plan');
                }}
                accessibilityRole="button"
                style={[styles.primaryBtn, { backgroundColor: colors.critical }]}
              >
                <Text style={[styles.primaryBtnText, { color: colors.onCritical }]}>
                  {t('scenarios.standDownBtn')}
                </Text>
              </Pressable>
            </View>
          </>
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
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    padding: space(1.5),
    borderRadius: radius.button,
  },
  emergencyBannerText: {
    flex: 1,
    fontSize: type.small,
    fontWeight: '800',
  },
  heading: {
    fontSize: type.h1,
    fontWeight: '800',
  },
  segmentBar: {
    flexDirection: 'row',
    borderRadius: radius.button,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: type.small,
    fontWeight: '700',
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(1.25),
  },
  sectionTitle: {
    fontSize: type.h3,
    fontWeight: '700',
  },
  paramLabel: {
    fontSize: type.small,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  paramChip: {
    minHeight: touchTarget.min,
    minWidth: 48,
    paddingHorizontal: space(1.5),
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paramChipText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  bodyText: {
    fontSize: type.body,
    lineHeight: 22,
  },
  bulletText: {
    fontSize: type.small,
    lineHeight: 20,
  },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(1),
    paddingVertical: space(1),
    borderTopWidth: 1,
  },
  rowTitle: {
    fontSize: type.body,
    fontWeight: '700',
  },
  rowMeta: {
    fontSize: type.small,
  },
  resourceRight: {
    alignItems: 'flex-end',
    gap: space(0.5),
  },
  smallBtn: {
    paddingHorizontal: space(1.25),
    paddingVertical: space(0.5),
    borderRadius: radius.button,
  },
  smallBtnText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  staffPill: {
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    paddingVertical: space(0.75),
  },
  staffText: {
    fontSize: type.small,
    fontWeight: '600',
  },
  primaryBtn: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(2),
  },
  primaryBtnText: {
    fontSize: type.body,
    fontWeight: '700',
  },
  input: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    fontSize: type.body,
  },
});
