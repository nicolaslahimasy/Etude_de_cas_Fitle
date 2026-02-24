import { ScrapingResult } from './types';

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error('Usage: npm run scrape <website-url>');
    console.error('Example: npm run scrape https://www.kleman-france.com');
    process.exit(1);
  }

  console.log(`\n🔍 Fitle Size Guide Scraper`);
  console.log(`📎 Target: ${url}\n`);

  // TODO: Step 1 - Crawl products
  // TODO: Step 2 - Detect & extract size guides
  // TODO: Step 3 - Export to Excel

  console.log('✅ Done!');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
