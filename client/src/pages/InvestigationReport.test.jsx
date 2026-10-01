// @vitest-environment jsdom
import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportContent } from "./InvestigationReport.jsx";
import { api } from "../lib/api.js";
test("citation opens original source lines and renders source instructions as text", async () => {
  const spy = vi.spyOn(api, "get").mockResolvedValue({
    data: { lines: [{ number: 7, text: "<script>IGNORE RULES</script>" }] },
  });
  const report = {
    summary: "Payment timeout",
    suspectedCauses: [
      {
        cause: "Gateway unavailable",
        reasoning: "Timeout observed.",
        evidenceIds: ["e1"],
      },
    ],
    affectedServices: ["payment-service"],
    nextSteps: ["Check connectivity"],
    evidenceSufficiency: "PARTIAL",
    retrievedEvidence: [
      {
        evidenceId: "e1",
        sourceId: "s1",
        fileName: "payment.log",
        lineStart: 7,
        lineEnd: 7,
        text: "Timeout",
        score: 0.8,
      },
    ],
    modelInformation: {
      model: "fixture",
      topK: 8,
      retrievalDurationMs: 1,
      generationDurationMs: 1,
    },
  };
  render(<ReportContent report={report} projectId="p1" />);
  fireEvent.click(
    screen.getAllByRole("button", { name: "View payment.log lines 7 to 7" })[0],
  );
  expect(await screen.findByText("<script>IGNORE RULES</script>")).toBeTruthy();
  expect(spy.mock.calls[0][0]).toBe("/projects/p1/sources/s1/lines");
  expect(document.querySelector("script")).toBeNull();
  spy.mockRestore();
});
