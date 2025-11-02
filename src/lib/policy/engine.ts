export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  metadata?: Record<string, any>;
}

export interface PolicyCondition {
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'not_in';
  value: any;
  weight?: number;
}

export interface PolicyAction {
  type: 'HOLD' | 'STOP' | 'ALLOW' | 'ESCALATE' | 'NOTIFY';
  parameters?: Record<string, any>;
}

export interface PolicyContext {
  declaration: any;
  riskScores: any;
  items: any[];
  user?: any;
  timestamp: string;
}

export interface PolicyResult {
  triggered: boolean;
  rules: PolicyRule[];
  actions: PolicyAction[];
  confidence: number;
  reason: string;
}

export interface PolicyPack {
  version: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  globalSettings: {
    defaultHoldTtl: number;
    defaultStopTtl: number;
    maxRiskScore: number;
    enableMLScoring: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

// Default FRIS policy pack
export const defaultPolicyPack: PolicyPack = {
  version: "2025-11-02-01",
  name: "FRIS Default Policy Pack",
  description: "Default fraud detection and revenue protection policies for Nigeria Customs",
  globalSettings: {
    defaultHoldTtl: 720, // 12 hours
    defaultStopTtl: 1440, // 24 hours
    maxRiskScore: 1.0,
    enableMLScoring: true
  },
  rules: [
    {
      id: "UVAL_SEVERE",
      name: "Severe Undervaluation Detection",
      description: "Detect severe undervaluation compared to reference price bands",
      enabled: true,
      priority: 1,
      conditions: [
        {
          field: "riskScores.undervaluation",
          operator: "greater_than",
          value: 0.85,
          weight: 1.0
        },
        {
          field: "items.0.invoice_value_usd",
          operator: "less_than",
          value: 1000,
          weight: 0.5
        }
      ],
      actions: [
        {
          type: "HOLD",
          parameters: {
            ttl: 720,
            reason: "Severe undervaluation detected - manual review required",
            escalationLevel: "VALUATION"
          }
        }
      ]
    },
    {
      id: "DOC_FORGERY_HIGH",
      name: "Document Forgery Detection",
      description: "High confidence document forgery detection",
      enabled: true,
      priority: 1,
      conditions: [
        {
          field: "riskScores.doc_forgery",
          operator: "greater_than",
          value: 0.80,
          weight: 1.0
        }
      ],
      actions: [
        {
          type: "STOP",
          parameters: {
            ttl: 1440,
            reason: "High confidence document forgery detected",
            escalationLevel: "ENFORCEMENT"
          }
        }
      ]
    },
    {
      id: "NETWORK_RISK_HIGH",
      name: "Network Risk Detection",
      description: "Detect high-risk network patterns and entity relationships",
      enabled: true,
      priority: 2,
      conditions: [
        {
          field: "riskScores.network_risk",
          operator: "greater_than",
          value: 0.75,
          weight: 1.0
        },
        {
          field: "items.0.declared_hs",
          operator: "in",
          value: ["8703", "2710", "2402", "2208", "8517"],
          weight: 0.8
        }
      ],
      actions: [
        {
          type: "HOLD",
          parameters: {
            ttl: 480,
            reason: "High network risk detected - investigate entity relationships",
            escalationLevel: "ENFORCEMENT"
          }
        }
      ]
    },
    {
      id: "ORIGIN_FHIGH_RISK",
      name: "High Risk Origin Detection",
      description: "Detect shipments from high-risk origin countries",
      enabled: true,
      priority: 3,
      conditions: [
        {
          field: "riskScores.origin_fraud",
          operator: "greater_than",
          value: 0.70,
          weight: 0.8
        },
        {
          field: "items.0.country_origin",
          operator: "in",
          value: ["CN", "HK", "SG", "AE"],
          weight: 0.6
        }
      ],
      actions: [
        {
          type: "HOLD",
          parameters: {
            ttl: 360,
            reason: "High risk origin detected - enhanced scrutiny required",
            escalationLevel: "VALUATION"
          }
        }
      ]
    },
    {
      id: "WEEKEND_FILING",
      name: "Weekend Filing Detection",
      description: "Detect declarations filed during weekends or holidays",
      enabled: true,
      priority: 4,
      conditions: [
        {
          field: "declaration.lodgement_ts",
          operator: "contains",
          value: "weekend",
          weight: 0.5
        }
      ],
      actions: [
        {
          type: "NOTIFY",
          parameters: {
            reason: "Weekend filing detected - monitor for suspicious patterns",
            notificationLevel: "INFO"
          }
        }
      ]
    },
    {
      id: "LOW_RISK_FAST_TRACK",
      name: "Low Risk Fast Track",
      description: "Fast track low-risk declarations for quick clearance",
      enabled: true,
      priority: 5,
      conditions: [
        {
          field: "riskScores.overall",
          operator: "less_than",
          value: 0.25,
          weight: 1.0
        },
        {
          field: "items.0.invoice_value_usd",
          operator: "less_than",
          value: 50000,
          weight: 0.8
        }
      ],
      actions: [
        {
          type: "ALLOW",
          parameters: {
            reason: "Low risk declaration - fast track clearance",
            channel: "GREEN"
          }
        }
      ]
    },
    {
      id: "HIGH_VALUE_SHIPMENT",
      name: "High Value Shipment",
      description: "Flag high-value shipments for enhanced review",
      enabled: true,
      priority: 3,
      conditions: [
        {
          field: "items.0.invoice_value_usd",
          operator: "greater_than",
          value: 100000,
          weight: 0.7
        }
      ],
      actions: [
        {
          type: "HOLD",
          parameters: {
            ttl: 240,
            reason: "High value shipment - enhanced review required",
            escalationLevel: "VALUATION"
          }
        }
      ]
    },
    {
      id: "MISCLASSIFICATION_HIGH",
      name: "HS Misclassification Detection",
      description: "Detect potential HS code misclassification",
      enabled: true,
      priority: 2,
      conditions: [
        {
          field: "riskScores.misclassification",
          operator: "greater_than",
          value: 0.80,
          weight: 1.0
        }
      ],
      actions: [
        {
          type: "HOLD",
          parameters: {
            ttl: 480,
            reason: "Potential HS misclassification - expert review required",
            escalationLevel: "VALUATION"
          }
        }
      ]
    }
  ],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-11-02T00:00:00Z"
};

// Policy engine class
export class PolicyEngine {
  private policyPack: PolicyPack;

  constructor(policyPack: PolicyPack = defaultPolicyPack) {
    this.policyPack = policyPack;
  }

  evaluate(context: PolicyContext): PolicyResult {
    const triggeredRules: PolicyRule[] = [];
    const actions: PolicyAction[] = [];
    let maxConfidence = 0;
    let reasons: string[] = [];

    // Sort rules by priority (lower number = higher priority)
    const sortedRules = [...this.policyPack.rules]
      .filter(rule => rule.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      const ruleResult = this.evaluateRule(rule, context);
      
      if (ruleResult.triggered) {
        triggeredRules.push(rule);
        actions.push(...ruleResult.actions);
        maxConfidence = Math.max(maxConfidence, ruleResult.confidence);
        reasons.push(ruleResult.reason);
      }
    }

    // If no rules triggered, apply default low-risk handling
    if (triggeredRules.length === 0) {
      return {
        triggered: false,
        rules: [],
        actions: [
          {
            type: "ALLOW",
            parameters: {
              reason: "No policy rules triggered - standard processing",
              channel: "GREEN"
            }
          }
        ],
        confidence: 0.1,
        reason: "No risk detected"
      };
    }

    return {
      triggered: true,
      rules: triggeredRules,
      actions: this.deduplicateActions(actions),
      confidence: maxConfidence,
      reason: reasons.join("; ")
    };
  }

  private evaluateRule(rule: PolicyRule, context: PolicyContext): {
    triggered: boolean;
    actions: PolicyAction[];
    confidence: number;
    reason: string;
  } {
    let totalWeight = 0;
    let matchedWeight = 0;

    for (const condition of rule.conditions) {
      const fieldValue = this.getFieldValue(context, condition.field);
      const conditionWeight = condition.weight || 1.0;
      totalWeight += conditionWeight;

      if (this.evaluateCondition(condition, fieldValue)) {
        matchedWeight += conditionWeight;
      }
    }

    const confidence = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    const triggered = confidence > 0.5; // 50% threshold for rule triggering

    return {
      triggered,
      actions: triggered ? rule.actions : [],
      confidence,
      reason: triggered ? rule.description : `Rule ${rule.name} not triggered`
    };
  }

  private getFieldValue(context: PolicyContext, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let value: any = context;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private evaluateCondition(condition: PolicyCondition, fieldValue: any): boolean {
    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'greater_than':
        return Number(fieldValue) > Number(condition.value);
      case 'less_than':
        return Number(fieldValue) < Number(condition.value);
      case 'contains':
        return String(fieldValue).includes(String(condition.value));
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
      default:
        return false;
    }
  }

  private deduplicateActions(actions: PolicyAction[]): PolicyAction[] {
    const seen = new Set();
    return actions.filter(action => {
      const key = `${action.type}-${JSON.stringify(action.parameters)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  updatePolicyPack(newPolicyPack: PolicyPack): void {
    this.policyPack = newPolicyPack;
  }

  getPolicyPack(): PolicyPack {
    return { ...this.policyPack };
  }

  enableRule(ruleId: string): boolean {
    const rule = this.policyPack.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = true;
      this.policyPack.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  disableRule(ruleId: string): boolean {
    const rule = this.policyPack.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = false;
      this.policyPack.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  addRule(rule: PolicyRule): void {
    this.policyPack.rules.push(rule);
    this.policyPack.updatedAt = new Date().toISOString();
  }

  removeRule(ruleId: string): boolean {
    const index = this.policyPack.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.policyPack.rules.splice(index, 1);
      this.policyPack.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }
}