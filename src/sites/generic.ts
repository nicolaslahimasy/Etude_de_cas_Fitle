import { SiteAdapter, ScrapingResult, Product, SizeGuide, SizeRow } from '../types';
import { newPage } from '../browser';

/**
 * Generic scraper for unknown e-commerce sites.
 * Uses heuristics to find products and size guides.
 */

async function crawlProducts(baseUrl: string): Promise<Product[]> {
  const page = await newPage();
  const products: Product[] = [];

  try {
    // First try Shopify API (many sites use Shopify)
    const shopifyProducts = await tryShopifyApi(baseUrl);
    if (shopifyProducts.length > 0) {
      console.log('   Detected Shopify site, using API');
      return shopifyProducts;
    }

    // Fallback: crawl the homepage and find product links
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Common product link patterns
    const productSelectors = [
      'a[href*="/products/"]',
      'a[href*="/product/"]',
      'a[href*="/p/"]',
      'a[href*="/produit/"]',
      '.product-card a',
      '.product-item a',
      '[data-product] a',
    ];

    const seen = new Set<string>();

    for (const selector of productSelectors) {
      const links = await page.locator(selector).all();
      for (const link of links) {
        try {
          const href = await link.getAttribute('href');
          const text = await link.textContent();
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
          products.push({
            name: (text || '').trim().split('\n')[0].trim() || 'Unknown',
            gender: 'Unisex',
            type: 'Shoes',
            url: fullUrl,
            sizeGuideId: null,
          });
        } catch {
          continue;
        }
      }

      if (products.length > 0) break;
    }

    // If still no products, try navigation links to find category pages
    if (products.length === 0) {
      const navLinks = await page.locator('nav a, .menu a, header a').all();
      const categoryKeywords = ['chaussure', 'shoe', 'homme', 'femme', 'collection', 'shop', 'boutique'];

      for (const navLink of navLinks) {
        const href = await navLink.getAttribute('href');
        const text = (await navLink.textContent()) || '';
        if (!href) continue;

        const isCategory = categoryKeywords.some((kw) => text.toLowerCase().includes(kw) || href.toLowerCase().includes(kw));
        if (!isCategory) continue;

        const catUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
        console.log(`   Exploring category: ${catUrl}`);
        await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(2000);

        for (const selector of productSelectors) {
          const links = await page.locator(selector).all();
          for (const link of links) {
            try {
              const linkHref = await link.getAttribute('href');
              const linkText = await link.textContent();
              if (!linkHref || seen.has(linkHref)) continue;
              seen.add(linkHref);

              const fullUrl = linkHref.startsWith('http') ? linkHref : `${baseUrl}${linkHref}`;
              products.push({
                name: (linkText || '').trim().split('\n')[0].trim() || 'Unknown',
                gender: detectGenderFromUrl(catUrl),
                type: 'Shoes',
                url: fullUrl,
                sizeGuideId: null,
              });
            } catch {
              continue;
            }
          }
        }

        if (products.length > 10) break;
      }
    }
  } catch (err) {
    console.log(`  ⚠️ Error crawling: ${(err as Error).message}`);
  } finally {
    await page.close();
  }

  return products;
}

async function tryShopifyApi(baseUrl: string): Promise<Product[]> {
  try {
    const res = await fetch(`${baseUrl}/products.json?limit=250`);
    if (!res.ok) return [];

    const data = (await res.json()) as { products: any[] };
    if (!data.products) return [];

    return data.products.map((p: any) => ({
      name: p.title,
      gender: detectGenderFromTags(p.tags || [], p.title),
      type: p.product_type || 'Shoes',
      url: `${baseUrl}/products/${p.handle}`,
      sizeGuideId: null,
    }));
  } catch {
    return [];
  }
}

function detectGenderFromTags(tags: string[], title: string): string {
  const text = `${tags.join(' ')} ${title}`.toLowerCase();
  if (text.includes('femme') || text.includes('women')) return 'Femme';
  if (text.includes('homme') || text.includes('men')) return 'Homme';
  if (text.includes('enfant') || text.includes('kid')) return 'Enfant';
  return 'Unisex';
}

function detectGenderFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('femme') || lower.includes('women') || lower.includes('woman')) return 'Femme';
  if (lower.includes('homme') || lower.includes('men') || lower.includes('man')) return 'Homme';
  return 'Unisex';
}

async function findSizeGuide(baseUrl: string, productUrls: string[]): Promise<SizeGuide | null> {
  // Try common size guide page URLs first
  const commonPaths = [
    '/pages/guide-des-tailles',
    '/pages/size-guide',
    '/size-guide',
    '/guide-des-tailles',
    '/pages/guide-taille',
    '/pages/sizing',
    '/sizing-guide',
  ];

  for (const path of commonPaths) {
    const guide = await trySizeGuidePage(`${baseUrl}${path}`);
    if (guide) return guide;
  }

  // Try product pages
  const sampled = productUrls.slice(0, 5);
  for (const url of sampled) {
    console.log(`   Checking: ${url}`);
    const guide = await findSizeGuideOnProductPage(url);
    if (guide) return guide;
  }

  return null;
}

async function trySizeGuidePage(url: string): Promise<SizeGuide | null> {
  const page = await newPage();

  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    if (!res || res.status() >= 400) return null;

    const tables = await page.locator('table').all();
    for (const table of tables) {
      const text = await table.textContent();
      if (!text) continue;

      const lower = text.toLowerCase();
      if (lower.includes('eu') || lower.includes('uk') || lower.includes('us') || lower.includes('cm')) {
        return await parseTable(table, url);
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

async function findSizeGuideOnProductPage(productUrl: string): Promise<SizeGuide | null> {
  const page = await newPage();

  try {
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 15000 });

    // Click on size guide triggers
    const triggers = [
      'text=/guide des tailles/i',
      'text=/size guide/i',
      'text=/size chart/i',
      'text=/guide de taille/i',
      'text=/tableau des tailles/i',
      '[class*="size-guide"]',
      '[class*="size_guide"]',
      '[class*="sizeguide"]',
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

    // Find tables with size data
    const tables = await page.locator('table').all();
    for (const table of tables) {
      const text = await table.textContent();
      if (!text) continue;

      const lower = text.toLowerCase();
      if (lower.includes('eu') || lower.includes('uk') || lower.includes('us') || lower.includes('cm') || lower.includes('pointure') || lower.includes('taille')) {
        return await parseTable(table, productUrl);
      }
    }

    return null;
  } catch {
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

  // Try to detect brand from URL
  const hostname = new URL(url).hostname.replace('www.', '').split('.')[0];
  const brand = hostname.charAt(0).toUpperCase() + hostname.slice(1);

  return { id: 1, brand, url, rows: sizeRows };
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

export const genericAdapter: SiteAdapter = {
  matches(): boolean {
    return true; // Fallback - always matches
  },

  async scrape(url: string): Promise<ScrapingResult> {
    console.log('📦 Crawling products (generic mode)...');
    const products = await crawlProducts(url);
    console.log(`   Found ${products.length} products`);

    console.log('\n🔍 Looking for size guide...');
    const sizeGuide = await findSizeGuide(url, products.map((p) => p.url));
    const sizeGuides: SizeGuide[] = [];

    if (sizeGuide) {
      sizeGuides.push(sizeGuide);
      products.forEach((p) => (p.sizeGuideId = 1));
      console.log('   ✅ Found size guide!');
    } else {
      console.log('   ⚠️ No size guide found');
    }

    return { products, sizeGuides };
  },
};
