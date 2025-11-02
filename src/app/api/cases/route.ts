import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { declaration_id, type, expected_recovery } = body;
    
    if (!declaration_id || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ["PCA", "INVESTIGATION", "VALUATION_REVIEW"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid case type" },
        { status: 400 }
      );
    }

    // Get declaration
    const declaration = await db.declaration.findUnique({
      where: { declaration_id }
    });

    if (!declaration) {
      return NextResponse.json(
        { error: "Declaration not found" },
        { status: 404 }
      );
    }

    // Generate unique case ID
    const caseId = `CASE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create case
    const caseRecord = await db.case.create({
      data: {
        case_id: caseId,
        declaration_id: declaration.id,
        type,
        expected_recovery: expected_recovery || null,
        status: "OPEN",
        assigned_to: body.assigned_to || null
      }
    });

    // Create audit record
    await db.audit.create({
      data: {
        event_id: `case_open_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        declaration_id: declaration.id,
        actor: body.assigned_to || "system",
        action: "CASE_OPENED",
        payload_hash: JSON.stringify({ case_id: caseId, type })
      }
    });

    return NextResponse.json({
      message: "Case opened successfully",
      case: {
        case_id: caseId,
        declaration_id,
        type,
        expected_recovery,
        status: "OPEN",
        assigned_to: body.assigned_to || null,
        opened_at: caseRecord.opened_at
      }
    });

  } catch (error) {
    console.error("Error opening case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const assigned_to = searchParams.get('assigned_to');

    const where: any = {};
    
    if (status) where.status = status;
    if (type) where.type = type;
    if (assigned_to) where.assigned_to = assigned_to;

    const cases = await db.case.findMany({
      where,
      include: {
        declaration: {
          include: {
            items: true,
            risk_scores: {
              orderBy: { created_at: 'desc' },
              take: 1
            }
          }
        }
      },
      orderBy: { opened_at: 'desc' }
    });

    return NextResponse.json({
      cases: cases.map(caseRecord => ({
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
      }))
    });

  } catch (error) {
    console.error("Error fetching cases:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}