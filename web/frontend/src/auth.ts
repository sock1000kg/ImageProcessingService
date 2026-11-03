import { User } from "./types";

let accessToken: string | null = null;
// The signed-in user from the last login/register/refresh response. After a page reload only the refresh call
// restores the session, so this is where AuthContext gets the user back from.
let currentUser: User | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token === null) currentUser = null;
}

export function getCurrentUser(): User | null {
  return currentUser;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T;
  if (!response.ok) {
    const message = (data as { error?: { message?: string } }).error?.message ?? "Authentication request failed";
    throw new Error(message);
  }
  return data;
}

export async function login(email: string, password: string): Promise<User> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = await parseResponse<{ user: User; accessToken: string }>(response);
  setAccessToken(data.accessToken);
  currentUser = data.user;
  return data.user;
}

export async function register(email: string, password: string, registerKey: string): Promise<User> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, registerKey }),
  });
  const data = await parseResponse<{ user: User; accessToken: string }>(response);
  setAccessToken(data.accessToken);
  currentUser = data.user;
  return data.user;
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          setAccessToken(null);
          return null;
        }
        const data = await parseResponse<{ user: User; accessToken: string }>(response);
        setAccessToken(data.accessToken);
        currentUser = data.user;
        return data.accessToken;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  setAccessToken(null);
}
