import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { changeAppLanguage } from '@/lib/i18n';
import { StatusChip } from '@/components/StatusChip';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import LoginScreen from '../../app/(auth)/login';
import AboutScreen from '../../app/(tabs)/more/about';
import SettingsScreen from '../../app/(tabs)/more/settings';

const queryClients: QueryClient[] = [];

async function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  queryClients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Phase 0 UI components and screens', () => {
  beforeEach(async () => {
    await changeAppLanguage('en');
  });

  afterEach(() => {
    for (const client of queryClients.splice(0)) {
      client.clear();
    }
  });

  it('renders StatusChip with both icon and label for every level (P8, MP-ALR-003)', async () => {
    const { rerender } = await render(
      <ThemeProvider>
        <StatusChip variant="healthy" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Healthy')).toBeTruthy();
    expect(screen.getByTestId('icon-check-circle-outline')).toBeTruthy();

    await rerender(
      <ThemeProvider>
        <StatusChip variant="warning" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Warning')).toBeTruthy();
    expect(screen.getByTestId('icon-alert-outline')).toBeTruthy();

    await rerender(
      <ThemeProvider>
        <StatusChip variant="critical" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Critical')).toBeTruthy();
    expect(screen.getByTestId('icon-alert-octagon-outline')).toBeTruthy();

    await rerender(
      <ThemeProvider>
        <StatusChip variant="in_testing" />
      </ThemeProvider>,
    );
    expect(screen.getByText('In Testing')).toBeTruthy();
    expect(screen.getByTestId('icon-flask-outline')).toBeTruthy();
  });

  it('renders Login screen with logo, email validation error, and attribution', async () => {
    await renderWithProviders(<LoginScreen />);

    expect(screen.getByLabelText('MedPulse logo')).toBeTruthy();
    expect(screen.getByText('Always ready. Before the emergency arrives.')).toBeTruthy();
    expect(screen.getByText('Designed & developed by Rajiv Kumar Singh')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'invalid');
    await fireEvent.press(screen.getByTestId('login-send-otp-btn'));

    expect(screen.getByTestId('login-error-banner')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
  });

  it('renders About screen with required v1.0 credit (Section 17)', async () => {
    await renderWithProviders(<AboutScreen />);
    expect(
      screen.getByText('MedPulse v1.0, Designed & developed by Rajiv Kumar Singh'),
    ).toBeTruthy();
  });

  it('keeps scanner In Testing badge hidden when scanner_beta is off and switches EN/HI live', async () => {
    await renderWithProviders(<SettingsScreen />);

    expect(screen.queryByText('In Testing')).toBeNull();
    expect(screen.getByText('Language')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('settings-lang-hi'));
    await waitFor(() => {
      expect(screen.getByText('भाषा')).toBeTruthy();
    });
  });
});
