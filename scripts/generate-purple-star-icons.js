import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const iconsDir = path.resolve(rootDir, 'public/icons');

const sizes = [
  { size: 128, radius: 32, fontSize: 78 },
  { size: 48, radius: 12, fontSize: 30 },
  { size: 32, radius: 8, fontSize: 20 },
  { size: 16, radius: 4, fontSize: 11 },
];

async function generate() {
  const browser = await chromium.launch({ channel: 'msedge' });

  for (const { size, radius, fontSize } of sizes) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });

    await page.setContent(`<!DOCTYPE html><html><head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        margin: 0;
        background: transparent;
        display: flex;
        width: ${size}px;
        height: ${size}px;
        overflow: hidden;
      }
      .icon {
        width: ${size}px;
        height: ${size}px;
        background: linear-gradient(135deg, hsl(245, 85%, 60%), hsl(280, 75%, 60%));
        border-radius: ${radius}px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-size: ${fontSize}px;
        line-height: 1;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
    </style></head><body><div class="icon">✦</div></body></html>`);

    const outPath = path.resolve(iconsDir, `${size}.png`);
    await page.screenshot({ path: outPath, omitBackground: true });
    console.log(`Generated ${size}.png`);
    await page.close();
  }

  // Also create a logo.png in root and public/icons for README / display
  const bannerPage = await browser.newPage({
    viewport: { width: 520, height: 140 },
    deviceScaleFactor: 2,
  });

  await bannerPage.setContent(`<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      margin: 0;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 520px;
      height: 140px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .banner {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .icon {
      width: 72px;
      height: 72px;
      background: linear-gradient(135deg, hsl(245, 85%, 60%), hsl(280, 75%, 60%));
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 44px;
      line-height: 1;
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
    }
    .title-group {
      display: flex;
      flex-direction: column;
    }
    .title {
      font-size: 42px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -1px;
      line-height: 1.1;
    }
    .subtitle {
      font-size: 15px;
      color: #94a3b8;
      font-weight: 500;
    }
  </style></head><body>
    <div class="banner">
      <div class="icon">✦</div>
      <div class="title-group">
        <div class="title">NoLeet</div>
        <div class="subtitle">Free AI LeetCode Code Analysis</div>
      </div>
    </div>
  </body></html>`);

  const bannerElement = await bannerPage.$('.banner');
  const bannerPath = path.resolve(rootDir, 'logo.png');
  await bannerElement.screenshot({ path: bannerPath, omitBackground: true });
  console.log('Generated root logo.png');
  await bannerPage.close();

  // Also generate SVG for icon.svg and logo.svg
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="32" fill="url(#purpleGrad)"/>
  <text x="64" y="88" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="76" font-weight="bold" fill="#ffffff" text-anchor="middle">✦</text>
</svg>`;
  fs.writeFileSync(path.resolve(iconsDir, 'icon.svg'), svg, 'utf-8');
  fs.writeFileSync(path.resolve(iconsDir, 'logo.svg'), svg, 'utf-8');
  fs.writeFileSync(path.resolve(rootDir, 'logo.svg'), svg, 'utf-8');
  console.log('Generated SVGs');

  await browser.close();
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
