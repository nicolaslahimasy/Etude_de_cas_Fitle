import { SiteAdapter } from './types';
import { closeBrowser } from './browser';
import { exportToExcel } from './exporter';
import { klemanAdapter } from './sites/kleman';
import { pradaAdapter } from './sites/prada';
import { labottegardiane } from './sites/labottegardiane';
import { genericAdapter } from './sites/generic';
import path from 'path';

const adapters: SiteAdapter[] = [
  klemanAdapter,
  pradaAdapter,
  labottegardiane,
  genericAdapter, // Fallback - always matches
];

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error('Usage: npm run scrape -- <website-url>');
    console.error('Example: npm run scrape -- https://www.kleman-france.com');
    process.exit(1);
  }

  // Normalize URL
  const normalizedUrl = url.replace(/\/$/, '');

  console.log(`\nFitle Size Guide Scraper`);
  console.log(`Target: ${normalizedUrl}\n`);

  // Find matching adapter
  const adapter = adapters.find((a) => a.matches(normalizedUrl));
  if (!adapter) {
    console.error('Error: No adapter found for this URL');
    process.exit(1);
  }

  const adapterName = adapter === genericAdapter ? 'Generic' : normalizedUrl.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
  console.log(`Using adapter: ${adapterName}\n`);

  try {
    // Run scraping
    const result = await adapter.scrape(normalizedUrl);

    console.log(`\nResults:`);
    console.log(`   Products found: ${result.products.length}`);
    console.log(`   Size guides found: ${result.sizeGuides.length}`);

    // Export to Excel
    const hostname = new URL(normalizedUrl).hostname.replace('www.', '').split('.')[0];
    const outputFile = path.join(process.cwd(), 'output', `${hostname}_size_guides.xlsx`);

    // Create output directory
    const fs = await import('fs');
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await exportToExcel(result, outputFile);

    console.log(`\nDone! Results saved to ${outputFile}`);
  } catch (err) {
    console.error(`\nError: ${(err as Error).message}`);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

main();
