/** CMIS Browser Binding JSON shapes used by Box CMIS Lab. */

import type { AuthCredentials } from "../auth/types.js";

export type CmisPropertyValue = string | number | boolean | null | string[];

export interface CmisProperty {
  id?: string;
  localName?: string;
  displayName?: string;
  queryName?: string;
  type?: string;
  cardinality?: string;
  value?: CmisPropertyValue;
}

export type CmisProperties = Record<string, CmisProperty | CmisPropertyValue>;

export interface CmisObject {
  properties?: Record<string, CmisProperty>;
  succinctProperties?: Record<string, CmisPropertyValue>;
  allowableActions?: Record<string, boolean>;
  acl?: CmisAcl;
  exactACL?: boolean;
  changeToken?: string;
}

export interface CmisObjectInFolder {
  object: CmisObject;
  pathSegment?: string;
}

export interface CmisChildrenResponse {
  objects?: CmisObjectInFolder[];
  hasMoreItems?: boolean;
  numItems?: number;
}

export interface CmisAcl {
  aces?: CmisAce[];
  exact?: boolean;
}

export interface CmisAce {
  principal?: { principalId?: string };
  permissions?: string[];
  isDirect?: boolean;
}

export interface CmisRendition {
  streamId?: string;
  mimeType?: string;
  kind?: string;
  height?: number;
  width?: number;
  title?: string;
  length?: number;
  renditionDocumentId?: string;
}

export interface CmisRepositoryCapabilities {
  capabilityQuery?: string | boolean;
  capabilityChanges?: string | boolean;
  capabilityACL?: string | boolean;
  capabilityRenditions?: string | boolean;
  [key: string]: unknown;
}

export interface CmisRepositoryInfo {
  repositoryId: string;
  repositoryName?: string;
  repositoryDescription?: string;
  vendorName?: string;
  productName?: string;
  productVersion?: string;
  cmisVersionSupported?: string;
  rootFolderId?: string;
  repositoryUrl?: string;
  rootFolderUrl?: string;
  capabilities?: CmisRepositoryCapabilities;
  [key: string]: unknown;
}

export type CmisServiceDocument = Record<string, CmisRepositoryInfo>;

export interface CmisQueryResult {
  properties?: Record<string, CmisProperty>;
  succinctProperties?: Record<string, CmisPropertyValue>;
}

export interface CmisQueryResponse {
  results?: CmisQueryResult[];
  hasMoreItems?: boolean;
  numItems?: number;
}

export interface CmisConnectionOptions {
  serviceUrl: string;
  repositoryId: string;
  succinct: boolean;
  auth?: AuthCredentials;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  /** When true, return raw Response (for content streams). */
  raw?: boolean;
}
