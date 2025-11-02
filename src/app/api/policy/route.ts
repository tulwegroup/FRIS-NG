import { NextRequest, NextResponse } from "next/server";
import { PolicyEngine, defaultPolicyPack, PolicyPack } from "@/lib/policy/engine";
import { withAuth } from "@/middleware/auth";

let policyEngine = new PolicyEngine(defaultPolicyPack);

const handler = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'evaluate') {
      return await evaluatePolicy(request);
    } else if (action === 'get') {
      return await getPolicyPack();
    } else if (action === 'update') {
      return await updatePolicyPack(request);
    } else if (action === 'rules') {
      return await manageRules(request);
    } else {
      return NextResponse.json(
        { error: "Invalid action parameter" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Policy API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
};

async function evaluatePolicy(request: NextRequest) {
  const body = await request.json();
  const { declaration, riskScores, items } = body;

  if (!declaration || !riskScores || !items) {
    return NextResponse.json(
      { error: "Missing required fields: declaration, riskScores, items" },
      { status: 400 }
    );
  }

  const context = {
    declaration,
    riskScores,
    items,
    timestamp: new Date().toISOString()
  };

  const result = policyEngine.evaluate(context);

  return NextResponse.json({
    result,
    context,
    timestamp: new Date().toISOString()
  });
}

async function getPolicyPack() {
  const policyPack = policyEngine.getPolicyPack();
  
  return NextResponse.json({
    policyPack,
    timestamp: new Date().toISOString()
  });
}

async function updatePolicyPack(request: NextRequest) {
  const body = await request.json();
  const { policyPack } = body;

  if (!policyPack) {
    return NextResponse.json(
      { error: "Policy pack data is required" },
      { status: 400 }
    );
  }

  // Validate policy pack structure
  if (!policyPack.version || !policyPack.rules || !Array.isArray(policyPack.rules)) {
    return NextResponse.json(
      { error: "Invalid policy pack structure" },
      { status: 400 }
    );
  }

  policyEngine.updatePolicyPack(policyPack);

  return NextResponse.json({
    message: "Policy pack updated successfully",
    policyPack,
    timestamp: new Date().toISOString()
  });
}

async function manageRules(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ruleAction = searchParams.get('ruleAction');
  const ruleId = searchParams.get('ruleId');

  if (!ruleAction || !ruleId) {
    return NextResponse.json(
      { error: "ruleAction and ruleId parameters are required" },
      { status: 400 }
    );
  }

  let success = false;
  let message = "";

  switch (ruleAction) {
    case 'enable':
      success = policyEngine.enableRule(ruleId);
      message = success ? `Rule ${ruleId} enabled successfully` : `Rule ${ruleId} not found`;
      break;
    case 'disable':
      success = policyEngine.disableRule(ruleId);
      message = success ? `Rule ${ruleId} disabled successfully` : `Rule ${ruleId} not found`;
      break;
    default:
      return NextResponse.json(
        { error: "Invalid ruleAction. Use 'enable' or 'disable'" },
        { status: 400 }
      );
  }

  return NextResponse.json({
    success,
    message,
    ruleId,
    ruleAction,
    timestamp: new Date().toISOString()
  });
}

export const GET = withAuth(handler, ['policy:read']);
export const POST = withAuth(handler, ['policy:write']);