import { SiteAdapter, ScrapingResult, Product, SizeGuide, SizeRow } from '../types';
import { newPage } from '../browser';

async function crawlProducts(baseUrl: string): Promise<Product[]> {
  const page = await newPage();
  const products: Product[] = [];

  try {
    // Prada product listing pages
    const categories = [
      { url: `${baseUrl}/fr/fr/men/shoes.html`, gender: 'Homme' },
      { url: `${baseUrl}/fr/fr/women/shoes.html`, gender: 'Femme' },
    ];

    for (const cat of categories) {
      console.log(`   Crawling: ${cat.url}`);
      await page.goto(cat.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      // Scroll to load more products
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      }

      // Extract product links
      const links = await page.locator('a[href*="/fr/fr/p/"]').all();
      const seen = new Set<string>();

      for (const link of links) {
        try {
          const href = await link.getAttribute('href');
          const name = await link.textContent();
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
          products.push({
            name: (name || '').trim().split('\n')[0].trim() || 'Unknown',
            gender: cat.gender,
            type: detectType((name || '').toLowerCase()),
            url: fullUrl,
            sizeGuideId: null,
          });
        } catch {
          continue;
        }
      }
    }
  } catch (err) {
    console.log(`  ⚠️ Error crawling Prada: ${(err as Error).message}`);
  } finally {
    await page.close();
  }

  // Deduplicate by URL
  const unique = new Map<string, Product>();
  for (const p of products) {
    if (!unique.has(p.url)) unique.set(p.url, p);
  }

  return Array.from(unique.values());
}

function detectType(text: string): string {
  if (text.includes('basket') || text.includes('sneaker')) return 'Sneakers';
  if (text.includes('mocassin') || text.includes('loafer')) return 'Loafers';
  if (text.includes('boot') || text.includes('botte')) return 'Boots';
  if (text.includes('sandal')) return 'Sandals';
  if (text.includes('derby') || text.includes('richelieu')) return 'Derby';
  return 'Shoes';
}

async function findSizeGuide(baseUrl: string): Promise<SizeGuide | null> {
  const page = await newPage();

  try {
    // Navigate to a product page and look for size guide
    const productPage = `${baseUrl}/fr/fr/men/shoes.html`;
    await page.goto(productPage, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    // Click first product
    const firstProduct = page.locator('a[href*="/fr/fr/p/"]').first();
    if (await firstProduct.isVisible({ timeout: 3000 })) {
      await firstProduct.click();
      await page.waitForTimeout(3000);
    }

    // Look for size guide trigger
    const triggers = [
      'text=/guide des tailles/i',
      'text=/size guide/i',
      'text=/guida alle taglie/i',
      '[class*="size-guide"]',
      '[class*="sizeGuide"]',
      '[data-testid*="size-guide"]',
      'button:has-text("taille")',
      'a:has-text("guide")',
    ];

    for (const selector of triggers) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 1000 })) {
          await el.click();
          await page.waitForTimeout(2000);

          // Look for table
          const table = page.locator('table').first();
          if (await table.isVisible({ timeout: 2000 })) {
            return await parseTable(table, page.url(), 'Prada');
          }
          break;
        }
      } catch {
        continue;
      }
    }

    // Fallback: try to find size data in page source
    const content = await page.content();
    const sizeGuide = parseSizeDataFromHtml(content);
    if (sizeGuide) return sizeGuide;

    return null;
  } catch (err) {
    console.log(`  ⚠️ Error finding Prada size guide: ${(err as Error).message}`);
    return null;
  } finally {
    await page.close();
  }
}

function parseSizeDataFromHtml(html: string): SizeGuide | null {
  // Look for JSON-LD or embedded size data in the page source
  const sizePatterns = [
    /sizeGuide['":\s]*(\[[\s\S]*?\])/i,
    /sizechart['":\s]*(\{[\s\S]*?\})/i,
  ];

  for (const pattern of sizePatterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        console.log('   Found embedded size data in HTML');
        return convertJsonToSizeGuide(data);
      } catch {
        continue;
      }
    }
  }

  return null;
}

function convertJsonToSizeGuide(data: any): SizeGuide | null {
  // Generic converter for JSON size data
  if (Array.isArray(data) && data.length > 0) {
    const rows: SizeRow[] = [];
    for (const entry of data) {
      if (entry.label && entry.values) {
        rows.push({
          label: entry.label,
          shortLabel: entry.shortLabel || entry.label,
          values: entry.values.map(String),
        });
      }
    }
    if (rows.length > 0) {
      return { id: 1, brand: 'Prada', url: '', rows };
    }
  }
  return null;
}

async function parseTable(table: any, url: string, brand: string): Promise<SizeGuide | null> {
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

  return { id: 1, brand, url, rows: sizeRows };
}

function getShortLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('europe') || lower === 'eu') return 'EU';
  if (lower.includes('royaume') || lower.includes('uk')) return 'UK';
  if (lower.includes('etats') || lower.includes('us')) return 'US';
  if (lower.includes('longueur') || lower.includes('cm') || lower.includes('pied')) return 'cm';
  if (lower.includes('prada')) return 'Prada';
  return label;
}

export const pradaAdapter: SiteAdapter = {
  matches(url: string): boolean {
    return url.includes('prada.com');
  },

  async scrape(url: string): Promise<ScrapingResult> {
    console.log('📦 Crawling Prada product pages...');
    const products = await crawlProducts(url);
    console.log(`   Found ${products.length} products`);

    console.log('\n🔍 Looking for size guide...');
    const sizeGuide = await findSizeGuide(url);
    const sizeGuides: SizeGuide[] = [];

    if (sizeGuide) {
      sizeGuides.push(sizeGuide);
      products.forEach((p) => (p.sizeGuideId = 1));
      console.log('   ✅ Found size guide!');
    } else {
      console.log('   ⚠️ No size guide found on product pages');
    }

    return { products, sizeGuides };
  },
};
