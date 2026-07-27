/** Box Platform helpers used by the Lab after OAuth. */

export interface BoxUser {
  id: string;
  name: string;
  login: string;
  /** From `GET /users/me?fields=enterprise` → `enterprise.id`. */
  enterpriseId: string | null;
}

export async function fetchCurrentBoxUser(accessToken: string): Promise<BoxUser> {
  const response = await fetch("/box-api/2.0/users/me?fields=id,name,login,enterprise", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Box /users/me returned non-JSON (${response.status})`);
  }

  if (!response.ok) {
    const message =
      typeof json.message === "string"
        ? json.message
        : `Failed to load Box user (${response.status})`;
    throw new Error(message);
  }

  return {
    id: typeof json.id === "string" ? json.id : "",
    name: typeof json.name === "string" ? json.name : "Box user",
    login: typeof json.login === "string" ? json.login : "",
    enterpriseId: enterpriseIdFromUserPayload(json),
  };
}

export function formatBoxUser(user: BoxUser): string {
  if (user.login && user.name) {
    return `${user.name} (${user.login})`;
  }
  return user.name || user.login || user.id || "Signed in";
}

function enterpriseIdFromUserPayload(json: Record<string, unknown>): string | null {
  const enterprise = json.enterprise;
  if (!enterprise || typeof enterprise !== "object" || Array.isArray(enterprise)) {
    return null;
  }
  const id = (enterprise as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() !== "" ? id : null;
}
