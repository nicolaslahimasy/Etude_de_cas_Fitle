import { chromium, firefox, Browser, Page, BrowserType } from 'playwright';

let browserChromium: Browser | null = null;
let browserFirefox: Browser | null = null;

export async function launchBrowser(type: 'chromium' | 'firefox' = 'chromium'): Promise<Browser> {
  if (type === 'firefox') {
    if (!browserFirefox) {
      browserFirefox = await firefox.launch({ headless: true });
    }
    return browserFirefox;
  }

  if (!browserChromium) {
    browserChromium = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  return browserChromium;
}

export async function newPage(type: 'chromium' | 'firefox' = 'chromium'): Promise<Page> {
  const b = await launchBrowser(type);
  const ua =
    type === 'firefox'
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  const context = await b.newContext({
    userAgent: ua,
    locale: 'fr-FR',
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  if (type === 'chromium') {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
  }

  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browserChromium) {
    await browserChromium.close();
    browserChromium = null;
  }
  if (browserFirefox) {
    await browserFirefox.close();
    browserFirefox = null;
  }
}
