import { NextResponse } from "next/server";
import { calculateMonthlyReport } from "@/lib/dashboard_logic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const month = parseInt(searchParams.get("month") || "");
  const year = parseInt(searchParams.get("year") || "");

  if (!userId || isNaN(month) || isNaN(year)) {
    return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 });
  }

  try {
    const report = await calculateMonthlyReport(userId, month, year);
    return NextResponse.json(report);
  } catch (error: any) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
