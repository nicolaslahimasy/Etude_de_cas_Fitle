import { SiteAdapter, ScrapingResult, Product, SizeGuide } from '../types';
import { newPage, closeBrowser } from '../browser';

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

async function findSizeGuideOnPage(productUrl: string): Promise<SizeGuide | null> {
  const page = await newPage();

  try {
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 15000 });

    // Look for size guide triggers (buttons, links, accordions)
    const sizeGuideSelectors = [
      'text=/guide des tailles/i',
      'text=/size guide/i',
      'text=/guide de taille/i',
      'text=/tableau des tailles/i',
      '[class*="size-guide"]',
      '[class*="size_guide"]',
      '[class*="sizeguide"]',
      '[data-action*="size-guide"]',
      '[href*="size-guide"]',
      '[href*="guide-taille"]',
    ];

    for (const selector of sizeGuideSelectors) {
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

    // Try to find any table with size data
    const tables = await page.locator('table').all();
    for (const table of tables) {
      const text = await table.textContent();
      if (!text) continue;

      const lowerText = text.toLowerCase();
      if (lowerText.includes('eu') || lowerText.includes('uk') || lowerText.includes('us') || lowerText.includes('cm') || lowerText.includes('pointure')) {
        return await parseHtmlTable(table, productUrl);
      }
    }

    // Also check for size guide content in divs/sections
    const guideContainers = await page.locator('[class*="size"], [class*="taille"], [id*="size"], [id*="taille"]').all();
    for (const container of guideContainers) {
      const innerTable = container.locator('table').first();
      if (await innerTable.count() > 0) {
        return await parseHtmlTable(innerTable, productUrl);
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

async function parseHtmlTable(table: any, url: string): Promise<SizeGuide | null> {
  const rows = await table.locator('tr').all();
  if (rows.length === 0) return null;

  const sizeRows: { label: string; shortLabel: string; values: string[] }[] = [];

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

  return {
    id: 1,
    brand: 'Kleman',
    url,
    rows: sizeRows,
  };
}

function getShortLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('europe') || lower === 'eu') return 'EU';
  if (lower.includes('royaume') || lower.includes('uk')) return 'UK';
  if (lower.includes('etats') || lower.includes('us') || lower.includes('usa')) return 'US';
  if (lower.includes('longueur') || lower.includes('cm') || lower.includes('pied')) return 'cm';
  if (lower.includes('japon') || lower.includes('jp')) return 'JP';
  return label;
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

    // Try to find size guide on a sample product page
    console.log('\n🔍 Looking for size guide on product pages...');
    const sampleUrls = products.slice(0, 3).map((p) => p.url);
    let sizeGuide: SizeGuide | null = null;

    for (const sampleUrl of sampleUrls) {
      console.log(`   Checking: ${sampleUrl}`);
      sizeGuide = await findSizeGuideOnPage(sampleUrl);
      if (sizeGuide) {
        console.log(`   ✅ Found size guide!`);
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
