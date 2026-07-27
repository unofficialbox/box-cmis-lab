export interface TrafficHeaders {
  [name: string]: string;
}

export interface TrafficEntry {
  id: string;
  startedAt: number;
  durationMs: number;
  method: string;
  url: string;
  requestHeaders: TrafficHeaders;
  requestBodyPreview?: string;
  status: number;
  statusText: string;
  responseHeaders: TrafficHeaders;
  responseBodyPreview?: string;
  error?: string;
}

type Listener = () => void;

const MAX_ENTRIES = 200;

export class TrafficLog {
  private entries: TrafficEntry[] = [];
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): TrafficEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.notify();
  }

  add(entry: TrafficEntry): void {
    this.entries = [entry, ...this.entries].slice(0, MAX_ENTRIES);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function headersToRecord(headers: Headers): TrafficHeaders {
  const out: TrafficHeaders = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export async function previewBody(
  body: BodyInit | null | undefined,
  maxChars = 8_000,
): Promise<string | undefined> {
  if (body == null) {
    return undefined;
  }
  if (typeof body === "string") {
    return truncate(body, maxChars);
  }
  if (body instanceof URLSearchParams) {
    return truncate(body.toString(), maxChars);
  }
  if (body instanceof Blob) {
    return truncate(await body.text(), maxChars);
  }
  if (body instanceof ArrayBuffer) {
    return truncate(new TextDecoder().decode(body), maxChars);
  }
  return undefined;
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n… truncated (${text.length} chars)`;
}

let trafficSeq = 0;

export function nextTrafficId(): string {
  trafficSeq += 1;
  return `req-${trafficSeq}-${Date.now()}`;
}
