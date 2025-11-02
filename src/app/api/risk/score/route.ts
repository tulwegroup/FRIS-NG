import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Risk scoring engine with ML and rules
function calculateRiskScore(declaration: any, items: any[]) {
  // Initialize scores
  const scores = {
    overall: 0.0,
    undervaluation: 0.0,
    misclassification: 0.0,
    origin_fraud: 0.0,
    doc_forgery: 0.0,
    network_risk: 0.0,
    payment_leakage: 0.0
  };

  const reasonCodes: string[] = [];

  // Rule 1: Check for undervaluation based on price bands
  for (const item of items) {
    // Mock price band check - in real implementation, this would query PriceBand table
    const priceBand = {
      p10: 50,
      p50: 100,
      p90: 150
    };

    if (item.invoice_value_usd < priceBand.p10) {
      scores.undervaluation = Math.max(scores.undervaluation, 0.8);
      reasonCodes.push(`Price_Outlier_${Math.round((item.invoice_value_usd - priceBand.p50) / priceBand.p50 * 100)}%_vs_band`);
    }
  }

  // Rule 2: Check for high-risk origins
  const highRiskOrigins = ['CN', 'HK', 'SG'];
  if (items.some(item => highRiskOrigins.includes(item.country_origin || ''))) {
    scores.origin_fraud = 0.6;
    reasonCodes.push('High_Risk_Origin');
  }

  // Rule 3: Check for weekend/holiday filings
  const lodgementDate = new Date(declaration.lodgement_ts);
  const dayOfWeek = lodgementDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    scores.network_risk = 0.4;
    reasonCodes.push('Weekend_Filing');
  }

  // Rule 4: Check for high-value shipments
  const totalValue = items.reduce((sum, item) => sum + item.invoice_value_usd, 0);
  if (totalValue > 100000) {
    scores.undervaluation = Math.max(scores.undervaluation, 0.5);
    reasonCodes.push('High_Value_Shipment');
  }

  // Calculate overall score (weighted average)
  scores.overall = Math.max(
    scores.undervaluation * 0.3,
    scores.misclassification * 0.2,
    scores.origin_fraud * 0.2,
    scores.doc_forgery * 0.1,
    scores.network_risk * 0.1,
    scores.payment_leakage * 0.1
  );

  return { scores, reasonCodes };
}

// Policy engine for decision making
function makeDecision(scores: any, reasonCodes: string[]) {
  const decision = {
    action: "ALLOW" as const,
    ttl_minutes: null as number | null,
    reason: ""
  };

  // Policy rules
  if (scores.undervaluation >= 0.85) {
    decision.action = "HOLD";
    decision.ttl_minutes = 720;
    decision.reason = "Severe undervaluation detected";
  } else if (scores.doc_forgery >= 0.80) {
    decision.action = "STOP";
    decision.ttl_minutes = 1440;
    decision.reason = "High confidence document forgery";
  } else if (scores.network_risk >= 0.75) {
    decision.action = "HOLD";
    decision.ttl_minutes = 480;
    decision.reason = "Network risk detected";
  } else if (scores.overall >= 0.7) {
    decision.action = "HOLD";
    decision.ttl_minutes = 240;
    decision.reason = "High overall risk score";
  } else if (scores.overall < 0.25) {
    decision.action = "ALLOW";
    decision.reason = "Low risk declaration";
  }

  return decision;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { declaration_id } = body;
    
    if (!declaration_id) {
      return NextResponse.json(
        { error: "Missing declaration_id" },
        { status: 400 }
      );
    }

    // Get declaration with items
    const declaration = await db.declaration.findUnique({
      where: { declaration_id },
      include: { items: true }
    });

    if (!declaration) {
      return NextResponse.json(
        { error: "Declaration not found" },
        { status: 404 }
      );
    }

    // Calculate risk scores
    const { scores, reasonCodes } = calculateRiskScore(declaration, declaration.items);

    // Make decision
    const decision = makeDecision(scores, reasonCodes);

    // Save risk score
    await db.riskScore.create({
      data: {
        declaration_id: declaration.id,
        overall: scores.overall,
        undervaluation: scores.undervaluation,
        misclassification: scores.misclassification,
        origin_fraud: scores.origin_fraud,
        doc_forgery: scores.doc_forgery,
        network_risk: scores.network_risk,
        payment_leakage: scores.payment_leakage,
        reason_codes: JSON.stringify(reasonCodes)
      }
    });

    // Create action if not ALLOW
    if (decision.action !== "ALLOW") {
      await db.action.create({
        data: {
          declaration_id: declaration.id,
          action: decision.action,
          reason: decision.reason,
          policy_version: "2025-11-02-01",
          ttl_minutes: decision.ttl_minutes
        }
      });
    }

    return NextResponse.json({
      declaration_id,
      ts: new Date().toISOString(),
      scores,
      reason_codes: reasonCodes,
      decision: {
        action: decision.action,
        ttl_minutes: decision.ttl_minutes
      },
      policy_version: "2025-11-02-01"
    });

  } catch (error) {
    console.error("Error in risk scoring:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}