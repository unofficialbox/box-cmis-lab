import type {
  CmisObject,
  CmisProperties,
  CmisProperty,
  CmisPropertyValue,
  CmisQueryResult,
} from "./types.js";

const DATETIME_PROPERTY_IDS = new Set([
  "cmis:creationDate",
  "cmis:lastModificationDate",
]);

export function propertyValue(
  properties: CmisProperties | undefined,
  id: string,
): CmisPropertyValue | undefined {
  if (!properties) {
    return undefined;
  }
  const entry = properties[id];
  if (entry == null) {
    return undefined;
  }
  if (typeof entry === "object" && !Array.isArray(entry) && "value" in entry) {
    return (entry as CmisProperty).value;
  }
  return entry as CmisPropertyValue;
}

export function objectProperties(object: CmisObject | null | undefined): CmisProperties {
  if (!object) {
    return {};
  }
  if (object.succinctProperties) {
    return object.succinctProperties;
  }
  return object.properties ?? {};
}

export function getObjectId(object: CmisObject | null | undefined): string {
  const value = propertyValue(objectProperties(object), "cmis:objectId");
  return value == null ? "" : String(value);
}

export function getObjectName(object: CmisObject | null | undefined): string {
  const value = propertyValue(objectProperties(object), "cmis:name");
  return value == null ? "(unnamed)" : String(value);
}

export function getBaseTypeId(object: CmisObject | null | undefined): string {
  const value = propertyValue(objectProperties(object), "cmis:baseTypeId");
  return value == null ? "" : String(value);
}

export function getMimeType(object: CmisObject | null | undefined): string {
  const value = propertyValue(objectProperties(object), "cmis:contentStreamMimeType");
  return value == null ? "" : String(value);
}

export function getContentLength(object: CmisObject | null | undefined): number | null {
  const value = propertyValue(objectProperties(object), "cmis:contentStreamLength");
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/** CMIS Browser Binding datetime → ISO-8601, or empty when missing/sentinel. */
export function getLastModified(object: CmisObject | null | undefined): string {
  return formatCmisDateTime(
    propertyValue(objectProperties(object), "cmis:lastModificationDate"),
  );
}

export function getCreationDate(object: CmisObject | null | undefined): string {
  return formatCmisDateTime(
    propertyValue(objectProperties(object), "cmis:creationDate"),
  );
}

export function getCreatedBy(object: CmisObject | null | undefined): string {
  const value = propertyValue(objectProperties(object), "cmis:createdBy");
  return value == null ? "" : String(value);
}

export function getLastModifiedBy(object: CmisObject | null | undefined): string {
  const value = propertyValue(objectProperties(object), "cmis:lastModifiedBy");
  return value == null ? "" : String(value);
}

export function getPath(object: CmisObject | null | undefined): string {
  const value = propertyValue(objectProperties(object), "cmis:path");
  return value == null ? "" : String(value);
}

/**
 * Parse a CMIS datetime property value.
 * Browser Binding may send epoch milliseconds (number) or an ISO/XML string.
 * Sentinel `0` / empty values are treated as missing (not epoch day zero).
 */
export function parseCmisDateTime(value: CmisPropertyValue | undefined): Date | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) {
      return null;
    }
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "0") {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      return parseCmisDateTime(Number(trimmed));
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function formatCmisDateTime(value: CmisPropertyValue | undefined): string {
  const date = parseCmisDateTime(value);
  return date ? date.toISOString() : "";
}

export function flattenProperties(
  object: CmisObject | CmisQueryResult | null | undefined,
): Array<{ id: string; value: string }> {
  const props = object
    ? "succinctProperties" in object && object.succinctProperties
      ? object.succinctProperties
      : "properties" in object
        ? (object.properties ?? {})
        : {}
    : {};

  return Object.keys(props)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => {
      const raw = propertyValue(props, id);
      return { id, value: formatPropertyValue(raw, id) };
    });
}

export function formatPropertyValue(
  value: CmisPropertyValue | undefined,
  propertyId?: string,
): string {
  if (value === undefined) {
    return "";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (propertyId && DATETIME_PROPERTY_IDS.has(propertyId)) {
    const formatted = formatCmisDateTime(value);
    return formatted || String(value);
  }
  return String(value);
}

export function supportsQuery(capability: string | boolean | undefined): boolean {
  if (capability === true) {
    return true;
  }
  if (typeof capability !== "string") {
    return false;
  }
  const normalized = capability.toLowerCase();
  return (
    normalized !== "none" &&
    normalized !== "false" &&
    normalized.length > 0
  );
}
