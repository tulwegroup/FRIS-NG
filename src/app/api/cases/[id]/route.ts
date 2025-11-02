import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caseId = params.id;

    const caseRecord = await db.case.findUnique({
      where: { case_id: caseId },
      include: {
        declaration: {
          include: {
            items: true,
            risk_scores: {
              orderBy: { created_at: 'desc' },
              take: 1
            },
            actions: {
              orderBy: { created_at: 'desc' }
            },
            payments: {
              orderBy: { created_at: 'desc' }
            }
          }
        }
      }
    });

    if (!caseRecord) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      case: {
        case_id: caseRecord.case_id,
        declaration_id: caseRecord.declaration?.declaration_id,
        type: caseRecord.type,
        expected_recovery: caseRecord.expected_recovery,
        status: caseRecord.status,
        outcome: caseRecord.outcome,
        recovery_amount: caseRecord.recovery_amount,
        assigned_to: caseRecord.assigned_to,
        opened_at: caseRecord.opened_at,
        closed_at: caseRecord.closed_at,
        declaration: caseRecord.declaration
      }
    });

  } catch (error) {
    console.error("Error fetching case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caseId = params.id;
    const body = await request.json();

    const { outcome, recovery_amount, actor } = body;

    // Validate outcome
    const validOutcomes = ["ADVERSE", "CLEAN", "SETTLED", "APPEALED"];
    if (outcome && !validOutcomes.includes(outcome)) {
      return NextResponse.json(
        { error: "Invalid outcome" },
        { status: 400 }
      );
    }

    // Get case
    const caseRecord = await db.case.findUnique({
      where: { case_id: caseId }
    });

    if (!caseRecord) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404 }
      );
    }

    // Update case
    const updatedCase = await db.case.update({
      where: { case_id: caseId },
      data: {
        status: "CLOSED",
        outcome: outcome || null,
        recovery_amount: recovery_amount || null,
        closed_at: new Date()
      }
    });

    // Create audit record
    await db.audit.create({
      data: {
        event_id: `case_close_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        declaration_id: caseRecord.declaration_id,
        actor: actor || "system",
        action: "CASE_CLOSED",
        payload_hash: JSON.stringify({ case_id: caseId, outcome, recovery_amount })
      }
    });

    return NextResponse.json({
      message: "Case closed successfully",
      case: {
        case_id: updatedCase.case_id,
        declaration_id: caseRecord.declaration_id,
        type: updatedCase.type,
        expected_recovery: updatedCase.expected_recovery,
        status: updatedCase.status,
        outcome: updatedCase.outcome,
        recovery_amount: updatedCase.recovery_amount,
        assigned_to: updatedCase.assigned_to,
        opened_at: updatedCase.opened_at,
        closed_at: updatedCase.closed_at
      }
    });

  } catch (error) {
    console.error("Error closing case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}