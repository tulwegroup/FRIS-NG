import { z } from 'zod';

// HS Code validation (6-digit format)
const hsCodeSchema = z.string()
  .length(6, 'HS code must be exactly 6 digits')
  .regex(/^\d{6}$/, 'HS code must contain only digits');

// Country code validation (ISO 3166-1 alpha-2)
const countryCodeSchema = z.string()
  .length(2, 'Country code must be 2 characters')
  .regex(/^[A-Z]{2}$/i, 'Country code must be 2 letters');

// Incoterm validation
const incotermSchema = z.enum(['CIF', 'FOB', 'CFR', 'EXW', 'DDP'], {
  errorMap: () => ({ message: 'Invalid Incoterm. Must be one of: CIF, FOB, CFR, EXW, DDP' })
});

// Quantity validation
const quantitySchema = z.number()
  .positive('Quantity must be positive')
  .max(1000000, 'Quantity seems unreasonably large');

// Weight validation
const weightSchema = z.number()
  .min(0, 'Weight cannot be negative')
  .max(1000000, 'Weight seems unreasonably large (kg)');

// Value validation
const valueSchema = z.number()
  .positive('Value must be positive')
  .max(100000000, 'Value seems unreasonably large (USD)');

// Date validation
const dateSchema = z.string()
  .refine((date) => !isNaN(Date.parse(date)), 'Invalid date format')
  .refine((date) => new Date(date) <= new Date(), 'Date cannot be in the future')
  .refine((date) => new Date(date) >= new Date('2000-01-01'), 'Date seems too far in the past');

// Email validation
const emailSchema = z.string()
  .email('Invalid email format');

// Phone number validation (basic international format)
const phoneSchema = z.string()
  .regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format');

// Declaration validation schema
export const declarationSchema = z.object({
  declaration_id: z.string()
    .min(1, 'Declaration ID is required')
    .max(50, 'Declaration ID too long'),
  
  arrival_port: z.string()
    .min(1, 'Arrival port is required')
    .max(50, 'Port name too long'),
  
  lodgement_ts: dateSchema,
  
  eta: dateSchema.optional(),
  
  channel: z.enum(['GREEN', 'YELLOW', 'RED']).optional(),
  
  status: z.enum(['FILED', 'SELECTED', 'HELD', 'RELEASED', 'AMENDED', 'CANCELLED']).optional(),
  
  consignee: z.object({
    tin: z.string().max(50).optional(),
    name: z.string().max(100).optional(),
    addr: z.string().max(200).optional(),
    phones: z.array(phoneSchema).optional(),
    emails: z.array(emailSchema).optional()
  }).optional(),
  
  declarant: z.object({
    license_id: z.string().max(50).optional(),
    name: z.string().max(100).optional()
  }).optional(),
  
  voyage: z.object({
    bl: z.string().max(50).optional(),
    vessel: z.string().max(100).optional(),
    origin: countryCodeSchema.optional(),
    transshipment_ports: z.array(countryCodeSchema).optional()
  }).optional(),
  
  items: z.array(z.object({
    line_no: z.number().int().positive().optional(),
    declared_hs: hsCodeSchema,
    declared_desc: z.string().min(1, 'Item description is required').max(200),
    qty: quantitySchema,
    uom: z.string().min(1, 'Unit of measure is required').max(20),
    gross_weight_kg: weightSchema.optional(),
    net_weight_kg: weightSchema.optional(),
    invoice_value_usd: valueSchema,
    incoterm: incotermSchema.optional(),
    country_origin: countryCodeSchema.optional(),
    brand: z.string().max(50).optional(),
    model: z.string().max(50).optional(),
    year: z.number()
      .int('Year must be an integer')
      .min(1900, 'Year seems too old')
      .max(new Date().getFullYear() + 1, 'Year cannot be in the far future')
      .optional()
  })).min(1, 'At least one item is required')
});

// Risk scoring validation schema
export const riskScoreSchema = z.object({
  declaration_id: z.string().min(1, 'Declaration ID is required'),
  scores: z.object({
    overall: z.number().min(0).max(1, 'Overall score must be between 0 and 1'),
    undervaluation: z.number().min(0).max(1),
    misclassification: z.number().min(0).max(1),
    origin_fraud: z.number().min(0).max(1),
    doc_forgery: z.number().min(0).max(1),
    network_risk: z.number().min(0).max(1),
    payment_leakage: z.number().min(0).max(1)
  }),
  reason_codes: z.array(z.string()).optional()
});

// Payment reconciliation validation schema
export const paymentSchema = z.object({
  declaration_id: z.string().min(1, 'Declaration ID is required'),
  bank_ref: z.string().min(1, 'Bank reference is required').max(100),
  assessed: z.number().min(0, 'Assessed amount cannot be negative'),
  paid: z.number().min(0, 'Paid amount cannot be negative'),
  fx_rate: z.number().positive('Exchange rate must be positive').optional(),
  status: z.enum(['MATCH', 'SHORT', 'OVER', 'DELAYED'])
});

// Case validation schema
export const caseSchema = z.object({
  declaration_id: z.string().min(1, 'Declaration ID is required').optional(),
  type: z.enum(['PCA', 'INVESTIGATION', 'VALUATION_REVIEW']),
  expected_recovery: z.number().min(0, 'Expected recovery cannot be negative').optional(),
  assigned_to: z.string().max(100).optional()
});

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodError['errors'];
}

// Validation function
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return {
      success: true,
      data: result.data
    };
  }
  
  return {
    success: false,
    errors: result.error.errors
  };
}

// Business rule validation functions
export function validateBusinessRules(declaration: any): string[] {
  const errors: string[] = [];

  // Check if net weight exceeds gross weight
  if (declaration.items) {
    declaration.items.forEach((item: any, index: number) => {
      if (item.net_weight_kg && item.gross_weight_kg) {
        if (item.net_weight_kg > item.gross_weight_kg) {
          errors.push(`Item ${index + 1}: Net weight cannot exceed gross weight`);
        }
      }
    });
  }

  // Check for reasonable value-to-weight ratios
  if (declaration.items) {
    declaration.items.forEach((item: any, index: number) => {
      if (item.invoice_value_usd && item.net_weight_kg && item.net_weight_kg > 0) {
        const valuePerKg = item.invoice_value_usd / item.net_weight_kg;
        
        // Flag extreme values (these thresholds should be configurable)
        if (valuePerKg > 10000) {
          errors.push(`Item ${index + 1}: Very high value-to-weight ratio (${valuePerKg.toFixed(2)} USD/kg)`);
        }
        if (valuePerKg < 0.1) {
          errors.push(`Item ${index + 1}: Very low value-to-weight ratio (${valuePerKg.toFixed(2)} USD/kg)`);
        }
      }
    });
  }

  // Check for weekend/holiday filings (business rule)
  const lodgementDate = new Date(declaration.lodgement_ts);
  const dayOfWeek = lodgementDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    errors.push('Declaration lodged on weekend - requires additional scrutiny');
  }

  return errors;
}