// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import UploadSource from "./UploadSource.jsx";
import { api } from "../lib/api.js";

vi.mock("../hooks/useResource.js", () => ({
  useResource: () => ({ data: { maxFileSizeMB: 1 } }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function renderUpload() {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/sources/upload"]}>
      <Routes>
        <Route
          element={
            <Outlet context={{ project: { _id: "p1", name: "ShopFlow" } }} />
          }
        >
          <Route
            path="/projects/p1/sources/upload"
            element={<UploadSource />}
          />
          <Route
            path="/projects/p1/sources"
            element={<h1>Project sources</h1>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
function select(files) {
  fireEvent.change(screen.getByLabelText("Source file"), { target: { files } });
}
function file(name, text = "ERROR timeout") {
  return new File([text], name, { type: "text/plain" });
}

test("uploads selected logs and documents sequentially, with one validated API request per file", async () => {
  let finishFirst;
  const post = vi
    .spyOn(api, "post")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockResolvedValue({ status: 202 });
  renderUpload();
  const files = [file("payment.log"), file("runbooks.md"), file("events.json")];
  select(files);
  expect(screen.getByLabelText("Source file").multiple).toBe(true);
  expect(screen.getByText("3 files selected")).toBeTruthy();
  expect(screen.getByLabelText("Source type for runbooks.md").value).toBe(
    "document",
  );
  fireEvent.change(screen.getByLabelText("Source type for events.json"), {
    target: { value: "document" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Upload and process" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Source file").disabled).toBe(true);
  fireEvent.submit(
    screen.getByRole("button", { name: "Uploading…" }).closest("form"),
  );
  expect(post).toHaveBeenCalledTimes(1);
  finishFirst({ status: 202 });
  expect(
    await screen.findByRole("heading", { name: "Project sources" }),
  ).toBeTruthy();
  expect(post).toHaveBeenCalledTimes(3);
  for (const [index, type] of ["log", "document", "document"].entries()) {
    expect(post.mock.calls[index][0]).toBe("/projects/p1/sources");
    const body = post.mock.calls[index][1];
    expect(body.getAll("file")).toHaveLength(1);
    expect(body.get("file").name).toBe(files[index].name);
    expect(body.get("sourceType")).toBe(type);
  }
});

test("continues after a rejected file and retries only that file", async () => {
  const post = vi
    .spyOn(api, "post")
    .mockResolvedValueOnce({ status: 202 })
    .mockRejectedValueOnce({
      response: {
        status: 429,
        data: {
          error: { message: "Upload limit reached. Please retry later." },
        },
      },
    })
    .mockResolvedValue({ status: 202 });
  renderUpload();
  select([file("first.log"), file("second.log"), file("third.log")]);
  fireEvent.click(screen.getByRole("button", { name: "Upload and process" }));
  const retry = await screen.findByRole("button", {
    name: "Retry rejected files",
  });
  expect(post).toHaveBeenCalledTimes(3);
  expect(screen.getByText("2 of 3 files queued for processing")).toBeTruthy();
  expect(
    screen.getByText("Upload limit reached. Please retry later."),
  ).toBeTruthy();
  fireEvent.click(retry);
  expect(
    await screen.findByRole("heading", { name: "Project sources" }),
  ).toBeTruthy();
  expect(post).toHaveBeenCalledTimes(4);
  expect(post.mock.calls[3][1].get("file").name).toBe("second.log");
});

test("rejects invalid, empty and oversized selections while uploading valid files", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ status: 202 });
  renderUpload();
  select([
    file("payload.exe"),
    file("empty.log", ""),
    file("large.log", "x".repeat(1024 * 1024 + 1)),
    file("valid.log"),
  ]);
  expect(screen.getByText("The file exceeds the 1 MB limit.")).toBeTruthy();
  expect(screen.getByText("Choose a non-empty text file.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Upload and process" }));
  await waitFor(() =>
    expect(screen.getByText("1 of 4 files queued for processing")).toBeTruthy(),
  );
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][1].get("file").name).toBe("valid.log");
  fireEvent.click(screen.getByRole("button", { name: "Remove payload.exe" }));
  expect(screen.queryByText("payload.exe")).toBeNull();
});

test("does not resend saved or unconfirmed uploads after queue errors or lost responses", async () => {
  const post = vi
    .spyOn(api, "post")
    .mockRejectedValueOnce({
      response: { status: 503, data: { error: { code: "QUEUE_UNAVAILABLE" } } },
    })
    .mockRejectedValueOnce(new Error("Network unavailable"))
    .mockResolvedValue({ status: 202 });
  renderUpload();
  select([file("saved.log"), file("unknown.log"), file("good.log")]);
  fireEvent.click(screen.getByRole("button", { name: "Upload and process" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Upload and process" }).disabled,
    ).toBe(true),
  );
  expect(post).toHaveBeenCalledTimes(3);
  expect(
    screen.getByText(
      "Saved, but not queued. Open Sources and retry processing there.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "Upload could not be confirmed. Check Sources before uploading this file again.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "View sources" }).getAttribute("href"),
  ).toBe("/projects/p1/sources");
});

test("changing the batch type updates selected files and leaving the page stops the remaining requests", async () => {
  let finish;
  const post = vi.spyOn(api, "post").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderUpload();
  select([file("one.txt"), file("two.md")]);
  fireEvent.change(screen.getByLabelText("Source type"), {
    target: { value: "log" },
  });
  expect(screen.getByLabelText("Source type for two.md").value).toBe("log");
  fireEvent.click(screen.getByRole("button", { name: "Upload and process" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  view.unmount();
  finish({ status: 202 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(post).toHaveBeenCalledTimes(1);
});
