import { describe, expect, it } from "vitest";
import { fetchRepo, parseRepoRef, rankCandidates, clearFetchCache } from "../src/scanner/repo-fetch.js";

function fakeFetch(routes: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [suffix, body] of Object.entries(routes)) {
      if (url.includes(suffix)) return new Response(body, { status: 200 });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
}

describe("parseRepoRef", () => {
  it("accepts the shapes a person pastes", () => {
    expect(parseRepoRef("https://github.com/aws/aws-cdk")).toEqual({ owner: "aws", repo: "aws-cdk" });
    expect(parseRepoRef("github.com/aws/aws-cdk")).toEqual({ owner: "aws", repo: "aws-cdk" });
    expect(parseRepoRef("aws/aws-cdk")).toEqual({ owner: "aws", repo: "aws-cdk" });
    expect(parseRepoRef("aws/aws-cdk.git")).toEqual({ owner: "aws", repo: "aws-cdk" });
    expect(parseRepoRef("https://github.com/aws/aws-cdk/tree/v2")).toEqual({
      owner: "aws",
      repo: "aws-cdk",
      ref: "v2",
    });
  });

  it("refuses what is not a repository", () => {
    expect(parseRepoRef("")).toBeNull();
    expect(parseRepoRef("not a repo")).toBeNull();
    expect(parseRepoRef("https://example.com/a/b")).toBeNull();
  });
});

describe("rankCandidates", () => {
  it("puts manifests above documentation, even when the docs are smaller", () => {
    const ranked = rankCandidates([
      { path: "README.md", size: 10 },
      { path: "LICENSE", size: 5 },
      { path: "package.json", size: 900 },
      { path: "infra/main.tf", size: 800 },
    ]);
    const positions = ranked.map((file) => file.path);
    expect(positions.indexOf("package.json")).toBe(0);
    expect(positions.indexOf("infra/main.tf")).toBe(1);
    expect(positions.indexOf("README.md")).toBeGreaterThan(1);
    expect(positions.indexOf("LICENSE")).toBeGreaterThan(1);
  });

  it("skips boilerplate directories and binaries", () => {
    const ranked = rankCandidates([
      { path: "node_modules/react/index.js", size: 10 },
      { path: "dist/bundle.js", size: 10 },
      { path: "logo.png", size: 10 },
      { path: "package.json", size: 10 },
    ]);
    expect(ranked.map((file) => file.path)).toEqual(["package.json"]);
  });
});

describe("fetchRepo", () => {
  it("reports a 404 as a typed failure rather than throwing", async () => {
    clearFetchCache();
    const result = await fetchRepo("o/r", {
      fetchImpl: (async () => new Response("", { status: 404 })) as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not_found");
  });

  it("distinguishes a rate limit from a missing repo", async () => {
    clearFetchCache();
    const result = await fetchRepo("o/r", {
      fetchImpl: (async () =>
        new Response("", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "0" },
        })) as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("rate_limited");
  });

  it("reads the tree and only the manifests it needs", async () => {
    clearFetchCache();
    const tree = JSON.stringify({
      tree: [
        { path: "package.json", type: "blob", size: 40 },
        { path: "README.md", type: "blob", size: 20 },
        { path: "src/index.ts", type: "blob", size: 30 },
      ],
    });
    const result = await fetchRepo("o/r", {
      fetchImpl: fakeFetch({
        "/repos/o/r/git/trees/": tree,
        "/repos/o/r": JSON.stringify({ default_branch: "main", languages: { TypeScript: 10 } }),
        "contents/package.json": JSON.stringify({ dependencies: { "@aws-sdk/client-dynamodb": "3" } }),
        "contents/README.md": "# readme",
        "contents/src/index.ts": "export {};",
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.defaultBranch).toBe("main");
    expect(Object.keys(result.snapshot.manifests)).toContain("package.json");
    expect(result.snapshot.fetchedFiles).toBe(3);
  });

  it("stops at the file cap and says so", async () => {
    clearFetchCache();
    const entries = Array.from({ length: 60 }, (_, index) => ({
      path: `package-${index}.json`,
      type: "blob",
      size: 10,
    }));
    const result = await fetchRepo("o/r", {
      maxFiles: 5,
      fetchImpl: fakeFetch({
        "/repos/o/r/git/trees/": JSON.stringify({ tree: entries }),
        "/repos/o/r": JSON.stringify({ default_branch: "main" }),
        "contents/package-": "{}",
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.fetchedFiles).toBeLessThanOrEqual(5);
    expect(result.snapshot.truncated).toBe(true);
  });
});
