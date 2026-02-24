export interface Product {
  name: string;
  gender: string;
  type: string;
  url: string;
  sizeGuideId: number | null;
}

export interface SizeRow {
  label: string;
  shortLabel: string;
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
