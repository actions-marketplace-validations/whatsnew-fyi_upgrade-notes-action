// The Action's inputs, read and checked once. A bad value fails the step with a
// message naming the input, rather than doing something the workflow did not ask.

export type CommentMode = "auto" | "always" | "never";
export type FailOn = "breaking" | "security";

export interface Inputs {
  token: string;
  comment: CommentMode;
  failOn: ReadonlySet<FailOn>;
  /** `auto` sends misses for public repositories only. */
  recordMisses: "auto" | "true" | "false";
  exclude: readonly string[];
  apiUrl: string;
}

const COMMENT_MODES: readonly CommentMode[] = ["auto", "always", "never"];
const FAIL_ON: readonly FailOn[] = ["breaking", "security"];

/** A list input: commas or newlines, blanks dropped. */
function list(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseInputs(get: (name: string) => string): Inputs {
  const comment = (get("comment") || "auto").trim() as CommentMode;
  if (!COMMENT_MODES.includes(comment)) {
    throw new Error(
      `comment: expected auto, always or never, got "${comment}".`,
    );
  }

  const failOn = new Set<FailOn>();
  for (const item of list(get("fail-on") || "none")) {
    if (item === "none") continue;
    if (!FAIL_ON.includes(item as FailOn)) {
      throw new Error(
        `fail-on: expected none, breaking or security, got "${item}".`,
      );
    }
    failOn.add(item as FailOn);
  }

  const recordMisses = (get("record-misses") || "auto").trim();
  if (!["auto", "true", "false"].includes(recordMisses)) {
    throw new Error(
      `record-misses: expected auto, true or false, got "${recordMisses}".`,
    );
  }

  const apiUrl = (get("api-url") || "https://whatsnew.fyi").trim();
  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error(`api-url: "${apiUrl}" is not a URL.`);
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("api-url: use https.");
  }

  return {
    token: get("github-token"),
    comment,
    failOn,
    recordMisses: recordMisses as Inputs["recordMisses"],
    exclude: list(get("exclude")),
    apiUrl: parsed.origin,
  };
}
