"use client";

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

declare global {
  interface Navigator {
    modelContext?: {
      registerTool?: (tool: WebMcpToolDefinition) => void;
      provideContext?: (options: { tools: WebMcpToolDefinition[] }) => void;
    };
  }
  interface Window {
    webMcp?: {
      tools: WebMcpToolDefinition[];
      callTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

export function registerWebMcpTools(): {
  supported: boolean;
  registeredCount: number;
  tools: string[];
} {
  if (typeof window === "undefined") {
    return { supported: false, registeredCount: 0, tools: [] };
  }

  const callBackend = async (tool: string, args: Record<string, unknown>) => {
    const response = await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
    });
    return response.json();
  };

  const tools: WebMcpToolDefinition[] = [
    {
      name: "scan_repository",
      description:
        "Scan a public GitHub repository to diagnose AWS architecture gaps, prescribe a 5-day walkable re:Invent 2026 schedule, and generate remediation tickets.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "GitHub URL or sample://reinvent-demo-shop",
          },
        },
        required: ["repo"],
      },
      execute: (args) => callBackend("repo_invent___scan_repository", args),
    },
    {
      name: "search_sessions",
      description: "Search the 2,279-session AWS re:Invent 2026 catalog by keyword, level, or seat availability.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          level: { type: "number" },
          reservableOnly: { type: "boolean" },
        },
      },
      execute: (args) => callBackend("repo_invent___search_sessions", args),
    },
    {
      name: "search_parties",
      description: "Search 171 re:Invent 2026 vendor & community parties scraped from conferenceparties.com.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          day: { type: "string" },
        },
      },
      execute: (args) => callBackend("repo_invent___search_parties", args),
    },
    {
      name: "what_can_i_make",
      description:
        "Find re:Invent 2026 sessions reachable in time from a current Las Vegas Strip venue using the 10-minute seat forfeiture transit matrix.",
      inputSchema: {
        type: "object",
        properties: {
          currentVenue: { type: "string" },
          afterTime: { type: "string" },
        },
      },
      execute: (args) => callBackend("repo_invent___what_can_i_make", args),
    },
    {
      name: "aws_events_get_schedule",
      description: "Proxy to AWSEventsPublicApi-Mcp-prod___GetSchedule on https://api.awsevents.com/mcp",
      inputSchema: {
        type: "object",
        properties: { eventId: { type: "string" } },
      },
      execute: (args) =>
        callBackend("AWSEventsPublicApi-Mcp-prod___GetSchedule", {
          eventId: "reinvent2026",
          ...args,
        }),
    },
    {
      name: "aws_events_associate_favorites",
      description: "Proxy to AWSEventsPublicApi-Mcp-prod___AssociateFavorites on https://api.awsevents.com/mcp",
      inputSchema: {
        type: "object",
        properties: {
          sessionIds: { type: "array", items: { type: "string" } },
        },
        required: ["sessionIds"],
      },
      execute: (args) =>
        callBackend("AWSEventsPublicApi-Mcp-prod___AssociateFavorites", {
          eventId: "reinvent2026",
          ...args,
        }),
    },
  ];

  window.webMcp = {
    tools,
    callTool: async (name: string, args: Record<string, unknown> = {}) => {
      const found = tools.find((t) => t.name === name);
      if (found) return found.execute(args);
      return callBackend(name, args);
    },
  };

  let nativeSupported = false;
  try {
    if (navigator.modelContext?.provideContext) {
      navigator.modelContext.provideContext({ tools });
      nativeSupported = true;
    } else if (navigator.modelContext?.registerTool) {
      for (const tool of tools) {
        navigator.modelContext.registerTool(tool);
      }
      nativeSupported = true;
    }
  } catch {
    // Browser does not have native navigator.modelContext enabled; window.webMcp fallback active
  }

  return {
    supported: nativeSupported,
    registeredCount: tools.length,
    tools: tools.map((t) => t.name),
  };
}
