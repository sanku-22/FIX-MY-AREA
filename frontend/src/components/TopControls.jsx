import React from "react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { LogIn, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TopControls({ compact = false }) {
  const { t, i18n } = useTranslation();
  const { user, openLogin, logout } = useAuth();
  const lang = i18n.language?.startsWith("hi") ? "hi" : "en";

  return (
    <div className="flex items-center gap-2">
      <div data-testid="language-toggle" className="flex overflow-hidden rounded-full border border-[#e6e3dc] bg-white">
        {["en", "hi"].map((l) => (
          <button key={l} data-testid={`lang-${l}`} onClick={() => setLanguage(l)}
            className={cn("px-2.5 py-1 text-xs font-bold transition-colors", lang === l ? "bg-[#1f7a72] text-white" : "text-[#6b6b70]")}>
            {l === "en" ? "EN" : "हिं"}
          </button>
        ))}
      </div>

      {user ? (
        <div className="flex items-center gap-1.5">
          <span className="flex h-8 items-center gap-1.5 rounded-full border border-[#e6e3dc] bg-white pl-1.5 pr-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1f7a72] text-[11px] font-bold text-white">
              {(user.name || "U").charAt(0).toUpperCase()}
            </span>
            <span className="max-w-[70px] truncate text-xs font-semibold text-[#2a2a2c]">{user.name || t("auth.guest")}</span>
          </span>
          <button data-testid="sign-out-btn" onClick={logout} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e6e3dc] bg-white text-[#6b6b70]" title={t("auth.signOut")}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button data-testid="sign-in-btn" onClick={openLogin}
          className="flex items-center gap-1.5 rounded-full bg-[#1f7a72] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#17635c]">
          <LogIn className="h-4 w-4" /> {t("auth.signIn")}
        </button>
      )}
    </div>
  );
}
