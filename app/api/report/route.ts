import { NextResponse } from "next/server";
import { renderReportFor } from "@/lib/engine";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = url.searchParams.get("repo") ?? "sample://reinvent-demo-shop";
  try {
    const html = await renderReportFor(repo);
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report generation failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
