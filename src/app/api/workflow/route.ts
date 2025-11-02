import { NextRequest, NextResponse } from "next/server";
import { holdStopWorkflowManager } from "@/lib/workflow/manager";
import { withAuth } from "@/middleware/auth";
import { withObservability } from "@/lib/observability/middleware";

const handler = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'create') {
      return await createWorkflow(request);
    } else if (action === 'release') {
      return await releaseWorkflow(request);
    } else if (action === 'escalate') {
      return await escalateWorkflow(request);
    } else if (action === 'review') {
      return await reviewWorkflow(request);
    } else if (action === 'stats') {
      return await getWorkflowStats(request);
    } else if (action === 'check-expired') {
      return await checkExpiredWorkflows();
    } else {
      return NextResponse.json(
        { error: "Invalid action parameter" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Workflow API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
};

async function createWorkflow(request: NextRequest) {
  const body = await request.json();
  const { 
    declaration_id, 
    action_type, 
    reason, 
    priority = 'MEDIUM',
    sla_minutes,
    assigned_to,
    rule_ids = [],
    metadata = {}
  } = body;

  if (!declaration_id || !action_type || !reason) {
    return NextResponse.json(
      { error: "Missing required fields: declaration_id, action_type, reason" },
      { status: 400 }
    );
  }

  if (!['HOLD', 'STOP'].includes(action_type)) {
    return NextResponse.json(
      { error: "action_type must be 'HOLD' or 'STOP'" },
      { status: 400 }
    );
  }

  const user = (request as any).user;
  const workflow = await holdStopWorkflowManager.createHoldStopWorkflow(
    declaration_id,
    action_type,
    reason,
    user.email,
    {
      priority,
      sla_minutes,
      assigned_to,
      ruleIds: rule_ids,
      metadata
    }
  );

  return NextResponse.json({
    message: "Workflow created successfully",
    workflow,
    timestamp: new Date().toISOString()
  });
}

async function releaseWorkflow(request: NextRequest) {
  const body = await request.json();
  const { workflow_id, reason, notes } = body;

  if (!workflow_id || !reason) {
    return NextResponse.json(
      { error: "Missing required fields: workflow_id, reason" },
      { status: 400 }
    );
  }

  const user = (request as any).user;
  const success = await holdStopWorkflowManager.releaseWorkflow(
    workflow_id,
    user.email,
    reason,
    notes
  );

  if (!success) {
    return NextResponse.json(
      { error: "Failed to release workflow" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Workflow released successfully",
    workflow_id,
    timestamp: new Date().toISOString()
  });
}

async function escalateWorkflow(request: NextRequest) {
  const body = await request.json();
  const { workflow_id, reason, escalation_level } = body;

  if (!workflow_id || !reason) {
    return NextResponse.json(
      { error: "Missing required fields: workflow_id, reason" },
      { status: 400 }
    );
  }

  const user = (request as any).user;
  const success = await holdStopWorkflowManager.escalateWorkflow(
    workflow_id,
    user.email,
    reason,
    escalation_level
  );

  if (!success) {
    return NextResponse.json(
      { error: "Failed to escalate workflow" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Workflow escalated successfully",
    workflow_id,
    timestamp: new Date().toISOString()
  });
}

async function reviewWorkflow(request: NextRequest) {
  const body = await request.json();
  const { workflow_id, outcome, notes } = body;

  if (!workflow_id || !outcome || !notes) {
    return NextResponse.json(
      { error: "Missing required fields: workflow_id, outcome, notes" },
      { status: 400 }
    );
  }

  if (!['APPROVED', 'REJECTED', 'NEEDS_MORE_INFO'].includes(outcome)) {
    return NextResponse.json(
      { error: "outcome must be 'APPROVED', 'REJECTED', or 'NEEDS_MORE_INFO'" },
      { status: 400 }
    );
  }

  const user = (request as any).user;
  const success = await holdStopWorkflowManager.reviewWorkflow(
    workflow_id,
    user.email,
    outcome,
    notes
  );

  if (!success) {
    return NextResponse.json(
      { error: "Failed to review workflow" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Workflow reviewed successfully",
    workflow_id,
    outcome,
    timestamp: new Date().toISOString()
  });
}

async function getWorkflowStats(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period_start = searchParams.get('period_start') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const period_end = searchParams.get('period_end') || new Date().toISOString();

  const stats = await holdStopWorkflowManager.getWorkflowStats(period_start, period_end);

  return NextResponse.json({
    stats,
    period: { start: period_start, end: period_end },
    timestamp: new Date().toISOString()
  });
}

async function checkExpiredWorkflows() {
  await holdStopWorkflowManager.checkExpiredWorkflows();

  return NextResponse.json({
    message: "Expired workflow check completed",
    timestamp: new Date().toISOString()
  });
}

export const GET = withObservability(withAuth(handler, ['workflow:read']), 'workflow_api');
export const POST = withObservability(withAuth(handler, ['workflow:write']), 'workflow_api');