import type { CmisClient } from "./client.js";
import type {
  CmisAcl,
  CmisChildrenResponse,
  CmisObject,
  CmisQueryResponse,
  CmisRendition,
  CmisRepositoryInfo,
  CmisServiceDocument,
} from "./types.js";
import { encodeObjectIdPath } from "./url.js";

function commonQuery(client: CmisClient, extra: Record<string, string | number | boolean | undefined> = {}) {
  return {
    succinct: client.options.succinct,
    ...extra,
  };
}

export async function getRepositories(client: CmisClient): Promise<CmisServiceDocument> {
  return client.requestJson<CmisServiceDocument>({ path: "" });
}

export async function getRepositoryInfo(client: CmisClient): Promise<CmisRepositoryInfo> {
  return client.requestJson<CmisRepositoryInfo>({
    path: client.options.repositoryId,
    query: commonQuery(client, { cmisselector: "repositoryInfo" }),
  });
}

/** Standard CMIS properties used by browse rows and object summary. */
const BROWSE_PROPERTY_FILTER = [
  "cmis:objectId",
  "cmis:name",
  "cmis:baseTypeId",
  "cmis:objectTypeId",
  "cmis:createdBy",
  "cmis:creationDate",
  "cmis:lastModifiedBy",
  "cmis:lastModificationDate",
  "cmis:contentStreamLength",
  "cmis:contentStreamMimeType",
  "cmis:path",
  "cmis:parentId",
].join(",");

export async function getChildren(
  client: CmisClient,
  folderId: string,
  options: { maxItems?: number; skipCount?: number; orderBy?: string } = {},
): Promise<CmisChildrenResponse> {
  return client.requestJson<CmisChildrenResponse>({
    path: `${client.options.repositoryId}/root`,
    query: commonQuery(client, {
      cmisselector: "children",
      objectId: folderId,
      filter: BROWSE_PROPERTY_FILTER,
      includeAllowableActions: true,
      includePathSegment: true,
      maxItems: options.maxItems ?? 100,
      skipCount: options.skipCount ?? 0,
      orderBy: options.orderBy,
    }),
  });
}

export async function getObject(
  client: CmisClient,
  objectId: string,
  options: { includeACL?: boolean } = {},
): Promise<CmisObject> {
  return client.requestJson<CmisObject>({
    path: `${client.options.repositoryId}/root`,
    query: commonQuery(client, {
      cmisselector: "object",
      objectId,
      includeAllowableActions: true,
      // includeACL can fail on some connector roots; load ACL via selector when needed.
      includeACL: options.includeACL ?? false,
      renditionFilter: "cmis:none",
    }),
  });
}

export async function getObjectByPath(
  client: CmisClient,
  path: string,
): Promise<CmisObject> {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  const encoded = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return client.requestJson<CmisObject>({
    path: `${client.options.repositoryId}/root${encoded ? `/${encoded}` : ""}`,
    query: commonQuery(client, {
      cmisselector: "object",
      includeAllowableActions: true,
    }),
  });
}

export async function getFolderParent(
  client: CmisClient,
  folderId: string,
): Promise<CmisObject> {
  return client.requestJson<CmisObject>({
    path: `${client.options.repositoryId}/root`,
    query: commonQuery(client, {
      cmisselector: "parent",
      objectId: folderId,
    }),
  });
}

export async function getAcl(client: CmisClient, objectId: string): Promise<CmisAcl> {
  return client.requestJson<CmisAcl>({
    path: `${client.options.repositoryId}/root`,
    query: commonQuery(client, {
      cmisselector: "acl",
      objectId,
    }),
  });
}

export async function getVersions(
  client: CmisClient,
  objectId: string,
): Promise<CmisObject[]> {
  const result = await client.requestJson<CmisObject[] | { objects?: CmisObject[] }>({
    path: `${client.options.repositoryId}/object/${encodeObjectIdPath(objectId)}`,
    query: commonQuery(client, {
      cmisselector: "versions",
    }),
  });
  if (Array.isArray(result)) {
    return result;
  }
  return result.objects ?? [];
}

export async function getRenditions(
  client: CmisClient,
  objectId: string,
): Promise<CmisRendition[]> {
  const result = await client.requestJson<CmisRendition[] | { renditions?: CmisRendition[] }>({
    path: `${client.options.repositoryId}/root`,
    query: commonQuery(client, {
      cmisselector: "renditions",
      objectId,
      renditionFilter: "*",
    }),
  });
  if (Array.isArray(result)) {
    return result;
  }
  return result.renditions ?? [];
}

export async function query(
  client: CmisClient,
  statement: string,
  options: { maxItems?: number; skipCount?: number; searchAllVersions?: boolean } = {},
): Promise<CmisQueryResponse> {
  return client.requestJson<CmisQueryResponse>({
    path: client.options.repositoryId,
    query: commonQuery(client, {
      cmisselector: "query",
      statement,
      maxItems: options.maxItems ?? 50,
      skipCount: options.skipCount ?? 0,
      searchAllVersions: options.searchAllVersions ?? false,
    }),
  });
}

export async function downloadContent(
  client: CmisClient,
  objectId: string,
  fileName: string,
): Promise<void> {
  const response = await client.request({
    path: `${client.options.repositoryId}/root`,
    query: commonQuery(client, {
      cmisselector: "content",
      objectId,
      download: "attachment",
    }),
    raw: true,
  });

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
