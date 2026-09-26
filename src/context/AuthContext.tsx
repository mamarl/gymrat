
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

type AuthContextType = {
  token: string | null;
  username: string | null;
  userKey: string | null;
  isLoading: boolean;
  login: (token: string, username: string) => Promise<void>;
  updateUsername: (newUsername: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

// =========================
// GLOBAL AUTH LOGOUT
// =========================

let globalLogout: (() => Promise<void>) | null = null;

export async function forceLogout() {
  if (globalLogout) {
    await globalLogout();
  }
}

// =========================
// AUTH PROVIDER
// =========================

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [userKey, setUserKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAuth();
  }, []);

  async function loadAuth() {
    try {
      const savedToken =
        await SecureStore.getItemAsync("gymrat_token");

      const savedUsername =
        await SecureStore.getItemAsync("gymrat_username");

      if (savedToken) {
        setToken(savedToken);
      }

      if (savedUsername) {
        setUsername(savedUsername);
        setUserKey(savedUsername);
      }
    } catch (error) {
      console.log("Failed to load auth:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(
    newToken: string,
    newUsername: string
  ) {
    await SecureStore.setItemAsync(
      "gymrat_token",
      newToken
    );

    await SecureStore.setItemAsync(
      "gymrat_username",
      newUsername
    );

    setToken(newToken);
    setUsername(newUsername);
    setUserKey(newUsername);
  }

  // =========================
  // UPDATE USERNAME
  // =========================

  async function updateUsername(
    newUsername: string
  ) {
    await SecureStore.setItemAsync(
      "gymrat_username",
      newUsername
    );

    setUsername(newUsername);
    setUserKey(newUsername);
  }

  // =========================
  // LOGOUT
  // =========================

  async function logout() {
    await SecureStore.deleteItemAsync(
      "gymrat_token"
    );

    await SecureStore.deleteItemAsync(
      "gymrat_username"
    );

    setToken(null);
    setUsername(null);
    setUserKey(null);
  }

  // Register logout so apiFetch can use it
  useEffect(() => {
    globalLogout = logout;

    return () => {
      globalLogout = null;
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        username,
        userKey,
        isLoading,
        login,
        updateUsername,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}

