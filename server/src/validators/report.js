import { z } from "zod";
const evidence = z.object({
  evidenceId: z.uuid(),
  chunkId: z.uuid(),
  sourceId: z.string().regex(/^[a-f0-9]{24}$/),
  projectId: z.string().regex(/^[a-f0-9]{24}$/),
  fileName: z.string().max(255),
  chunkType: z.enum(["log", "document"]),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  text: z.string().max(5000),
  section: z.string().nullable().optional(),
  score: z.number().finite(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export const reportSchema = z
  .object({
    summary: z.string().min(1).max(3000),
    suspectedCauses: z
      .array(
        z
          .object({
            cause: z.string().min(1).max(500),
            reasoning: z.string().min(1).max(2000),
            evidenceIds: z.array(z.uuid()).min(1).max(30),
          })
          .strict(),
      )
      .max(8),
    affectedServices: z.array(z.string().max(120)).max(20),
    nextSteps: z.array(z.string().min(1).max(1000)).min(1).max(12),
    evidenceSufficiency: z.enum(["SUFFICIENT", "PARTIAL", "INSUFFICIENT"]),
    retrievedEvidence: z.array(evidence).max(30),
    modelInformation: z
      .object({
        provider: z.string().max(80),
        model: z.string().max(120),
        embeddingModel: z.string().max(120),
        topK: z.number().int().min(1).max(30),
        retrievalDurationMs: z.number().nonnegative(),
        generationDurationMs: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();
export function parseReport(value, projectId, readyIds) {
  const report = reportSchema.parse(value);
  const ids = new Set(report.retrievedEvidence.map((e) => e.evidenceId));
  if (
    report.retrievedEvidence.some(
      (e) =>
        e.projectId !== String(projectId) ||
        !readyIds.includes(e.sourceId) ||
        e.lineEnd < e.lineStart,
    ) ||
    report.suspectedCauses.some((c) => c.evidenceIds.some((id) => !ids.has(id)))
  )
    throw new Error("Invalid report evidence");
  if (
    (report.evidenceSufficiency === "INSUFFICIENT") !==
    (report.suspectedCauses.length === 0)
  )
    throw new Error("Invalid report sufficiency");
  return report;
}
