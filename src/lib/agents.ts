
import {z} from "zod";
import {
  AgentLog,
  ClaimInput,
  ClaimInputSchema,
  SubmissionDraft,
  SubmissionDraftSchema,
  VerificationIssue,
} from "./schemas";
import { askGeminiJSON } from "./gemini";

// Minimal CPT “dictionary” for demo
const CPT_REF: Record<string, { label: string; procedures: string[] }> = {
  "73721": { label: "MRI Lower Extremity w/o contrast", procedures: ["mri knee", "knee mri"] },
  "70551": { label: "MRI Brain w/o contrast", procedures: ["mri brain", "brain mri"] },
  "72148": { label: "MRI Lumbar Spine w/o contrast", procedures: ["mri spine", "lumbar mri"] },
};

function now(): number {
  return Date.now();
}

function pushLog(logs: AgentLog[], entry: Omit<AgentLog, "ts">) {
  logs.push({ ...entry, ts: now() });
}

function normalizeDOB(dob: string): string {
  // try to coerce to YYYY-MM-DD
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return dob;
  const mdy = dob.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const [_, mm, dd, yyyy] = mdy;
    const y = (yyyy.length === 2 ? "19" : "") + yyyy; // naive
    return `${y.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return dob; // leave as-is if unknown
}

// ---------- Agents ----------

export async function parserAgent(input: unknown, logs: AgentLog[]): Promise<ClaimInput> {
  // Accept JSON object or raw text -> ask LLM to parse
  if (typeof input === "object" && input) {
    const parsed = ClaimInputSchema.safeParse(input);
    if (parsed.success) {
      const normalized = { ...parsed.data, dob: normalizeDOB(parsed.data.dob) };
      pushLog(logs, { agent: "ParserAgent", step: "parse-json", detail: "Parsed JSON claim.", data: normalized });
      return normalized;
    }
  }

  const prompt = `
You are a strict JSON parser for healthcare claim snippets.
Extract fields: patientName, dob, insuranceId (nullable), procedure, cptCode (nullable).
Return ONLY JSON.

Snippet:
${typeof input === "string" ? input : JSON.stringify(input, null, 2)}
  `.trim();

  const json = await askGeminiJSON(prompt);
  const result = ClaimInputSchema.parse({ ...json, dob: normalizeDOB(json.dob) });
  pushLog(logs, { agent: "ParserAgent", step: "parse-text", detail: "Parsed text claim.", data: result });
  return result;
}

export async function verifierAgent(
  claim: ClaimInput,
  logs: AgentLog[]
): Promise<{ issues: VerificationIssue[]; normalized: ClaimInput }> {
  const issues: VerificationIssue[] = [];

  if (!claim.insuranceId || claim.insuranceId.trim() === "") {
    issues.push({ field: "insuranceId", message: "Missing insurance ID.", severity: "error" });
  }
  if (!claim.dob) {
    issues.push({ field: "dob", message: "DOB missing or invalid format.", severity: "warn" });
  }
  if (!claim.patientName) {
    issues.push({ field: "patientName", message: "Patient name missing.", severity: "error" });
  }
  if (!claim.procedure) {
    issues.push({ field: "procedure", message: "Procedure missing.", severity: "error" });
  }

  // Optional LLM cross-check for obvious inconsistencies
  const prompt = `
Check the following claim for obvious consistency issues in 3 bullets max (no PHI storage).
Claim JSON:
${JSON.stringify(claim)}
Return JSON: { "notes": string[] } only.
  `.trim();
  let notes: string[] = [];
  try {
    const res = await askGeminiJSON(prompt);
    notes = Array.isArray(res.notes) ? res.notes.slice(0, 3) : [];
  } catch {
    // ignore LLM failure
  }

  notes.forEach((n) => issues.push({ field: "general", message: n, severity: "info" }));

  pushLog(logs, { agent: "VerifierAgent", step: "validate", detail: "Validated fields & consistency.", data: { issues } });
  return { issues, normalized: claim };
}

export async function coderAgent(claim: ClaimInput, logs: AgentLog[]) {
  const proc = claim.procedure.toLowerCase().trim();
  let suggested: string | null = null;
  let valid = false;

  // If CPT exists, validate quickly
  if (claim.cptCode && CPT_REF[claim.cptCode]) {
    valid = CPT_REF[claim.cptCode].procedures.some((p) => proc.includes(p));
  }

  if (!valid) {
    // Find the closest by simple contains
    const hit = Object.entries(CPT_REF).find(([_, v]) => v.procedures.some((p) => proc.includes(p)));
    suggested = hit?.[0] ?? null;
  } else {
    suggested = claim.cptCode!;
  }

  // LLM justification (short)
  const prompt = `
Provide a one-sentence justification for CPT selection for the procedure "${claim.procedure}".
If CPT "${suggested ?? claim.cptCode ?? ""}" is appropriate, confirm. No PHI.
Return JSON: {"justification": string}
`.trim();

  let justification = "Heuristic CPT validation completed.";
  try {
    const j = await askGeminiJSON(prompt);
    if (typeof j.justification === "string") justification = j.justification;
  } catch {}

  pushLog(logs, {
    agent: "CoderAgent",
    step: "code-validate",
    detail: "Validated/suggested CPT code.",
    data: { suggested, valid },
  });
  return { suggestedCpt: suggested, justification, valid };
}

export async function submissionAgent(
  claim: ClaimInput,
  issues: VerificationIssue[],
  suggestedCpt: string | null,
  logs: AgentLog[]
): Promise<SubmissionDraft> {
  const blocked = issues.some((i) => i.severity === "error");
  const draft: SubmissionDraft = {
    patient: claim.patientName,
    dob: claim.dob,
    insuranceId: claim.insuranceId ?? null,
    procedure: claim.procedure,
    cptCode: suggestedCpt ?? claim.cptCode ?? null,
    status: blocked ? "BLOCKED" : "READY",
    notes: issues.map((i) => `${i.severity.toUpperCase()}: ${i.message}`),
  };
  const validated = SubmissionDraftSchema.parse(draft);
  pushLog(logs, { agent: "SubmissionAgent", step: "draft", detail: "Prepared submission draft.", data: validated });
  return validated;
}

export async function reviewerAgent(submission: SubmissionDraft, logs: AgentLog[]) {
  // Simple denial risk heuristic + LLM rationale
  const risk =
    submission.status === "BLOCKED"
      ? "high"
      : !submission.insuranceId || !submission.cptCode
      ? "medium"
      : "low";

  const prompt = `
Given this submission draft, estimate denial risk and explain briefly (max 2 sentences). No PHI.
${JSON.stringify(submission)}
Return JSON: {"rationale": string}
`.trim();

  let rationale = "Automated review completed.";
  try {
    const r = await askGeminiJSON(prompt);
    if (typeof r.rationale === "string") rationale = r.rationale;
  } catch {}

  pushLog(logs, { agent: "ReviewerAgent", step: "review", detail: "Assessed denial risk.", data: { risk, rationale } });
  return { denialRisk: risk as "low" | "medium" | "high", rationale };
}

/** ---------- Human-friendly explanation (new) ---------- */
async function humanExplain({
  parsed,
  verifiedIssues,
  suggestedCpt,
  coderValid,
  submission,
  reviewer,
  metrics,
}: {
  parsed: ClaimInput;
  verifiedIssues: VerificationIssue[];
  suggestedCpt: string | null;
  coderValid: boolean;
  submission: SubmissionDraft;
  reviewer: { denialRisk: "low" | "medium" | "high"; rationale: string };
  metrics: { timeSavedPercent: number; cleanClaimRate: number };
}) {
  // Compact, non-sensitive snapshot
  const mini = {
    patientName: parsed.patientName ? "Present" : "Missing",
    dob: parsed.dob ? "Present" : "Missing",
    insuranceId: submission.insuranceId ? "Present" : "Missing",
    procedure: parsed.procedure || "Missing",
    cpt: suggestedCpt || submission.cptCode || null,
    issues: verifiedIssues.map((i) => `${i.severity}:${i.message}`).slice(0, 5),
    status: submission.status,
    denialRisk: reviewer.denialRisk,
    timeSavedPercent: metrics.timeSavedPercent,
    cleanClaimRate: metrics.cleanClaimRate,
  };

  const prompt = `
Return ONLY JSON: { "text": string }.
Write a concise, non-technical recap (5–7 short lines, emojis ok) of what the AI assistant did:
Reader → Checker → Coder → Submitter → Reviewer.
Use the outcomes below, be to-the-point, avoid jargon, under 120 words.

Outcomes:
${JSON.stringify(mini)}
`.trim();

  try {
    const j = await askGeminiJSON(prompt);
    if (j && typeof j.text === "string") return j.text.trim();
  } catch {
    // ignore and fall back
  }

  // Fallback if LLM hiccups
  return [
    "🧾 Read the claim and pulled out key fields.",
    "✅ Checked for missing/incorrect details.",
    `💬 Matched the procedure to a billing code (CPT: ${mini.cpt ?? "n/a"}).`,
    `📤 Prepared a submission draft — status: ${mini.status}.`,
    `🔍 Denial risk: ${mini.denialRisk}.`,
    `⚡ Estimated time saved: ${mini.timeSavedPercent}% · Clean-claim rate: ${mini.cleanClaimRate}%.`,
  ].join("\n");
}

// Orchestrator
export async function runWorkflow(input: unknown) {
  const logs: AgentLog[] = [];

  const t0 = performance.now();

  const parsed = await parserAgent(input, logs);
  const verified = await verifierAgent(parsed, logs);
  const coder = await coderAgent(parsed, logs);
  const submission = await submissionAgent(parsed, verified.issues, coder.suggestedCpt, logs);
  const reviewer = await reviewerAgent(submission, logs);

  const t1 = performance.now();
  const automatedMs = t1 - t0;

  // Simulate baseline vs automated timing & KPI
  const baselineSeconds = 12 * 60 / 10; // ~72s per claim (toy)
  const automatedSeconds = Math.max(1, Math.round(automatedMs / 1000));
  const timeSavedPercent = Math.round((1 - automatedSeconds / baselineSeconds) * 100);
  const cleanClaimRate = submission.status === "READY" ? 98 : 82;

  // NEW: Generate human-readable explanation
  const explanation = await humanExplain({
    parsed,
    verifiedIssues: verified.issues,
    suggestedCpt: coder.suggestedCpt,
    coderValid: coder.valid,
    submission,
    reviewer,
    metrics: { timeSavedPercent, cleanClaimRate },
  });

  return {
    parsed,
    verified,
    coder,
    submission,
    reviewer,
    metrics: {
      baselineSeconds,
      automatedSeconds,
      timeSavedPercent,
      cleanClaimRate,
    },
    logs,
    explanation, // <-- include the recap in API response
  };
}

