import { WhtTaxableBaseType, WhtTreatment } from '@/types';

export type WhtInput = {
  treatment: WhtTreatment;
  rate: number; // e.g. 6 (percent)
  taxableBaseType: WhtTaxableBaseType;
  subtotalExclVat: number;
  totalInclVat: number;
  manualAmount?: number;
};

export type WhtResult = {
  taxableBase: number;
  whtAmount: number;
  netPayable: number;
  grossedUpAmount: number | null;
};

export function computeWHT(input: WhtInput): WhtResult {
  const { treatment, rate, taxableBaseType, subtotalExclVat, totalInclVat, manualAmount } = input;
  const rateDecimal = rate / 100;

  let taxableBase: number;
  switch (taxableBaseType) {
    case 'SUBTOTAL_EXCL_VAT':
      taxableBase = subtotalExclVat;
      break;
    case 'TOTAL_INCL_VAT':
      taxableBase = totalInclVat;
      break;
    case 'MANUAL':
      taxableBase = manualAmount ?? 0;
      break;
  }

  if (treatment === 'STANDARD_DEDUCTION') {
    const whtAmount = Math.round(taxableBase * rateDecimal);
    return {
      taxableBase,
      whtAmount,
      netPayable: totalInclVat - whtAmount,
      grossedUpAmount: null,
    };
  }

  // GROSS_UP: supplier must net exactly taxableBase after WHT
  // grossedUp = taxableBase / (1 - rate)
  const grossedUpExact = taxableBase / (1 - rateDecimal);
  const grossedUpAmount = Math.round(grossedUpExact);
  const whtAmount = grossedUpAmount - taxableBase;

  return {
    taxableBase,
    whtAmount,
    netPayable: taxableBase,
    grossedUpAmount,
  };
}

export const WHT_TREATMENT_LABELS: Record<WhtTreatment, string> = {
  STANDARD_DEDUCTION: 'Standard Deduction',
  GROSS_UP: 'Gross-up (supplier nets target amount)',
};

export const WHT_BASE_LABELS: Record<WhtTaxableBaseType, string> = {
  SUBTOTAL_EXCL_VAT: 'Subtotal (excl. VAT)',
  TOTAL_INCL_VAT: 'Total (incl. VAT)',
  MANUAL: 'Manual amount',
};
