import React from "react";
import { useTranslation } from "react-i18next";
import { FILTER_CHIPS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function FilterChips({ active, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-1 py-1">
      {FILTER_CHIPS.map((chip) => {
        const isActive = active === chip.key;
        return (
          <button
            key={chip.key}
            data-testid={`filter-chip-${chip.key}`}
            onClick={() => onChange(chip.key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black active:scale-95",
              isActive
                ? "bg-[#09090b] text-white shadow-md"
                : "bg-white/80 text-[#09090b] backdrop-blur-xl border border-white/40 hover:-translate-y-0.5",
            )}
          >
            {t(`filters.${chip.key}`)}
          </button>
        );
      })}
    </div>
  );
}
