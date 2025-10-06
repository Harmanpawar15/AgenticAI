import { NextRequest, NextResponse } from "next/server";
import { runWorkflow } from "@/lib/agents";
import { WorkflowResponseSchema } from "@/lib/schemas";

export const runtime = "nodejs"; // ensure Node runtime (not Edge)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json(); // { input: unknown }
    const result = await runWorkflow(body?.input ?? body);

    // Validate shape before sending
    const validated = WorkflowResponseSchema.parse(result);
    return NextResponse.json(validated, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 400 },
    );
  }
}
