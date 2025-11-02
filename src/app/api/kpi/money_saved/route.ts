import { NextRequest, NextResponse } from "next/server";
import { moneySavedCalculator } from "@/lib/attribution/calculator";
import { withAuth } from "@/middleware/auth";
import { withObservability } from "@/lib/observability/middleware";

const handler = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const groupBy = searchParams.get('groupBy') || 'source';
    const includeVerifiedOnly = searchParams.get('verifiedOnly') === 'true';
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0.5');

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing required parameters: from and to" },
        { status: 400 }
      );
    }

    const calculation = await moneySavedCalculator.calculateMoneySaved(from, to, {
      includeVerifiedOnly,
      minConfidence
    });

    // Get detailed report if requested
    let detailedReport = null;
    if (groupBy !== 'source') {
      detailedReport = await moneySavedCalculator.getAttributionReport(from, to, groupBy as any);
    }

    return NextResponse.json({
      calculation,
      detailed_report: detailedReport,
      request_parameters: {
        from,
        to,
        groupBy,
        includeVerifiedOnly,
        minConfidence
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error calculating money saved KPI:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
};

export const GET = withObservability(withAuth(handler, ['kpi:read']), 'money_saved_kpi');