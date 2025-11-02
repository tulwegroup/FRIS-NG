import { NextRequest, NextResponse } from "next/server";
import { verifyRefreshToken, generateToken, UserPayload } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { refresh_token } = await request.json();

    if (!refresh_token) {
      return NextResponse.json(
        { error: "Refresh token is required" },
        { status: 400 }
      );
    }

    const userPayload = verifyRefreshToken(refresh_token);

    if (!userPayload) {
      return NextResponse.json(
        { error: "Invalid or expired refresh token" },
        { status: 401 }
      );
    }

    // Generate new access token
    const newToken = generateToken(userPayload);

    return NextResponse.json({
      message: "Token refreshed successfully",
      token: newToken,
      user: {
        id: userPayload.id,
        email: userPayload.email,
        role: userPayload.role,
        permissions: userPayload.permissions
      }
    });

  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}