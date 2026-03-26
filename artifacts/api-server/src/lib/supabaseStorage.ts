import { randomUUID } from "crypto";

export const SUPABASE_BUCKET = "inspectproof-files";

function getConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export function isSupabaseStorageAvailable(): boolean {
  return !!getConfig();
}

export async function ensureSupabaseBucket(): Promise<void> {
  const config = getConfig();
  if (!config) return;
  try {
    const check = await fetch(`${config.url}/storage/v1/bucket/${SUPABASE_BUCKET}`, {
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
      },
    });
    if (check.status === 400 || check.status === 404) {
      await fetch(`${config.url}/storage/v1/bucket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.serviceRoleKey}`,
          apikey: config.serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: SUPABASE_BUCKET, name: SUPABASE_BUCKET, public: false }),
      });
    }
  } catch {
  }
}

export async function getSupabaseSignedUploadURL(): Promise<{ uploadURL: string; objectPath: string }> {
  const config = getConfig();
  if (!config) throw new Error("Supabase Storage not configured");

  const objectName = `uploads/${randomUUID()}`;

  const res = await fetch(
    `${config.url}/storage/v1/object/upload/sign/${SUPABASE_BUCKET}/${objectName}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase upload sign failed ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { url?: string; signedUrl?: string };
  const signedPath = data.url ?? data.signedUrl ?? "";
  const uploadURL = signedPath.startsWith("http")
    ? signedPath
    : `${config.url}/storage/v1${signedPath}`;

  const objectPath = `/objects/supabase/${SUPABASE_BUCKET}/${objectName}`;
  return { uploadURL, objectPath };
}

export async function getSupabaseSignedDownloadURL(objectPath: string): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error("Supabase Storage not configured");

  const withoutPrefix = objectPath.replace(/^\/objects\/supabase\//, "");
  const slashIdx = withoutPrefix.indexOf("/");
  const bucket = withoutPrefix.slice(0, slashIdx);
  const filePath = withoutPrefix.slice(slashIdx + 1);

  const res = await fetch(`${config.url}/storage/v1/object/sign/${bucket}/${filePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 3600 }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase download sign failed ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const signedPath = data.signedURL ?? data.signedUrl ?? "";
  return signedPath.startsWith("http") ? signedPath : `${config.url}/storage/v1${signedPath}`;
}

export async function streamFromSupabase(objectPath: string): Promise<Response> {
  const config = getConfig();
  if (!config) throw new Error("Supabase Storage not configured");

  const withoutPrefix = objectPath.replace(/^\/objects\/supabase\//, "");
  const slashIdx = withoutPrefix.indexOf("/");
  const bucket = withoutPrefix.slice(0, slashIdx);
  const filePath = withoutPrefix.slice(slashIdx + 1);

  const upstream = await fetch(
    `${config.url}/storage/v1/object/authenticated/${bucket}/${filePath}`,
    {
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
      },
    }
  );

  return upstream;
}
