// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Layout from "./Layout.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: () => ({ user: { name: "Test Engineer" }, logout: vi.fn() }),
}));
afterEach(() => cleanup());
test("project navigation exposes the main workflow without benchmark controls", () => {
  render(
    <MemoryRouter initialEntries={["/projects/p1"]}>
      <Routes>
        <Route path="/projects/:projectId" element={<Layout />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: "Overview", exact: true }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Sources", exact: true }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Incidents", exact: true }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("link", { name: "Evaluation", exact: true }),
  ).toBeNull();
});
