import { randomToken, sha256, userCode } from "@/lib/crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";

export const runtime = "nodejs";

const EXPIRES_SECONDS = 600;

/** `dad login` step 1: the CLI asks for a device code and a short code to show the user. */
export async function POST() {
  const deviceCode = randomToken(32);
  const code = userCode();
  await db()`delete from device_codes where expires_at < now()`;
  await db()`
    insert into device_codes (device_code_hash, user_code, expires_at)
    values (${sha256(deviceCode)}, ${code}, now() + ${`${EXPIRES_SECONDS} seconds`}::interval)`;

  return Response.json({
    device_code: deviceCode,
    user_code: code,
    verification_url: `${appUrl()}/cli/authorize?code=${code}`,
    interval: 3,
    expires_in: EXPIRES_SECONDS,
  });
}
