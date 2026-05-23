import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Send, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { sendIndustrySuggestion } from "@/lib/industryCatalog";

type Subcategory = {
  name: string;
  slug: string;
};

type Props = {
  value?: string;
  subcategories: Subcategory[];
  parentIndustry?: string;
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
  parentIndustry,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);

  const [customInput, setCustomInput] = useState("");
  const [sendingSuggestion, setSendingSuggestion] = useState(false);
  const [suggestionSent, setSuggestionSent] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedItems = useMemo(() => parseCsv(value), [value]);

  const selectedCount = selectedItems.length;

  const allSelected =
    subcategories.length > 0 &&
    selectedCount === subcategories.length;

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

  useEffect(() => {
    if (!open || !wrapperRef.current) return;

    const rect = wrapperRef.current.getBoundingClientRect();

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    setOpenUpward(spaceBelow < 260 && spaceAbove > spaceBelow);
  }, [open, subcategories.length]);

  function toggleItem(name: string) {
    const next = selectedItems.includes(name)
      ? selectedItems.filter(item => item !== name)
      : Array.from(new Set([...selectedItems, name]));

    onChange(next.join(","));
  }

  function toggleAll() {
    onChange(
      allSelected
        ? ""
        : subcategories.map(item => item.name).join(",")
    );
  }

  async function handleSuggestSubcategory() {
    const clean = customInput.trim();

    if (!clean || clean.length < 3 || !parentIndustry) {
      return;
    }

    setSendingSuggestion(true);

    try {
      await sendIndustrySuggestion({
        name: clean,
        type: "subindustry",
        parentIndustry,
      });

      setSuggestionSent(true);
      setCustomInput("");

    } catch {
      // silencioso
    } finally {
      setSendingSuggestion(false);
    }
  }

  if (!subcategories.length) return null;

  return (
    <div className="grid gap-2" ref={wrapperRef}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">
          Tipos específicos{" "}
          <span className="font-normal">
            (puedes elegir varios)
          </span>
        </Label>

        <button
          type="button"
          className="text-[11px] text-primary hover:underline"
          onClick={toggleAll}
        >
          {allSelected
            ? "Quitar todas"
            : "Seleccionar todas"}
        </button>
      </div>

      <div className="relative z-20">
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={
              selectedCount
                ? "text-foreground"
                : "text-muted-foreground"
            }
          >
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
          <div
            className={`absolute left-0 z-[9999] w-full rounded-xl border border-border bg-popover p-2 shadow-xl ${
              openUpward
                ? "bottom-full mb-2"
                : "top-full mt-2"
            }`}
          >
            <div className="max-h-56 overflow-x-visible overflow-y-auto space-y-1">
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
                      {selected && (
                        <Check className="h-3 w-3" />
                      )}
                    </span>

                    <span className="flex-1">
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 border-t border-border pt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Plus className="w-3 h-3" />
                ¿No encuentras tu subcategoría?
              </div>

              <div className="flex gap-2">
                <Input
                  value={customInput}
                  onChange={e => {
                    setCustomInput(e.target.value);
                    setSuggestionSent(false);
                  }}
                  placeholder="Ej: Relojes de lujo..."
                  className="h-9 text-sm"
                />

                <button
                  type="button"
                  onClick={handleSuggestSubcategory}
                  disabled={
                    sendingSuggestion ||
                    customInput.trim().length < 3
                  }
                  className="inline-flex items-center justify-center rounded-md border border-primary/30 bg-primary/10 px-3 text-primary hover:bg-primary/15 disabled:opacity-50"
                >
                  {sendingSuggestion ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>

              {suggestionSent && (
                <p className="text-[11px] text-primary">
                  Gracias 🙌 Revisaremos esta subcategoría.
                </p>
              )}
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