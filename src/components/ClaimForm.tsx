"use client";


import { useEffect, useMemo, useState } from "react";
import { SAMPLE_CLAIMS } from "../data/sampleClaim";


/** ---------- Small UI helpers (Badges, Stepper, Tooltip-ish) ---------- */

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warn" | "error" | "info";
}) {
  const map: Record<string, string> = {
    neutral: "bg-gray-200 text-gray-700",
    success: "bg-green-600 text-white",
    warn: "bg-yellow-500 text-white",
    error: "bg-red-600 text-white",
    info: "bg-blue-600 text-white",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${map[tone]}`}>
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: "READY" | "BLOCKED" }) {
  return (
    <Badge tone={status === "READY" ? "success" : "error"}>
      {status === "READY" ? "READY" : "BLOCKED"}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: "info" | "warn" | "error" }) {
  const tone = severity === "error" ? "error" : severity === "warn" ? "warn" : "info";
  return <Badge tone={tone}>{severity.toUpperCase()}</Badge>;
}

function Tooltip({
  label,
  text,
}: {
  label: React.ReactNode;
  text: string;
}) {
  // Simple native tooltip via title attribute (keeps deps minimal)
  return (
    <span title={text} className="underline decoration-dotted cursor-help">
      {label}
    </span>
  );
}

const STEPS = ["Reader", "Checker", "Coder", "Submitter", "Reviewer"] as const;
type StepName = (typeof STEPS)[number];

/** Narration sequence used while the workflow runs (purely UX) */
const NARRATION: Record<StepName, string> = {
  Reader: "🧾 Reading claim...",
  Checker: "✅ Checking for missing details...",
  Coder: "💬 Validating procedure code...",
  Submitter: "📤 Preparing submission...",
  Reviewer: "🔍 Reviewing denial risk...",
};

type RunResult = any; // server validates; keep UI flexible

export default function ClaimForm() {
  const [freeText, setFreeText] = useState<string>("");
  const [jsonText, setJsonText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UI stepper state (visual only)
  const [activeStep, setActiveStep] = useState<number>(0);
  const [narration, setNarration] = useState<string>("");

  // Derive outcome headline after a successful run
  const outcomeText = useMemo(() => {
    if (!result) return "";
    const ready = result?.submission?.status === "READY";
    const risk = result?.reviewer?.denialRisk;
    const ts = result?.metrics?.timeSavedPercent ?? 0;
    const ccr = result?.metrics?.cleanClaimRate ?? 0;
    return ready
      ? `✅ Claim is READY. Denial risk: ${risk}. Time saved: ${ts}%. Clean-claim rate: ${ccr}%.`
      : `⚠️ Claim is BLOCKED. Denial risk: ${risk}. Fix issues, then re-run. Time saved: ${ts}%.`;
  }, [result]);

  // Stepper advance “animation” while we wait for the API.
  // This doesn’t reflect server internals; it’s user-friendly narration.
  useEffect(() => {
    if (!loading) return;
    setActiveStep(0);
    setNarration(NARRATION.Reader);

    const timers: NodeJS.Timeout[] = [];
    STEPS.forEach((_, idx) => {
      timers.push(
        setTimeout(() => {
          setActiveStep(idx + 1);
          setNarration(NARRATION[STEPS[idx]]);
        }, 400 * idx),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  const run = async (payload: unknown) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: payload }),
      });

      const text = await res.text(); // read once
      if (!res.ok) {
        // Show raw text if server returned HTML error page or message
        throw new Error(text?.slice(0, 300) || "Run failed");
      }
      const data = JSON.parse(text);
      setResult(data);
      setNarration("✅ Completed.");
      setActiveStep(STEPS.length);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
      setNarration("❗ Error — see message below.");
    } finally {
      setLoading(false);
    }
  };

  const handleRun = () => {
    if (jsonText.trim()) {
      try {
        const parsed = JSON.parse(jsonText);
        return run(parsed);
      } catch {
        setError("Invalid JSON in the JSON input.");
        return;
      }
    }
    if (freeText.trim()) return run(freeText);
    setError("Provide free-text snippet or JSON.");
  };

  const loadSample = (idx: number) => {
    const sample = SAMPLE_CLAIMS[idx];
    setJsonText(JSON.stringify(sample.data, null, 2));
    setFreeText("");
    setResult(null);
    setError(null);
    setActiveStep(0);
    setNarration("");
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Left: Inputs */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Try a Claim</h2>

        <div className="space-y-2">
          <label className="font-medium">Pick a Sample</label>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_CLAIMS.map((s, i) => (
              <button
                key={i}
                onClick={() => loadSample(i)}
                className="rounded-xl border px-3 py-1 text-sm hover:bg-gray-50"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="font-medium">Free-text Snippet</label>
          <p className="text-xs text-gray-500">
            Example: <em>Patient: John Doe, DOB 01/01/1975, Procedure: MRI Knee, Insurance ID: (missing), Code: CPT 73721</em>
          </p>
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={6}
            className="w-full rounded-2xl border p-3"
            placeholder={`Patient: John Doe, DOB 01/01/1975
Procedure: MRI Knee
Insurance ID: (missing)
Code: CPT 73721`}
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium">JSON Input (optional)</label>
          <p className="text-xs text-gray-500">
            If provided, this is used instead of free-text. It represents the machine-readable claim.
          </p>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={10}
            className="w-full rounded-2xl border p-3 font-mono text-sm"
            placeholder={`{
  "patientName": "John Doe",
  "dob": "01/01/1975",
  "insuranceId": "",
  "procedure": "MRI Knee",
  "cptCode": "73721"
}`}
          />
        </div>

        <button
          onClick={handleRun}
          disabled={loading}
          className="rounded-2xl bg-black px-5 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Agent Workflow"}
        </button>

        {error && (
          <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Narration bar */}
        {loading || narration ? (
          <div className="rounded-2xl border p-3 text-sm text-gray-700">
            <span className="mr-2">🗣️</span>
            {narration || "Ready."}
          </div>
        ) : null}
      </div>

      {/* Right: Results & Visuals */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">What the AI Employee is Doing</h2>

        {/* Stepper */}
        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold mb-2">Agent Workflow</h3>
          <p className="text-sm text-gray-600 mb-3">
            The AI processes the claim like a relay team:
            <span className="ml-1">🧾 Reader → ✅ Checker → 💬 Coder → 📤 Submitter → 🔍 Reviewer</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {STEPS.map((step, i) => (
              <span
                key={step}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  i < activeStep ? "bg-green-600 text-white" : "bg-gray-200 text-gray-600"
                }`}
              >
                {step}
              </span>
            ))}
          </div>
        </section>

        {!result && (
          <p className="text-gray-600">
            Run the workflow to see a friendly summary, verification highlights, a suggested{" "}
            <Tooltip label={<b>CPT code</b>} text="A 5-digit procedure code used for medical billing." />{" "}
            and a final risk review.
          </p>
        )}

        {result && (
          <div className="space-y-6">
            {/* Outcome Summary (business impact) */}
            <section className="rounded-2xl border bg-green-50 p-6 text-center">
              <h3 className="text-xl font-semibold">Outcome Summary</h3>
              <p className="mt-2 text-gray-700">{outcomeText}</p>
              <p className="mt-1 text-gray-500 text-sm">
                Imagine scaling this to thousands of claims — that’s the power of agentic automation.
              </p>
            </section>

            {/* Impact Metrics */}
            <section className="rounded-2xl border p-4">
              <h3 className="font-semibold">Impact Metrics</h3>
              <ul className="mt-2 text-sm">
                <li>Baseline time/claim: <b>{result.metrics.baselineSeconds}s</b></li>
                <li>Automated time/claim: <b>{result.metrics.automatedSeconds}s</b></li>
                <li>Time saved: <b>{result.metrics.timeSavedPercent}%</b></li>
                <li>Clean claim rate (sim): <b>{result.metrics.cleanClaimRate}%</b></li>
              </ul>
            </section>

            {/* Parsed Claim */}
            <section className="rounded-2xl border p-4">
              <h3 className="font-semibold">Reader Agent (Parsed Claim)</h3>
              <p className="text-sm text-gray-600 mb-2">
                Turns the claim into neat fields the rest of the team can use.
              </p>
              <pre className="mt-2 overflow-auto rounded-xl bg-gray-50 p-3 text-xs">
                {JSON.stringify(result.parsed, null, 2)}
              </pre>
            </section>

            {/* Verifier */}
            <section className="rounded-2xl border p-4">
              <h3 className="font-semibold">Checker Agent (Verification)</h3>
              <p className="text-sm text-gray-600 mb-2">
                Flags anything that might cause a delay or denial.
              </p>
              {result.verified.issues.length === 0 ? (
                <p className="text-sm text-green-700">No issues found.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {result.verified.issues.map((i: any, idx: number) => (
                    <li key={idx} className="flex items-center gap-2">
                      <SeverityBadge severity={i.severity} />
                      <span>{i.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Coder */}
            <section className="rounded-2xl border p-4">
              <h3 className="font-semibold">
                Medical Coder Agent{" "}
                <span className="text-sm text-gray-500">
                  (<Tooltip
                    label={<span className="text-gray-700">What’s a CPT code?</span>}
                    text="A 5-digit code (e.g., 73721) used to identify medical procedures for billing."
                  />)
                </span>
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                Ensures the procedure matches the correct billing code.
              </p>
              <p className="text-sm">
                Suggested CPT: <b>{result.coder.suggestedCpt ?? "null"}</b> (valid: {String(result.coder.valid)})
              </p>
              <p className="mt-1 text-xs text-gray-700">{result.coder.justification}</p>
            </section>

            {/* Submission */}
            <section className="rounded-2xl border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Claim Preparer (Submission Draft)</h3>
                <StatusBadge status={result.submission.status} />
              </div>
              <p className="text-sm text-gray-600 mb-2">
                Packs everything into the final form and reports if it’s ready to submit.
              </p>
              <pre className="mt-2 overflow-auto rounded-xl bg-gray-50 p-3 text-xs">
                {JSON.stringify(result.submission, null, 2)}
              </pre>
            </section>

            {/* Reviewer */}
            <section className="rounded-2xl border p-4">
              <h3 className="font-semibold">Compliance Reviewer (Denial Risk)</h3>
              <p className="text-sm text-gray-600 mb-2">
                Estimates the chance an insurer might deny this claim and explains why.
              </p>
              <p className="text-sm">Denial risk: <b>{result.reviewer.denialRisk}</b></p>
              <p className="mt-1 text-xs text-gray-700">{result.reviewer.rationale}</p>
            </section>

            {/* Logs */}
            <section className="rounded-2xl border p-4">
              <h3 className="font-semibold">Automation Logs</h3>
              <p className="text-sm text-gray-600 mb-2">
                A clear activity trail for reliability and auditing.
              </p>
              <ol className="mt-2 space-y-2 text-xs">
                {result.logs.map((l: any, i: number) => (
                  <li key={i} className="rounded-lg bg-gray-50 p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {l.agent} → {l.step}
                      </span>
                      <span className="text-gray-500">
                        {new Date(l.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-gray-700">{l.detail}</div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}