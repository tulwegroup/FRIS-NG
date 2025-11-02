import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { declaration_id, bank_ref, assessed, paid, fx_rate, status } = body;
    
    if (!declaration_id || !bank_ref || assessed === undefined || paid === undefined || !status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ["MATCH", "SHORT", "OVER", "DELAYED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // Check for idempotency key
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      const existingPayment = await db.payment.findFirst({
        where: {
          declaration: {
            declaration_id
          },
          bank_ref
        }
      });
      
      if (existingPayment) {
        return NextResponse.json({
          message: "Payment already processed",
          payment: existingPayment
        });
      }
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

    // Calculate delta
    const delta = paid - assessed;

    // Create payment record
    const payment = await db.payment.create({
      data: {
        declaration_id: declaration.id,
        assessed,
        paid,
        fx_rate: fx_rate || null,
        status,
        bank_ref
      }
    });

    // Create audit record
    await db.audit.create({
      data: {
        event_id: `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        declaration_id: declaration.id,
        actor: "system",
        action: "PAYMENT_RECONCILED",
        payload_hash: idempotencyKey || JSON.stringify({ bank_ref, status, delta })
      }
    });

    // If payment is SHORT or DELAYED, create a PCA case automatically
    if ((status === "SHORT" || status === "DELAYED") && Math.abs(delta) > 1000) {
      const existingCase = await db.case.findFirst({
        where: {
          declaration_id: declaration.id,
          status: "OPEN"
        }
      });

      if (!existingCase) {
        const caseId = `CASE-RECON-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        
        await db.case.create({
          data: {
            case_id: caseId,
            declaration_id: declaration.id,
            type: "PCA",
            expected_recovery: Math.abs(delta),
            status: "OPEN"
          }
        });

        // Create audit record for auto-generated case
        await db.audit.create({
          data: {
            event_id: `case_auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            declaration_id: declaration.id,
            actor: "system",
            action: "CASE_AUTO_CREATED",
            payload_hash: JSON.stringify({ case_id: caseId, reason: "Payment reconciliation" })
          }
        });
      }
    }

    return NextResponse.json({
      message: "Payment reconciliation processed",
      payment: {
        declaration_id,
        bank_ref,
        assessed,
        paid,
        delta,
        fx_rate,
        status,
        created_at: payment.created_at
      }
    });

  } catch (error) {
    console.error("Error in payment reconciliation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'MTD';
    const status = searchParams.get('status');

    const where: any = {};
    
    if (status) where.status = status;

    // Calculate date range based on period
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case 'TODAY':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'MTD':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'YTD':
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    where.created_at = {
      gte: startDate
    };

    const payments = await db.payment.findMany({
      where,
      include: {
        declaration: {
          select: {
            declaration_id: true,
            arrival_port: true,
            lodgement_ts: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    // Calculate summary statistics
    const summary = {
      total_payments: payments.length,
      total_assessed: payments.reduce((sum, p) => sum + p.assessed, 0),
      total_paid: payments.reduce((sum, p) => sum + p.paid, 0),
      total_delta: payments.reduce((sum, p) => sum + (p.paid - p.assessed), 0),
      match_count: payments.filter(p => p.status === 'MATCH').length,
      short_count: payments.filter(p => p.status === 'SHORT').length,
      over_count: payments.filter(p => p.status === 'OVER').length,
      delayed_count: payments.filter(p => p.status === 'DELAYED').length
    };

    return NextResponse.json({
      summary,
      payments: payments.map(payment => ({
        declaration_id: payment.declaration?.declaration_id,
        bank_ref: payment.bank_ref,
        assessed: payment.assessed,
        paid: payment.paid,
        delta: payment.paid - payment.assessed,
        fx_rate: payment.fx_rate,
        status: payment.status,
        created_at: payment.created_at,
        arrival_port: payment.declaration?.arrival_port,
        lodgement_ts: payment.declaration?.lodgement_ts
      }))
    });

  } catch (error) {
    console.error("Error fetching payment reconciliation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}