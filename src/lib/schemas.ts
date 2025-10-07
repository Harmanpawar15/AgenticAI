import { z } from "zod";

export const ClaimInputSchema = z.object({
  patientName: z.string(),
  dob: z.string(), // ISO yyyy-mm-dd preferred; free-form allowed, we’ll normalize
  insuranceId: z.string().optional().nullable(),
  procedure: z.string(), // e.g., "MRI Knee"
  cptCode: z.string().optional().nullable(), // e.g., "73721"
});

export type ClaimInput = z.infer<typeof ClaimInputSchema>;

export const VerificationIssueSchema = z.object({
  field: z.string(),
  message: z.string(),
  severity: z.enum(["info", "warn", "error"]),
});

export type VerificationIssue = z.infer<typeof VerificationIssueSchema>;

export const AgentLogSchema = z.object({
  agent: z.string(),
  step: z.string(),
  detail: z.string(),
  data: z.any().optional(),
  ts: z.number(), // Date.now()
});

export type AgentLog = z.infer<typeof AgentLogSchema>;

export const SubmissionDraftSchema = z.object({
  patient: z.string(),
  dob: z.string(),
  insuranceId: z.string().nullable(),
  procedure: z.string(),
  cptCode: z.string().nullable(),
  status: z.enum(["READY", "BLOCKED"]),
  notes: z.array(z.string()).default([]),
});

export type SubmissionDraft = z.infer<typeof SubmissionDraftSchema>;

export const WorkflowResponseSchema = z.object({
  parsed: ClaimInputSchema,
  verified: z.object({
    issues: z.array(VerificationIssueSchema),
    normalized: ClaimInputSchema,
  }),
  coder: z.object({
    suggestedCpt: z.string().nullable(),
    justification: z.string(),
    valid: z.boolean(),
  }),
  submission: SubmissionDraftSchema,
  reviewer: z.object({
    denialRisk: z.enum(["low", "medium", "high"]),
    rationale: z.string(),
  }),
  metrics: z.object({
    baselineSeconds: z.number(),
    automatedSeconds: z.number(),
    timeSavedPercent: z.number(),
    cleanClaimRate: z.number(), // simulated KPI
  }),
  logs: z.array(AgentLogSchema),

   explanation: z.string(), 
});

export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>;
