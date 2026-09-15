import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      checks: { database: "ok" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        checks: {
          database: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 503 }
    );
  }
}
