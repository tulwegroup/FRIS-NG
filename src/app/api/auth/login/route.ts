import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, generateToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const userPayload = await authenticateUser(email, password);

    if (!userPayload) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = generateToken(userPayload);

    return NextResponse.json({
      message: "Authentication successful",
      token,
      user: {
        id: userPayload.id,
        email: userPayload.email,
        role: userPayload.role,
        permissions: userPayload.permissions
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}