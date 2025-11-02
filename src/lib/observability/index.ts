export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  meta?: Record<string, any>;
  userId?: string;
  requestId?: string;
}

export interface Metric {
  name: string;
  value: number;
  timestamp: string;
  tags: Record<string, string>;
}

class Logger {
  private requestId?: string;

  setRequestId(requestId: string) {
    this.requestId = requestId;
  }

  private log(level: LogEntry['level'], message: string, meta?: Record<string, any>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
      requestId: this.requestId
    };

    // Add user context if available
    if (typeof window !== 'undefined' && (window as any).user) {
      entry.userId = (window as any).user.id;
    }

    // In production, this would send to a logging service
    console.log(JSON.stringify(entry));
  }

  info(message: string, meta?: Record<string, any>) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, any>) {
    this.log('error', message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    this.log('debug', message, meta);
  }
}

class Metrics {
  private metrics: Metric[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor() {
    // Flush metrics every 30 seconds
    this.flushInterval = setInterval(() => this.flush(), 30000);
  }

  record(name: string, value: number, tags: Record<string, string> = {}) {
    const metric: Metric = {
      name,
      value,
      timestamp: new Date().toISOString(),
      tags
    };

    this.metrics.push(metric);

    // Keep only last 1000 metrics in memory
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  increment(name: string, value: number = 1, tags: Record<string, string> = {}) {
    this.record(name, value, tags);
  }

  gauge(name: string, value: number, tags: Record<string, string> = {}) {
    this.record(name, value, tags);
  }

  timing(name: string, duration: number, tags: Record<string, string> = {}) {
    this.record(`${name}_duration_ms`, duration, tags);
  }

  private flush() {
    if (this.metrics.length === 0) return;

    // In production, this would send to a metrics service like Prometheus
    console.log('Metrics flush:', this.metrics.length, 'metrics');
    
    // Clear metrics after flushing
    this.metrics = [];
  }

  getMetrics(): Metric[] {
    return [...this.metrics];
  }
}

class Tracer {
  private spans: Map<string, { startTime: number; tags: Record<string, string> }> = new Map();

  startSpan(name: string, tags: Record<string, string> = {}): string {
    const spanId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.spans.set(spanId, {
      startTime: Date.now(),
      tags
    });
    return spanId;
  }

  endSpan(spanId: string, additionalTags: Record<string, string> = {}) {
    const span = this.spans.get(spanId);
    if (!span) return;

    const duration = Date.now() - span.startTime;
    const allTags = { ...span.tags, ...additionalTags };

    // Record as timing metric
    metrics.timing(spanId.split('_')[0], duration, allTags);

    this.spans.delete(spanId);
  }
}

export const logger = new Logger();
export const metrics = new Metrics();
export const tracer = new Tracer();

// Utility function to create request-scoped logger
export function createRequestLogger(requestId: string) {
  const requestLogger = new Logger();
  requestLogger.setRequestId(requestId);
  return requestLogger;
}

// Utility function to measure API response times
export function measureApiTime(name: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const spanId = tracer.startSpan(name, { method: propertyKey });
      try {
        const result = await originalMethod.apply(this, args);
        tracer.endSpan(spanId, { status: 'success' });
        return result;
      } catch (error) {
        tracer.endSpan(spanId, { status: 'error', error: error.message });
        throw error;
      }
    };

    return descriptor;
  };
}