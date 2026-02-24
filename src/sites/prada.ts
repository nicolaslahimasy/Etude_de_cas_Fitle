import { SiteAdapter, ScrapingResult, Product, SizeGuide, SizeRow } from '../types';
import { newPage } from '../browser';

/** Prada requires Firefox (Chromium gets HTTP/2 errors due to anti-bot protection) */
const BROWSER = 'firefox' as const;

async function dismissCookieBanner(page: any): Promise<void> {
  const selectors = [
    'button:has-text("Accepter")',
    'button:has-text("Accept")',
    'button:has-text("Tout accepter")',
    '#onetrust-accept-btn-handler',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click();
        await page.waitForTimeout(1000);
        return;
      }
    } catch {
      continue;
    }
  }
}

async function crawlProducts(baseUrl: string): Promise<Product[]> {
  const products: Product[] = [];
  const seen = new Set<string>();

  const categories = [
    { url: `${baseUrl}/fr/fr/men/shoes.html`, gender: 'Homme' },
    { url: `${baseUrl}/fr/fr/women/shoes.html`, gender: 'Femme' },
  ];

  for (const cat of categories) {
    const page = await newPage(BROWSER);
    try {
      console.log(`   Crawling: ${cat.url}`);
      await page.goto(cat.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await dismissCookieBanner(page);
      await page.waitForTimeout(3000);

      // Scroll to load products
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);
      }

      // Extract product links
      const links = await page.locator('a[href*="/fr/fr/p/"]').all();

      for (const link of links) {
        try {
          const href = await link.getAttribute('href');
          if (!href || seen.has(href)) continue;
          seen.add(href);

          // Get product name from aria-label or text
          let name = await link.getAttribute('aria-label') || '';
          if (!name) {
            name = ((await link.textContent()) || '').trim().split('\n')[0].trim();
          }
          if (!name || name.length < 3) continue;

          // Clean up: remove price, color info, and "FROM THE RUNWAY" prefix
          name = name
            .replace(/FROM THE RUNWAY\s*/i, '')
            .replace(/\s*€\s*[\d.,]+.*$/i, '')
            .replace(/\s*Disponible en.*$/i, '')
            .trim();

          const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
          products.push({
            name: name.trim(),
            gender: cat.gender,
            type: detectType(name),
            url: fullUrl,
            sizeGuideId: null,
          });
        } catch {
          continue;
        }
      }
    } catch (err) {
      console.log(`  Error crawling ${cat.url}: ${(err as Error).message}`);
    } finally {
      await page.close();
    }
  }

  return products;
}

function detectType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('basket') || lower.includes('sneaker')) return 'Sneakers';
  if (lower.includes('mocassin') || lower.includes('loafer')) return 'Loafers';
  if (lower.includes('boot') || lower.includes('botte') || lower.includes('bottine')) return 'Boots';
  if (lower.includes('sandal')) return 'Sandals';
  if (lower.includes('derby') || lower.includes('richelieu')) return 'Derby';
  if (lower.includes('escarpin') || lower.includes('pump')) return 'Pumps';
  if (lower.includes('mule') || lower.includes('slide')) return 'Mules';
  return 'Shoes';
}

async function findSizeGuide(baseUrl: string, sampleProductUrl: string): Promise<SizeGuide | null> {
  const page = await newPage(BROWSER);

  try {
    console.log(`   Opening product: ${sampleProductUrl}`);
    await page.goto(sampleProductUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(5000);
    await dismissCookieBanner(page);
    await page.waitForTimeout(1000);

    // Click "Tableau des tailles" trigger
    const sizeGuideBtn = page.locator('[data-element="size-guide-trigger"]').first();
    if (await sizeGuideBtn.isVisible({ timeout: 3000 })) {
      await sizeGuideBtn.click({ force: true });
      await page.waitForTimeout(2000);
    } else {
      // Fallback selectors
      const fallbacks = [
        'button:has-text("Tableau des tailles")',
        'button:has-text("Size guide")',
        'text=/tableau des tailles/i',
      ];
      for (const sel of fallbacks) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click({ force: true });
            await page.waitForTimeout(2000);
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // Parse the size table
    const table = page.locator('table').first();
    if (!(await table.isVisible({ timeout: 3000 }))) {
      console.log('   No size table found');
      return null;
    }

    const rows = await table.locator('tr').all();
    const sizeRows: SizeRow[] = [];

    for (const row of rows) {
      const headers = await row.locator('th').allTextContents();
      const cells = await row.locator('td').allTextContents();
      const allCells = [...headers, ...cells].map((c) => c.trim());

      if (allCells.length < 2) continue;

      const label = allCells[0];
      const values = allCells.slice(1).map((v) => v.replace(/\s*cm$/, '').trim()).filter((v) => v.length > 0);

      if (values.length === 0) continue;

      sizeRows.push({
        label: getLongLabel(label),
        shortLabel: getShortLabel(label),
        values,
      });
    }

    if (sizeRows.length === 0) return null;

    return {
      id: 1,
      brand: 'Prada',
      url: sampleProductUrl,
      rows: sizeRows,
    };
  } catch (err) {
    console.log(`  Error: ${(err as Error).message}`);
    return null;
  } finally {
    await page.close();
  }
}

function getShortLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('prada')) return 'Prada';
  if (lower.includes('europe') || lower === 'eu') return 'EU';
  if (lower.includes('royaume') || lower.includes('uk')) return 'UK';
  if (lower.includes('etats') || lower.includes('us')) return 'US';
  if (lower.includes('pied') || lower.includes('cm') || lower.includes('longueur')) return 'cm';
  return label;
}

function getLongLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('prada')) return 'Prada';
  if (lower.includes('europe') || lower === 'eu') return 'Europe';
  if (lower.includes('royaume') || lower.includes('uk')) return 'Royaume-Uni';
  if (lower.includes('etats') || lower.includes('us')) return 'Etats-Unis';
  if (lower.includes('pied')) return 'Longueur pied';
  return label;
}

export const pradaAdapter: SiteAdapter = {
  matches(url: string): boolean {
    return url.includes('prada.com');
  },

  async scrape(url: string): Promise<ScrapingResult> {
    console.log('Crawling Prada product pages (using Firefox)...');
    const products = await crawlProducts(url);
    console.log(`   Found ${products.length} products`);

    console.log('\nLooking for size guide...');
    let sizeGuide: SizeGuide | null = null;

    // Try to find size guide on first few product pages
    const sampled = products.slice(0, 3);
    for (const product of sampled) {
      sizeGuide = await findSizeGuide(url, product.url);
      if (sizeGuide) break;
    }

    const sizeGuides: SizeGuide[] = [];
    if (sizeGuide) {
      sizeGuides.push(sizeGuide);
      products.forEach((p) => (p.sizeGuideId = 1));
      console.log('   Found size guide!');
    } else {
      console.log('   No size guide found');
    }

    return { products, sizeGuides };
  },
};
