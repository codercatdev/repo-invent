import type { RepoFile, RepoRef, RepoSnapshot } from "../types.js";

export const GITHUB_API = "https://api.github.com";

// The scanner reads a handful of manifests, never a clone. These caps are what
// keeps a 400 MB monorepo from timing out a judge's demo.
export const MAX_FILES = 40;
export const MAX_TOTAL_BYTES = 300 * 1024;
export const MAX_FILE_BYTES = 100 * 1024;

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar",
  ".tgz", ".jar", ".war", ".so", ".dll", ".dylib", ".exe", ".bin", ".wasm", ".mp4",
  ".mp3", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".class", ".pyc", ".onnx", ".pt",
]);

const MANIFEST_NAMES = new Set([
  "package.json", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml",
  ".mcp.json", "mcp.json", "cdk.json", "serverless.yml", "serverless.yaml",
  "sst.config.ts", "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
  "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json",
  "terraform.tfvars", "Pipfile",
]);

const MANIFEST_EXTENSIONS = [".tf", ".tfvars"];

const BOILERPLATE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "target", "vendor", ".venv",
  "venv", "__pycache__", ".next", ".nuxt", "coverage", ".terraform", "Pods",
  "site-packages", ".gradle", ".mvn", ".idea", ".vscode", "example", "examples",
  "testdata", "fixtures", "third_party", "third-party",
]);

export type FetchErrorKind = "not_found" | "rate_limited" | "network" | "bad-url" | "empty-repo";

export interface FetchFailure {
  kind: FetchErrorKind;
  message: string;
  retryAfterSeconds?: number;
}

export type FetchResult =
  | { ok: true; snapshot: RepoSnapshot }
  | { ok: false; error: FetchFailure };

export interface FetchOptions {
  token?: string;
  ref?: string;
  fetchImpl?: typeof fetch;
  maxFiles?: number;
  maxTotalBytes?: number;
}

interface TreeEntry {
  path?: unknown;
  type?: unknown;
  size?: unknown;
}

/** Parse the shapes a person actually pastes. */
export function parseRepoRef(input: string): RepoRef | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const fromUrl = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/tree\/([^/\s#?]+))?/u.exec(
    trimmed,
  );
  if (fromUrl) {
    const owner = fromUrl[1];
    const repo = fromUrl[2];
    if (!owner || !repo) return null;
    const ref = fromUrl[3];
    const name = repo.replace(/\.git$/u, "");
    return ref ? { owner, repo: name, ref } : { owner, repo: name };
  }

  const bare = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/u.exec(trimmed);
  if (bare) {
    const owner = bare[1];
    const repo = bare[2];
    if (!owner || !repo) return null;
    return { owner, repo };
  }
  return null;
}

function extensionOf(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index).toLowerCase();
}

function baseName(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function isBoilerplate(path: string): boolean {
  return path.split("/").some((segment) => BOILERPLATE_DIRS.has(segment.toLowerCase()));
}

function isManifest(path: string): boolean {
  const name = baseName(path);
  if (MANIFEST_NAMES.has(name)) return true;
  return MANIFEST_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/**
 * Order candidate files so the caps are spent on what matters.
 *
 * Manifests and IaC describe the architecture; a stray `src/util.ts` mostly
 * repeats what `package.json` already said.
 */
export function rankCandidates(files: RepoFile[]): RepoFile[] {
  const scored = files
    .filter((file) => !isBoilerplate(file.path))
    .filter((file) => !BINARY_EXTENSIONS.has(extensionOf(file.path)))
    .filter((file) => file.size <= MAX_FILE_BYTES)
    .map((file) => {
      const name = baseName(file.path);
      const depth = file.path.split("/").length;
      let score = 50;
      if (isManifest(file.path)) score = 0;
      else if (depth <= 2) score = 10;
      else if (depth === 3) score = 30;
      if (name.toLowerCase().startsWith("readme")) score = 20;
      if (file.path.includes("/src/")) score -= 5;
      return { file, score };
    });
  scored.sort((left, right) => {
    if (left.score !== right.score) return left.score - right.score;
    if (left.file.size !== right.file.size) return left.file.size - right.file.size;
    return left.file.path.localeCompare(right.file.path);
  });
  return scored.map((entry) => entry.file);
}

function headersFor(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "repo-invent",
  };
  if (token && token.length > 0) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function rateLimitFailure(response: Response): FetchFailure {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  const retryAfter = Number.isFinite(reset) ? Math.max(0, reset - Math.floor(Date.now() / 1000)) : undefined;
  const detail = remaining === "0"
    ? "GitHub rate limit reached for anonymous requests"
    : `GitHub refused the request (HTTP ${response.status})`;
  const failure: FetchFailure = { kind: "rate_limited", message: detail };
  if (retryAfter !== undefined && retryAfter > 0) failure.retryAfterSeconds = retryAfter;
  return failure;
}

/**
 * Fetch a public repository's metadata, tree and the handful of files worth
 * reading. No clone, no git binary, five to fifteen HTTP calls.
 */
export async function fetchRepo(input: string, options: FetchOptions = {}): Promise<FetchResult> {
  const ref = parseRepoRef(input);
  if (ref === null) {
    return {
      ok: false,
      error: { kind: "bad-url", message: `not a GitHub repository reference: ${input}` },
    };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const headers = headersFor(options.token);
  const maxFiles = options.maxFiles ?? MAX_FILES;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_TOTAL_BYTES;

  let metaResponse: Response;
  try {
    metaResponse = await doFetch(`${GITHUB_API}/repos/${ref.owner}/${ref.repo}`, { headers });
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "network",
        message: `could not reach GitHub: ${error instanceof Error ? error.message : "unknown error"}`,
      },
    };
  }

  if (metaResponse.status === 404) {
    return {
      ok: false,
      error: {
        kind: "not_found",
        message: `${ref.owner}/${ref.repo} was not found, or it is private and no token was given`,
      },
    };
  }
  if (metaResponse.status === 403 || metaResponse.status === 429) {
    return { ok: false, error: rateLimitFailure(metaResponse) };
  }
  if (!metaResponse.ok) {
    return {
      ok: false,
      error: { kind: "network", message: `GitHub returned HTTP ${metaResponse.status}` },
    };
  }

  const meta = (await readJson(metaResponse)) as {
    default_branch?: unknown;
    languages?: unknown;
  };
  const defaultBranch =
    typeof meta.default_branch === "string" ? meta.default_branch : (ref as { ref?: string }).ref ?? "main";
  const languages: Record<string, number> = {};
  if (meta.languages && typeof meta.languages === "object") {
    for (const [name, size] of Object.entries(meta.languages as Record<string, unknown>)) {
      if (typeof size === "number") languages[name] = size;
    }
  }

  const head = (ref as { ref?: string }).ref ?? defaultBranch;
  const treeUrl = `${GITHUB_API}/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(head)}?recursive=1`;
  let treeResponse: Response;
  try {
    treeResponse = await doFetch(treeUrl, { headers });
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "network",
        message: `could not read the file tree: ${error instanceof Error ? error.message : "unknown error"}`,
      },
    };
  }
  if (treeResponse.status === 403 || treeResponse.status === 429) {
    return { ok: false, error: rateLimitFailure(treeResponse) };
  }
  if (treeResponse.status === 409) {
    return {
      ok: false,
      error: { kind: "empty-repo", message: `${ref.owner}/${ref.repo} has no commits on ${head}` },
    };
  }
  if (!treeResponse.ok) {
    return {
      ok: false,
      error: { kind: "network", message: `GitHub returned HTTP ${treeResponse.status} for the tree` },
    };
  }

  const tree = (await readJson(treeResponse)) as { tree?: TreeEntry[] };
  const allFiles: RepoFile[] = [];
  for (const entry of Array.isArray(tree.tree) ? tree.tree : []) {
    if (entry.type !== "blob") continue;
    if (typeof entry.path !== "string") continue;
    allFiles.push({
      path: entry.path,
      size: typeof entry.size === "number" ? entry.size : 0,
    });
  }

  const candidates = rankCandidates(allFiles);
  const fetched: RepoFile[] = [];
  const manifests: Record<string, string> = {};
  let totalBytes = 0;
  let truncated = candidates.length > 0;

  for (const file of candidates) {
    if (fetched.length >= maxFiles) {
      truncated = true;
      break;
    }
    if (totalBytes + file.size > maxTotalBytes) {
      truncated = true;
      continue;
    }
    const rawUrl = `${GITHUB_API}/repos/${ref.owner}/${ref.repo}/contents/${file.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(head)}`;
    let response: Response;
    try {
      response = await doFetch(rawUrl, {
        headers: { ...headers, Accept: "application/vnd.github.raw+json" },
      });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const body = await response.text();
    const bytes = Buffer.byteLength(body, "utf8");
    if (bytes > MAX_FILE_BYTES || totalBytes + bytes > maxTotalBytes) {
      truncated = true;
      continue;
    }
    totalBytes += bytes;
    fetched.push(file);
    manifests[file.path] = body;
    if (fetched.length === candidates.length) truncated = false;
  }

  if (fetched.length === 0) truncated = false;

  const snapshot: RepoSnapshot = {
    ref,
    defaultBranch: head,
    languages,
    files: fetched,
    manifests,
    truncated,
    fetchedFiles: fetched.length,
    fetchedBytes: totalBytes,
  };
  return { ok: true, snapshot };
}
