import React, { useEffect, useState } from "react";

import { Globe } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import CountrySelect from "@/components/brand-profile/CountrySelect";
import SubIndustryMultiSelect from "@/components/brand-profile/SubIndustryMultiSelect";

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
          <SubIndustryMultiSelect
               value={data.subIndustry ?? ""}
               subcategories={subcategories}
               onChange={subIndustry => onChange({ subIndustry })}
          />
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
