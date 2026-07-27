import { describe, expect, it } from "vitest";
import {
  formatCmisDateTime,
  formatPropertyValue,
  getLastModified,
  getObjectId,
  getObjectName,
  objectProperties,
  parseCmisDateTime,
  propertyValue,
  supportsQuery,
} from "./properties.js";
import type { CmisObject } from "./types.js";
import {
  buildQueryString,
  encodeObjectIdPath,
  joinUrl,
  resolveServiceUrlForBrowser,
} from "./url.js";

describe("resolveServiceUrlForBrowser", () => {
  it("rewrites local connector URLs through the Vite proxy path", () => {
    expect(resolveServiceUrlForBrowser("http://127.0.0.1:8080/cmis")).toBe("/cmis");
    expect(resolveServiceUrlForBrowser("http://localhost:8080/cmis/")).toBe("/cmis");
  });

  it("keeps relative and remote URLs", () => {
    expect(resolveServiceUrlForBrowser("/cmis")).toBe("/cmis");
    expect(resolveServiceUrlForBrowser("https://cmis.example.com/browser")).toBe(
      "https://cmis.example.com/browser",
    );
  });
});

describe("joinUrl", () => {
  it("joins service and repository paths", () => {
    expect(joinUrl("/cmis", "box")).toBe("/cmis/box");
    expect(joinUrl("http://127.0.0.1:8080/cmis/", "box", "root")).toBe(
      "http://127.0.0.1:8080/cmis/box/root",
    );
  });

  it("ignores empty segments", () => {
    expect(joinUrl("/cmis", "")).toBe("/cmis");
  });
});

describe("buildQueryString", () => {
  it("omits nullish and empty values", () => {
    expect(
      buildQueryString({
        cmisselector: "children",
        objectId: "folder:0",
        orderBy: undefined,
        filter: "",
        succinct: false,
      }),
    ).toBe("?cmisselector=children&objectId=folder%3A0&succinct=false");
  });
});

describe("encodeObjectIdPath", () => {
  it("encodes typed object ids", () => {
    expect(encodeObjectIdPath("file:abc/def")).toBe("file%3Aabc%2Fdef");
  });
});

describe("property helpers", () => {
  const standardObject: CmisObject = {
    properties: {
      "cmis:objectId": { id: "cmis:objectId", value: "file:1" },
      "cmis:name": { id: "cmis:name", value: "Report.pdf" },
    },
  };

  const succinctObject: CmisObject = {
    succinctProperties: {
      "cmis:objectId": "folder:0",
      "cmis:name": "Root",
    },
  };

  it("reads standard and succinct properties", () => {
    expect(getObjectId(standardObject)).toBe("file:1");
    expect(getObjectName(standardObject)).toBe("Report.pdf");
    expect(getObjectId(succinctObject)).toBe("folder:0");
    expect(propertyValue(objectProperties(succinctObject), "cmis:name")).toBe("Root");
  });

  it("formats property values", () => {
    expect(formatPropertyValue(null)).toBe("null");
    expect(formatPropertyValue(["a", "b"])).toBe("a, b");
  });

  it("parses CMIS Browser Binding datetime values", () => {
    expect(parseCmisDateTime(0)).toBeNull();
    expect(parseCmisDateTime("0")).toBeNull();
    expect(formatCmisDateTime(1_704_067_200_000)).toBe("2024-01-01T00:00:00.000Z");
    expect(getLastModified({
      properties: {
        "cmis:lastModificationDate": {
          id: "cmis:lastModificationDate",
          type: "datetime",
          value: 1_704_067_200_000,
        },
      },
    })).toBe("2024-01-01T00:00:00.000Z");
    expect(formatPropertyValue(1_704_067_200_000, "cmis:lastModificationDate")).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it("detects query capability", () => {
    expect(supportsQuery("bothcombined")).toBe(true);
    expect(supportsQuery("none")).toBe(false);
    expect(supportsQuery(false)).toBe(false);
    expect(supportsQuery(true)).toBe(true);
  });
});
