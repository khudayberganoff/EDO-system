import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ForcePasswordChangePage } from "../pages/ForcePasswordChangePage";

export function RequireAuth() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  // Avtomatik yaratilgan yoki tiklangan parolda - foydalanuvchi uni almashtirmaguncha
  // tizimning boshqa hech qanday qismiga (AppLayout ham) o'ta olmaydi.
  if (user?.mustChangePassword) {
    return <ForcePasswordChangePage />;
  }
  return <Outlet />;
}
