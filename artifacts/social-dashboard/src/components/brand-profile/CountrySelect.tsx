import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Search } from "lucide-react";

type CountryOption = {
  name: string;
  code: string;
  flag: string;
};

const COUNTRY_CODES = [
  "AF", "AX", "AL", "DZ", "AS", "AD", "AO", "AI", "AQ", "AG", "AR", "AM", "AW", "AU", "AT", "AZ",
  "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BM", "BT", "BO", "BQ", "BA", "BW", "BV", "BR", "IO", "BN", "BG", "BF", "BI",
  "CV", "KH", "CM", "CA", "KY", "CF", "TD", "CL", "CN", "CX", "CC", "CO", "KM", "CG", "CD", "CK", "CR", "CI", "HR", "CU", "CW", "CY", "CZ",
  "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET", "FK", "FO", "FJ", "FI", "FR", "GF", "PF", "TF",
  "GA", "GM", "GE", "DE", "GH", "GI", "GR", "GL", "GD", "GP", "GU", "GT", "GG", "GN", "GW", "GY",
  "HT", "HM", "VA", "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IM", "IL", "IT", "JM", "JP", "JE", "JO",
  "KZ", "KE", "KI", "KP", "KR", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MO", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX", "FM", "MD", "MC", "MN", "ME", "MS", "MA", "MZ", "MM",
  "NA", "NR", "NP", "NL", "NC", "NZ", "NI", "NE", "NG", "NU", "NF", "MK", "MP", "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH", "PN", "PL", "PT", "PR",
  "QA", "RE", "RO", "RU", "RW", "BL", "SH", "KN", "LC", "MF", "PM", "VC", "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SX", "SK", "SI", "SB", "SO", "ZA", "GS", "SS", "ES", "LK", "SD", "SR", "SJ", "SE", "CH", "SY",
  "TW", "TJ", "TZ", "TH", "TL", "TG", "TK", "TO", "TT", "TN", "TR", "TM", "TC", "TV", "UG", "UA", "AE", "GB", "US", "UM", "UY", "UZ", "VU", "VE", "VN", "VG", "VI", "WF", "EH", "YE", "ZM", "ZW",
] as const;

function countryCodeToFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return code
    .split("")
    .map(char => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function buildCountryList(): CountryOption[] {
  let displayNames: { of: (code: string) => string | undefined } | null = null;

  try {
    const IntlWithDisplayNames = Intl as typeof Intl & {
      DisplayNames?: new (locales: string[], options: { type: "region" }) => { of: (code: string) => string | undefined };
    };

    displayNames = IntlWithDisplayNames.DisplayNames
      ? new IntlWithDisplayNames.DisplayNames(["es"], { type: "region" })
      : null;
  } catch {
    displayNames = null;
  }

  const list = COUNTRY_CODES.map(code => ({
    code,
    name: displayNames?.of(code) || code,
    flag: countryCodeToFlag(code),
  }))
    .filter(country => country.name && country.name !== country.code)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return [...list, { name: "Otro", code: "OT", flag: "🌍" }];
}

const COUNTRIES = buildCountryList();

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function CountrySelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (countryName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedCountry = COUNTRIES.find(country => country.name === value);
  const normalizedQuery = normalizeSearchText(query);

  const filteredCountries = normalizedQuery
    ? COUNTRIES.filter(country =>
        normalizeSearchText(`${country.name} ${country.code}`).includes(normalizedQuery)
      ).slice(0, 60)
    : COUNTRIES.slice(0, 12);

  useEffect(() => {

    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pickCountry(country: CountryOption) {
    onChange(country.name);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background transition-all hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={selectedCountry ? "flex items-center gap-2 text-foreground" : "text-muted-foreground"}>
          {selectedCountry ? (
            <>
              <span className="text-lg leading-none">{selectedCountry.flag}</span>
              <span>{selectedCountry.name}</span>
            </>
          ) : (
            "Selecciona un país..."
          )}
        </span>
        <Globe className="h-4 w-4 text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[9999] bottom-full mb-2 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-xl"
          >
            <div className="border-b border-border p-2">
              <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  type="text"
                  role="combobox"
                  inputMode="search"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  name="hazpost-country-search-field"
                  id="hazpost-country-search-field"
                  data-lpignore="true"
                  data-form-type="other"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar país..."
                  className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                HazPost usa país y ciudad para adaptar idioma, cultura, horarios y contexto del contenido.
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto p-1">
              {filteredCountries.length > 0 ? (
                filteredCountries.map(country => {
                  const selected = country.name === value;

                  return (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => pickCountry(country)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg leading-none">{country.flag}</span>
                        <span>{country.name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{country.code}</span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No encontramos ese país. Puedes elegir “Otro”.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CountrySelect;
