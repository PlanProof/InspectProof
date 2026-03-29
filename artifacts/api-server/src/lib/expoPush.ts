import type { Logger } from "pino";

export interface ExpoPushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

export async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  log?: Logger,
): Promise<void> {
  if (!token?.startsWith("ExponentPushToken[") && !token?.startsWith("ExpoPushToken[")) {
    log?.warn({ token }, "Invalid Expo push token — skipping");
    return;
  }
  const payload: ExpoPushPayload = {
    to: token,
    title,
    body,
    sound: "default",
    data: data ?? {},
  };
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log?.warn({ status: res.status, text }, "Expo push API error");
    } else {
      const json = await res.json().catch(() => null);
      log?.info({ to: token, status: json?.data?.status }, "Expo push sent");
    }
  } catch (err) {
    log?.warn({ err }, "Expo push send failed");
  }
}
