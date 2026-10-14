// The runner's entry point: inputs and context from the toolkit, GitHub through
// Octokit, then `run`. Nothing here decides anything.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { parseInputs } from "./inputs.ts";
import { type GitHubPort, type PullRequest, run } from "./run.ts";
import type { DependencyChange } from "./sources/dependency-graph.ts";

function pullRequest(): PullRequest | undefined {
  const pr = context.payload.pull_request;
  if (!pr) return undefined;
  return {
    number: pr.number,
    author: String(pr.user?.login ?? ""),
    headRef: String(pr.head?.ref ?? ""),
    baseSha: String(pr.base?.sha ?? ""),
    headSha: String(pr.head?.sha ?? ""),
    body: typeof pr.body === "string" ? pr.body : null,
  };
}

function githubPort(token: string, pr: PullRequest): GitHubPort {
  const octokit = getOctokit(token);
  const { owner, repo } = context.repo;
  return {
    async commitMessages() {
      const commits = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: pr.number,
        per_page: 10,
      });
      return commits.data.map((commit) => commit.commit.message);
    },
    async dependencyChanges(basehead) {
      try {
        const response = await octokit.rest.dependencyGraph.diffRange({
          owner,
          repo,
          basehead,
        });
        return response.data as DependencyChange[];
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 403 || status === 404) return undefined;
        throw error;
      }
    },
    async findComment(marker) {
      const comments = await octokit.paginate(
        octokit.rest.issues.listComments,
        {
          owner,
          repo,
          issue_number: pr.number,
          per_page: 100,
        },
      );
      const found = comments.find((comment) => comment.body?.includes(marker));
      return found ? { id: found.id, body: found.body ?? "" } : undefined;
    },
    async createComment(body) {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body,
      });
    },
    async updateComment(id, body) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: id,
        body,
      });
    },
  };
}

async function main(): Promise<void> {
  const pr = pullRequest();
  if (!pr) {
    core.notice(
      `upgrade-notes runs on pull_request events; this was ${context.eventName}. Nothing to do.`,
    );
    return;
  }
  const inputs = parseInputs((name) => core.getInput(name));
  const result = await run(
    inputs,
    pr,
    { private: Boolean(context.payload.repository?.private) },
    {
      github: githubPort(inputs.token, pr),
      async writeJson(answers) {
        const path = join(
          process.env.RUNNER_TEMP ?? process.cwd(),
          "whatsnew-upgrade-notes.json",
        );
        await writeFile(path, JSON.stringify(answers, null, 2));
        return path;
      },
      info: (message) => core.info(message),
      warning: (message) => core.warning(message),
    },
  );

  for (const [name, value] of Object.entries(result.outputs)) {
    core.setOutput(name, value);
  }
  if (result.summary) {
    await core.summary.addRaw(result.summary).write();
  }
  core.info(`Comment: ${result.comment}.`);
  if (result.failure) core.setFailed(result.failure);
}

main().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
