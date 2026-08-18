import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { RequireAuth } from "./components/RequireAuth";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { DocumentDetailPage } from "./pages/DocumentDetailPage";
import { LettersPage } from "./pages/LettersPage";
import { LetterArchivePage } from "./pages/LetterArchivePage";
import { LetterVerifyPage } from "./pages/LetterVerifyPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify/:id" element={<LetterVerifyPage />} />

            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/documents/:id" element={<DocumentDetailPage />} />
                <Route path="/letters" element={<LettersPage />} />
                <Route path="/letters/:kind" element={<LettersPage />} />
                <Route path="/letters/archive" element={<LetterArchivePage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
