import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { login, logout, refreshAccessToken, register } from "../auth";
import { User } from "../types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";
type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, registerKey: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const testMode = import.meta.env.MODE === "test";
  const [user, setUser] = useState<User | null>(testMode ? { id: "test-user", email: "test@example.com" } : null);
  const [status, setStatus] = useState<AuthStatus>(testMode ? "authenticated" : "loading");

  useEffect(() => {
    if (testMode) return;
    refreshAccessToken().then((token) => {
      setStatus(token ? "authenticated" : "unauthenticated");
    });
  }, [testMode]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      async signIn(email, password) {
        const nextUser = await login(email, password);
        setUser(nextUser);
        setStatus("authenticated");
      },
      async signUp(email, password, registerKey) {
        const nextUser = await register(email, password, registerKey);
        setUser(nextUser);
        setStatus("authenticated");
      },
      async signOut() {
        await logout();
        setUser(null);
        setStatus("unauthenticated");
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
