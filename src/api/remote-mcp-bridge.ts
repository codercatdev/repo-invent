import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getValidTokens, type TokenSet } from "../auth/pkce";

export const REMOTE_MCP_URL = "https://api.awsevents.com/mcp";

export interface RemoteTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface RemoteToolResult {
  tool: string;
  content: unknown[];
  isError: boolean;
}

export class RemoteMcpError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RemoteMcpError";
  }
}

/**
 * Bridge to the AWS Events remote MCP server.
 *
 * Unlike the REST API, this server requires sign-in for EVERY call, including
 * catalog reads that the REST API serves anonymously. The bearer token travels
 * as a request header rather than through the OAuth dance the installed clients
 * run, because this tool is already signed in by the time it gets here.
 */
export class RemoteMcpBridge {
  private client: Client | undefined;
  private transport: StreamableHTTPClientTransport | undefined;

  constructor(private readonly options: { url?: string; tokens?: () => Promise<TokenSet> } = {}) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const tokens = await (this.options.tokens ?? getValidTokens)();
    const requestInit = {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    };
    const transport = new StreamableHTTPClientTransport(
      new URL(this.options.url ?? REMOTE_MCP_URL),
      { requestInit },
    );
    const client = new Client({ name: "repo-invent", version: "0.1.0" }, { capabilities: {} });
    try {
      await client.connect(transport);
    } catch (error) {
      throw new RemoteMcpError("could not connect to the AWS Events MCP server", error);
    }
    this.client = client;
    this.transport = transport;
    return client;
  }

  async listTools(): Promise<RemoteTool[]> {
    const client = await this.connect();
    try {
      const listed = await client.listTools();
      return listed.tools.map((tool) => {
        const entry: RemoteTool = { name: tool.name };
        if (typeof tool.description === "string") entry.description = tool.description;
        if (tool.inputSchema !== undefined) entry.inputSchema = tool.inputSchema;
        return entry;
      });
    } catch (error) {
      throw new RemoteMcpError("listing remote tools failed", error);
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<RemoteToolResult> {
    const client = await this.connect();
    try {
      const result = await client.callTool({ name, arguments: args });
      const content = Array.isArray(result.content) ? (result.content as unknown[]) : [];
      return { tool: name, content, isError: result.isError === true };
    } catch (error) {
      throw new RemoteMcpError(`calling remote tool ${name} failed`, error);
    }
  }

  /**
   * Reserving and favouriting succeed per session, not per request, so a raw
   * "done" from the server is not proof. Confirm from GetSchedule.
   */
  async close(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        return;
      }
    }
    this.client = undefined;
    this.transport = undefined;
  }
}
