import type { RepoFile, RepoRef, RepoSnapshot } from "../types.js";

export const GITHUB_API = "https://api.github.com";

// The scanner reads a handful of manifests, never a clone. These caps are what
// keeps a 400 MB monorepo from timing out a judge's demo.
export const MAX_FILES = 40;
export const MAX_TOTAL_BYTES = 300 * 1024;
export const MAX_FILE_BYTES = 100 * 1024;
export const REQUEST_TIMEOUT_MS = 20_000;
export const CACHE_TTL_MS = 15 * 60 * 1000;

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

// `.py` is read because CDK with Python declares the stack in Python: the
// resources live in the code, not in any dependency file. It scores below the
// manifests so a large repo cannot spend the cap on application code first.
const MANIFEST_EXTENSIONS = [".tf", ".tfvars", ".py"];

// Files that describe code rather than being it. Reading ten of them burns the
// cap without telling the scanner anything about the architecture.
const DOC_EXTENSIONS = new Set([".md", ".markdown", ".rst", ".txt", ".adoc"]);
const DOC_NAMES = new Set([
  "LICENSE",
  "LICENSE.txt",
  "LICENCE",
  "NOTICE",
  "AUTHORS",
  "CHANGELOG",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODEOWNERS",
]);

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
  timeoutMs?: number;
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

function isDoc(path: string): boolean {
  const name = baseName(path);
  if (DOC_NAMES.has(name)) return true;
  if (MANIFEST_NAMES.has(name)) return false;
  return DOC_EXTENSIONS.has(extensionOf(path));
}

/**
 * Order candidate files so the caps are spent on what matters.
 *
 * Manifests and IaC describe the architecture; documentation describes nothing
 * the scanner can diagnose, so a README must never outrank a package.json just
 * because it is smaller.
 *
 * A file name that repeats across directories is collapsed to one representative
 * first: a service-per-folder repo has twenty `requirements.txt` files that say
 * the same thing, and reading all twenty fills the cap before the single
 * `template.yaml` that describes the whole system.
 */
export function rankCandidates(files: RepoFile[]): RepoFile[] {
  const scored = files
    .filter((file) => !isBoilerplate(file.path))
    .filter((file) => !BINARY_EXTENSIONS.has(extensionOf(file.path)))
    .filter((file) => file.size <= MAX_FILE_BYTES)
    .map((file) => {
      const depth = file.path.split("/").length;
      const name = baseName(file.path).toLowerCase();
      let score = 50;
      if (name === "package.json" || name === "pyproject.toml" || name === "go.mod" || name === "cargo.toml") {
        // The dependency manifest leads: it names the SDK clients, which is the
        // strongest signal the scanner gets.
        score = 0;
      } else if (name === "template.yaml" || name === "template.yml" || name === "cdk.json") {
        // SAM and CDK describe the whole topology in one file.
        score = 1;
      } else if (isManifest(file.path)) {
        // A Python file is code, not a manifest, so it ranks below one: the
        // stack file is worth reading, the other two hundred are not.
        score = name.endsWith(".py") ? 4 : 2;
      } else if (isDoc(file.path)) score = 90;
      else if (depth <= 2) score = 10;
      else if (depth === 3) score = 30;
      if (file.path.includes("/src/")) score -= 5;
      // A stack file is the one Python file worth reading first.
      if (name.endsWith(".py") && /stack|app\.py$/u.test(name)) score -= 3;
      return { file, score, name };
    });

  scored.sort((left, right) => {
    if (left.score !== right.score) return left.score - right.score;
    // Shallower wins first, so the representative of a repeated file name is
    // the one nearest the root.
    const leftDepth = left.file.path.split("/").length;
    const rightDepth = right.file.path.split("/").length;
    if (leftDepth !== rightDepth) return leftDepth - rightDepth;
    return left.file.path.localeCompare(right.file.path);
  });

  const seenNames = new Set<string>();
  const ordered: RepoFile[] = [];
  for (const entry of scored) {
    // One of each file name, except manifests that genuinely differ per module
    // (package.json) and IaC, which is read once anyway.
    if (entry.score > 2 && seenNames.has(entry.name)) continue;
    seenNames.add(entry.name);
    ordered.push(entry.file);
  }
  return ordered;
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

interface CacheEntry {
  at: number;
  value: FetchResult;
}

const cache = new Map<string, CacheEntry>();

/** Forget cached scans, for a test that needs a fresh read. */
export function clearFetchCache(): void {
  cache.clear();
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
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const cacheKey = `${ref.owner}/${ref.repo}#${ref.ref ?? ""}#${maxFiles}#${maxTotalBytes}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  // Every call is bounded: a giant tree or a stalled connection must fail loudly
  // rather than hang a judge's demo.
  const timedFetch: typeof fetch = (input, init) =>
    doFetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });

  let metaResponse: Response;
  try {
    metaResponse = await timedFetch(`${GITHUB_API}/repos/${ref.owner}/${ref.repo}`, { headers });
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
    treeResponse = await timedFetch(treeUrl, { headers });
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
      response = await timedFetch(rawUrl, {
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
  const value: FetchResult = { ok: true, snapshot };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
