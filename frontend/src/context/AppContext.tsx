import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { getMe } from "../api/auth";
import { getChats } from "../api/chats";
import { getConfig } from "../api/config";
import type { User, Session, Config } from "../types";

interface AppContextValue {
  user: User | null | undefined;
  setUser: React.Dispatch<React.SetStateAction<User | null | undefined>>;
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  refreshSessions: () => Promise<void>;
  currentSessionId: string | null;
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  config: Config | null;
  setConfig: React.Dispatch<React.SetStateAction<Config | null>>;
  theme: string;
  toggleTheme: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem("theme") || "dark",
  );
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => localStorage.getItem("sidebar") === "open",
  );

  // Apply theme to <html>
  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem("sidebar", sidebarOpen ? "open" : "closed");
  }, [sidebarOpen]);

  // Bootstrap: fetch /me
  useEffect(() => {
    getMe().then((me) => {
      if (!me) {
        setUser(null);
        navigate("/login", { replace: true });
      } else {
        setUser(me);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch config once user is known
  useEffect(() => {
    if (!user) return;
    getConfig().then(setConfig);
  }, [user]);

  const refreshSessions = useCallback(async () => {
    const data = await getChats();
    setSessions(data.chats || []);
  }, []);

  // Fetch sessions once user is known
  useEffect(() => {
    if (!user) return;
    refreshSessions();
  }, [user, refreshSessions]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((o) => !o);
  }, []);

  const value: AppContextValue = {
    user,
    setUser,
    sessions,
    setSessions,
    refreshSessions,
    currentSessionId,
    setCurrentSessionId,
    config,
    setConfig,
    theme,
    toggleTheme,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
