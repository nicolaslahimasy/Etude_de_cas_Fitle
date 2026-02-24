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
  if (text.includes('sandal') || text.includes('sandale')) return 'Sandals';
  if (text.includes('basket') || text.includes('sneaker')) return 'Sneakers';
  if (text.includes('mocassin') || text.includes('loafer')) return 'Loafers';
  if (text.includes('espadrille')) return 'Espadrilles';
  if (text.includes('derby')) return 'Derby';
  if (text.includes('ceinture') || text.includes('belt')) return 'Belt';
  if (text.includes('sac') || text.includes('bag')) return 'Bag';
  return product.product_type || 'Shoes';
}

async function findSizeGuideOnPage(productUrl: string): Promise<SizeGuide | null> {
  const page = await newPage();

  try {
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 15000 });

    // Look for size guide triggers
    const triggers = [
      'text=/guide des tailles/i',
      'text=/size guide/i',
      'text=/guide de taille/i',
      'text=/guide des pointures/i',
      '[class*="size-guide"]',
      '[class*="size_guide"]',
      '[href*="size-guide"]',
      '[href*="guide-taille"]',
    ];

    for (const selector of triggers) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 1000 })) {
          await el.click();
          await page.waitForTimeout(1500);
          break;
        }
      } catch {
        continue;
      }
    }

    // Look for size tables
    const tables = await page.locator('table').all();
    for (const table of tables) {
      const text = await table.textContent();
      if (!text) continue;

      const lower = text.toLowerCase();
      if (lower.includes('eu') || lower.includes('uk') || lower.includes('us') || lower.includes('cm') || lower.includes('pointure')) {
        return await parseTable(table, productUrl);
      }
    }

    return null;
  } catch (err) {
    console.log(`  ⚠️ Could not load ${productUrl}: ${(err as Error).message}`);
    return null;
  } finally {
    await page.close();
  }
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

    const shortLabel = getShortLabel(label);
    sizeRows.push({ label, shortLabel, values });
  }

  if (sizeRows.length === 0) return null;

  return { id: 1, brand: 'La Botte Gardiane', url, rows: sizeRows };
}

function getShortLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('europe') || lower === 'eu') return 'EU';
  if (lower.includes('royaume') || lower.includes('uk')) return 'UK';
  if (lower.includes('etats') || lower.includes('us')) return 'US';
  if (lower.includes('longueur') || lower.includes('cm') || lower.includes('pied')) return 'cm';
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

    // Try to find size guide on sample pages
    console.log('\n🔍 Looking for size guide on product pages...');
    const sampleUrls = products.slice(0, 5).map((p) => p.url);
    let sizeGuide: SizeGuide | null = null;

    for (const sampleUrl of sampleUrls) {
      console.log(`   Checking: ${sampleUrl}`);
      sizeGuide = await findSizeGuideOnPage(sampleUrl);
      if (sizeGuide) {
        console.log('   ✅ Found size guide!');
        break;
      }
    }

    const sizeGuides: SizeGuide[] = [];
    if (sizeGuide) {
      sizeGuides.push(sizeGuide);
      products.forEach((p) => (p.sizeGuideId = 1));
    }

    return { products, sizeGuides };
  },
};
