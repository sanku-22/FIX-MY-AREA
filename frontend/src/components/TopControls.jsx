import React from "react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TopControls({ compact = false }) {
  const { t, i18n } = useTranslation();
  const { user, login, logout } = useAuth();
  const lang = i18n.language?.startsWith("hi") ? "hi" : "en";

  return (
    <div className="flex items-center gap-2">
      {/* language toggle */}
      <div data-testid="language-toggle" className="flex overflow-hidden rounded-full border border-[#e4e4e7] bg-white">
        {["en", "hi"].map((l) => (
          <button
            key={l}
            data-testid={`lang-${l}`}
            onClick={() => setLanguage(l)}
            className={cn(
              "px-2.5 py-1 text-xs font-bold transition-colors",
              lang === l ? "bg-[#09090b] text-white" : "text-[#71717a]",
            )}
          >
            {l === "en" ? "EN" : "हिं"}
          </button>
        ))}
      </div>

      {/* auth */}
      {user ? (
        <div className="flex items-center gap-1.5">
          {user.picture ? (
            <img data-testid="user-avatar" src={user.picture} alt={user.name} className="h-8 w-8 rounded-full border border-[#e4e4e7] object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#09090b] text-xs font-bold text-white">
              {(user.name || "U").charAt(0)}
            </span>
          )}
          <button data-testid="sign-out-btn" onClick={logout} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e4e4e7] bg-white text-[#71717a]" title={t("auth.signOut")}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          data-testid="sign-in-btn"
          onClick={login}
          className="flex items-center gap-1.5 rounded-full bg-[#09090b] px-3 py-1.5 text-xs font-semibold text-white"
        >
          <LogIn className="h-4 w-4" /> {compact ? t("auth.signIn") : t("auth.signIn")}
        </button>
      )}
    </div>
  );
}
