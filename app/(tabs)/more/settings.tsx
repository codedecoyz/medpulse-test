import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StatusChip } from '@/components/StatusChip';
import { useAuth } from '@/features/auth/AuthProvider';
import { type FeatureFlagKey, useFeatureFlags } from '@/lib/flags';
import { type AppLocale, changeAppLanguage } from '@/lib/i18n';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { type ThemeMode, useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

const FLAG_KEYS: FeatureFlagKey[] = [
  'scanner_beta',
  'ai_tasks',
  'ai_scenarios',
  'ai_assistant',
];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: flags } = useFeatureFlags(profile?.hospital_id, profile?.id);

  const isAdmin = profile?.role === 'admin';
  const currentLocale: AppLocale = i18n.language === 'hi' ? 'hi' : 'en';

  const handleLanguageChange = async (nextLocale: AppLocale) => {
    await changeAppLanguage(nextLocale);
    if (profile && isSupabaseConfigured) {
      await supabase.from('profiles').update({ locale: nextLocale }).eq('id', profile.id);
    }
  };

  const handleToggleFlag = async (flagKey: FeatureFlagKey, currentValue: boolean) => {
    if (!isAdmin || !profile || !isSupabaseConfigured) {
      return;
    }
    const nextValue = !currentValue;
    const { data: existing } = await supabase
      .from('feature_flags')
      .select('id')
      .eq('hospital_id', profile.hospital_id)
      .eq('key', flagKey)
      .is('user_id', null)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from('feature_flags')
        .update({ enabled: nextValue, updated_by: profile.id })
        .eq('id', existing.id);
    } else {
      await supabase.from('feature_flags').insert({
        key: flagKey,
        hospital_id: profile.hospital_id,
        user_id: null,
        enabled: nextValue,
        updated_by: profile.id,
      });
    }
    await queryClient.invalidateQueries({ queryKey: ['feature_flags'] });
  };

  const renderToggleButton = (
    label: string,
    active: boolean,
    onPress: () => void,
    testID: string,
  ) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.toggleButton,
        {
          backgroundColor: active ? colors.primary : colors.surfaceSoft,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.toggleLabel,
          { color: active ? colors.onPrimary : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('more.languageTitle')}
        </Text>
        <View style={styles.toggleRow}>
          {renderToggleButton(
            t('more.languageEnglish'),
            currentLocale === 'en',
            () => void handleLanguageChange('en'),
            'settings-lang-en',
          )}
          {renderToggleButton(
            t('more.languageHindi'),
            currentLocale === 'hi',
            () => void handleLanguageChange('hi'),
            'settings-lang-hi',
          )}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('more.appearanceTitle')}
        </Text>
        <View style={styles.toggleRow}>
          {(['light', 'dark'] as ThemeMode[]).map((option) =>
            <React.Fragment key={option}>
              {renderToggleButton(
                option === 'light' ? t('more.themeLight') : t('more.themeDark'),
                mode === option,
                () => setMode(option),
                `settings-theme-${option}`,
              )}
            </React.Fragment>,
          )}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('more.flagsTitle')}
        </Text>
        {isAdmin ? (
          <Text style={[styles.flagHint, { color: colors.textSecondary }]}>
            {t('more.flagsAdminHint')}
          </Text>
        ) : null}
        {FLAG_KEYS.map((flagKey) => {
          const enabled = flags?.[flagKey] ?? false;
          const rowContent = (
            <>
              <View style={styles.flagLeft}>
                <Text style={[styles.flagLabel, { color: colors.text }]}>
                  {t(`more.flags.${flagKey}`)}
                </Text>
                {flagKey === 'scanner_beta' && enabled ? (
                  <StatusChip variant="in_testing" />
                ) : null}
              </View>
              <StatusChip
                variant={enabled ? 'healthy' : 'warning'}
                label={enabled ? t('more.flagEnabled') : t('more.flagDisabled')}
              />
            </>
          );

          return isAdmin ? (
            <Pressable
              key={flagKey}
              testID={`settings-flag-${flagKey}`}
              onPress={() => void handleToggleFlag(flagKey, enabled)}
              accessibilityRole="switch"
              accessibilityState={{ checked: enabled }}
              style={styles.flagRow}
            >
              {rowContent}
            </Pressable>
          ) : (
            <View key={flagKey} style={styles.flagRow}>
              {rowContent}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: space(2),
    gap: space(2),
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
  toggleRow: {
    flexDirection: 'row',
    gap: space(1.5),
  },
  toggleButton: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(1.5),
  },
  toggleLabel: {
    fontSize: type.small,
    fontWeight: '700',
    textAlign: 'center',
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(1),
    paddingVertical: space(0.5),
  },
  flagLeft: {
    flex: 1,
    gap: space(0.5),
  },
  flagLabel: {
    fontSize: type.body,
    fontWeight: '600',
  },
  flagHint: {
    fontSize: type.small,
  },
});
