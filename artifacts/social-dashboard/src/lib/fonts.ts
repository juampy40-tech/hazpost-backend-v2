export interface FontEntry {
  key: string;
  label: string;
  family: string;
  category: "display" | "sans" | "serif" | "script" | "handwriting" | "tech";
}

export const FONT_CATALOG: FontEntry[] = [
  // ── Display / Condensed ───────────────────────────────────────────────────
  { key: "bebas",        label: "BEBAS",            family: "'Bebas Neue', Impact, sans-serif",            category: "display" },
  { key: "anton",        label: "ANTON",            family: "'Anton', Impact, sans-serif",                 category: "display" },
  { key: "fjalla",       label: "Fjalla",           family: "'Fjalla One', Impact, sans-serif",            category: "display" },
  { key: "oswald",       label: "Oswald",           family: "'Oswald', Impact, sans-serif",               category: "display" },
  { key: "barlow",       label: "Barlow Cond",      family: "'Barlow Condensed', Arial, sans-serif",       category: "display" },
  { key: "unbounded",    label: "UNBOUNDED",        family: "'Unbounded', sans-serif",                    category: "display" },
  { key: "russoone",     label: "Russo One",        family: "'Russo One', sans-serif",                    category: "display" },
  { key: "blackhansans", label: "Black Han",        family: "'Black Han Sans', sans-serif",               category: "display" },
  { key: "teko",         label: "Teko",             family: "'Teko', sans-serif",                         category: "display" },
  { key: "abrilfatface", label: "Abril Fatface",    family: "'Abril Fatface', cursive",                   category: "display" },
  { key: "righteous",    label: "Righteous",        family: "'Righteous', sans-serif",                    category: "display" },
  { key: "delagothic",   label: "Dela Gothic",      family: "'Dela Gothic One', sans-serif",              category: "display" },
  { key: "bungee",       label: "Bungee",           family: "'Bungee', sans-serif",                       category: "display" },
  { key: "leaguespartan",label: "League Spartan",   family: "'League Spartan', sans-serif",               category: "display" },
  { key: "graduate",     label: "Graduate",         family: "'Graduate', serif",                          category: "display" },
  { key: "squadaone",    label: "Squada One",       family: "'Squada One', sans-serif",                   category: "display" },

  // ── Sans-serif moderno ───────────────────────────────────────────────────
  { key: "montserrat",   label: "Eco ★",            family: "'Montserrat', 'Helvetica Neue', sans-serif", category: "sans" },
  { key: "inter",        label: "Inter",            family: "'Inter', 'Helvetica Neue', sans-serif",      category: "sans" },
  { key: "poppins",      label: "Poppins",          family: "'Poppins', sans-serif",                      category: "sans" },
  { key: "raleway",      label: "Raleway",          family: "'Raleway', sans-serif",                      category: "sans" },
  { key: "lato",         label: "Lato",             family: "'Lato', sans-serif",                         category: "sans" },
  { key: "jakarta",      label: "Plus Jakarta",     family: "'Plus Jakarta Sans', sans-serif",            category: "sans" },
  { key: "dmsans",       label: "DM Sans",          family: "'DM Sans', sans-serif",                      category: "sans" },
  { key: "spacegrotesk", label: "Space Grotesk",    family: "'Space Grotesk', sans-serif",                category: "sans" },
  { key: "syne",         label: "Syne",             family: "'Syne', sans-serif",                         category: "sans" },
  { key: "outfit",       label: "Outfit",           family: "'Outfit', sans-serif",                       category: "sans" },
  { key: "roboto",       label: "Roboto",           family: "'Roboto', sans-serif",                       category: "sans" },
  { key: "opensans",     label: "Open Sans",        family: "'Open Sans', sans-serif",                    category: "sans" },
  { key: "sourcesans3",  label: "Source Sans 3",    family: "'Source Sans 3', sans-serif",                category: "sans" },
  { key: "nunito",       label: "Nunito",           family: "'Nunito', sans-serif",                       category: "sans" },
  { key: "ubuntu",       label: "Ubuntu",           family: "'Ubuntu', sans-serif",                       category: "sans" },
  { key: "notosans",     label: "Noto Sans",        family: "'Noto Sans', sans-serif",                    category: "sans" },
  { key: "firasans",     label: "Fira Sans",        family: "'Fira Sans', sans-serif",                    category: "sans" },
  { key: "worksans",     label: "Work Sans",        family: "'Work Sans', sans-serif",                    category: "sans" },
  { key: "barlowreg",    label: "Barlow",           family: "'Barlow', sans-serif",                       category: "sans" },
  { key: "quicksand",    label: "Quicksand",        family: "'Quicksand', sans-serif",                    category: "sans" },
  { key: "josefin",      label: "Josefin Sans",     family: "'Josefin Sans', sans-serif",                 category: "sans" },
  { key: "exo2",         label: "Exo 2",            family: "'Exo 2', sans-serif",                        category: "sans" },
  { key: "titillium",    label: "Titillium Web",    family: "'Titillium Web', sans-serif",                category: "sans" },
  { key: "yanone",       label: "Yanone",           family: "'Yanone Kaffeesatz', sans-serif",            category: "sans" },
  { key: "cabin",        label: "Cabin",            family: "'Cabin', sans-serif",                        category: "sans" },
  { key: "cooper",       label: "Cooper Hewitt",    family: "'Cooper Hewitt', sans-serif",                category: "sans" },
  { key: "sora",         label: "Sora",             family: "'Sora', sans-serif",                         category: "sans" },
  { key: "manrope",      label: "Manrope",          family: "'Manrope', sans-serif",                      category: "sans" },
  { key: "lexend",       label: "Lexend",           family: "'Lexend', sans-serif",                       category: "sans" },
  { key: "figtree",      label: "Figtree",          family: "'Figtree', sans-serif",                      category: "sans" },
  { key: "hankengrotesk",label: "Hanken Grotesk",   family: "'Hanken Grotesk', sans-serif",               category: "sans" },
  { key: "albertsans",   label: "Albert Sans",      family: "'Albert Sans', sans-serif",                  category: "sans" },
  { key: "urbanist",     label: "Urbanist",         family: "'Urbanist', sans-serif",                     category: "sans" },
  { key: "ptsans",       label: "PT Sans",          family: "'PT Sans', sans-serif",                      category: "sans" },
  { key: "bricolage",    label: "Bricolage",        family: "'Bricolage Grotesque', sans-serif",          category: "sans" },
  { key: "instrumentsans",label: "Instrument Sans", family: "'Instrument Sans', sans-serif",              category: "sans" },
  { key: "onest",        label: "Onest",            family: "'Onest', sans-serif",                        category: "sans" },
  { key: "karla",        label: "Karla",            family: "'Karla', sans-serif",                        category: "sans" },
  { key: "chivo",        label: "Chivo",            family: "'Chivo', sans-serif",                        category: "sans" },

  // ── Serif ────────────────────────────────────────────────────────────────
  { key: "playfair",     label: "Playfair",         family: "'Playfair Display', Georgia, serif",         category: "serif" },
  { key: "cinzel",       label: "CINZEL",           family: "'Cinzel', Georgia, serif",                   category: "serif" },
  { key: "fraunces",     label: "Fraunces",         family: "'Fraunces', serif",                          category: "serif" },
  { key: "baskerville",  label: "Baskerville",      family: "'Libre Baskerville', serif",                 category: "serif" },
  { key: "merriweather", label: "Merriweather",     family: "'Merriweather', serif",                      category: "serif" },
  { key: "crimson",      label: "Crimson Text",     family: "'Crimson Text', serif",                      category: "serif" },
  { key: "ebgaramond",   label: "EB Garamond",      family: "'EB Garamond', serif",                       category: "serif" },
  { key: "bitter",       label: "Bitter",           family: "'Bitter', serif",                            category: "serif" },
  { key: "arvo",         label: "Arvo",             family: "'Arvo', serif",                              category: "serif" },
  { key: "creteround",   label: "Crete Round",      family: "'Crete Round', serif",                       category: "serif" },
  { key: "electra",      label: "Electra",          family: "'Electra', Georgia, serif",                  category: "serif" },
  { key: "cormorant",    label: "Cormorant",        family: "'Cormorant Garamond', Georgia, serif",       category: "serif" },
  { key: "italiana",     label: "Italiana",         family: "'Italiana', serif",                          category: "serif" },
  { key: "spectral",     label: "Spectral",         family: "'Spectral', serif",                          category: "serif" },
  { key: "lora",         label: "Lora",             family: "'Lora', serif",                              category: "serif" },
  { key: "bodonimoda",   label: "Bodoni Moda",      family: "'Bodoni Moda', serif",                       category: "serif" },
  { key: "dmserif",      label: "DM Serif",         family: "'DM Serif Display', serif",                  category: "serif" },
  { key: "yesevaone",    label: "Yeseva One",       family: "'Yeseva One', serif",                        category: "serif" },
  { key: "zillaslab",    label: "Zilla Slab",       family: "'Zilla Slab', serif",                        category: "serif" },

  // ── Script / Cursiva ─────────────────────────────────────────────────────
  { key: "pacifico",       label: "Pacifico",       family: "'Pacifico', cursive",                        category: "script" },
  { key: "lobster",        label: "Lobster",        family: "'Lobster', cursive",                         category: "script" },
  { key: "dancingscript",  label: "Dancing Script", family: "'Dancing Script', cursive",                  category: "script" },
  { key: "greatvibes",     label: "Great Vibes",    family: "'Great Vibes', cursive",                     category: "script" },
  { key: "sacramento",     label: "Sacramento",     family: "'Sacramento', cursive",                      category: "script" },
  { key: "satisfy",        label: "Satisfy",        family: "'Satisfy', cursive",                         category: "script" },
  { key: "kaushan",        label: "Kaushan Script", family: "'Kaushan Script', cursive",                  category: "script" },
  { key: "allura",         label: "Allura",         family: "'Allura', cursive",                          category: "script" },

  // ── Handwriting casual ───────────────────────────────────────────────────
  { key: "caveat",              label: "Caveat",             family: "'Caveat', cursive",                       category: "handwriting" },
  { key: "architectsdaughter", label: "Architects Daughter",family: "'Architects Daughter', cursive",           category: "handwriting" },
  { key: "indieflower",         label: "Indie Flower",       family: "'Indie Flower', cursive",                 category: "handwriting" },

  // ── Tech / Futurista ─────────────────────────────────────────────────────
  { key: "orbitron",     label: "Orbitron",         family: "'Orbitron', sans-serif",                     category: "tech" },
  { key: "chakrapetch",  label: "Chakra Petch",     family: "'Chakra Petch', sans-serif",                 category: "tech" },
  { key: "audiowide",    label: "Audiowide",        family: "'Audiowide', sans-serif",                    category: "tech" },
];

export const FONT_NAMES: string[] = FONT_CATALOG.map(f => {
  const familyName = f.family.split(",")[0].replace(/'/g, "").trim();
  return familyName;
});
