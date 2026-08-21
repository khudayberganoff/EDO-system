import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Kutilmagan xatolik yuz berganda sahifa butunlay oppoq bo'lib qolmasligi uchun.
 * Xatoni ushlab, foydalanuvchiga tushunarli xabar ko'rsatadi.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Sahifada xatolik:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Kutilmagan xatolik yuz berdi</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sahifani yangilab ko'ring. Xatolik takrorlansa, tizim administratoriga murojaat qiling.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Sahifani yangilash
          </button>
        </div>
      </div>
    );
  }
}
