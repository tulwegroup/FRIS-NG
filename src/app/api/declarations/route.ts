import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { withAuth } from "@/middleware/auth";
import { withIdempotency } from "@/lib/middleware/idempotency";
import { withValidation } from "@/lib/validation/middleware";
import { declarationSchema } from "@/lib/validation/schemas";
import { withObservability } from "@/lib/observability/middleware";

const handler = withValidation(
  declarationSchema,
  async (request: NextRequest, validatedData: any) => {
    try {
      const { declaration_id, arrival_port, lodgement_ts, items, ...rest } = validatedData;

      // Check if declaration already exists
      const existingDeclaration = await db.declaration.findUnique({
        where: { declaration_id }
      });

      if (existingDeclaration) {
        return NextResponse.json(
          { error: "Declaration already exists" },
          { status: 409 }
        );
      }

      // Create declaration with items
      const declaration = await db.declaration.create({
        data: {
          declaration_id,
          arrival_port,
          lodgement_ts: new Date(lodgement_ts),
          eta: rest.eta ? new Date(rest.eta) : null,
          channel: rest.channel || "GREEN",
          status: rest.status || "FILED",
          consignee_tin: rest.consignee?.tin || null,
          consignee_name: rest.consignee?.name || null,
          consignee_addr: rest.consignee?.addr || null,
          consignee_phones: rest.consignee?.phones ? JSON.stringify(rest.consignee.phones) : null,
          consignee_emails: rest.consignee?.emails ? JSON.stringify(rest.consignee.emails) : null,
          declarant_license_id: rest.declarant?.license_id || null,
          declarant_name: rest.declarant?.name || null,
          voyage_bl: rest.voyage?.bl || null,
          voyage_vessel: rest.voyage?.vessel || null,
          voyage_origin: rest.voyage?.origin || null,
          transshipment_ports: rest.voyage?.transshipment_ports ? JSON.stringify(rest.voyage.transshipment_ports) : null,
          items: {
            create: items.map((item: any, index: number) => ({
              line_no: item.line_no || index + 1,
              declared_hs: item.declared_hs,
              declared_desc: item.declared_desc,
              qty: item.qty,
              uom: item.uom,
              gross_weight_kg: item.gross_weight_kg || null,
              net_weight_kg: item.net_weight_kg || null,
              invoice_value_usd: item.invoice_value_usd,
              incoterm: item.incoterm || null,
              country_origin: item.country_origin || null,
              brand: item.brand || null,
              model: item.model || null,
              year: item.year || null,
            }))
          }
        },
        include: {
          items: true
        }
      });

      return NextResponse.json({
        message: "Declaration created successfully",
        declaration
      });

    } catch (error) {
      console.error("Error creating declaration:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

export const POST = withObservability(
  withAuth(
    withIdempotency(handler, 'declarations'), 
    ['declaration:write']
  ),
  'declarations'
);