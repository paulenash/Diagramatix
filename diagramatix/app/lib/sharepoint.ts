/**
 * Microsoft Graph API utility for SharePoint / OneDrive file operations.
 * All functions require a valid Microsoft access token from the user's session.
 */
import { Client, ResponseType } from "@microsoft/microsoft-graph-client";

function getClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

// ── Types ────────────────────────────────────────────────────────────

export interface SharePointSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
}

export interface DriveInfo {
  id: string;
  name: string;
  webUrl: string;
}

export interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  lastModifiedDateTime: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  folder?: { childCount: number };
  file?: { mimeType: string };
}

// ── Sites ────────────────────────────────────────────────────────────

/** Search for SharePoint sites the user has access to. */
export async function searchSites(accessToken: string, query: string): Promise<SharePointSite[]> {
  const client = getClient(accessToken);
  const resp = await client.api(`/sites?search=${encodeURIComponent(query)}`).get();
  return (resp.value ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    displayName: s.displayName,
    webUrl: s.webUrl,
  }));
}

/** List all sites the user has access to (via search with empty query). */
export async function listSites(accessToken: string): Promise<SharePointSite[]> {
  return searchSites(accessToken, "*");
}

// ── Drives (Document Libraries) ──────────────────────────────────────

/** List document libraries (drives) for a SharePoint site. */
export async function listDrives(accessToken: string, siteId: string): Promise<DriveInfo[]> {
  const client = getClient(accessToken);
  const resp = await client.api(`/sites/${siteId}/drives`).get();
  return (resp.value ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    webUrl: d.webUrl,
  }));
}

// ── Files & Folders ──────────────────────────────────────────────────

/** List children (files + folders) at the root of a drive. */
export async function listDriveRoot(accessToken: string, driveId: string): Promise<DriveItem[]> {
  const client = getClient(accessToken);
  const resp = await client.api(`/drives/${driveId}/root/children`)
    .select("id,name,webUrl,size,lastModifiedDateTime,lastModifiedBy,folder,file")
    .get();
  return resp.value ?? [];
}

/** List children (files + folders) inside a specific folder. */
export async function listFolder(accessToken: string, driveId: string, itemId: string): Promise<DriveItem[]> {
  const client = getClient(accessToken);
  const resp = await client.api(`/drives/${driveId}/items/${itemId}/children`)
    .select("id,name,webUrl,size,lastModifiedDateTime,lastModifiedBy,folder,file")
    .get();
  return resp.value ?? [];
}

/** Get metadata for a single file/folder. */
export async function getItem(accessToken: string, driveId: string, itemId: string): Promise<DriveItem> {
  const client = getClient(accessToken);
  return await client.api(`/drives/${driveId}/items/${itemId}`)
    .select("id,name,webUrl,size,lastModifiedDateTime,lastModifiedBy,folder,file")
    .get();
}

// ── OneDrive (user's personal drive) ─────────────────────────────────

/** List files/folders at the root of the signed-in user's OneDrive. */
export async function listMyDriveRoot(accessToken: string): Promise<DriveItem[]> {
  const client = getClient(accessToken);
  const resp = await client.api("/me/drive/root/children")
    .select("id,name,webUrl,size,lastModifiedDateTime,lastModifiedBy,folder,file")
    .get();
  return resp.value ?? [];
}

/** List files/folders inside a folder in the user's OneDrive. */
export async function listMyDriveFolder(accessToken: string, itemId: string): Promise<DriveItem[]> {
  const client = getClient(accessToken);
  const resp = await client.api(`/me/drive/items/${itemId}/children`)
    .select("id,name,webUrl,size,lastModifiedDateTime,lastModifiedBy,folder,file")
    .get();
  return resp.value ?? [];
}

/** Get the user's OneDrive info. */
export async function getMyDrive(accessToken: string): Promise<DriveInfo> {
  const client = getClient(accessToken);
  const resp = await client.api("/me/drive").select("id,name,webUrl").get();
  return { id: resp.id, name: resp.name ?? "OneDrive", webUrl: resp.webUrl };
}

/** Download file content as a string (for JSON diagram files). */
export async function downloadFileContent(accessToken: string, driveId: string, itemId: string): Promise<string> {
  const client = getClient(accessToken);
  const stream = await client.api(`/drives/${driveId}/items/${itemId}/content`).get();
  return stream;
}

/** Upload a file (create or overwrite) at a given path in a drive. */
export async function uploadFile(
  accessToken: string,
  driveId: string,
  folderPath: string,
  fileName: string,
  content: string
): Promise<DriveItem> {
  const client = getClient(accessToken);
  const path = folderPath === "/" || folderPath === ""
    ? `/${fileName}`
    : `/${folderPath.replace(/^\/|\/$/g, "")}/${fileName}`;
  return await client.api(`/drives/${driveId}/root:${path}:/content`)
    .header("Content-Type", "application/json")
    .put(content);
}

/**
 * Upload (create or overwrite) a file INTO a folder addressed by its item id —
 * or the drive root when folderItemId is null. Accepts binary (Buffer) so
 * Visio .vsdx exports upload correctly, as well as text (XML/XSD/JSON).
 * Simple PUT — fine for diagram files (< 4 MB Graph single-shot limit).
 */
export async function uploadToFolder(
  accessToken: string,
  driveId: string,
  folderItemId: string | null,
  fileName: string,
  content: Buffer | string,
  contentType: string,
): Promise<DriveItem> {
  const client = getClient(accessToken);
  const enc = encodeURIComponent(fileName);
  const target = folderItemId
    ? `/drives/${driveId}/items/${folderItemId}:/${enc}:/content`
    : `/drives/${driveId}/root:/${enc}:/content`;
  return await client.api(target).header("Content-Type", contentType).put(content);
}

/** Download raw file bytes (for binary diagram files like .vsdx). */
export async function downloadFileBytes(
  accessToken: string,
  driveId: string,
  itemId: string,
): Promise<Buffer> {
  const client = getClient(accessToken);
  const buf = await client.api(`/drives/${driveId}/items/${itemId}/content`)
    .responseType(ResponseType.ARRAYBUFFER)
    .get();
  return Buffer.from(buf as ArrayBuffer);
}

/**
 * Get a short-lived embeddable preview URL for a file (Graph /preview action).
 * Returned `getUrl` can be set as an <iframe src> to preview Office/PDF files
 * inside Diagramatix without leaving the app.
 */
export async function getPreviewUrl(
  accessToken: string,
  driveId: string,
  itemId: string,
): Promise<string | null> {
  const client = getClient(accessToken);
  const resp = await client.api(`/drives/${driveId}/items/${itemId}/preview`).post({});
  return resp?.getUrl ?? null;
}
