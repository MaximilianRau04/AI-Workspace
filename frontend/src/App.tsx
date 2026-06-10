import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import ChatPage from "./pages/ChatPage";
import LoginPage from "./pages/LoginPage";

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          {/* ChatPage stays mounted when navigating between / and /c/:sessionId */}
          <Route path="/" element={<ChatPage />}>
            <Route index element={<Outlet />} />
            <Route path="c/:sessionId" element={<Outlet />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
