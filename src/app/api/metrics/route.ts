import { NextRequest, NextResponse } from "next/server";
import { metrics } from "@/lib/observability";
import { withAuth } from "@/middleware/auth";

const handler = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    const allMetrics = metrics.getMetrics();

    let filteredMetrics = allMetrics;
    
    if (type !== 'all') {
      filteredMetrics = allMetrics.filter(metric => 
        metric.name.includes(type) || 
        Object.values(metric.tags).some(tag => tag.includes(type))
      );
    }

    // Calculate summary statistics
    const summary = {
      total_metrics: filteredMetrics.length,
      metrics_by_name: {} as Record<string, { count: number; sum: number; avg: number }>,
      recent_metrics: filteredMetrics.slice(-100) // Last 100 metrics
    };

    // Group by name and calculate statistics
    filteredMetrics.forEach(metric => {
      if (!summary.metrics_by_name[metric.name]) {
        summary.metrics_by_name[metric.name] = { count: 0, sum: 0, avg: 0 };
      }
      summary.metrics_by_name[metric.name].count++;
      summary.metrics_by_name[metric.name].sum += metric.value;
    });

    // Calculate averages
    Object.keys(summary.metrics_by_name).forEach(name => {
      const stats = summary.metrics_by_name[name];
      stats.avg = stats.sum / stats.count;
    });

    return NextResponse.json({
      metrics: filteredMetrics,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
};

export const GET = withAuth(handler, ['dashboard:read']);