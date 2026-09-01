import { useAuthStore } from "@/store/auth.store";
import type { AuthResponse } from "@/types/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

type ApiErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

type ApiOptions = RequestInit & {
  auth?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

let refreshInFlight: Promise<boolean> | null = null;

export async function apiRequest<T>(path: string, requestInit: ApiOptions = {}) {
  let res = await sendRequest(path, requestInit);

  if (res.status === 401 && requestInit.auth !== false && path !== "/auth/refresh") {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      res = await sendRequest(path, requestInit);
    }
  }

  return readJson<T>(res);
}

async function sendRequest(path: string, requestInit: ApiOptions) {
  const headers = new Headers(requestInit.headers);
  headers.set("Content-Type", "application/json");

  if (requestInit.auth !== false) {
    const token = useAuthStore.getState().accessToken;

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return fetch(`${API_URL}${path}`, {
    ...requestInit,
    headers,
    credentials: "include"
  });
}

async function readJson<T>(res: Response) {
  if (res.status === 204) {
    return undefined as T;
  }

  const body = (await res.json()) as ApiEnvelope<T> | ApiErrorEnvelope;

  if (!res.ok || !body.success) {
    const message = "error" in body ? body.error.message : "Request failed";
    const code = "error" in body ? body.error.code : `HTTP_${res.status}`;
    throw new ApiError(message, res.status, code);
  }

  return body.data;
}

export async function restoreSession() {
  if (useAuthStore.getState().accessToken) {
    return true;
  }

  useAuthStore.getState().startCheck();
  return refreshAccessToken();
}

async function refreshAccessToken() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include"
  })
    .then(async (res) => {
      if (!res.ok) {
        useAuthStore.getState().logout();
        return false;
      }

      const body = (await res.json()) as ApiEnvelope<AuthResponse>;
      useAuthStore.getState().setSession(body.data);
      return true;
    })
    .catch(() => {
      useAuthStore.getState().logout();
      return false;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export async function apiDownload(path: string, requestInit: ApiOptions = {}) {
  let res = await sendRequest(path, requestInit);

  if (res.status === 401 && requestInit.auth !== false && (await refreshAccessToken())) {
    res = await sendRequest(path, requestInit);
  }

  if (!res.ok) {
    const contentType = res.headers.get("Content-Type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await res.json()) as ApiErrorEnvelope;
      throw new ApiError(
        body.error?.message ?? "Download failed",
        res.status,
        body.error?.code ?? `HTTP_${res.status}`
      );
    }

    throw new ApiError("Download failed", res.status, `HTTP_${res.status}`);
  }

  // Some providers omit Content-Disposition, so keep a safe fallback name.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);

  return {
    blob: await res.blob(),
    filename: match?.[1] ?? "levelupx-export.csv"
  };
}
