import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { declaration_id, arrival_port, lodgement_ts, items } = body;
    
    if (!declaration_id || !arrival_port || !lodgement_ts || !items) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

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
        ucms_ref: body.ucms_ref || null,
        arrival_port,
        lodgement_ts: new Date(lodgement_ts),
        eta: body.eta ? new Date(body.eta) : null,
        channel: body.channel || "GREEN",
        status: body.status || "FILED",
        consignee_tin: body.consignee?.tin || null,
        consignee_name: body.consignee?.name || null,
        consignee_addr: body.consignee?.addr || null,
        consignee_phones: body.consignee?.phones ? JSON.stringify(body.consignee.phones) : null,
        consignee_emails: body.consignee?.emails ? JSON.stringify(body.consignee.emails) : null,
        declarant_license_id: body.declarant?.license_id || null,
        declarant_name: body.declarant?.name || null,
        voyage_bl: body.voyage?.bl || null,
        voyage_vessel: body.voyage?.vessel || null,
        voyage_origin: body.voyage?.origin || null,
        transshipment_ports: body.voyage?.transshipment_ports ? JSON.stringify(body.voyage.transshipment_ports) : null,
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