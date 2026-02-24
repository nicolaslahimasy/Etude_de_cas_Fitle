import { newPage, closeBrowser } from './browser';

/**
 * Debug script to inspect a product page and find size guide elements.
 * Usage: npx ts-node src/debug.ts <product-url>
 */
async function debug() {
  const url = process.argv[2] || 'https://www.kleman-france.com/products/padror-xfun-leopard';

  console.log(`\n🔍 Debugging: ${url}\n`);
  const page = await newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

    // 1. Find ALL elements containing size-related keywords
    const keywords = ['taille', 'size', 'pointure', 'guide', 'mesure', 'cm'];
    console.log('=== Elements with size keywords ===');

    for (const kw of keywords) {
      const elements = await page.locator(`text=/${kw}/i`).all();
      for (const el of elements) {
        const tag = await el.evaluate((e: any) => e.tagName);
        const text = (await el.textContent() || '').trim().substring(0, 100);
        const cls = await el.evaluate((e: any) => e.className);
        const href = await el.evaluate((e: any) => e.getAttribute('href'));
        console.log(`  [${tag}] class="${cls}" href="${href}" → "${text}"`);
      }
    }

    // 2. Find all tables
    console.log('\n=== Tables found ===');
    const tables = await page.locator('table').all();
    console.log(`  Found ${tables.length} tables`);
    for (const table of tables) {
      const text = (await table.textContent() || '').trim().substring(0, 200);
      console.log(`  Table content: "${text}"`);
    }

    // 3. Find all iframes (size guide might be in an iframe)
    console.log('\n=== Iframes found ===');
    const iframes = await page.locator('iframe').all();
    console.log(`  Found ${iframes.length} iframes`);
    for (const iframe of iframes) {
      const src = await iframe.getAttribute('src');
      const title = await iframe.getAttribute('title');
      console.log(`  iframe src="${src}" title="${title}"`);
    }

    // 4. Find all buttons and links
    console.log('\n=== Buttons/Links with relevant text ===');
    const clickables = await page.locator('button, a, [role="button"], summary, details').all();
    for (const el of clickables) {
      const text = (await el.textContent() || '').trim();
      const lower = text.toLowerCase();
      if (keywords.some(kw => lower.includes(kw))) {
        const tag = await el.evaluate((e: any) => e.tagName);
        const cls = await el.evaluate((e: any) => e.className);
        const href = await el.evaluate((e: any) => e.getAttribute('href'));
        console.log(`  [${tag}] class="${cls}" href="${href}" → "${text.substring(0, 100)}"`);
      }
    }

    // 5. Dump full page HTML to look for hidden content
    const html = await page.content();
    const sizeRelated = html.match(/.{0,50}(guide.des.tailles|size.guide|sizechart|size_guide|taille).{0,50}/gi);
    console.log('\n=== HTML matches for size guide patterns ===');
    if (sizeRelated) {
      for (const match of sizeRelated.slice(0, 10)) {
        console.log(`  ...${match.trim()}...`);
      }
    } else {
      console.log('  No matches found');
    }

  } finally {
    await page.close();
    await closeBrowser();
  }
}

debug();
