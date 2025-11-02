import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/middleware/auth";

const handler = async (req: NextRequest) => {
  const user = (req as any).user;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions
    }
  });
};

export const GET = withAuth(handler, []);