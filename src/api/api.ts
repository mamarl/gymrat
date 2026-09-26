import { forceLogout } from "../context/AuthContext";

const API_URL = "http://192.168.1.59:8000";

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  token: string
) {
  const response = await fetch(
    `${API_URL}${endpoint}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    }
  );

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401) {
      await forceLogout();
      throw new Error("AUTH_TOKEN_INVALID");
    }

    throw new Error(
      data?.detail ||
      data?.error ||
      "API request failed"
    );
  }

  return data;
}