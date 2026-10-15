// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import EvidenceViewer from "./EvidenceViewer.jsx";
import { api } from "../lib/api.js";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const evidence = {
  evidenceId: "e1",
  sourceId: "s1",
  fileName: "payment.log",
  lineStart: 2,
  lineEnd: 7,
  section: null,
  score: 0.8,
  text: "Saved payment timeout excerpt",
};

test("connection failure keeps the saved excerpt and allows original lines to load after retry", async () => {
  const get = vi
    .spyOn(api, "get")
    .mockRejectedValueOnce(new Error("Network unavailable"))
    .mockResolvedValueOnce({
      data: { lines: [{ number: 4, text: "ERROR ETIMEDOUT after 5000ms" }] },
    });
  render(<EvidenceViewer evidence={evidence} projectId="p1" />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "The original file could not be loaded. Check that the local app is running, then retry.",
  );
  expect(screen.getByText("Saved payment timeout excerpt")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Retry loading original lines" }),
  );
  expect(await screen.findByText("ERROR ETIMEDOUT after 5000ms")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("Saved payment timeout excerpt")).toBeNull();
  expect(get).toHaveBeenCalledTimes(2);
  expect(get.mock.calls[1][0]).toBe("/projects/p1/sources/s1/lines");
  expect(get.mock.calls[1][1].params).toEqual({ start: 1, limit: 12 });
});

test("a late response from another citation never replaces the selected source's lines", async () => {
  let finishOld;
  const get = vi
    .spyOn(api, "get")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockResolvedValueOnce({
      data: { lines: [{ number: 5, text: "Current runbook lines" }] },
    });
  const view = render(<EvidenceViewer evidence={evidence} projectId="p1" />);
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  view.rerender(
    <EvidenceViewer
      evidence={{ ...evidence, sourceId: "s2", fileName: "runbooks.md" }}
      projectId="p1"
    />,
  );
  expect(await screen.findByText("Current runbook lines")).toBeTruthy();
  finishOld({ data: { lines: [{ number: 4, text: "Old payment lines" }] } });
  await waitFor(() => expect(get.mock.calls[0][1].signal.aborted).toBe(true));
  expect(screen.queryByText("Old payment lines")).toBeNull();
  expect(screen.getByText("Current runbook lines")).toBeTruthy();
});
