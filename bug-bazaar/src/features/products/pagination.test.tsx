// @vitest-environment jsdom
// Paging through the list, including a link to a page that no longer exists
// (found untested by the D4-5 coverage report).

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import TestApp from "../../test/TestApp.tsx";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  server.resetHandlers(
    ...createHandlers({ db: createDb({ storage }), controls: createControls({ storage }) }),
  );
});

function renderAt(path: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp />
    </MemoryRouter>,
  );
  return user;
}

const firstCardName = async () => {
  const [list] = await screen.findAllByRole("list");
  if (!list) throw new Error("no list");
  return within(list).getAllByRole("link")[0]?.textContent;
};

describe("pagination", () => {
  it("Next and Previous move between pages and back to the same results", async () => {
    const user = renderAt("/");
    const pageOne = await firstCardName();
    // Re-queried each time: the bar is replaced while a new page loads.
    const pagination = () => screen.getByRole("navigation", { name: "Pagination" });

    await user.click(within(pagination()).getByRole("button", { name: /next/i }));
    await screen.findByText(/page 2/i, { selector: "nav *" });
    expect(await firstCardName()).not.toBe(pageOne);

    await user.click(within(pagination()).getByRole("button", { name: /previous/i }));
    await screen.findByText(/page 1/i, { selector: "nav *" });
    expect(await firstCardName()).toBe(pageOne);
  });

  it("a link to a page that doesn't exist explains it and offers page 1", async () => {
    const user = renderAt("/?search=decaf&page=999");
    expect(await screen.findByText("That page doesn't exist")).toBeInTheDocument();
    expect(screen.getByText(/These results only have \d+ pages?\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to page 1" }));
    expect(await firstCardName()).toMatch(/decaf/i);
  });
});
