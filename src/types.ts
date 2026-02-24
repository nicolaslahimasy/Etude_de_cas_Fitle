export interface Product {
  name: string;
  gender: string;
  type: string;
  url: string;
  sizeGuideId: number | null;
}

export interface SizeRow {
  /** Full label e.g. "Europe", "Royaume-Uni", "Longueur pied" */
  label: string;
  /** Short label e.g. "EU", "UK", "US" */
  shortLabel: string;
  /** Size values for each column */
  values: string[];
}

export interface SizeGuide {
  id: number;
  brand: string;
  url: string;
  rows: SizeRow[];
}

export interface ScrapingResult {
  products: Product[];
  sizeGuides: SizeGuide[];
}

export interface SiteAdapter {
  /** Detect if this adapter handles the given URL */
  matches(url: string): boolean;
  /** Scrape products and size guides from the site */
  scrape(url: string): Promise<ScrapingResult>;
}
