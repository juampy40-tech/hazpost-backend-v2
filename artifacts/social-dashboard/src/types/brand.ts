export interface BrandProfile {
  companyName?: string;
  slogan?: string;
  industry?: string;
  subIndustry?: string;
  country?: string;
  city?: string;
  website?: string;
  logoUrl?: string;
  logoUrls?: string;
  primaryColor?: string;
  secondaryColor?: string;
  businessDescription?: string;
  brandFont?: string;
  brandFontUrl?: string;
  customFonts?: string;
  audienceDescription?: string;
  brandTone?: string;
  referenceImages?: string;
  onboardingStep?: number;
  onboardingCompleted?: boolean | string;
  aiGenFrequency?: string;
}

export interface IndustryCatalogEntry {
  name: string;
  slug?: string;
  subcategories: {
    name: string;
    slug: string;
  }[];
}
