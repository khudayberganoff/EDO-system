import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, LogOut } from "lucide-react";
import { changePassword } from "../api/auth";
import { useAuth } from "../context/AuthContext";

/**
 * Avtomatik yaratilgan yoki administrator tiklagan hisoblarda birinchi kirishda
 * ko'rsatiladi - foydalanuvchi o'z parolini almashtirmaguncha tizimning boshqa
 * qismiga o'tolmaydi (RequireAuth shu sahifani AppLayout o'rniga ko'rsatadi).
 */
export function ForcePasswordChangePage() {
  const { user, logout, markPasswordChanged } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => markPasswordChanged(),
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(". ") : typeof msg === "string" ? msg : "Parolni almashtirib bo'lmadi.");
    },
  });

  const submit = () => {
    setError(null);
    if (newPassword.length < 8) return setError("Yangi parol kamida 8 ta belgidan iborat bo'lishi kerak.");
    if (newPassword !== confirmPassword) return setError("Yangi parollar bir xil emas.");
    mutation.mutate();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
          <KeyRound size={22} />
        </div>
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Parolni almashtirish shart</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user?.fullName}, tizimga birinchi marta kiryapsiz - davom etishdan oldin yangi parol o'rnating.
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Joriy parol</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Yangi parol</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Yangi parolni takrorlang</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="input"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

        <button
          onClick={submit}
          disabled={mutation.isPending || !currentPassword || !newPassword || !confirmPassword}
          className="mt-5 w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
        >
          Parolni saqlash va davom etish
        </button>
        <button onClick={logout} className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
          <LogOut size={13} /> Chiqish
        </button>
      </div>
    </div>
  );
}
