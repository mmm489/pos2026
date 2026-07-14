import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

import { rawQuery } from "@/lib/db";

const COOKIE_NAME = "hicream_pos_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

type SessionPayload = {
  employeeId: number;
  expiresAt: number;
};

export type AuthenticatedEmployee = {
  id: number;
  name: string;
  role: "admin" | "employee";
  can_post_sale_lookup: boolean;
  can_refund_sales: boolean;
};

function getSessionSecret() {
  return (
    process.env.POS_SESSION_SECRET ||
    process.env.NEON_DATABASE_URL ||
    "hicream-local-pos-session-change-me"
  );
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function createToken(employeeId: number) {
  const payload = encode(
    JSON.stringify({
      employeeId,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    } satisfies SessionPayload),
  );
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): SessionPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (!Number.isInteger(parsed.employeeId) || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPosSession(response: NextResponse, employeeId: number) {
  response.cookies.set(COOKIE_NAME, createToken(employeeId), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.POS_SESSION_SECURE === "true",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearPosSession(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.POS_SESSION_SECURE === "true",
    path: "/",
    maxAge: 0,
  });
}

export async function getAuthenticatedEmployee(
  request: NextRequest,
): Promise<AuthenticatedEmployee | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = verifyToken(token);
  if (!session) return null;

  const [employee] = await rawQuery<AuthenticatedEmployee>(
    `SELECT id, name, role,
            CASE WHEN role = 'admin' THEN true ELSE can_post_sale_lookup END AS can_post_sale_lookup,
            CASE WHEN role = 'admin' THEN true ELSE can_refund_sales END AS can_refund_sales
     FROM pos.employees
     WHERE id = $1 AND active = true`,
    [session.employeeId],
  );
  return employee || null;
}
