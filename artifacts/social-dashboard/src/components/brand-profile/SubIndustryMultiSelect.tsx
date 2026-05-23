import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Label } from "@/components/ui/label";

type Subcategory = {
  name: string;
  slug: string;
};

type Props = {
  value?: string;
  subcategories: Subcategory[];
  onChange: (value: string) => void;
};

function parseCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

export default function SubIndustryMultiSelect({
  value,
  subcategories,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedItems = useMemo(() => parseCsv(value), [value]);
  const selectedCount = selectedItems.length;
  const allSelected =
    subcategories.length > 0 && selectedCount === subcategories.length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  function toggleItem(name: string) {
    const next = selectedItems.includes(name)
      ? selectedItems.filter(item => item !== name)
      : Array.from(new Set([...selectedItems, name]));

    onChange(next.join(","));
  }

  function toggleAll() {
    onChange(allSelected ? "" : subcategories.map(item => item.name).join(","));
  }

  if (!subcategories.length) return null;

  return (
    <div className="grid gap-2" ref={wrapperRef}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">
          Tipos específicos{" "}
          <span className="font-normal">(puedes elegir varios)</span>
        </Label>

        <button
          type="button"
          className="text-[11px] text-primary hover:underline"
          onClick={toggleAll}
        >
          {allSelected ? "Quitar todas" : "Seleccionar todas"}
        </button>
      </div>

      <div className="relative z-20">
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={selectedCount ? "text-foreground" : "text-muted-foreground"}>
            {selectedCount
              ? `${selectedCount} seleccionado(s)`
              : "Selecciona tipos específicos..."}
          </span>

          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-xl border border-border bg-popover p-2 shadow-xl">
            <div className="max-h-56 overflow-y-auto space-y-1">
              {subcategories.map(item => {
                const selected = selectedItems.includes(item.name);

                return (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => toggleItem(item.name)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded border border-input bg-background">
                      {selected && <Check className="h-3 w-3" />}
                    </span>

                    <span className="flex-1">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map(item => (
            <button
              key={item}
              type="button"
              onClick={() => toggleItem(item)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/15"
            >
              {item}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}