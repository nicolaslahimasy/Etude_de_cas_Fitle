import { SiteAdapter, SizeGuide } from './types';
import { closeBrowser } from './browser';
import { exportToExcel } from './exporter';
import { klemanAdapter } from './sites/kleman';
import { pradaAdapter } from './sites/prada';
import { labottegardiane } from './sites/labottegardiane';
import { genericAdapter } from './sites/generic';
import path from 'path';

// Only keep standard rows: brand (first row) + EU, UK, US, cm
const ALLOWED_SHORT_LABELS = new Set(['EU', 'UK', 'US', 'cm']);

function filterStandardRows(guide: SizeGuide): SizeGuide {
  const brandRow = guide.rows[0]; // First row is always the brand
  const filtered = guide.rows.slice(1).filter((r) => ALLOWED_SHORT_LABELS.has(r.shortLabel));
  return { ...guide, rows: [brandRow, ...filtered] };
}

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

  // Normalize URL - add https:// if missing
  let normalizedUrl = url;
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://www.${normalizedUrl.replace(/^www\./i, '')}`;
  }
  normalizedUrl = normalizedUrl.replace(/\/$/, '');

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

    // Standardize: keep only brand + EU/UK/US/cm rows
    result.sizeGuides = result.sizeGuides.map(filterStandardRows);

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
