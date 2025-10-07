import { NextRequest, NextResponse } from "next/server";
import { runWorkflow } from "@/lib/agents";
import { WorkflowResponseSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { input?: unknown } | unknown;
    const input = (body as { input?: unknown })?.input ?? body;
    const result = await runWorkflow(input);
    const validated = WorkflowResponseSchema.parse(result);
    return NextResponse.json(validated, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
