import { db } from '@/lib/db';

export interface MoneySavedAttribution {
  id: string;
  declaration_id: string;
  source: 'ACTION' | 'CASE' | 'RECONCILIATION' | 'BAND_ADJUSTMENT';
  amount: number;
  currency: string;
  confidence_score: number;
  attribution_factors: AttributionFactor[];
  rule_ids: string[];
  model_version?: string;
  created_at: string;
  verified: boolean;
  verified_by?: string;
  verified_at?: string;
}

export interface AttributionFactor {
  type: 'UNDERVALUATION' | 'MISCLASSIFICATION' | 'FRAUD_DETECTED' | 'COMPLIANCE_IMPROVEMENT';
  description: string;
  weight: number;
  evidence: string[];
}

export interface MoneySavedCalculation {
  total_money_saved: number;
  breakdown: {
    from_actions: number;
    from_cases: number;
    from_reconciliation: number;
    from_band_adjustments: number;
  };
  attribution_details: MoneySavedAttribution[];
  calculation_metadata: {
    period_start: string;
    period_end: string;
    baseline_revenue: number;
    actual_revenue: number;
    uplift_percentage: number;
    confidence_level: number;
  };
}

class MoneySavedCalculator {
  async calculateMoneySaved(
    periodStart: string,
    periodEnd: string,
    options: {
      includeVerifiedOnly?: boolean;
      minConfidence?: number;
      sources?: string[];
    } = {}
  ): Promise<MoneySavedCalculation> {
    const {
      includeVerifiedOnly = false,
      minConfidence = 0.5,
      sources = ['ACTION', 'CASE', 'RECONCILIATION', 'BAND_ADJUSTMENT']
    } = options;

    // Get all relevant attributions for the period
    const attributions = await this.getAttributionsForPeriod(
      periodStart,
      periodEnd,
      includeVerifiedOnly,
      minConfidence,
      sources
    );

    // Calculate breakdown by source
    const breakdown = {
      from_actions: 0,
      from_cases: 0,
      from_reconciliation: 0,
      from_band_adjustments: 0
    };

    attributions.forEach(attribution => {
      switch (attribution.source) {
        case 'ACTION':
          breakdown.from_actions += attribution.amount;
          break;
        case 'CASE':
          breakdown.from_cases += attribution.amount;
          break;
        case 'RECONCILIATION':
          breakdown.from_reconciliation += attribution.amount;
          break;
        case 'BAND_ADJUSTMENT':
          breakdown.from_band_adjustments += attribution.amount;
          break;
      }
    });

    const totalMoneySaved = Object.values(breakdown).reduce((sum, amount) => sum + amount, 0);

    // Get baseline revenue for comparison
    const baselineRevenue = await this.getBaselineRevenue(periodStart, periodEnd);
    const actualRevenue = baselineRevenue + totalMoneySaved;
    const upliftPercentage = baselineRevenue > 0 ? (totalMoneySaved / baselineRevenue) * 100 : 0;

    // Calculate overall confidence level
    const confidenceLevel = this.calculateOverallConfidence(attributions);

    return {
      total_money_saved: totalMoneySaved,
      breakdown,
      attribution_details: attributions,
      calculation_metadata: {
        period_start: periodStart,
        period_end: periodEnd,
        baseline_revenue: baselineRevenue,
        actual_revenue: actualRevenue,
        uplift_percentage: upliftPercentage,
        confidence_level: confidenceLevel
      }
    };
  }

  private async getAttributionsForPeriod(
    periodStart: string,
    periodEnd: string,
    includeVerifiedOnly: boolean,
    minConfidence: number,
    sources: string[]
  ): Promise<MoneySavedAttribution[]> {
    // This would query a dedicated attribution table in a real implementation
    // For now, we'll calculate attributions from existing data

    const attributions: MoneySavedAttribution[] = [];

    // Get HOLD/STOP actions that led to additional revenue
    const actions = await db.action.findMany({
      where: {
        created_at: {
          gte: new Date(periodStart),
          lte: new Date(periodEnd)
        },
        action: {
          in: ['HOLD', 'STOP']
        }
      },
      include: {
        declaration: {
          include: {
            items: true,
            risk_scores: true,
            payments: true
          }
        }
      }
    });

    for (const action of actions) {
      const declaration = action.declaration;
      if (!declaration) continue;

      const attribution = await this.calculateActionAttribution(action, declaration);
      if (attribution && attribution.confidence_score >= minConfidence) {
        attributions.push(attribution);
      }
    }

    // Get closed cases with recoveries
    const cases = await db.case.findMany({
      where: {
        closed_at: {
          gte: new Date(periodStart),
          lte: new Date(periodEnd)
        },
        status: 'CLOSED',
        outcome: {
          in: ['ADVERSE', 'SETTLED']
        },
        recovery_amount: {
          gt: 0
        }
      },
      include: {
        declaration: {
          include: {
            items: true,
            risk_scores: true
          }
        }
      }
    });

    for (const caseRecord of cases) {
      if (caseRecord.recovery_amount) {
        const attribution: MoneySavedAttribution = {
          id: `case_${caseRecord.case_id}`,
          declaration_id: caseRecord.declaration?.declaration_id || '',
          source: 'CASE',
          amount: caseRecord.recovery_amount,
          currency: 'NGN',
          confidence_score: 0.9, // High confidence for actual recoveries
          attribution_factors: [
            {
              type: 'COMPLIANCE_IMPROVEMENT',
              description: 'Recovery through post-clearance audit',
              weight: 1.0,
              evidence: [`Case ${caseRecord.case_id}`, `Outcome: ${caseRecord.outcome}`]
            }
          ],
          rule_ids: ['PCA_RECOVERY'],
          created_at: caseRecord.closed_at?.toISOString() || new Date().toISOString(),
          verified: true,
          verified_by: caseRecord.assigned_to || 'system'
        };
        attributions.push(attribution);
      }
    }

    // Get payment reconciliation discrepancies
    const payments = await db.payment.findMany({
      where: {
        created_at: {
          gte: new Date(periodStart),
          lte: new Date(periodEnd)
        },
        status: {
          in: ['SHORT', 'DELAYED']
        }
      },
      include: {
        declaration: {
          include: {
            items: true
          }
        }
      }
    });

    for (const payment of payments) {
      const delta = payment.assessed - payment.paid;
      if (delta > 0) {
        const attribution: MoneySavedAttribution = {
          id: `payment_${payment.bank_ref}`,
          declaration_id: payment.declaration?.declaration_id || '',
          source: 'RECONCILIATION',
          amount: delta,
          currency: 'NGN',
          confidence_score: 0.8,
          attribution_factors: [
            {
              type: 'COMPLIANCE_IMPROVEMENT',
              description: 'Payment discrepancy detected and reconciled',
              weight: 1.0,
              evidence: [`Bank ref: ${payment.bank_ref}`, `Status: ${payment.status}`]
            }
          ],
          rule_ids: ['PAYMENT_RECONCILIATION'],
          created_at: payment.created_at.toISOString(),
          verified: true
        };
        attributions.push(attribution);
      }
    }

    // Filter by sources and verification status
    return attributions.filter(attribution => {
      if (includeVerifiedOnly && !attribution.verified) return false;
      if (!sources.includes(attribution.source)) return false;
      return true;
    });
  }

  private async calculateActionAttribution(action: any, declaration: any): Promise<MoneySavedAttribution | null> {
    const riskScore = declaration.risk_scores?.[0];
    if (!riskScore) return null;

    // Estimate additional revenue that would have been lost without this action
    const totalDeclaredValue = declaration.items.reduce((sum: number, item: any) => sum + item.invoice_value_usd, 0);
    
    // Calculate potential undervaluation based on risk score
    let estimatedAdditionalRevenue = 0;
    const factors: AttributionFactor[] = [];
    const ruleIds: string[] = [];

    if (riskScore.undervaluation > 0.5) {
      const undervaluationAmount = totalDeclaredValue * riskScore.undervaluation * 0.2; // Assume 20% duty rate
      estimatedAdditionalRevenue += undervaluationAmount;
      
      factors.push({
        type: 'UNDERVALUATION',
        description: `Undervaluation detected (${(riskScore.undervaluation * 100).toFixed(1)}% confidence)`,
        weight: riskScore.undervaluation,
        evidence: [`Risk score: ${riskScore.undervaluation}`, `Action: ${action.action}`]
      });
      ruleIds.push('UNDERVALUATION_DETECTION');
    }

    if (riskScore.misclassification > 0.5) {
      const misclassificationAmount = totalDeclaredValue * riskScore.misclassification * 0.15; // Assume 15% tariff difference
      estimatedAdditionalRevenue += misclassificationAmount;
      
      factors.push({
        type: 'MISCLASSIFICATION',
        description: `HS misclassification detected (${(riskScore.misclassification * 100).toFixed(1)}% confidence)`,
        weight: riskScore.misclassification,
        evidence: [`Risk score: ${riskScore.misclassification}`, `Action: ${action.action}`]
      });
      ruleIds.push('MISCLASSIFICATION_DETECTION');
    }

    if (estimatedAdditionalRevenue <= 0) return null;

    // Calculate overall confidence score
    const confidenceScore = Math.max(...factors.map(f => f.weight));

    return {
      id: `action_${action.id}`,
      declaration_id: declaration.declaration_id,
      source: 'ACTION',
      amount: estimatedAdditionalRevenue,
      currency: 'NGN',
      confidence_score: confidenceScore,
      attribution_factors: factors,
      rule_ids,
      created_at: action.created_at.toISOString(),
      verified: false
    };
  }

  private async getBaselineRevenue(periodStart: string, periodEnd: string): Promise<number> {
    // In a real implementation, this would query historical data
    // For now, return a reasonable baseline
    return 1000000; // 1M NGN baseline
  }

  private calculateOverallConfidence(attributions: MoneySavedAttribution[]): number {
    if (attributions.length === 0) return 0;

    const totalWeight = attributions.reduce((sum, attr) => sum + attr.confidence_score, 0);
    return totalWeight / attributions.length;
  }

  async verifyAttribution(
    attributionId: string,
    verified: boolean,
    verifiedBy: string,
    notes?: string
  ): Promise<boolean> {
    // In a real implementation, this would update the attribution record
    console.log(`Verifying attribution ${attributionId}: ${verified} by ${verifiedBy}`);
    if (notes) {
      console.log(`Verification notes: ${notes}`);
    }
    return true;
  }

  async getAttributionReport(
    periodStart: string,
    periodEnd: string,
    groupBy: 'source' | 'day' | 'rule' = 'source'
  ): Promise<any> {
    const calculation = await this.calculateMoneySaved(periodStart, periodEnd);

    if (groupBy === 'source') {
      return {
        period: { start: periodStart, end: periodEnd },
        total: calculation.total_money_saved,
        breakdown: calculation.breakdown,
        confidence: calculation.calculation_metadata.confidence_level
      };
    }

    // Implement other grouping logic as needed
    return calculation;
  }
}

export const moneySavedCalculator = new MoneySavedCalculator();