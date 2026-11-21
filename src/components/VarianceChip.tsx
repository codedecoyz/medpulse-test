import { useTranslation } from 'react-i18next';
import { StatusChip } from './StatusChip';

export interface VarianceChipProps {
  varianceQty: number;
  variancePct: number;
  outOfTolerance: boolean;
}

/**
 * Accessible count variance chip pairing color, icon, signed quantity,
 * and percentage (MP-CNT-004, Section 11.4, Principle P8).
 */
export function VarianceChip({ varianceQty, variancePct, outOfTolerance }: VarianceChipProps) {
  const { t } = useTranslation();

  if (varianceQty === 0) {
    return <StatusChip variant="healthy" label={t('counting.varianceMatch')} />;
  }

  const signedQty = varianceQty > 0 ? `+${varianceQty}` : `${varianceQty}`;
  const label = `${signedQty} (${variancePct.toFixed(1)}%)`;

  return <StatusChip variant={outOfTolerance ? 'critical' : 'warning'} label={label} />;
}
