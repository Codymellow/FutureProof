/**
 * Ship-on-Time (SOT) Pillar Scoring
 *
 * Computes delivery performance score from historical shipment records.
 * Grace period: deliveries less than 10 days late count as on-time.
 */

export interface SOTRecord {
  supplierId: string;
  poNumber: string;
  originalDueDate: string;
  actualDeliveryDate: string;
  quantity: number;
}

export interface LateBucket {
  range: string;
  count: number;
}

export type RAGStatus = 'green' | 'amber' | 'red';

export interface ShipOnTimeScore {
  weight: 0.35;
  percentOnTime: number;
  rag: RAGStatus;
  histogram: LateBucket[];
  avgLateDaysAllPOs: number;
  avgLateDaysWhenLate: number;
  totalPOs: number;
  latePOs: number;
  gracePeriodDays: 10;
}

export interface SOTThresholds {
  green: number;   // >= 94
  amber: number;   // >= 85
  gracePeriodDays: number; // 10
}

const DEFAULT_THRESHOLDS: SOTThresholds = { green: 94, amber: 85, gracePeriodDays: 10 };

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeSOTScore(
  records: SOTRecord[],
  thresholds: SOTThresholds = DEFAULT_THRESHOLDS
): ShipOnTimeScore {
  const GRACE = thresholds.gracePeriodDays;
  const totalPOs = records.length;

  if (totalPOs === 0) {
    return {
      weight: 0.35, percentOnTime: 0, rag: 'red',
      histogram: [], avgLateDaysAllPOs: 0, avgLateDaysWhenLate: 0,
      totalPOs: 0, latePOs: 0, gracePeriodDays: 10,
    };
  }

  let latePOs = 0;
  let totalLateDays = 0;
  let lateOnlyDays = 0;
  const buckets = new Map<string, number>([
    ['10-14 days', 0], ['15-21 days', 0], ['22-30 days', 0], ['30+ days', 0],
  ]);

  for (const record of records) {
    const daysLate = daysBetween(record.originalDueDate, record.actualDeliveryDate);

    if (daysLate >= GRACE) {
      latePOs++;
      lateOnlyDays += daysLate;
      totalLateDays += daysLate;

      if (daysLate <= 14) buckets.set('10-14 days', (buckets.get('10-14 days') ?? 0) + 1);
      else if (daysLate <= 21) buckets.set('15-21 days', (buckets.get('15-21 days') ?? 0) + 1);
      else if (daysLate <= 30) buckets.set('22-30 days', (buckets.get('22-30 days') ?? 0) + 1);
      else buckets.set('30+ days', (buckets.get('30+ days') ?? 0) + 1);
    }
  }

  const percentOnTime = ((totalPOs - latePOs) / totalPOs) * 100;

  return {
    weight: 0.35,
    percentOnTime,
    rag: computeSOTRAG(percentOnTime, thresholds),
    histogram: Array.from(buckets.entries()).map(([range, count]) => ({ range, count })),
    avgLateDaysAllPOs: totalLateDays / totalPOs,
    avgLateDaysWhenLate: latePOs > 0 ? lateOnlyDays / latePOs : 0,
    totalPOs,
    latePOs,
    gracePeriodDays: 10,
  };
}

export function computeSOTRAG(percentOnTime: number, thresholds: SOTThresholds = DEFAULT_THRESHOLDS): RAGStatus {
  if (percentOnTime >= thresholds.green) return 'green';
  if (percentOnTime >= thresholds.amber) return 'amber';
  return 'red';
}
