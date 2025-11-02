import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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

    // Check for idempotency key
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      // Check if this request was already processed
      const existingAction = await db.action.findFirst({
        where: {
          declaration: {
            declaration_id
          },
          // In a real implementation, you'd store the idempotency key
        }
      });
      
      if (existingAction) {
        return NextResponse.json({
          message: "Request already processed",
          action: existingAction
        });
      }
    }

    // Get declaration with risk scores
    const declaration = await db.declaration.findUnique({
      where: { declaration_id },
      include: { 
        items: true,
        risk_scores: {
          orderBy: { created_at: 'desc' },
          take: 1
        }
      }
    });

    if (!declaration) {
      return NextResponse.json(
        { error: "Declaration not found" },
        { status: 404 }
      );
    }

    // Get latest risk score
    const riskScore = declaration.risk_scores[0];
    if (!riskScore) {
      return NextResponse.json(
        { error: "No risk score found for declaration" },
        { status: 400 }
      );
    }

    // Parse reason codes
    const reasonCodes = riskScore.reason_codes ? JSON.parse(riskScore.reason_codes) : [];

    // Policy engine for HOLD/STOP decisioning
    let action = "ALLOW";
    let reason = "";
    let ttlMinutes = null;

    // Policy rules
    if (riskScore.undervaluation >= 0.85) {
      action = "HOLD";
      reason = "Severe undervaluation detected";
      ttlMinutes = 720;
    } else if (riskScore.doc_forgery >= 0.80) {
      action = "STOP";
      reason = "High confidence document forgery";
      ttlMinutes = 1440;
    } else if (riskScore.network_risk >= 0.75) {
      action = "HOLD";
      reason = "Network risk detected";
      ttlMinutes = 480;
    } else if (riskScore.overall >= 0.7) {
      action = "HOLD";
      reason = "High overall risk score";
      ttlMinutes = 240;
    } else if (riskScore.overall < 0.25) {
      action = "ALLOW";
      reason = "Low risk declaration";
    }

    // Create action record
    const actionRecord = await db.action.create({
      data: {
        declaration_id: declaration.id,
        action,
        reason,
        policy_version: "2025-11-02-01",
        ttl_minutes: ttlMinutes
      }
    });

    // Update declaration status
    await db.declaration.update({
      where: { id: declaration.id },
      data: {
        status: action === "ALLOW" ? "RELEASED" : "HELD",
        channel: action === "ALLOW" ? "GREEN" : action === "STOP" ? "RED" : "YELLOW"
      }
    });

    // Create audit record
    await db.audit.create({
      data: {
        event_id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        declaration_id: declaration.id,
        actor: "system",
        action: `DECISION_${action}`,
        payload_hash: idempotencyKey || null
      }
    });

    return NextResponse.json({
      declaration_id,
      ts: new Date().toISOString(),
      decision: {
        action,
        ttl_minutes: ttlMinutes
      },
      reason,
      reason_codes: reasonCodes,
      policy_version: "2025-11-02-01",
      action_id: actionRecord.id
    });

  } catch (error) {
    console.error("Error in decision ingest:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}