import { NextRequest, NextResponse } from "next/server";
import { driftMonitor } from "@/lib/monitoring/drift";
import { withAuth } from "@/middleware/auth";
import { withObservability } from "@/lib/observability/middleware";

const handler = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'dashboard') {
      return await getDriftDashboard(request);
    } else if (action === 'run-check') {
      return await runDriftCheck();
    } else if (action === 'price-bands') {
      return await getPriceBandDrift(request);
    } else if (action === 'model-performance') {
      return await getModelPerformanceDrift(request);
    } else if (action === 'data-quality') {
      return await getDataQualityIssues(request);
    } else {
      return NextResponse.json(
        { error: "Invalid action parameter" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Monitoring API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
};

async function getDriftDashboard(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '30d';

  const dashboard = await driftMonitor.getDriftDashboard(period as any);

  return NextResponse.json({
    dashboard,
    timestamp: new Date().toISOString()
  });
}

async function runDriftCheck() {
  await driftMonitor.runDriftCheck();

  return NextResponse.json({
    message: "Drift check completed successfully",
    timestamp: new Date().toISOString()
  });
}

async function getPriceBandDrift(request: NextRequest) {
  const drifts = await driftMonitor.checkPriceBandDrift();

  return NextResponse.json({
    drifts,
    metric_type: 'PRICE_BAND',
    total_drifts: drifts.length,
    critical_drifts: drifts.filter(d => d.drift_percentage > 0.20).length,
    warning_drifts: drifts.filter(d => d.drift_percentage > 0.10 && d.drift_percentage <= 0.20).length,
    timestamp: new Date().toISOString()
  });
}

async function getModelPerformanceDrift(request: NextRequest) {
  const drifts = await driftMonitor.checkModelPerformanceDrift();

  return NextResponse.json({
    drifts,
    metric_type: 'MODEL_PERFORMANCE',
    total_drifts: drifts.length,
    critical_drifts: drifts.filter(d => d.drift_percentage > 0.10).length,
    warning_drifts: drifts.filter(d => d.drift_percentage > 0.05 && d.drift_percentage <= 0.10).length,
    timestamp: new Date().toISOString()
  });
}

async function getDataQualityIssues(request: NextRequest) {
  const issues = await driftMonitor.checkDataQuality();

  return NextResponse.json({
    issues,
    metric_type: 'DATA_QUALITY',
    total_issues: issues.length,
    high_severity_issues: issues.filter(i => i.severity === 'HIGH').length,
    medium_severity_issues: issues.filter(i => i.severity === 'MEDIUM').length,
    low_severity_issues: issues.filter(i => i.severity === 'LOW').length,
    timestamp: new Date().toISOString()
  });
}

export const GET = withObservability(withAuth(handler, ['monitoring:read']), 'monitoring_api');
export const POST = withObservability(withAuth(handler, ['monitoring:write']), 'monitoring_api');