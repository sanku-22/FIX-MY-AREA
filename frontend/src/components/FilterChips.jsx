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
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-[transform,background-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1f7a72] active:scale-95",
              isActive
                ? "bg-[#1f7a72] text-white shadow-[0_4px_12px_rgba(31,122,114,0.28)]"
                : "border border-[#e6e3dc] bg-white/90 text-[#2a2a2c] backdrop-blur-xl hover:-translate-y-0.5",
            )}
          >
            {t(`filters.${chip.key}`)}
          </button>
        );
      })}
    </div>
  );
}
