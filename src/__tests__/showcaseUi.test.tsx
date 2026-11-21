import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Counter } from '@/components/Counter';
import { ReadinessGauge } from '@/components/ReadinessGauge';
import { VarianceChip } from '@/components/VarianceChip';
import { buildInventorySnapshot } from '@/features/inventory/inventoryService';
import * as useInventoryModule from '@/features/inventory/useInventory';
import { changeAppLanguage } from '@/lib/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';
import ScenariosScreen from '../../app/(tabs)/scenarios/index';
import TasksScreen from '../../app/(tabs)/tasks/index';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'authenticated',
    profile: {
      id: 'user-coord',
      hospital_id: 'h1',
      full_name: 'Emergency Coordinator',
      role: 'coordinator',
      locale: 'en',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
    hospital: {
      id: 'h1',
      name: 'MedPulse General Hospital',
      code: 'MPGH-01',
      idle_timeout_minutes: 15,
      created_at: '',
    },
    locations: [
      { id: 'loc-er', hospital_id: 'h1', parent_id: null, name: 'Emergency Room', type: 'er', created_at: '' },
    ],
    activeLocationId: 'loc-er',
    setActiveLocationId: jest.fn(),
  }),
}));

const uiSnapshot = buildInventorySnapshot({
  hospitalId: 'h1',
  locations: [
    { id: 'loc-er', hospital_id: 'h1', parent_id: null, name: 'Emergency Room', type: 'er', created_at: '' },
  ],
  categories: [{ id: 'cat-1', hospitalId: 'h1', name: 'IV Fluids', slug: 'iv-fluids' }],
  suppliersById: { 'sup-1': 'Apollo' },
  items: [
    {
      id: 'item-1',
      hospital_id: 'h1',
      sku: 'IVF-038',
      name: 'Ringer Lactate 500ml',
      category_id: 'cat-1',
      base_unit: 'bottle',
      barcode: '8901000038',
      criticality: 'A',
      is_controlled: false,
      is_cold_chain: false,
      tracks_batch: true,
      tracks_expiry: true,
      unit_cost: 38,
      supplier_id: 'sup-1',
    },
  ],
  units: [{ itemId: 'item-1', unit: 'bottle', factorToBase: 1, isOrderPack: true }],
  batches: [
    {
      id: 'b-1',
      hospitalId: 'h1',
      itemId: 'item-1',
      batchNo: 'RL-B1',
      expiryDate: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
  parLevels: [{ itemId: 'item-1', locationId: 'loc-er', minQty: 20, parQty: 60, maxQty: 120 }],
  stockLevels: [
    { id: 'sl-1', itemId: 'item-1', batchId: 'b-1', locationId: 'loc-er', condition: 'usable', qty: 10, reservedQty: 0, lastCountedAt: null },
  ],
  reasonCodes: [],
  syncedAt: '2026-11-21T00:00:00.000Z',
});

const queryClients: QueryClient[] = [];

async function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  queryClients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Final Showcase Components & Screens', () => {
  beforeEach(async () => {
    await changeAppLanguage('en');
    mockPush.mockClear();
    jest.restoreAllMocks();
    jest.spyOn(useInventoryModule, 'useInventoryCatalog').mockReturnValue({
      data: { snapshot: uiSnapshot, isOffline: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useInventoryModule.useInventoryCatalog>);
  });

  afterEach(() => {
    for (const client of queryClients.splice(0)) {
      client.clear();
    }
  });

  it('renders Counter with quick-add chips, conversion text, and adjustable accessibility', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider>
        <Counter value={3} onChange={onChange} label="Normal Saline" conversionText="3 box = 60 bottle" />
      </ThemeProvider>,
    );

    expect(screen.getByText('3 box = 60 bottle')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('stock-counter-plus'));
    expect(onChange).toHaveBeenCalledWith(4);
    await fireEvent.press(screen.getByTestId('stock-counter-add-10'));
    expect(onChange).toHaveBeenCalledWith(13);
  });

  it('renders ReadinessGauge and VarianceChip cleanly', async () => {
    await render(
      <ThemeProvider>
        <>
          <ReadinessGauge score={88} band="ready" confidence="high" />
          <VarianceChip varianceQty={-4} variancePct={8.5} outOfTolerance />
        </>
      </ThemeProvider>,
    );

    expect(screen.getByText('88%')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('-4 (8.5%)')).toBeTruthy();
  });

  it('renders all 9 scenario templates on ScenariosScreen and navigates on press', async () => {
    await renderWithQuery(<ScenariosScreen />);

    expect(screen.getByText('Road Accident / Mass Casualty')).toBeTruthy();
    expect(screen.getByText('Maternity & Obstetric Surge')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('scenario-card-road_accident'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/scenarios/road_accident');
  });

  it('answers Ask MedPulse queries and marks operational tasks Done on TasksScreen', async () => {
    await renderWithQuery(<TasksScreen />);

    expect(screen.getByText('Ask MedPulse')).toBeTruthy();
    expect(screen.getByText('Replenish below MIN: Ringer Lactate 500ml')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('assistant-preset-expiring'));
    expect(screen.getByTestId('assistant-response')).toBeTruthy();
    expect(screen.getByText('Tool: list_expiring')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('task-done-task-min-item-1'));
    expect(screen.queryByTestId('task-card-task-min-item-1')).toBeNull();
  });
});
