"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { apiGet, apiPost, getToken, setToken, removeToken } from "@/lib/api";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  avatar_url: string | null;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** 激活从外部获取的 token（例如 /register 的 active-account 分支）。 */
  loginWithToken: (token: string) => Promise<void>;
  /** 重新获取 /api/auth/me；在个人资料更新后使用。 */
  refreshUser: () => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  loginWithToken: async () => {},
  refreshUser: async () => {},
  logout: () => {},
  isAdmin: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // 惰性初始化，使"加载中"状态仅在确实有待验证的 token 时存在。
  // 当没有 token 时 `loading` 初始即为 false，从而避免在引导 effect 中
  // 进行同步的 `setLoading(false)` 调用——这一点会被 react-hooks/set-state-in-effect
  // 规则标记为级联更新。
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return !!getToken();
  });

  const fetchUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const u = await apiGet<User>("/api/auth/me");
      setUser(u);
    } catch {
      removeToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 引导：挂载时验证已保存的 token。如果没有 token 则不执行任何操作——
  // 在此分支中 `loading` 已被惰性初始化为 false，因此消费者会立即看到
  // "就绪、匿名"的状态。
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!getToken()) return;
    let cancelled = false;
    apiGet<User>("/api/auth/me")
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) {
          removeToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiPost<{ access_token: string }>("/api/auth/login", {
      email,
      password,
    });
    setToken(res.access_token);
    await fetchUser();
  };

  const loginWithToken = async (token: string) => {
    setToken(token);
    setLoading(true);
    await fetchUser();
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  const logout = () => {
    removeToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginWithToken,
        refreshUser,
        logout,
        isAdmin: user?.role === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
