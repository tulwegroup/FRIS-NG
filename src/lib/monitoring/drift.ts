import { db } from '@/lib/db';

export interface DriftAlert {
  id: string;
  metric_type: 'PRICE_BAND' | 'MODEL_PERFORMANCE' | 'DATA_QUALITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  detected_at: string;
  affected_entities: string[];
  drift_score: number;
  threshold: number;
  recommended_action: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';
  assigned_to?: string;
  resolved_at?: string;
  resolution_notes?: string;
}

export interface PriceBandDrift {
  hs6: string;
  origin: string;
  incoterm: string;
  current_p50: number;
  previous_p50: number;
  drift_percentage: number;
  sample_count_current: number;
  sample_count_previous: number;
  last_updated: string;
  confidence: number;
}

export interface ModelPerformanceDrift {
  model_name: string;
  model_version: string;
  metric_name: string;
  current_value: number;
  baseline_value: number;
  drift_percentage: number;
  sample_size: number;
  confidence: number;
  feature_importance?: Record<string, number>;
}

export interface DataQualityIssue {
  table_name: string;
  column_name: string;
  issue_type: 'NULL_RATE' | 'OUTLIER' | 'FORMAT_VIOLATION' | 'CARDINALITY_CHANGE';
  current_value: number;
  baseline_value: number;
  threshold: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  affected_rows: number;
  detected_at: string;
}

class DriftMonitor {
  private priceBandThresholds = {
    warning: 0.10, // 10% drift triggers warning
    critical: 0.20  // 20% drift triggers critical alert
  };

  private modelPerformanceThresholds = {
    warning: 0.05, // 5% performance drop triggers warning
    critical: 0.10 // 10% performance drop triggers critical alert
  };

  private dataQualityThresholds = {
    nullRate: 0.05, // 5% null rate threshold
    outlierRate: 0.01, // 1% outlier rate threshold
    formatViolation: 0.02 // 2% format violation threshold
  };

  async checkPriceBandDrift(): Promise<PriceBandDrift[]> {
    const drifts: PriceBandDrift[] = [];

    try {
      // Get current price bands
      const currentBands = await db.priceBand.findMany({
        where: {
          period_end: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        orderBy: { period_end: 'desc' }
      });

      // Get previous price bands for comparison
      const previousBands = await db.priceBand.findMany({
        where: {
          period_end: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 30-90 days ago
            lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        orderBy: { period_end: 'desc' }
      });

      // Compare current and previous bands
      for (const currentBand of currentBands) {
        const previousBand = previousBands.find(
          pb => pb.hs6 === currentBand.hs6 && 
                pb.origin === currentBand.origin && 
                pb.incoterm === currentBand.incoterm
        );

        if (previousBand && previousBand.p50 > 0) {
          const driftPercentage = Math.abs((currentBand.p50 - previousBand.p50) / previousBand.p50);
          
          if (driftPercentage > this.priceBandThresholds.warning) {
            const drift: PriceBandDrift = {
              hs6: currentBand.hs6,
              origin: currentBand.origin,
              incoterm: currentBand.incoterm,
              current_p50: currentBand.p50,
              previous_p50: previousBand.p50,
              drift_percentage: driftPercentage,
              sample_count_current: currentBand.sample_count,
              sample_count_previous: previousBand.sample_count,
              last_updated: currentBand.period_end.toISOString(),
              confidence: Math.min(currentBand.sample_count, previousBand.sample_count) / 100
            };

            drifts.push(drift);

            // Create alert if drift is significant
            if (driftPercentage > this.priceBandThresholds.critical) {
              await this.createDriftAlert({
                metric_type: 'PRICE_BAND',
                severity: 'CRITICAL',
                description: `Critical price band drift detected for HS6 ${currentBand.hs6} from ${currentBand.origin}`,
                detected_at: new Date().toISOString(),
                affected_entities: [`${currentBand.hs6}-${currentBand.origin}-${currentBand.incoterm}`],
                drift_score: driftPercentage,
                threshold: this.priceBandThresholds.critical,
                recommended_action: 'Review and update price bands, investigate market changes',
                status: 'OPEN'
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking price band drift:', error);
    }

    return drifts;
  }

  async checkModelPerformanceDrift(): Promise<ModelPerformanceDrift[]> {
    const drifts: ModelPerformanceDrift[] = [];

    try {
      // This would query model performance metrics from a monitoring system
      // For now, we'll simulate with some basic checks

      // Check risk scoring model performance
      const recentRiskScores = await db.riskScore.findMany({
        where: {
          created_at: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        }
      });

      if (recentRiskScores.length > 100) {
        const currentAccuracy = this.calculateModelAccuracy(recentRiskScores);
        const baselineAccuracy = 0.85; // Assume 85% baseline accuracy

        const driftPercentage = Math.abs((currentAccuracy - baselineAccuracy) / baselineAccuracy);

        if (driftPercentage > this.modelPerformanceThresholds.warning) {
          const drift: ModelPerformanceDrift = {
            model_name: 'risk_scoring',
            model_version: '2025-11-02-01',
            metric_name: 'accuracy',
            current_value: currentAccuracy,
            baseline_value: baselineAccuracy,
            drift_percentage: driftPercentage,
            sample_size: recentRiskScores.length,
            confidence: 0.95
          };

          drifts.push(drift);

          if (driftPercentage > this.modelPerformanceThresholds.critical) {
            await this.createDriftAlert({
              metric_type: 'MODEL_PERFORMANCE',
              severity: 'CRITICAL',
              description: `Critical model performance drift detected in risk scoring model`,
              detected_at: new Date().toISOString(),
              affected_entities: ['risk_scoring_model'],
              drift_score: driftPercentage,
              threshold: this.modelPerformanceThresholds.critical,
              recommended_action: 'Retrain model with recent data, investigate feature drift',
              status: 'OPEN'
            });
          }
        }
      }
    } catch (error) {
      console.error('Error checking model performance drift:', error);
    }

    return drifts;
  }

  async checkDataQuality(): Promise<DataQualityIssue[]> {
    const issues: DataQualityIssue[] = [];

    try {
      // Check declaration data quality
      const recentDeclarations = await db.declaration.findMany({
        where: {
          created_at: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        }
      });

      // Check for null rates in critical fields
      const totalDeclarations = recentDeclarations.length;
      if (totalDeclarations > 0) {
        // Check consignee_tin null rate
        const nullTinCount = recentDeclarations.filter(d => !d.consignee_tin).length;
        const nullTinRate = nullTinCount / totalDeclarations;

        if (nullTinRate > this.dataQualityThresholds.nullRate) {
          issues.push({
            table_name: 'declarations',
            column_name: 'consignee_tin',
            issue_type: 'NULL_RATE',
            current_value: nullTinRate,
            baseline_value: 0.02, // Assume 2% baseline
            threshold: this.dataQualityThresholds.nullRate,
            severity: nullTinRate > 0.1 ? 'HIGH' : 'MEDIUM',
            affected_rows: nullTinCount,
            detected_at: new Date().toISOString()
          });
        }

        // Check for outlier values in invoice amounts
        const items = await db.item.findMany({
          where: {
            declaration: {
              created_at: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
              }
            }
          }
        });

        if (items.length > 0) {
          const values = items.map(item => item.invoice_value_usd).sort((a, b) => a - b);
          const q1 = values[Math.floor(values.length * 0.25)];
          const q3 = values[Math.floor(values.length * 0.75)];
          const iqr = q3 - q1;
          const outlierThreshold = q3 + 3 * iqr;

          const outlierCount = values.filter(v => v > outlierThreshold).length;
          const outlierRate = outlierCount / values.length;

          if (outlierRate > this.dataQualityThresholds.outlierRate) {
            issues.push({
              table_name: 'items',
              column_name: 'invoice_value_usd',
              issue_type: 'OUTLIER',
              current_value: outlierRate,
              baseline_value: 0.005, // Assume 0.5% baseline
              threshold: this.dataQualityThresholds.outlierRate,
              severity: 'MEDIUM',
              affected_rows: outlierCount,
              detected_at: new Date().toISOString()
            });
          }
        }
      }
    } catch (error) {
      console.error('Error checking data quality:', error);
    }

    return issues;
  }

  private async createDriftAlert(alert: Omit<DriftAlert, 'id'>): Promise<void> {
    // In production, this would store alerts in a dedicated table
    console.log('Creating drift alert:', alert);
    
    // Send notification
    await this.sendDriftNotification(alert);
  }

  private async sendDriftNotification(alert: DriftAlert): Promise<void> {
    // In production, this would send actual notifications
    console.log(`Drift Alert: ${alert.severity} - ${alert.description}`);
    console.log(`Drift Score: ${alert.drift_score.toFixed(3)} (Threshold: ${alert.threshold})`);
    console.log(`Recommended Action: ${alert.recommended_action}`);
  }

  private calculateModelAccuracy(scores: any[]): number {
    // Simplified accuracy calculation - in production, this would use actual model performance metrics
    const highRiskScores = scores.filter(s => s.overall > 0.7).length;
    const totalScores = scores.length;
    
    // Assume accuracy based on distribution of scores
    return Math.min(0.95, 0.7 + (highRiskScores / totalScores) * 0.3);
  }

  async getDriftDashboard(period: '7d' | '30d' | '90d' = '30d'): Promise<any> {
    const periodStart = new Date();
    
    switch (period) {
      case '7d':
        periodStart.setDate(periodStart.getDate() - 7);
        break;
      case '30d':
        periodStart.setDate(periodStart.getDate() - 30);
        break;
      case '90d':
        periodStart.setDate(periodStart.getDate() - 90);
        break;
    }

    const [priceBandDrifts, modelDrifts, dataQualityIssues] = await Promise.all([
      this.checkPriceBandDrift(),
      this.checkModelPerformanceDrift(),
      this.checkDataQuality()
    ]);

    return {
      period,
      start_date: periodStart.toISOString(),
      end_date: new Date().toISOString(),
      summary: {
        total_alerts: priceBandDrifts.length + modelDrifts.length + dataQualityIssues.length,
        price_band_alerts: priceBandDrifts.length,
        model_alerts: modelDrifts.length,
        data_quality_alerts: dataQualityIssues.length,
        critical_alerts: [
          ...priceBandDrifts.filter(d => d.drift_percentage > this.priceBandThresholds.critical),
          ...modelDrifts.filter(d => d.drift_percentage > this.modelPerformanceThresholds.critical),
          ...dataQualityIssues.filter(d => d.severity === 'HIGH')
        ].length
      },
      details: {
        price_band_drifts: priceBandDrifts,
        model_drifts: modelDrifts,
        data_quality_issues: dataQualityIssues
      },
      thresholds: {
        price_band: this.priceBandThresholds,
        model_performance: this.modelPerformanceThresholds,
        data_quality: this.dataQualityThresholds
      }
    };
  }

  async runDriftCheck(): Promise<void> {
    console.log('Running comprehensive drift check...');
    
    const [priceBandDrifts, modelDrifts, dataQualityIssues] = await Promise.all([
      this.checkPriceBandDrift(),
      this.checkModelPerformanceDrift(),
      this.checkDataQuality()
    ]);

    console.log(`Drift check completed:
      - Price band drifts: ${priceBandDrifts.length}
      - Model performance drifts: ${modelDrifts.length}
      - Data quality issues: ${dataQualityIssues.length}
    `);

    // Store drift check results
    await this.storeDriftCheckResults({
      timestamp: new Date().toISOString(),
      price_band_drifts: priceBandDrifts.length,
      model_drifts: modelDrifts.length,
      data_quality_issues: dataQualityIssues.length,
      total_alerts: priceBandDrifts.length + modelDrifts.length + dataQualityIssues.length
    });
  }

  private async storeDriftCheckResults(results: any): Promise<void> {
    // In production, this would store drift check results in a monitoring table
    await db.audit.create({
      data: {
        event_id: `drift_check_${Date.now()}`,
        action: 'DRIFT_CHECK_COMPLETED',
        payload_hash: JSON.stringify(results)
      }
    });
  }
}

export const driftMonitor = new DriftMonitor();