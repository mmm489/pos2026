import { spawn } from "child_process";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function isLocalHost(host: string | null) {
  if (!host) return false;
  const cleanHost = host.split(",")[0].trim().toLowerCase();
  return /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/.test(cleanHost);
}

export async function POST(request: NextRequest) {
  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json(
      { success: false, error: "Shutdown nomes esta permes des del POS local" },
      { status: 403 }
    );
  }

  if (process.platform !== "win32") {
    return NextResponse.json(
      { success: false, error: "Shutdown automatic nomes esta disponible a Windows" },
      { status: 400 }
    );
  }

  const scriptPath = path.join(process.cwd(), "scripts", "shutdown-pos.ps1");
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  child.unref();

  return NextResponse.json({ success: true });
}
