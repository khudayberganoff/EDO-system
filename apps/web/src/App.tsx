import { lazy, Suspense, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RequireAuth } from "./components/RequireAuth";
import { AppLayout } from "./components/AppLayout";

// Sahifalar alohida bo'laklarga ajratilgan: brauzer faqat ochilgan sahifaning kodini yuklaydi
// (ilgari hamma sahifa bitta katta faylda edi va kirish oynasi uchun ham to'liq yuklanardi).
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const LoginPage = page(() => import("./pages/LoginPage"), "LoginPage");
const DashboardPage = page(() => import("./pages/DashboardPage"), "DashboardPage");
const DocumentsPage = page(() => import("./pages/DocumentsPage"), "DocumentsPage");
const DocumentDetailPage = page(() => import("./pages/DocumentDetailPage"), "DocumentDetailPage");
const LettersPage = page(() => import("./pages/LettersPage"), "LettersPage");
const LetterArchivePage = page(() => import("./pages/LetterArchivePage"), "LetterArchivePage");
const LetterVerifyPage = page(() => import("./pages/LetterVerifyPage"), "LetterVerifyPage");
const HrPage = page(() => import("./pages/HrPage"), "HrPage");
const MyHrPage = page(() => import("./pages/MyHrPage"), "MyHrPage");
const IntegrationsPage = page(() => import("./pages/IntegrationsPage"), "IntegrationsPage");
const SettingsPage = page(() => import("./pages/SettingsPage"), "SettingsPage");
const BoardPage = page(() => import("./pages/BoardPage"), "BoardPage");
const IncomingMailPage = page(() => import("./pages/IncomingMailPage"), "IncomingMailPage");
const CallCenterPage = page(() => import("./pages/CallCenterPage"), "CallCenterPage");
import { IS_CALL_SITE } from "./utils/site";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Sahifalar orasida o'tganda bir xil ma'lumot 20 soniya ichida qayta so'ralmaydi (o'zgartirishdan keyin baribir yangilanadi)
      staleTime: 20_000,
      // Ruxsat yo'q / topilmadi kabi javoblarni qayta-qayta so'rash befoyda; faqat tarmoq yoki server xatosida 1 marta
      retry: (failureCount, error: any) => {
        const status = error?.response?.status;
        return failureCount < 1 && (status === undefined || status >= 500);
      },
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={null}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify/:id" element={<LetterVerifyPage />} />

            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                {IS_CALL_SITE ? (
                  <>
                    <Route path="/calls" element={<CallCenterPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/calls" replace />} />
                  </>
                ) : (
                  <>
                    <Route path="/" element={<DashboardPage />} />
                <Route path="/calls" element={<Navigate to="/" replace />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/documents/:id" element={<DocumentDetailPage />} />
                <Route path="/letters" element={<LettersPage />} />
                <Route path="/letters/incoming" element={<IncomingMailPage />} />
                <Route path="/letters/:kind" element={<LettersPage />} />
                <Route path="/letters/archive" element={<LetterArchivePage />} />
                <Route path="/my-hr" element={<MyHrPage />} />
                <Route path="/board" element={<BoardPage />} />
                <Route path="/integrations" element={<IntegrationsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/hr" element={<HrPage />} />
                <Route path="/hr/:tab" element={<HrPage />} />
              </>
                )}
              </Route>
            </Route>
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
