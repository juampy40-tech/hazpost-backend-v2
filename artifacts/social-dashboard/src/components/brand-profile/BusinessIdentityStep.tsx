import React, { useEffect, useState } from "react";

import { Globe } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import CountrySelect from "@/components/brand-profile/CountrySelect";

import {
  fetchIndustryCatalog,
} from "@/lib/industryCatalog";

import type {
  BrandProfile,
  IndustryCatalogEntry,
} from "@/types/brand";

const OTRA_INDUSTRIA = "__otra__";

function Step1({
  data, onChange,
}: {
  data: BrandProfile;
  onChange: (d: Partial<BrandProfile>) => void;
}) {
  const [catalog, setCatalog] = useState<IndustryCatalogEntry[]>([]);
  const [selectValue, setSelectValue] = useState<string>("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoadingCatalog(true);

    fetchIndustryCatalog()
      .then(cat => {
        if (!mounted) return;
        setCatalog(cat);
        setCatalogError(null);

        if (data.industry) {
          const found = cat.find(e => e.name === data.industry);
          setSelectValue(found ? data.industry : OTRA_INDUSTRIA);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setCatalog([]);
        setCatalogError("No pudimos cargar la lista de industrias. Puedes escribirla manualmente en 'Otra industria'.");
      })
      .finally(() => {
        if (mounted) setLoadingCatalog(false);
      });

    return () => { mounted = false; };
  }, []);

  function handleSelectChange(val: string) {
    setSelectValue(val);
    if (val === OTRA_INDUSTRIA) {
      onChange({ industry: "", subIndustry: "" });
    } else {
      onChange({ industry: val, subIndustry: "" });
    }
  }

  const isOtra = selectValue === OTRA_INDUSTRIA;
  const selectedEntry = catalog.find(e => e.name === data.industry);
  const subcategories = (!isOtra && selectedEntry) ? selectedEntry.subcategories : [];

  const SELECT_CLS = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Cuéntanos sobre tu negocio</h2>
        <p className="text-muted-foreground">
          Esta información ayuda a HazPost a crear contenido alineado con tu marca, tu estilo y tus objetivos.
        </p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>Nombre de la empresa <span className="text-muted-foreground font-normal">(recomendado)</span></Label>
          <Input
            value={data.companyName ?? ""}
            onChange={e => onChange({ companyName: e.target.value })}
            placeholder="Ej: Acme Studio, BrandNova, TuMarca..."
          />
        </div>

        <div className="grid gap-2">
          <Label>
            Slogan del negocio <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            value={data.slogan ?? ""}
            onChange={e => onChange({ slogan: e.target.value.slice(0, 150) })}
            placeholder="Ej: Creamos experiencias únicas, Moda que inspira, Soluciones digitales para crecer..."
            maxLength={150}
          />
          <p className="text-[11px] text-muted-foreground/70 leading-tight">
            Esto ayuda a que el contenido tenga una voz más coherente con tu marca. Máximo 150 caracteres.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>
              Industria <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>

            <select
              value={selectValue}
              onChange={e => handleSelectChange(e.target.value)}
              className={SELECT_CLS}
              disabled={loadingCatalog}
            >
              <option value="">
                {loadingCatalog ? "Cargando industrias..." : "Selecciona una industria..."}
              </option>
              {catalog.map(e => (
                <option key={e.slug ?? e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
              <option value={OTRA_INDUSTRIA}>Otra industria</option>
            </select>

            {catalogError && (
              <p className="text-[11px] text-destructive/80 leading-tight">
                {catalogError}
              </p>
            )}

            {isOtra && (
              <Input
                value={data.industry ?? ""}
                onChange={e => onChange({ industry: e.target.value })}
                placeholder="Ej: Relojería, Club de ventas, Importadora..."
                autoFocus
              />
            )}

     {!isOtra && subcategories.length > 0 && (
          <div className="grid gap-2">
               <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">
                         Tipos específicos <span className="font-normal">(puedes elegir varios)</span>
                    </Label>

                    <button
                         type="button"
                         className="text-[11px] text-primary hover:underline"
                         onClick={() =>
                              onChange({
                                   subIndustry:
                                        (data.subIndustry ?? "").split(",").map(x => x.trim()).filter(Boolean).length === subcategories.length
                                             ? ""
                                             : subcategories.map(s => s.name).join(","),
                              })
                         }
                    >
                         {(data.subIndustry ?? "").split(",").map(x => x.trim()).filter(Boolean).length === subcategories.length
                              ? "Quitar todas"
                              : "Seleccionar todas"}
                    </button>
               </div>

               <details className="group relative">
                    <summary className="flex min-h-10 w-full cursor-pointer list-none items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                         <span className={(data.subIndustry ?? "").trim() ? "text-foreground" : "text-muted-foreground"}>
                              {(data.subIndustry ?? "").trim()
                                   ? `${(data.subIndustry ?? "").split(",").map(x => x.trim()).filter(Boolean).length} seleccionado(s)`
                                   : "Selecciona tipos específicos..."}
                         </span>

                         <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">
                              ⌄
                         </span>
                    </summary>

                    <div className="absolute z-[9999] mt-2 w-full rounded-xl border border-border bg-popover p-2 shadow-xl">
                         <div className="max-h-56 overflow-y-auto space-y-1">
                              {subcategories.map(s => {
                                   const selected = (data.subIndustry ?? "")
                                        .split(",")
                                        .map(x => x.trim())
                                        .filter(Boolean)
                                        .includes(s.name);

                                   return (
                                        <label
                                             key={s.slug}
                                             className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                                                  selected
                                                       ? "bg-primary/10 text-primary"
                                                       : "hover:bg-muted text-foreground"
                                             }`}
                                        >
                                             <input
                                                  type="checkbox"
                                                  checked={selected}
                                                  onChange={e => {
                                                       const current = (data.subIndustry ?? "")
                                                            .split(",")
                                                            .map(x => x.trim())
                                                            .filter(Boolean);

                                                       const next = e.target.checked
                                                            ? Array.from(new Set([...current, s.name]))
                                                            : current.filter(x => x !== s.name);

                                                       onChange({ subIndustry: next.join(",") });
                                                  }}
                                                  className="h-4 w-4"
                                             />

                                             <span>{s.name}</span>
                                        </label>
                                   );
                              })}
                         </div>
                    </div>
               </details>

               {(data.subIndustry ?? "").trim() && (
                    <p className="text-[11px] text-muted-foreground/80 leading-tight">
                         Seleccionado: {(data.subIndustry ?? "").split(",").map(x => x.trim()).filter(Boolean).join(", ")}
                    </p>
               )}
          </div>
     )}

            <p className="text-[11px] text-muted-foreground/70 leading-tight">
              Nos ayuda a adaptar el contenido a tu industria y mejorar los resultados desde el primer día.
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>País <span className="text-muted-foreground font-normal">(recomendado)</span></Label>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Global
              </span>
            </div>
            <CountrySelect
              value={data.country ?? ""}
              onChange={country => onChange({ country })}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Ciudad <span className="text-muted-foreground font-normal">(recomendado)</span></Label>
          <Input
            value={data.city ?? ""}
            onChange={e => onChange({ city: e.target.value })}
            placeholder="Ej: Bogotá, Ciudad de México, Madrid..."
          />
        </div>

        <div className="grid gap-2">
          <Label>
            Sitio web <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>

          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              value={data.website ?? ""}
              onChange={e => onChange({ website: e.target.value })}
              placeholder="Ej: https://tumarca.com"
              className="flex-1 min-w-0"
            />
          </div>

          <p className="text-[11px] text-muted-foreground/70 leading-tight">
            Si agregas tu sitio web, HazPost podrá entender mejor tu negocio, tus productos y el estilo de tu marca.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Step1;
