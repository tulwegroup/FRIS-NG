import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export interface IdempotencyResult {
  isDuplicate: boolean;
  existingResponse?: any;
}

export async function checkIdempotency(
  idempotencyKey: string,
  endpoint: string
): Promise<IdempotencyResult> {
  try {
    // Check if we have a stored response for this key
    const storedResponse = await db.audit.findFirst({
      where: {
        payload_hash: idempotencyKey,
        action: `IDEMPOTENT_${endpoint}`
      }
    });

    if (storedResponse) {
      return {
        isDuplicate: true,
        existingResponse: JSON.parse(storedResponse.payload_hash || '{}')
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Idempotency check error:', error);
    return { isDuplicate: false };
  }
}

export async function storeIdempotentResponse(
  idempotencyKey: string,
  endpoint: string,
  response: any
): Promise<void> {
  try {
    await db.audit.create({
      data: {
        event_id: `idempotent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        action: `IDEMPOTENT_${endpoint}`,
        payload_hash: JSON.stringify(response),
        actor: 'system'
      }
    });
  } catch (error) {
    console.error('Idempotency storage error:', error);
  }
}

export function withIdempotency(handler: (req: NextRequest) => Promise<NextResponse>, endpoint: string) {
  return async (req: NextRequest) => {
    try {
      const idempotencyKey = req.headers.get('Idempotency-Key');
      
      if (!idempotencyKey) {
        return await handler(req);
      }

      // Check for duplicate request
      const idempotencyResult = await checkIdempotency(idempotencyKey, endpoint);
      
      if (idempotencyResult.isDuplicate && idempotencyResult.existingResponse) {
        return NextResponse.json(idempotencyResult.existingResponse);
      }

      // Process the request
      const response = await handler(req);
      const responseData = await response.json();

      // Store the response for idempotency
      await storeIdempotentResponse(idempotencyKey, endpoint, responseData);

      return response;
    } catch (error) {
      console.error('Idempotency middleware error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}