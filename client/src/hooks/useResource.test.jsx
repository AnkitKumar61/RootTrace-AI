// @vitest-environment jsdom
import { test, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useResource } from "./useResource.js";
import { api } from "../lib/api.js";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
test("polling pauses while hidden and stops at a terminal state", async () => {
  vi.useFakeTimers();
  let hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  const get = vi
    .spyOn(api, "get")
    .mockResolvedValueOnce({ data: { status: "PROCESSING" } })
    .mockResolvedValue({ data: { status: "READY" } });
  const { result } = renderHook(() =>
    useResource("/sources/fixture", {
      pollWhile: (d) => d.status === "PROCESSING",
    }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.data.status).toBe("PROCESSING");
  hidden = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(get).toHaveBeenCalledTimes(1);
  hidden = false;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(result.current.data.status).toBe("READY");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9000);
  });
  expect(get).toHaveBeenCalledTimes(2);
});
