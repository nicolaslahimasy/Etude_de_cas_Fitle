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
  if (text.includes('enfant') || text.includes('kid')) return 'Enfant';
  return 'Unisex';
}

function detectType(product: ShopifyProduct): string {
  const text = `${product.title} ${product.product_type}`.toLowerCase();
  if (text.includes('botte') || text.includes('boot')) return 'Boots';
  if (text.includes('bottine')) return 'Ankle Boots';
  if (text.includes('sandal') || text.includes('sandale')) return 'Sandals';
  if (text.includes('basket') || text.includes('sneaker')) return 'Sneakers';
  if (text.includes('mocassin') || text.includes('loafer')) return 'Loafers';
  if (text.includes('derby')) return 'Derby';
  if (text.includes('espadrille')) return 'Espadrilles';
  if (text.includes('ceinture') || text.includes('belt')) return 'Belt';
  if (text.includes('sac') || text.includes('bag')) return 'Bag';
  return product.product_type || 'Shoes';
}

async function findSizeGuideOnPages(baseUrl: string, productUrls: string[]): Promise<SizeGuide | null> {
  // Try common size guide page URLs first
  const commonPaths = [
    '/pages/guide-des-tailles',
    '/pages/size-guide',
    '/pages/guide-taille',
    '/pages/guide-des-pointures',
  ];

  for (const path of commonPaths) {
    const page = await newPage();
    try {
      const res = await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      if (res && res.status() < 400) {
        const tables = await page.locator('table').all();
        for (const table of tables) {
          const text = await table.textContent();
          if (text && (text.includes('EU') || text.includes('UK') || text.includes('cm'))) {
            console.log(`   Found size guide at ${baseUrl}${path}`);
            return await parseTable(table, `${baseUrl}${path}`);
          }
        }
      }
    } catch {} finally {
      await page.close();
    }
  }

  // Try product pages
  for (const url of productUrls.slice(0, 3)) {
    const page = await newPage();
    try {
      console.log(`   Checking: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

      // Try clicking size guide triggers
      const triggers = [
        'text=/guide des tailles/i',
        'text=/size guide/i',
        'text=/correspondance/i',
        '[class*="size-guide"]',
      ];

      for (const sel of triggers) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1000 })) {
            await el.click();
            await page.waitForTimeout(1500);
            break;
          }
        } catch { continue; }
      }

      // Check for tables
      const tables = await page.locator('table').all();
      for (const table of tables) {
        const text = await table.textContent();
        if (text && (text.includes('EU') || text.includes('UK') || text.includes('cm'))) {
          return await parseTable(table, url);
        }
      }

      // Check for custom div-based size guides (like Kleman)
      const sizeContainers = await page.locator('[class*="size-guide"], [class*="size_guide"], [class*="taille"]').all();
      if (sizeContainers.length > 0) {
        console.log(`   Found ${sizeContainers.length} size-related containers`);
      }
    } catch {} finally {
      await page.close();
    }
  }

  return null;
}

async function parseTable(table: any, url: string): Promise<SizeGuide | null> {
  const rows = await table.locator('tr').all();
  if (rows.length === 0) return null;

  const sizeRows: SizeRow[] = [];

  for (const row of rows) {
    const cells = await row.locator('td, th').allTextContents();
    if (cells.length < 2) continue;

    const label = cells[0].trim();
    const values = cells.slice(1).map((c: string) => c.trim()).filter((c: string) => c.length > 0);
    if (values.length === 0) continue;

    sizeRows.push({
      label: getLongLabel(label),
      shortLabel: getShortLabel(label),
      values,
    });
  }

  if (sizeRows.length === 0) return null;

  return { id: 1, brand: 'La Botte Gardiane', url, rows: sizeRows };
}

function getShortLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('europe') || lower === 'eu') return 'EU';
  if (lower.includes('royaume') || lower.includes('uk')) return 'UK';
  if (lower.includes('etats') || lower.includes('us')) return 'US';
  if (lower.includes('longueur') || lower.includes('cm')) return 'cm';
  return label;
}

function getLongLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'eu') return 'Europe';
  if (lower === 'uk') return 'Royaume-Uni';
  if (lower === 'us') return 'Etats-Unis';
  return label;
}

export const labottegardiane: SiteAdapter = {
  matches(url: string): boolean {
    return url.includes('labottegardiane.com');
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

    // Try to find size guide
    console.log('\n🔍 Looking for size guide...');
    const sizeGuide = await findSizeGuideOnPages(url, products.map((p) => p.url));
    const sizeGuides: SizeGuide[] = [];

    if (sizeGuide) {
      sizeGuides.push(sizeGuide);
      products.forEach((p) => (p.sizeGuideId = 1));
      console.log('   ✅ Found size guide!');
    } else {
      console.log('   ⚠️ No size guide found on this site');
    }

    return { products, sizeGuides };
  },
};
