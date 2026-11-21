import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StockBar } from '@/components/StockBar';
import { buildInventorySnapshot } from '@/features/inventory/inventoryService';
import * as inventoryService from '@/features/inventory/inventoryService';
import { changeAppLanguage } from '@/lib/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';
import InventoryScreen from '../../app/(tabs)/inventory/index';
import MovementScreen from '../../app/(tabs)/inventory/movement';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ type: 'issue', itemId: 'item-1' }),
}));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'authenticated',
    profile: {
      id: 'user-store',
      hospital_id: 'h1',
      full_name: 'Store Manager',
      role: 'store_manager',
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
      { id: 'loc-1', hospital_id: 'h1', parent_id: null, name: 'Central Store', type: 'central_store', created_at: '' },
      { id: 'loc-2', hospital_id: 'h1', parent_id: null, name: 'Emergency Room', type: 'er', created_at: '' },
    ],
    activeLocationId: 'loc-1',
    setActiveLocationId: jest.fn(),
  }),
}));

const testSnapshot = buildInventorySnapshot({
  hospitalId: 'h1',
  locations: [
    { id: 'loc-1', hospital_id: 'h1', parent_id: null, name: 'Central Store', type: 'central_store', created_at: '' },
    { id: 'loc-2', hospital_id: 'h1', parent_id: null, name: 'Emergency Room', type: 'er', created_at: '' },
  ],
  categories: [{ id: 'cat-1', hospitalId: 'h1', name: 'IV Fluids', slug: 'iv-fluids' }],
  suppliersById: { 'sup-1': 'Apollo Pharma' },
  items: [
    {
      id: 'item-1',
      hospital_id: 'h1',
      sku: 'IVF-036',
      name: 'Normal Saline 0.9% 500ml',
      category_id: 'cat-1',
      base_unit: 'bottle',
      barcode: '8901000036',
      criticality: 'B',
      is_controlled: false,
      is_cold_chain: false,
      tracks_batch: true,
      tracks_expiry: true,
      unit_cost: 34,
      supplier_id: 'sup-1',
    },
  ],
  units: [
    { itemId: 'item-1', unit: 'bottle', factorToBase: 1, isOrderPack: false },
    { itemId: 'item-1', unit: 'box', factorToBase: 20, isOrderPack: true },
  ],
  batches: [
    { id: 'b-late', hospitalId: 'h1', itemId: 'item-1', batchNo: 'NS-B2', expiryDate: '2027-08-01', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'b-early', hospitalId: 'h1', itemId: 'item-1', batchNo: 'NS-B1', expiryDate: '2027-01-15', createdAt: '2026-01-02T00:00:00Z' },
  ],
  parLevels: [
    { itemId: 'item-1', locationId: 'loc-1', minQty: 20, parQty: 60, maxQty: 150 },
  ],
  stockLevels: [
    { id: 'sl-1', itemId: 'item-1', batchId: 'b-late', locationId: 'loc-1', condition: 'usable', qty: 30, reservedQty: 0, lastCountedAt: null },
    { id: 'sl-2', itemId: 'item-1', batchId: 'b-early', locationId: 'loc-1', condition: 'usable', qty: 12, reservedQty: 0, lastCountedAt: null },
  ],
  reasonCodes: [
    { code: 'damaged', labelEn: 'Damaged', labelHi: 'क्षतिग्रस्त', requiresNote: false, isActive: true },
    { code: 'other', labelEn: 'Other (note required)', labelHi: 'अन्य', requiresNote: true, isActive: true },
  ],
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

describe('Phase 1 Inventory & Movement UI', () => {
  beforeEach(async () => {
    await changeAppLanguage('en');
    jest.restoreAllMocks();
    jest.spyOn(inventoryService, 'fetchAndCacheInventory').mockResolvedValue({
      snapshot: testSnapshot,
      isOffline: false,
    });
    jest.spyOn(inventoryService, 'fetchRecentMovements').mockResolvedValue([]);
  });

  afterEach(() => {
    for (const client of queryClients.splice(0)) {
      client.clear();
    }
  });

  it('renders StockBar and OfflineBanner with accessible labels (P8, MP-INV-011)', async () => {
    await render(
      <ThemeProvider>
        <StockBar usable={15} minQty={10} parQty={30} maxQty={60} unit="bottle" />
      </ThemeProvider>,
    );
    expect(screen.getByText('15 bottle usable · PAR 30')).toBeTruthy();

    await render(
      <ThemeProvider>
        <OfflineBanner
          isOffline
          lastSyncedAt="2026-11-21T00:00:00.000Z"
          pendingCount={2}
          failedCount={1}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Offline mode')).toBeTruthy();
    expect(screen.getByText('1 needs attention')).toBeTruthy();
  });

  it('renders Inventory catalog, searches items, and hides scanner UI when scanner_beta is off', async () => {
    await renderWithQuery(<InventoryScreen />);

    await waitFor(() => {
      expect(screen.getByText('Normal Saline 0.9% 500ml')).toBeTruthy();
    });

    expect(screen.queryByText('In Testing')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('inventory-search-input'), 'nonexistent-sku');
    expect(screen.getByText('No matching items found in the inventory catalog.')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('inventory-search-input'), '8901000036');
    expect(screen.getByText('Normal Saline 0.9% 500ml')).toBeTruthy();
  });

  it('pre-selects FEFO batch, converts UoM, blocks negative stock, and enforces batch/reason rules', async () => {
    const submitSpy = jest
      .spyOn(inventoryService, 'submitOrQueueMovement')
      .mockResolvedValue({ mode: 'synced', movementId: 'mov-1', duplicate: false });

    await renderWithQuery(<MovementScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('mov-fefo-batch-NS-B1')).toBeTruthy();
    });

    // Earliest expiry batch NS-B1 is pre-selected by FEFO
    expect(screen.getByTestId('mov-fefo-batch-NS-B1').props.accessibilityState?.selected).toBe(true);

    // Switch UoM to box (x20) and enter qty 1 -> = 20 bottles, exceeding NS-B1's 12 available
    await fireEvent.press(screen.getByTestId('mov-uom-box'));
    expect(screen.getByText('1 box = 20 bottle')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('mov-submit-btn'));
    expect(screen.getByText('Only 12 available')).toBeTruthy();
    expect(submitSpy).not.toHaveBeenCalled();

    // Switch back to bottle and issue 5 -> succeeds
    await fireEvent.press(screen.getByTestId('mov-uom-bottle'));
    await fireEvent.changeText(screen.getByTestId('mov-qty-input'), '5');
    await fireEvent.press(screen.getByTestId('mov-submit-btn'));

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(1);
    });
    expect(submitSpy.mock.calls[0]?.[0]).toMatchObject({
      type: 'issue',
      qtyBase: 5,
      batchId: 'b-early',
    });

    // Receive requires batch and expiry (MP-MOV-006)
    await fireEvent.press(screen.getByTestId('mov-type-receive'));
    await fireEvent.press(screen.getByTestId('mov-submit-btn'));
    expect(screen.getByText('Batch number or batch selection is required for this item.')).toBeTruthy();

    // Wastage requires reason code (MP-MOV-007)
    await fireEvent.press(screen.getByTestId('mov-type-wastage'));
    await fireEvent.press(screen.getByTestId('mov-submit-btn'));
    expect(screen.getByText('Select a reason code.')).toBeTruthy();
  });
});
