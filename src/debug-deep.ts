import { newPage, closeBrowser } from './browser';

async function debug() {
  const url = process.argv[2] || 'https://www.kleman-france.com/products/padror-xfun-leopard';

  console.log(`\n🔍 Deep debug: ${url}\n`);
  const page = await newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

    // Step 1: Click "Guide des tailles" button
    console.log('=== Step 1: Click "Guide des tailles" ===');
    const guideBtn = page.locator('button:has-text("Guide des tailles")').first();
    if (await guideBtn.isVisible({ timeout: 3000 })) {
      await guideBtn.click();
      await page.waitForTimeout(1500);
      console.log('  Clicked!');
    }

    // Step 2: Click "Equivalence des tailles" accordion
    console.log('\n=== Step 2: Click "Equivalence des tailles" accordion ===');
    const accordion = page.locator('button:has-text("Équivalence des tailles")').first();
    if (await accordion.isVisible({ timeout: 3000 })) {
      await accordion.click();
      await page.waitForTimeout(1000);
      console.log('  Clicked!');
    }

    // Step 3: Dump the size guide panel content
    console.log('\n=== Step 3: Size guide panel content ===');
    const panel = page.locator('.panel-size-guide').first();
    if (await panel.isVisible({ timeout: 3000 })) {
      const html = await panel.innerHTML();
      console.log('Panel HTML (first 3000 chars):');
      console.log(html.substring(0, 3000));
    }

    // Step 4: Look for the size-guide-table divs
    console.log('\n=== Step 4: Size guide table structures ===');
    const sizeGuideTableContainers = await page.locator('.size-guide-table').all();
    console.log(`Found ${sizeGuideTableContainers.length} size-guide-table containers`);

    for (let i = 0; i < sizeGuideTableContainers.length; i++) {
      console.log(`\n--- Container ${i} ---`);
      const container = sizeGuideTableContainers[i];

      // Get title
      const title = await container.locator('.panel-size-guide__table-title, .size-guide-table__title').first().textContent().catch(() => null);
      console.log(`Title: ${title}`);

      // Get toggle buttons (EU/UK/US/CM)
      const toggleBtns = await container.locator('.size-guide-table__toggle__button').all();
      for (const btn of toggleBtns) {
        const text = await btn.textContent();
        console.log(`Toggle: ${text?.trim()}`);
      }

      // Get content items
      const contentItems = await container.locator('.size-guide-table__content__item').all();
      for (const item of contentItems) {
        const itemText = await item.textContent();
        console.log(`Content item: ${itemText?.trim().substring(0, 200)}`);
      }

      // Get all visible text
      const fullText = await container.textContent();
      console.log(`Full text: ${fullText?.trim().substring(0, 500)}`);
    }

    // Step 5: Check for the table title elements
    console.log('\n=== Step 5: Table titles ===');
    const titles = await page.locator('.panel-size-guide__table-title').all();
    for (const title of titles) {
      console.log(`Title: ${await title.textContent()}`);
    }

  } finally {
    await page.close();
    await closeBrowser();
  }
}

debug();
