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

    // Read the default table (Prada + Europe + cm)
    const defaultRows = await readTableRows(table);
    if (defaultRows.length === 0) return null;

    // The Prada size guide uses a <select> dropdown to switch conversion systems.
    // Default shows: Prada, Europe, Pied (cm). We need to also get UK and US.
    const sizeRows: SizeRow[] = [];

    // Row 0 is always the Prada sizes
    sizeRows.push(defaultRows[0]);

    // Row 1 is Europe (default selection)
    sizeRows.push(defaultRows[1]);

    // Switch through other conversion systems via the select dropdown
    const select = page.locator('.size-component select, .size-table select, select').first();
    const hasSelect = await select.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasSelect) {
      const options = await select.locator('option').allTextContents();
      const systems = options.map((o) => o.trim()).filter((o) => o.length > 0);
      console.log(`   Conversion systems: ${systems.join(', ')}`);

      // We want Royaume-Uni and Etats-Unis (they may have accents)
      const wanted = systems.filter((s) => {
        const lower = s.toLowerCase();
        return lower.includes('royaume') || lower.includes('tats-unis') || lower.includes('united');
      });

      for (const system of wanted) {
        try {
          await select.selectOption({ label: system });
          await page.waitForTimeout(1000);

          const newRows = await readTableRows(table);
          // The middle row (index 1) changes to the selected system
          if (newRows.length >= 2) {
            sizeRows.push(newRows[1]);
          }
        } catch {
          continue;
        }
      }
    }

    // Last row is always Pied (cm) - take from the default reading
    const footRow = defaultRows[defaultRows.length - 1];
    if (footRow && footRow.shortLabel !== sizeRows[sizeRows.length - 1]?.shortLabel) {
      sizeRows.push(footRow);
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

async function readTableRows(table: any): Promise<SizeRow[]> {
  const rows = await table.locator('tr').all();
  const sizeRows: SizeRow[] = [];

  for (const row of rows) {
    const headers = await row.locator('th').allTextContents();
    const cells = await row.locator('td').allTextContents();
    const allCells = [...headers, ...cells].map((c) => c.trim());

    if (allCells.length < 2) continue;

    const label = allCells[0];
    const values = allCells.slice(1).map((v) => v.trim()).filter((v) => v.length > 0);

    if (values.length === 0) continue;

    sizeRows.push({
      label: getLongLabel(label),
      shortLabel: getShortLabel(label),
      values,
    });
  }

  return sizeRows;
}

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getShortLabel(label: string): string {
  const lower = stripAccents(label).toLowerCase();
  if (lower.includes('prada') || lower.includes('taille prada')) return 'Prada';
  if (lower.includes('europe') || lower === 'eu') return 'EU';
  if (lower.includes('royaume') || lower.includes('uk')) return 'UK';
  if (lower.includes('etats') || lower.includes('unis') || lower.includes('us')) return 'US';
  if (lower.includes('pied') || lower.includes('cm') || lower.includes('longueur')) return 'cm';
  return label;
}

function getLongLabel(label: string): string {
  const lower = stripAccents(label).toLowerCase();
  if (lower.includes('prada') || lower.includes('taille prada')) return 'Prada';
  if (lower.includes('europe') || lower === 'eu') return 'Europe';
  if (lower.includes('royaume') || lower.includes('uk')) return 'Royaume-Uni';
  if (lower.includes('etats') || lower.includes('unis') || lower.includes('us')) return 'Etats-Unis';
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
