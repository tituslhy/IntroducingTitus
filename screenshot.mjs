import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, 'screenshots');
await mkdir(screenshotsDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
});
const page = await context.newPage();

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
// Give fonts/animations a moment to settle
await page.waitForTimeout(1500);

const sections = [
  { id: 'home',       file: '01-hero.png' },
  { id: 'techstack',  file: '02-techstack.png', selector: 'section:has(h2:text("What I Work With"))' },
  { id: 'passions',   file: '03-passions.png',  selector: 'section:has(h2:text("What Drives Me"))' },
  { id: 'experience', file: '04-experience.png' },
  { id: 'projects',   file: '05-projects.png' },
  { id: 'writing',    file: '06-writing.png' },
  { id: 'contact',    file: '07-contact.png' },
];

for (const section of sections) {
  // Scroll to section anchor if it exists
  const anchor = section.id === 'home' ? null : `#${section.id}`;
  if (anchor) {
    await page.evaluate((a) => {
      const el = document.querySelector(a);
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, anchor);
    await page.waitForTimeout(600);
  } else {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);
  }

  // Determine what to screenshot
  let target;
  if (section.selector) {
    target = page.locator(section.selector).first();
  } else if (section.id !== 'home') {
    target = page.locator(`#${section.id}`).first();
  }

  const outPath = path.join(screenshotsDir, section.file);

  if (target) {
    await target.screenshot({ path: outPath });
  } else {
    // Hero: viewport screenshot from top
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1440, height: 900 } });
  }

  console.log(`✓ ${section.file}`);
}

await browser.close();
console.log('\nAll screenshots saved to screenshots/');
