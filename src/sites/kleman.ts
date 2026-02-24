import { SiteAdapter, ScrapingResult, Product, SizeGuide, SizeRow } from '../types';
import { newPage } from '../browser';

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  tags: string[];
  variants: { title: string; option1: string; available: boolean }[];
  options: { name: string; values: string[] }[];
}

async function fetchAllProducts(baseUrl: string): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(`${baseUrl}/products.json?limit=250&page=${page}`);
    if (!res.ok) break;

    const data = (await res.json()) as { products: ShopifyProduct[] };
    if (!data.products || data.products.length === 0) break;

    products.push(...data.products);
    if (data.products.length < 250) break;
    page++;
  }

  return products;
}

function detectGender(product: ShopifyProduct): string {
  const text = `${product.title} ${product.tags.join(' ')} ${product.product_type}`.toLowerCase();
  if (text.includes('femme') || text.includes('woman') || text.includes('women')) return 'Femme';
  if (text.includes('homme') || text.includes('man') || text.includes('men')) return 'Homme';
  return 'Unisex';
}

function detectType(product: ShopifyProduct): string {
  const text = `${product.title} ${product.product_type}`.toLowerCase();
  if (text.includes('boot') || text.includes('botte')) return 'Boots';
  if (text.includes('sandal')) return 'Sandals';
  if (text.includes('basket') || text.includes('sneaker')) return 'Sneakers';
  return 'Shoes';
}

async function findSizeGuides(productUrl: string): Promise<SizeGuide[]> {
  const page = await newPage();
  const guides: SizeGuide[] = [];

  try {
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 20000 });

    // The size guide data is already in the DOM (hidden panels).
    // Kleman uses div-based tables with class "size-guide-table",
    // NOT HTML <table> elements.

    // Get titles to know which guide is which (Homme/Femme)
    const titles = await page.locator('.panel-size-guide__table-title').allTextContents();
    const containers = await page.locator('.size-guide-table').all();

    console.log(`   Found ${containers.length} size guide tables: ${titles.join(', ')}`);

    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      const title = titles[i] || `Guide ${i + 1}`;

      // Get the header labels (EU, UK, US, CM, Pouces)
      const headerItems = await container.locator('.size-guide-table__content__item').allTextContents();
      const cleaned = headerItems.map((t) => t.trim()).filter((t) => t.length > 0);

      if (cleaned.length === 0) continue;

      // First N items are the column headers, then the rest is data in row-major order
      // Headers: EU, UK, US, CM, Pouces (5 columns)
      const headers = findHeaders(cleaned);
      const numCols = headers.length;

      if (numCols === 0) continue;

      // Find where data starts (after the header row)
      const headerEndIdx = numCols;
      const dataItems = cleaned.slice(headerEndIdx);

      // Group data into rows
      const numRows = Math.floor(dataItems.length / numCols);
      const sizeRows: SizeRow[] = [];

      for (let h = 0; h < numCols; h++) {
        const label = headers[h];
        const values: string[] = [];
        for (let r = 0; r < numRows; r++) {
          values.push(dataItems[r * numCols + h]);
        }
        sizeRows.push({
          label: getLongLabel(label),
          shortLabel: label,
          values,
        });
      }

      if (sizeRows.length > 0) {
        const guideId = i + 1;
        const genderSuffix = title.toLowerCase().includes('femme') ? ' (Femme)' : title.toLowerCase().includes('homme') ? ' (Homme)' : '';
        guides.push({
          id: guideId,
          brand: `Kleman${genderSuffix}`,
          url: productUrl,
          rows: sizeRows,
        });
      }
    }
  } catch (err) {
    console.log(`  ⚠️ Error: ${(err as Error).message}`);
  } finally {
    await page.close();
  }

  return guides;
}

function findHeaders(items: string[]): string[] {
  // Known header labels
  const knownHeaders = ['EU', 'UK', 'US', 'CM', 'Pouces'];
  const headers: string[] = [];

  for (const item of items) {
    if (knownHeaders.includes(item)) {
      headers.push(item);
    } else {
      break; // Data starts
    }
  }

  return headers;
}

function getLongLabel(short: string): string {
  switch (short) {
    case 'EU': return 'Europe';
    case 'UK': return 'Royaume-Uni';
    case 'US': return 'Etats-Unis';
    case 'CM': return 'Longueur pied (cm)';
    case 'Pouces': return 'Longueur pied (pouces)';
    default: return short;
  }
}

export const klemanAdapter: SiteAdapter = {
  matches(url: string): boolean {
    return url.includes('kleman-france.com') || url.includes('kleman.com');
  },

  async scrape(url: string): Promise<ScrapingResult> {
    console.log('📦 Fetching products from Shopify API...');
    const shopifyProducts = await fetchAllProducts(url);
    console.log(`   Found ${shopifyProducts.length} products`);

    const products: Product[] = shopifyProducts.map((p) => ({
      name: p.title,
      gender: detectGender(p),
      type: detectType(p),
      url: `${url}/products/${p.handle}`,
      sizeGuideId: null,
    }));

    // Find size guides on a sample product page
    console.log('\n🔍 Looking for size guides on a product page...');
    const sampleUrl = products[0]?.url;
    let sizeGuides: SizeGuide[] = [];

    if (sampleUrl) {
      console.log(`   Checking: ${sampleUrl}`);
      sizeGuides = await findSizeGuides(sampleUrl);

      if (sizeGuides.length > 0) {
        console.log(`   ✅ Found ${sizeGuides.length} size guide(s)!`);
        // Assign guide IDs to products based on gender
        for (const product of products) {
          const matchingGuide = sizeGuides.find((g) => {
            if (g.brand.includes('Homme') && product.gender === 'Homme') return true;
            if (g.brand.includes('Femme') && product.gender === 'Femme') return true;
            if (!g.brand.includes('Homme') && !g.brand.includes('Femme')) return true;
            return false;
          });
          product.sizeGuideId = matchingGuide?.id ?? sizeGuides[0].id;
        }
      }
    }

    return { products, sizeGuides };
  },
};
