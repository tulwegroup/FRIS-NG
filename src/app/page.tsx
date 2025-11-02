"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Users,
  Package,
  Shield,
  BarChart3
} from "lucide-react";

interface KPIData {
  money_saved: {
    total: number;
    from_actions: number;
    from_cases: number;
    from_payment_reconciliation: number;
  };
  revenue_uplift: number;
  performance_metrics: {
    total_actions: number;
    holds: number;
    stops: number;
    hit_rate: number;
    cases_closed: number;
    payment_discrepancies: number;
  };
}

interface CaseData {
  case_id: string;
  declaration_id?: string;
  type: string;
  expected_recovery?: number;
  status: string;
  outcome?: string;
  recovery_amount?: number;
  assigned_to?: string;
  opened_at: string;
  closed_at?: string;
}

interface ActionData {
  declaration_id: string;
  action: string;
  reason: string;
  created_at: string;
  ttl_minutes?: number;
}

export default function FRISDashboard() {
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [cases, setCases] = useState<CaseData[]>([]);
  const [actions, setActions] = useState<ActionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load KPI data
      const kpiResponse = await fetch('/api/kpi/money_saved?from=2025-01-01&to=2025-12-31');
      if (kpiResponse.ok) {
        const kpiResult = await kpiResponse.json();
        setKpiData(kpiResult);
      }

      // Load cases
      const casesResponse = await fetch('/api/cases');
      if (casesResponse.ok) {
        const casesResult = await casesResponse.json();
        setCases(casesResult.cases || []);
      }

      // Load recent actions (mock data for now)
      setActions([
        {
          declaration_id: "DEC-2025-001",
          action: "HOLD",
          reason: "Severe undervaluation detected",
          created_at: "2025-07-21T10:30:00Z",
          ttl_minutes: 720
        },
        {
          declaration_id: "DEC-2025-002",
          action: "STOP",
          reason: "Document forgery detected",
          created_at: "2025-07-21T09:15:00Z",
          ttl_minutes: 1440
        }
      ]);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-NG').format(num);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading FRIS Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">FRIS Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Fraud & Revenue Intelligence System - Nigeria Customs Service
          </p>
        </div>
        <Button onClick={loadDashboardData} variant="outline">
          Refresh Data
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Money Saved</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {kpiData ? formatCurrency(kpiData.money_saved.total) : '₦0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Total revenue protected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Uplift</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {kpiData ? formatCurrency(kpiData.revenue_uplift) : '₦0'}
            </div>
            <p className="text-xs text-muted-foreground">
              vs. baseline performance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cases</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {cases.filter(c => c.status === 'OPEN').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Pending investigations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hit Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {kpiData ? `${kpiData.performance_metrics.hit_rate.toFixed(1)}%` : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">
              Detection accuracy
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="pca">Post-Clearance Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Recent Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent HOLD/STOP Actions</CardTitle>
              <CardDescription>
                Latest fraud prevention actions taken by the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Declaration ID</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>TTL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((action, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{action.declaration_id}</TableCell>
                      <TableCell>
                        <Badge variant={action.action === 'STOP' ? 'destructive' : 'default'}>
                          {action.action}
                        </Badge>
                      </TableCell>
                      <TableCell>{action.reason}</TableCell>
                      <TableCell>
                        {new Date(action.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {action.ttl_minutes ? `${action.ttl_minutes} min` : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {kpiData && (
                  <>
                    <div className="flex justify-between">
                      <span>Total Actions:</span>
                      <span className="font-semibold">{formatNumber(kpiData.performance_metrics.total_actions)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>HOLD Actions:</span>
                      <span className="font-semibold">{formatNumber(kpiData.performance_metrics.holds)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>STOP Actions:</span>
                      <span className="font-semibold">{formatNumber(kpiData.performance_metrics.stops)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cases Closed:</span>
                      <span className="font-semibold">{formatNumber(kpiData.performance_metrics.cases_closed)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Payment Discrepancies:</span>
                      <span className="font-semibold">{formatNumber(kpiData.performance_metrics.payment_discrepancies)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Money Saved Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {kpiData && (
                  <>
                    <div className="flex justify-between">
                      <span>From Actions:</span>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(kpiData.money_saved.from_actions)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>From Cases:</span>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(kpiData.money_saved.from_cases)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>From Payment Reconciliation:</span>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(kpiData.money_saved.from_payment_reconciliation)}
                      </span>
                    </div>
                    <div className="border-t pt-2">
                      <div className="flex justify-between font-bold">
                        <span>Total:</span>
                        <span className="text-green-600">
                          {formatCurrency(kpiData.money_saved.total)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="valuation" className="space-y-4">
          <Alert>
            <BarChart3 className="h-4 w-4" />
            <AlertDescription>
              Valuation monitoring and price band analysis features will be implemented here.
              This will include price band monitoring, undervaluation detection, and valuation analytics.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Price Band Monitor</CardTitle>
              <CardDescription>
                Monitor reference price bands and detect undervaluation patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Price band monitoring functionality coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pca" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PCA Queue</CardTitle>
              <CardDescription>
                Post-Clearance Audit cases sorted by expected recovery
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case ID</TableHead>
                    <TableHead>Declaration ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Expected Recovery</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Opened</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases
                    .filter(c => c.status === 'OPEN')
                    .sort((a, b) => (b.expected_recovery || 0) - (a.expected_recovery || 0))
                    .map((case_item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{case_item.case_id}</TableCell>
                        <TableCell>{case_item.declaration_id || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{case_item.type}</Badge>
                        </TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {case_item.expected_recovery ? formatCurrency(case_item.expected_recovery) : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={case_item.status === 'OPEN' ? 'default' : 'secondary'}>
                            {case_item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{case_item.assigned_to || 'Unassigned'}</TableCell>
                        <TableCell>
                          {new Date(case_item.opened_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recently Closed Cases</CardTitle>
              <CardDescription>
                Cases that have been resolved with outcomes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Recovery Amount</TableHead>
                    <TableHead>Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases
                    .filter(c => c.status === 'CLOSED')
                    .slice(0, 10)
                    .map((case_item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{case_item.case_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{case_item.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              case_item.outcome === 'ADVERSE' ? 'destructive' :
                              case_item.outcome === 'SETTLED' ? 'default' :
                              case_item.outcome === 'CLEAN' ? 'secondary' : 'outline'
                            }
                          >
                            {case_item.outcome}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {case_item.recovery_amount ? formatCurrency(case_item.recovery_amount) : '₦0'}
                        </TableCell>
                        <TableCell>
                          {case_item.closed_at ? new Date(case_item.closed_at).toLocaleDateString() : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}