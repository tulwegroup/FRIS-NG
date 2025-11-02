import { db } from '@/lib/db';
import { moneySavedCalculator } from '@/lib/attribution/calculator';

export interface HoldStopWorkflow {
  id: string;
  declaration_id: string;
  action_type: 'HOLD' | 'STOP';
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'ESCALATED';
  created_at: string;
  expires_at: string;
  created_by: string;
  assigned_to?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  policy_version: string;
  rule_ids: string[];
  sla_minutes: number;
  escalation_level?: number;
  review_required: boolean;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  release_authorized_by?: string;
  release_authorized_at?: string;
  metadata?: Record<string, any>;
}

export interface WorkflowAction {
  id: string;
  workflow_id: string;
  action_type: 'CREATE' | 'ESCALATE' | 'REVIEW' | 'RELEASE' | 'EXPIRE' | 'OVERRIDE';
  performed_by: string;
  performed_at: string;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface SLAConfig {
  action_type: 'HOLD' | 'STOP';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  default_sla_minutes: number;
  escalation_path: string[];
  notification_rules: {
    escalation_thresholds: number[];
    notification_channels: string[];
  };
}

class HoldStopWorkflowManager {
  private slaConfigs: SLAConfig[] = [
    {
      action_type: 'HOLD',
      priority: 'LOW',
      default_sla_minutes: 240, // 4 hours
      escalation_path: ['VALUATION', 'SUPERVISOR'],
      notification_rules: {
        escalation_thresholds: [50, 75, 90], // percentages
        notification_channels: ['email', 'sms', 'system']
      }
    },
    {
      action_type: 'HOLD',
      priority: 'MEDIUM',
      default_sla_minutes: 480, // 8 hours
      escalation_path: ['VALUATION', 'SUPERVISOR', 'MANAGER'],
      notification_rules: {
        escalation_thresholds: [50, 75, 90],
        notification_channels: ['email', 'sms', 'system']
      }
    },
    {
      action_type: 'HOLD',
      priority: 'HIGH',
      default_sla_minutes: 720, // 12 hours
      escalation_path: ['VALUATION', 'SUPERVISOR', 'MANAGER', 'DIRECTOR'],
      notification_rules: {
        escalation_thresholds: [25, 50, 75, 90],
        notification_channels: ['email', 'sms', 'system', 'phone']
      }
    },
    {
      action_type: 'STOP',
      priority: 'CRITICAL',
      default_sla_minutes: 1440, // 24 hours
      escalation_path: ['ENFORCEMENT', 'SUPERVISOR', 'MANAGER', 'DIRECTOR', 'COMMISSIONER'],
      notification_rules: {
        escalation_thresholds: [25, 50, 75, 90],
        notification_channels: ['email', 'sms', 'system', 'phone', 'alert']
      }
    }
  ];

  async createHoldStopWorkflow(
    declarationId: string,
    actionType: 'HOLD' | 'STOP',
    reason: string,
    createdBy: string,
    options: {
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      slaMinutes?: number;
      assignedTo?: string;
      ruleIds?: string[];
      policyVersion?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<HoldStopWorkflow> {
    const {
      priority = 'MEDIUM',
      slaMinutes,
      assignedTo,
      ruleIds = [],
      policyVersion = '2025-11-02-01',
      metadata = {}
    } = options;

    // Determine SLA based on action type and priority
    const slaConfig = this.slaConfigs.find(
      config => config.action_type === actionType && config.priority === priority
    );

    const finalSlaMinutes = slaMinutes || slaConfig?.default_sla_minutes || 480;
    const expiresAt = new Date(Date.now() + finalSlaMinutes * 60 * 1000);

    // Create workflow
    const workflow: HoldStopWorkflow = {
      id: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      declaration_id: declarationId,
      action_type: actionType,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      created_by: createdBy,
      assigned_to: assignedTo,
      priority,
      reason,
      policy_version: policyVersion,
      rule_ids: ruleIds,
      sla_minutes: finalSlaMinutes,
      review_required: actionType === 'STOP',
      metadata
    };

    // Store workflow in database (would create a workflow table in production)
    await this.storeWorkflow(workflow);

    // Log workflow creation
    await this.logWorkflowAction(workflow.id, 'CREATE', createdBy, 'Workflow created');

    // Send notifications
    await this.sendNotifications(workflow, 'created');

    // Schedule expiration check
    this.scheduleExpirationCheck(workflow.id, expiresAt);

    return workflow;
  }

  async releaseWorkflow(
    workflowId: string,
    authorizedBy: string,
    reason: string,
    notes?: string
  ): Promise<boolean> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.status !== 'ACTIVE') {
      throw new Error('Workflow is not active and cannot be released');
    }

    // Update workflow status
    workflow.status = 'RELEASED';
    workflow.release_authorized_by = authorizedBy;
    workflow.release_authorized_at = new Date().toISOString();
    workflow.review_notes = notes;

    await this.updateWorkflow(workflow);

    // Log release action
    await this.logWorkflowAction(workflow.id, 'RELEASE', authorizedBy, reason, { notes });

    // Send notifications
    await this.sendNotifications(workflow, 'released');

    // Update declaration status
    await this.updateDeclarationStatus(workflow.declaration_id, 'RELEASED');

    return true;
  }

  async escalateWorkflow(
    workflowId: string,
    escalatedBy: string,
    reason: string,
    newLevel?: number
  ): Promise<boolean> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.status !== 'ACTIVE') {
      throw new Error('Workflow is not active and cannot be escalated');
    }

    // Update escalation level
    workflow.escalation_level = newLevel || (workflow.escalation_level || 0) + 1;
    workflow.status = 'ESCALATED';

    await this.updateWorkflow(workflow);

    // Log escalation action
    await this.logWorkflowAction(workflow.id, 'ESCALATE', escalatedBy, reason, {
      escalation_level: workflow.escalation_level
    });

    // Send escalation notifications
    await this.sendNotifications(workflow, 'escalated');

    return true;
  }

  async reviewWorkflow(
    workflowId: string,
    reviewedBy: string,
    outcome: 'APPROVED' | 'REJECTED' | 'NEEDS_MORE_INFO',
    notes: string
  ): Promise<boolean> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    workflow.reviewed_by = reviewedBy;
    workflow.reviewed_at = new Date().toISOString();
    workflow.review_notes = notes;

    if (outcome === 'APPROVED') {
      workflow.status = 'ACTIVE';
    } else if (outcome === 'REJECTED') {
      workflow.status = 'RELEASED';
      workflow.release_authorized_by = reviewedBy;
      workflow.release_authorized_at = new Date().toISOString();
    }

    await this.updateWorkflow(workflow);

    // Log review action
    await this.logWorkflowAction(workflow.id, 'REVIEW', reviewedBy, `Review outcome: ${outcome}`, {
      outcome,
      notes
    });

    // Send notifications
    await this.sendNotifications(workflow, 'reviewed');

    return true;
  }

  async checkExpiredWorkflows(): Promise<void> {
    const now = new Date();
    const activeWorkflows = await this.getActiveWorkflows();

    for (const workflow of activeWorkflows) {
      const expiresAt = new Date(workflow.expires_at);
      
      if (expiresAt <= now) {
        // Workflow has expired
        workflow.status = 'EXPIRED';
        await this.updateWorkflow(workflow);

        // Log expiration
        await this.logWorkflowAction(workflow.id, 'EXPIRE', 'system', 'Workflow expired due to SLA');

        // Send expiration notifications
        await this.sendNotifications(workflow, 'expired');

        // Auto-release if no adverse findings (for HOLD actions only)
        if (workflow.action_type === 'HOLD') {
          const hasAdverseFindings = await this.checkForAdverseFindings(workflow.declaration_id);
          
          if (!hasAdverseFindings) {
            await this.releaseWorkflow(
              workflow.id,
              'system',
              'Auto-released: No adverse findings found within SLA period',
              'Automatically released due to SLA expiration with no adverse findings'
            );
          }
        }
      } else {
        // Check for SLA warnings
        const timeUntilExpiration = expiresAt.getTime() - now.getTime();
        const slaPercent = ((workflow.sla_minutes * 60 * 1000 - timeUntilExpiration) / (workflow.sla_minutes * 60 * 1000)) * 100;

        const slaConfig = this.slaConfigs.find(
          config => config.action_type === workflow.action_type && config.priority === workflow.priority
        );

        if (slaConfig) {
          for (const threshold of slaConfig.notification_rules.escalation_thresholds) {
            if (slaPercent >= threshold && slaPercent < threshold + 5) {
              // Send SLA warning notification
              await this.sendSlaWarning(workflow, slaPercent, threshold);
              break;
            }
          }
        }
      }
    }
  }

  private async storeWorkflow(workflow: HoldStopWorkflow): Promise<void> {
    // In production, this would store in a workflow table
    // For now, we'll store in the audit table
    await db.audit.create({
      data: {
        event_id: workflow.id,
        declaration_id: workflow.declaration_id,
        actor: workflow.created_by,
        action: `WORKFLOW_${workflow.action_type}_CREATED`,
        payload_hash: JSON.stringify(workflow)
      }
    });
  }

  private async getWorkflow(workflowId: string): Promise<HoldStopWorkflow | null> {
    // In production, this would query the workflow table
    // For now, we'll retrieve from audit table
    const auditRecord = await db.audit.findFirst({
      where: {
        event_id: workflowId,
        action: {
          contains: 'WORKFLOW_'
        }
      }
    });

    if (auditRecord && auditRecord.payload_hash) {
      try {
        return JSON.parse(auditRecord.payload_hash);
      } catch {
        return null;
      }
    }

    return null;
  }

  private async updateWorkflow(workflow: HoldStopWorkflow): Promise<void> {
    // In production, this would update the workflow table
    await db.audit.create({
      data: {
        event_id: `${workflow.id}_update_${Date.now()}`,
        declaration_id: workflow.declaration_id,
        actor: 'system',
        action: `WORKFLOW_${workflow.action_type}_UPDATED`,
        payload_hash: JSON.stringify(workflow)
      }
    });
  }

  private async getActiveWorkflows(): Promise<HoldStopWorkflow[]> {
    // In production, this would query active workflows from the workflow table
    // For now, return empty array as this is a placeholder
    return [];
  }

  private async logWorkflowAction(
    workflowId: string,
    actionType: string,
    performedBy: string,
    notes: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await db.audit.create({
      data: {
        event_id: `${workflowId}_${actionType}_${Date.now()}`,
        action: `WORKFLOW_ACTION_${actionType}`,
        actor: performedBy,
        payload_hash: JSON.stringify({
          workflow_id: workflowId,
          action_type: actionType,
          notes,
          metadata,
          timestamp: new Date().toISOString()
        })
      }
    });
  }

  private async sendNotifications(workflow: HoldStopWorkflow, eventType: string): Promise<void> {
    // In production, this would send actual notifications via email, SMS, etc.
    console.log(`Notification: ${eventType} for workflow ${workflow.id}`);
    console.log(`Action: ${workflow.action_type}, Priority: ${workflow.priority}`);
    console.log(`Assigned to: ${workflow.assigned_to || 'Unassigned'}`);
  }

  private async sendSlaWarning(workflow: HoldStopWorkflow, slaPercent: number, threshold: number): Promise<void> {
    // In production, this would send SLA warning notifications
    console.log(`SLA Warning: Workflow ${workflow.id} at ${slaPercent.toFixed(1)}% of SLA`);
    console.log(`Threshold: ${threshold}%, Action: ${workflow.action_type}`);
  }

  private scheduleExpirationCheck(workflowId: string, expiresAt: Date): void {
    // In production, this would schedule a job to check expiration
    const timeUntilExpiration = expiresAt.getTime() - Date.now();
    
    if (timeUntilExpiration > 0) {
      setTimeout(async () => {
        await this.checkExpiredWorkflows();
      }, timeUntilExpiration);
    }
  }

  private async updateDeclarationStatus(declarationId: string, status: string): Promise<void> {
    await db.declaration.update({
      where: { declaration_id: declarationId },
      data: { 
        status,
        released_at: status === 'RELEASED' ? new Date() : null
      }
    });
  }

  private async checkForAdverseFindings(declarationId: string): Promise<boolean> {
    // Check if there are any adverse findings for this declaration
    const actions = await db.action.findMany({
      where: {
        declaration: {
          declaration_id: declarationId
        },
        action: {
          in: ['HOLD', 'STOP']
        }
      }
    });

    // Simple check - if there are recent HOLD/STOP actions, consider as adverse findings
    return actions.length > 0;
  }

  async getWorkflowStats(periodStart: string, periodEnd: string): Promise<any> {
    // In production, this would query workflow statistics
    return {
      total_workflows: 0,
      active_workflows: 0,
      expired_workflows: 0,
      released_workflows: 0,
      escalated_workflows: 0,
      average_sla_compliance: 0,
      by_priority: {
        LOW: { total: 0, released: 0, expired: 0 },
        MEDIUM: { total: 0, released: 0, expired: 0 },
        HIGH: { total: 0, released: 0, expired: 0 },
        CRITICAL: { total: 0, released: 0, expired: 0 }
      },
      by_action_type: {
        HOLD: { total: 0, released: 0, expired: 0 },
        STOP: { total: 0, released: 0, expired: 0 }
      }
    };
  }
}

export const holdStopWorkflowManager = new HoldStopWorkflowManager();