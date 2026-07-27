import { authorizationHeader, type AuthCredentials } from "../auth/types.js";
import {
  headersToRecord,
  nextTrafficId,
  previewBody,
  truncate,
  type TrafficLog,
} from "../inspector/traffic-log.js";
import type { CmisConnectionOptions, RequestOptions } from "./types.js";
import { buildQueryString, joinUrl, resolveServiceUrlForBrowser } from "./url.js";

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out = { ...headers };
  if (out.Authorization) {
    out.Authorization = "[redacted]";
  }
  return out;
}

export class CmisClientError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "CmisClientError";
    this.status = status;
    this.body = body;
  }
}

export class CmisClient {
  readonly options: CmisConnectionOptions;
  private readonly traffic: TrafficLog;

  constructor(options: CmisConnectionOptions, traffic: TrafficLog) {
    this.options = options;
    this.traffic = traffic;
  }

  get serviceUrl(): string {
    return resolveServiceUrlForBrowser(this.options.serviceUrl);
  }

  get repositoryUrl(): string {
    return joinUrl(this.serviceUrl, this.options.repositoryId);
  }

  get rootFolderUrl(): string {
    return joinUrl(this.repositoryUrl, "root");
  }

  async requestJson<T>(options: RequestOptions): Promise<T> {
    const response = await this.request(options);
    const text = await response.text();
    if (!text) {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new CmisClientError(
        `Invalid JSON response (${response.status})`,
        response.status,
        text,
      );
    }
  }

  async request(options: RequestOptions): Promise<Response> {
    const method = options.method ?? "GET";
    const url = `${joinUrl(this.serviceUrl, options.path)}${buildQueryString(options.query ?? {})}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
    };

    const authHeader = this.options.auth
      ? authorizationHeader(this.options.auth)
      : undefined;
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const startedAt = Date.now();
    const id = nextTrafficId();
    const requestBodyPreview = await previewBody(options.body);
    const loggedHeaders = redactHeaders(headers);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body ?? undefined,
      });
    } catch (error) {
      this.traffic.add({
        id,
        startedAt,
        durationMs: Date.now() - startedAt,
        method,
        url,
        requestHeaders: loggedHeaders,
        requestBodyPreview,
        status: 0,
        statusText: "Network Error",
        responseHeaders: {},
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const durationMs = Date.now() - startedAt;
    const responseHeaders = headersToRecord(response.headers);
    const contentType = response.headers.get("content-type") ?? "";
    let responseBodyPreview: string | undefined;

    if (options.raw) {
      responseBodyPreview = `[binary/stream: ${contentType || "unknown"}]`;
      this.traffic.add({
        id,
        startedAt,
        durationMs,
        method,
        url,
        requestHeaders: loggedHeaders,
        requestBodyPreview,
        status: response.status,
        statusText: response.statusText,
        responseHeaders,
        responseBodyPreview,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      });
      if (!response.ok) {
        throw new CmisClientError(
          `CMIS request failed: ${method} ${url}`,
          response.status,
        );
      }
      return response;
    }

    const clone = response.clone();
    const text = await clone.text();
    responseBodyPreview = truncate(text, 8_000);

    this.traffic.add({
      id,
      startedAt,
      durationMs,
      method,
      url,
      requestHeaders: loggedHeaders,
      requestBodyPreview,
      status: response.status,
      statusText: response.statusText,
      responseHeaders,
      responseBodyPreview,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    });

    if (!response.ok) {
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        // keep raw text
      }
      const message =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof (body as { message: unknown }).message === "string"
          ? (body as { message: string }).message
          : `CMIS request failed: ${method} ${url}`;
      throw new CmisClientError(message, response.status, body);
    }

    return response;
  }
}

/** Fetch service document before a repository is selected. */
export async function fetchServiceDocument(
  serviceUrl: string,
  traffic: TrafficLog,
  auth?: AuthCredentials,
): Promise<unknown> {
  const client = new CmisClient(
    {
      serviceUrl,
      repositoryId: "_",
      succinct: false,
      auth,
    },
    traffic,
  );
  return client.requestJson({ path: "", query: {} });
}
