/**
 * Tier Classification Engine
 *
 * Classifies suppliers into tiers based on composite score and RAG statuses.
 * Red-flag override: 2+ red pillars → Conditional regardless of composite.
 */

import type { RAGStatus } from './sot';

export type Tier = 'Strategic' | 'Preferred' | 'Approved' | 'Conditional';

export interface TierThresholds {
  strategic: number;  // >= 90
  preferred: number;  // >= 80
  approved: number;   // >= 65
}

const DEFAULT_THRESHOLDS: TierThresholds = { strategic: 90, preferred: 80, approved: 65 };

export function classifyTier(
  composite: number,
  ragStatuses: { sot: RAGStatus; quality: RAGStatus; pricing: RAGStatus; communication: RAGStatus },
  thresholds: TierThresholds = DEFAULT_THRESHOLDS
): Tier {
  const redCount = Object.values(ragStatuses).filter(r => r === 'red').length;

  // Red-flag override: 2+ red → Conditional always
  if (redCount >= 2) return 'Conditional';

  // Composite below minimum → Conditional
  if (composite < thresholds.approved) return 'Conditional';

  // One red pillar → capped at Approved
  if (redCount === 1) return 'Approved';

  // No red — classify by composite
  if (composite >= thresholds.strategic) return 'Strategic';
  if (composite >= thresholds.preferred) return 'Preferred';
  return 'Approved';
}

/**
 * Compute weighted composite score from pillar scores.
 *
 * Formula: 0.35×SOT + 0.25×Quality + 0.20×Pricing + 0.20×(Communication×10)
 */
export function computeComposite(
  sotPercentOnTime: number,
  qualityNormalized: number,
  pricingNormalized: number,
  communicationWeightedAvg: number,
  pricingInsufficientData: boolean = false
): number {
  const pricing = pricingInsufficientData ? 50 : pricingNormalized;
  const communication = communicationWeightedAvg * 10; // scale 1-10 to 0-100

  return (
    0.35 * sotPercentOnTime +
    0.25 * qualityNormalized +
    0.20 * pricing +
    0.20 * communication
  );
}
