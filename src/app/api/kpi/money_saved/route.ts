import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing required parameters: from and to" },
        { status: 400 }
      );
    }

    const startDate = new Date(from);
    const endDate = new Date(to);

    // Get all actions within the date range
    const actions = await db.action.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: endDate
        },
        action: {
          in: ['HOLD', 'STOP']
        }
      },
      include: {
        declaration: {
          include: {
            items: true,
            risk_scores: {
              orderBy: { created_at: 'desc' },
              take: 1
            },
            payments: {
              orderBy: { created_at: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    // Get all cases closed within the date range
    const closedCases = await db.case.findMany({
      where: {
        closed_at: {
          gte: startDate,
          lte: endDate
        },
        status: 'CLOSED',
        outcome: {
          in: ['ADVERSE', 'SETTLED']
        }
      },
      include: {
        declaration: {
          include: {
            items: true,
            payments: true
          }
        }
      }
    });

    // Calculate Money Saved from actions
    let moneySavedFromActions = 0;
    const actionDetails = [];

    for (const action of actions) {
      const declaration = action.declaration;
      if (!declaration) continue;

      // Calculate total declared value
      const totalDeclaredValue = declaration.items.reduce((sum, item) => sum + item.invoice_value_usd, 0);
      
      // Estimate potential undervaluation based on risk score
      const riskScore = declaration.risk_scores[0];
      if (riskScore && riskScore.undervaluation > 0.5) {
        // Estimate additional duty that would have been lost
        const estimatedUndervaluation = totalDeclaredValue * riskScore.undervaluation * 0.2; // Assume 20% duty rate
        moneySavedFromActions += estimatedUndervaluation;
        
        actionDetails.push({
          declaration_id: declaration.declaration_id,
          action: action.action,
          reason: action.reason,
          estimated_savings: estimatedUndervaluation,
          risk_score: riskScore.overall
        });
      }
    }

    // Calculate Money Saved from closed cases
    let moneySavedFromCases = 0;
    const caseDetails = [];

    for (const caseRecord of closedCases) {
      if (caseRecord.recovery_amount && caseRecord.recovery_amount > 0) {
        moneySavedFromCases += caseRecord.recovery_amount;
        
        caseDetails.push({
          case_id: caseRecord.case_id,
          declaration_id: caseRecord.declaration?.declaration_id,
          type: caseRecord.type,
          outcome: caseRecord.outcome,
          recovery_amount: caseRecord.recovery_amount
        });
      }
    }

    // Get payment reconciliation data
    const payments = await db.payment.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: endDate
        },
        status: {
          in: ['SHORT', 'DELAYED']
        }
      },
      include: {
        declaration: {
          select: {
            declaration_id: true,
            items: true
          }
        }
      }
    });

    // Calculate potential leakage from payment discrepancies
    let paymentLeakagePrevented = 0;
    const paymentDetails = [];

    for (const payment of payments) {
      const delta = payment.assessed - payment.paid;
      if (delta > 0) {
        paymentLeakagePrevented += delta;
        
        paymentDetails.push({
          declaration_id: payment.declaration?.declaration_id,
          bank_ref: payment.bank_ref,
          status: payment.status,
          delta: delta
        });
      }
    }

    // Calculate Revenue Uplift
    const baselineDuties = 1000000; // This would be calculated from historical data
    const totalDutiesCollected = moneySavedFromCases + paymentLeakagePrevented;
    const revenueUplift = totalDutiesCollected - baselineDuties;

    // Calculate hit rates
    const totalActions = actions.length;
    const holds = actions.filter(a => a.action === 'HOLD').length;
    const stops = actions.filter(a => a.action === 'STOP').length;
    
    // Get declarations that were released after hold (successful interventions)
    const releasedAfterHold = await db.declaration.findMany({
      where: {
        status: 'RELEASED',
        released_at: {
          gte: startDate,
          lte: endDate
        },
        actions: {
          some: {
            action: 'HOLD',
            created_at: {
              gte: startDate,
              lte: endDate
            }
          }
        }
      }
    });

    const hitRate = totalActions > 0 ? (releasedAfterHold.length / totalActions) * 100 : 0;

    return NextResponse.json({
      period: {
        from: startDate.toISOString(),
        to: endDate.toISOString()
      },
      money_saved: {
        total: moneySavedFromActions + moneySavedFromCases + paymentLeakagePrevented,
        from_actions: moneySavedFromActions,
        from_cases: moneySavedFromCases,
        from_payment_reconciliation: paymentLeakagePrevented
      },
      revenue_uplift: revenueUplift,
      performance_metrics: {
        total_actions: totalActions,
        holds: holds,
        stops: stops,
        hit_rate: hitRate,
        cases_closed: closedCases.length,
        payment_discrepancies: payments.length
      },
      breakdown: {
        actions: actionDetails,
        cases: caseDetails,
        payments: paymentDetails
      }
    });

  } catch (error) {
    console.error("Error calculating money saved KPI:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}