import { forceLogout } from "../context/AuthContext";

const API_URL = "https://gymrat-py89.onrender.com";

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  token: string
) {
  const url = `${API_URL}${endpoint}`;

  console.log("🌐 API REQUEST:", url);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    console.log("🌐 API STATUS:", response.status);

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
  } catch (error) {
    console.log("❌ API ERROR:", error);
    throw error;
  }
}