import { spawn } from "child_process";
import { appendFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function isLocalHost(host: string | null) {
  if (!host) return false;
  const cleanHost = host.split(",")[0].trim().toLowerCase();
  return /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/.test(cleanHost);
}

function writeShutdownApiLog(message: string) {
  try {
    const logPath = path.join(process.cwd(), "scripts", "shutdown-pos-api.log");
    appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Logging must never block shutdown.
  }
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
  const powershellPath = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );

  writeShutdownApiLog(`Shutdown requested from ${request.headers.get("host")}; script=${scriptPath}`);

  const child = spawn(
    powershellPath,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  child.on("error", (error) => {
    writeShutdownApiLog(`Failed to spawn shutdown script: ${error.message}`);
  });
  writeShutdownApiLog(`Spawned shutdown script pid=${child.pid ?? "unknown"}`);
  child.unref();

  return NextResponse.json({ success: true });
}
