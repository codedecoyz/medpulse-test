import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ScreenState } from '@/components/ScreenState';
import { StatusChip } from '@/components/StatusChip';
import { useAuth } from '@/features/auth/AuthProvider';
import { useInventoryCatalog } from '@/features/inventory/useInventory';
import { evaluateAllScenarios } from '@/features/scenarios/scenarioEngine';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

export default function ReportsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { profile, hospital } = useAuth();
  const catalogQuery = useInventoryCatalog();

  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);

  const snapshot = catalogQuery.data?.snapshot ?? null;
  const canReadAudit = profile ? ['admin', 'auditor'].includes(profile.role) : false;

  const auditQuery = useQuery({
    queryKey: ['audit_logs_preview', hospital?.id ?? 'none'],
    enabled: Boolean(hospital?.id) && isSupabaseConfigured && canReadAudit,
    queryFn: async () => {
      if (!hospital?.id) return [];
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, entity_type, created_at')
        .eq('hospital_id', hospital.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const items = snapshot?.items ?? [];
    const totalValue = items.reduce((sum, i) => sum + i.totalUsable * i.unitCost, 0);
    const belowPar = items.filter((i) => i.status === 'low').length;
    const outOfStock = items.filter((i) => i.status === 'out').length;
    const expiring = items.filter(
      (i) => i.daysToExpiry !== null && i.daysToExpiry <= 90 && i.totalUsable > 0,
    ).length;

    return {
      totalItems: items.length,
      totalValue: Math.round(totalValue),
      belowPar,
      outOfStock,
      expiring,
    };
  }, [snapshot]);

  const scenarios = useMemo(() => evaluateAllScenarios(snapshot), [snapshot]);

  const handleExportCsv = () => {
    const items = snapshot?.items ?? [];
    const header = 'SKU,Name,Category,UsableQty,PAR,MinQty,Status,UnitCost,StockValue';
    const lines = items.map((i) => {
      const safeName = `"${i.name.replace(/"/g, '""')}"`;
      const safeCat = `"${i.categoryName.replace(/"/g, '""')}"`;
      return [
        i.sku,
        safeName,
        safeCat,
        i.totalUsable,
        i.totalPar,
        i.totalMin,
        i.status,
        i.unitCost,
        (i.totalUsable * i.unitCost).toFixed(2),
      ].join(',');
    });
    const csv = [header, ...lines].join('\n');

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `medpulse-inventory-report.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    setCsvPreview(lines.slice(0, 5).join('\n'));
    setExportStatus(t('reports.exportDone', { rows: items.length }));
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Inventory Health Overview */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('reports.summaryTitle')}
        </Text>

        <View style={styles.metricGrid}>
          <View style={[styles.metricBox, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
            <Text style={[styles.metricVal, { color: colors.text }]}>{stats.totalItems}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              {t('reports.totalItems')}
            </Text>
          </View>
          <View style={[styles.metricBox, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
            <Text style={[styles.metricVal, { color: colors.primary }]}>
              ₹{stats.totalValue.toLocaleString()}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              {t('reports.stockValue')}
            </Text>
          </View>
          <View style={[styles.metricBox, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
            <Text style={[styles.metricVal, { color: colors.critical }]}>{stats.belowPar}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              {t('reports.belowParCount')}
            </Text>
          </View>
          <View style={[styles.metricBox, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
            <Text style={[styles.metricVal, { color: colors.critical }]}>{stats.outOfStock}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              {t('reports.outOfStockCount')}
            </Text>
          </View>
        </View>

        <Pressable
          testID="reports-export-csv-btn"
          onPress={handleExportCsv}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.exportBtn,
            { backgroundColor: pressed ? colors.critical : colors.primary },
          ]}
        >
          <MaterialCommunityIcons name="file-delimited-outline" size={20} color={colors.onPrimary} />
          <Text style={[styles.exportBtnText, { color: colors.onPrimary }]}>
            {t('reports.exportCsvBtn')}
          </Text>
        </Pressable>

        {exportStatus ? (
          <View style={[styles.previewCard, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>{exportStatus}</Text>
            {csvPreview ? (
              <Text style={[styles.monoText, { color: colors.textSecondary }]}>{csvPreview}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Scenario Readiness Summary */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('reports.scenarioSummaryTitle')}
        </Text>
        {scenarios.map((s) => (
          <View key={s.templateId} style={[styles.listRow, { borderColor: colors.border }]}>
            <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>
              {t(`scenarios.templates.${s.templateId}`)}
            </Text>
            <StatusChip
              variant={
                s.band === 'ready'
                  ? 'healthy'
                  : s.band === 'partially_ready'
                    ? 'warning'
                    : 'critical'
              }
              label={`${s.score}% · ${t(`scenarios.bands.${s.band}`)}`}
            />
          </View>
        ))}
      </View>

      {/* Immutable Audit Log (MP-RPT-002) */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('reports.auditLogTitle')}
        </Text>

        {!canReadAudit ? (
          <ScreenState kind="permission_denied" />
        ) : auditQuery.isLoading ? (
          <ScreenState kind="loading" />
        ) : (auditQuery.data ?? []).length === 0 ? (
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {t('reports.auditLogEmpty')}
          </Text>
        ) : (
          (auditQuery.data ?? []).map((entry) => (
            <View key={entry.id} style={[styles.listRow, { borderColor: colors.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{entry.action}</Text>
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {entry.entity_type} · {entry.created_at.slice(0, 19).replace('T', ' ')}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: space(2),
    gap: space(2),
    paddingBottom: space(4),
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(1.5),
  },
  sectionTitle: {
    fontSize: type.h3,
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  metricBox: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: radius.button,
    borderWidth: 1,
    padding: space(1.5),
    gap: 2,
  },
  metricVal: {
    fontSize: type.h2,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: type.small,
  },
  exportBtn: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1),
    paddingHorizontal: space(2),
  },
  exportBtnText: {
    fontSize: type.body,
    fontWeight: '700',
  },
  previewCard: {
    borderRadius: radius.button,
    borderWidth: 1,
    padding: space(1.5),
    gap: space(0.5),
  },
  monoText: {
    fontSize: 12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(1),
    paddingVertical: space(1),
    borderTopWidth: 1,
  },
  rowTitle: {
    fontSize: type.body,
    fontWeight: '600',
  },
  metaText: {
    fontSize: type.small,
  },
});
