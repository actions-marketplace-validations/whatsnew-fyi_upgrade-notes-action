import { describe, expect, it, vi } from "vitest";
import { ApiError, BATCH, upgradeNotes, userAgent } from "../src/api.ts";
import type { ApiDependency } from "../src/types.ts";
import { answer, answered } from "./fixtures.ts";

const deps = (count: number): ApiDependency[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `pkg-${i}`,
    from: "1.0.0",
    to: "2.0.0",
  }));

function ok(body: unknown): Response {
  return Response.json(body);
}

const options = (fetch: typeof globalThis.fetch) => ({
  apiUrl: "https://whatsnew.fyi",
  recordMisses: false,
  fetch,
  sleep: vi.fn(async () => {}),
});

describe("upgradeNotes", () => {
  it("posts names and versions only, asks for the comment, and says who it is", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        ok(answer([answered("pkg-0")])),
    );
    await upgradeNotes(deps(1), options(fetch));

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://whatsnew.fyi/api/v1/upgrade-notes?render=markdown",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      dependencies: [{ name: "pkg-0", from: "1.0.0", to: "2.0.0" }],
      recordMisses: false,
    });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["user-agent"]).toBe(userAgent());
    expect(userAgent()).toMatch(
      /^whatsnew-upgrade-notes-action\/\S+ \(\+https:/,
    );
  });

  it("splits a large PR at the API's cap, in order", async () => {
    const fetch = vi.fn(async () => ok(answer([])));
    const answers = await upgradeNotes(deps(BATCH * 2 + 1), options(fetch));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(answers).toHaveLength(3);
    const sizes = fetch.mock.calls.map(
      (call) =>
        JSON.parse(String((call as unknown as [URL, RequestInit])[1].body))
          .dependencies.length,
    );
    expect(sizes).toEqual([BATCH, BATCH, 1]);
  });

  it("retries once after a 5xx or a 429, honouring a short Retry-After", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response("{}", { status: 429, headers: { "retry-after": "3" } }),
      )
      .mockResolvedValueOnce(ok(answer([])));
    const opts = options(fetch);
    await upgradeNotes(deps(1), opts);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(opts.sleep).toHaveBeenCalledWith(3_000);
  });

  it("gives up after the retry with the API's own message", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: { code: "x", message: "down for maintenance" } },
        { status: 503 },
      ),
    );
    await expect(upgradeNotes(deps(1), options(fetch))).rejects.toThrow(
      new ApiError("What's New answered 503: down for maintenance", 503),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a request the API refused", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "invalid_body",
            message: "dependencies.0.from: Required",
          },
        },
        { status: 400 },
      ),
    );
    await expect(upgradeNotes(deps(1), options(fetch))).rejects.toThrow(
      "What's New answered 400: dependencies.0.from: Required",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses an answer that is not its JSON, or has no comment, without retrying", async () => {
    const cases: [string, string][] = [
      [
        "<html>Checking your browser</html>",
        "What's New answered with something other than its JSON",
      ],
      [
        JSON.stringify({ data: { dependencies: [] }, meta: {} }),
        "What's New answered without a rendered comment; the server is older than this Action",
      ],
    ];
    for (const [body, message] of cases) {
      const fetch = vi.fn(async () => new Response(body, { status: 200 }));
      await expect(upgradeNotes(deps(1), options(fetch))).rejects.toThrow(
        new ApiError(message),
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("turns a network failure into an ApiError after one retry", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(upgradeNotes(deps(1), options(fetch))).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
