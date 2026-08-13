import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const OUT = path.resolve('.impeccable/screenshots');
const URL = 'http://localhost:5173/';
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', file);
}

async function waitForHero(page) {
  await page.waitForFunction(
    () => !document.querySelector('[aria-label^="Loading"]'),
    { timeout: 12000 },
  );
  await new Promise((r) => setTimeout(r, 800));
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: BRAVE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await desktop.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitForHero(desktop);
  await shot(desktop, 'desktop-hero.png');

  await desktop.evaluate(() => document.getElementById('work')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 600));
  await shot(desktop, 'desktop-work.png');

  await desktop.evaluate(() => document.getElementById('journal')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 600));
  await shot(desktop, 'desktop-journal.png');

  await desktop.evaluate(() => document.getElementById('explorations')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 600));
  await shot(desktop, 'desktop-explorations.png');

  await desktop.evaluate(() => document.getElementById('resume')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 600));
  await shot(desktop, 'desktop-stats.png');

  await desktop.evaluate(() => document.getElementById('contact')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 600));
  await shot(desktop, 'desktop-footer.png');

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await mobile.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitForHero(mobile);
  await shot(mobile, 'mobile-hero.png');

  await mobile.evaluate(() => document.getElementById('work')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 600));
  await shot(mobile, 'mobile-work.png');

  await mobile.evaluate(() => document.getElementById('journal')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 600));
  await shot(mobile, 'mobile-journal.png');

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
