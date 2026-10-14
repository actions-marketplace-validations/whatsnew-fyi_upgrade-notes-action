// The one call this Action makes outside GitHub: `POST /api/v1/upgrade-notes
// ?render=markdown` on What's New, which answers with the JSON its outputs read
// and the comment it posts (ADR 2026-10.b8yg in whatsnew-app). Keyless. What is
// sent is each package's name or purl and the two versions — nothing from the
// repository, no file contents, no token.

import type { ApiAnswer, ApiDependency } from "./types.ts";

/** The API's per-call cap (`UPGRADE_MAX_DEPS`); a larger PR is split. */
export const BATCH = 20;
const TIMEOUT_MS = 60_000;
/** The longest `Retry-After` honoured before giving up on the one retry. */
const MAX_RETRY_WAIT_MS = 10_000;

declare const ACTION_VERSION: string;

export function userAgent(): string {
  const version =
    typeof ACTION_VERSION === "string" ? ACTION_VERSION : "0.0.0-dev";
  return `whatsnew-upgrade-notes-action/${version} (+https://github.com/whatsnew-fyi/upgrade-notes-action)`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiOptions {
  apiUrl: string;
  recordMisses: boolean;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function waitFor(response: Response | undefined): number {
  const header = Number(response?.headers.get("retry-after"));
  return Number.isFinite(header) && header > 0
    ? Math.min(header * 1000, MAX_RETRY_WAIT_MS)
    : 2_000;
}

async function post(
  dependencies: ApiDependency[],
  options: ApiOptions,
): Promise<ApiAnswer> {
  const doFetch = options.fetch ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const url = new URL("/api/v1/upgrade-notes", options.apiUrl);
  url.searchParams.set("render", "markdown");
  const init = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": userAgent(),
    },
    body: JSON.stringify({ dependencies, recordMisses: options.recordMisses }),
  };

  let last: ApiError | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await doFetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      last = new ApiError(
        `What's New did not answer: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (response?.ok) {
      const answer = (await response.json().catch(() => undefined)) as
        | Partial<ApiAnswer>
        | undefined;
      // A challenge page or a proxy's error page arrives as HTML with a 200.
      if (!answer?.data) {
        throw new ApiError(
          "What's New answered with something other than its JSON",
        );
      }
      // A server older than `?render=markdown` answers the JSON alone.
      if (typeof answer.rendered?.markdown !== "string") {
        throw new ApiError(
          "What's New answered without a rendered comment; the server is older than this Action",
        );
      }
      return answer as ApiAnswer;
    }
    if (response) {
      const detail = await response
        .json()
        .then(
          (body: unknown) =>
            (body as { error?: { message?: string } }).error?.message,
        )
        .catch(() => undefined);
      last = new ApiError(
        `What's New answered ${response.status}${detail ? `: ${detail}` : ""}`,
        response.status,
      );
      if (!retryable(response.status)) throw last;
    }
    if (attempt === 0) await sleep(waitFor(response));
  }
  throw last ?? new ApiError("What's New did not answer.");
}

/** Every dependency, in batches of `BATCH`, answered in order. */
export async function upgradeNotes(
  dependencies: readonly ApiDependency[],
  options: ApiOptions,
): Promise<ApiAnswer[]> {
  const answers: ApiAnswer[] = [];
  for (let at = 0; at < dependencies.length; at += BATCH) {
    answers.push(await post(dependencies.slice(at, at + BATCH), options));
  }
  return answers;
}
