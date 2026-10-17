import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const iconsDir = path.resolve(rootDir, 'public/icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const icons = [
  { size: 128, stroke: 7 },
  { size: 48, stroke: 8 },
  { size: 32, stroke: 9 },
  { size: 16, stroke: 12 },
];

function getSvg(stroke, width = 64, height = 64) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 64 64" role="img" aria-label="NoLeet mark">
  <rect width="64" height="64" rx="16" fill="#14131A"/>
  <path d="M12 52L52 32L52 12C44 44 30 52 12 52Z" fill="#C6F135" opacity="0.28"/>
  <path d="M12 52C30 52 44 44 52 12" stroke="#F4F3EE" stroke-width="${stroke}" stroke-linecap="square" fill="none"/>
  <path d="M12 52L52 32" stroke="#C6F135" stroke-width="${stroke}" stroke-linecap="square" fill="none"/>
</svg>`;
}

async function run() {
  // Save base SVGs
  const svg128 = getSvg(7, 128, 128);
  fs.writeFileSync(path.resolve(iconsDir, 'icon.svg'), svg128, 'utf-8');
  fs.writeFileSync(path.resolve(iconsDir, 'logo.svg'), svg128, 'utf-8');
  console.log('Saved icon.svg and logo.svg');

  const browser = await chromium.launch({ channel: 'msedge' });

  // Render individual icon sizes
  for (const { size, stroke } of icons) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#14131A"/>
      <path d="M12 52L52 32L52 12C44 44 30 52 12 52Z" fill="#C6F135" opacity="0.28"/>
      <path d="M12 52C30 52 44 44 52 12" stroke="#F4F3EE" stroke-width="${stroke}" stroke-linecap="square" fill="none"/>
      <path d="M12 52L52 32" stroke="#C6F135" stroke-width="${stroke}" stroke-linecap="square" fill="none"/>
    </svg>`;
    await page.setContent(`<!DOCTYPE html><html><head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { margin: 0; padding: 0; background: transparent; overflow: hidden; display: flex; width: ${size}px; height: ${size}px; }
      svg { width: ${size}px; height: ${size}px; display: block; }
    </style></head><body>${svg}</body></html>`);

    const outPath = path.resolve(iconsDir, `${size}.png`);
    await page.screenshot({ path: outPath, omitBackground: true });
    console.log(`Generated ${size}.png (${fs.statSync(outPath).size} bytes)`);
    await page.close();
  }

  // Render a banner containing the mark and the exact styled typography
  const bannerPage = await browser.newPage({
    viewport: { width: 560, height: 160 },
    deviceScaleFactor: 2,
  });

  await bannerPage.setContent(`<!DOCTYPE html>
<html>
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 560px;
      height: 160px;
      font-family: 'JetBrains Mono', monospace;
    }
    .banner {
      background: #14131A;
      border-radius: 24px;
      padding: 24px 36px;
      display: flex;
      align-items: center;
      gap: 24px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.4);
    }
    .wordmark {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      font-size: 64px;
      font-weight: 700;
      letter-spacing: -3.5px;
      color: #F4F3EE;
      line-height: 1;
    }
    .cursor {
      display: block;
      width: 32px;
      height: 10px;
      margin-bottom: 5px;
      background: #C6F135;
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <div class="banner">
    <svg width="80" height="80" viewBox="0 0 64 64" role="img" aria-label="NoLeet mark">
      <rect width="64" height="64" rx="16" fill="#14131A"/>
      <path d="M12 52L52 32L52 12C44 44 30 52 12 52Z" fill="#C6F135" opacity="0.28"/>
      <path d="M12 52C30 52 44 44 52 12" stroke="#F4F3EE" stroke-width="7" stroke-linecap="square" fill="none"/>
      <path d="M12 52L52 32" stroke="#C6F135" stroke-width="7" stroke-linecap="square" fill="none"/>
    </svg>
    <div class="wordmark">
      <span>noleet</span>
      <span class="cursor"></span>
    </div>
  </div>
</body>
</html>`);

  await bannerPage.waitForFunction(() => document.fonts.ready);
  const bannerElement = await bannerPage.$('.banner');
  const bannerPngPath = path.resolve(iconsDir, 'logo-banner.png');
  await bannerElement.screenshot({ path: bannerPngPath, omitBackground: true });
  console.log('Saved logo-banner.png');
  await bannerPage.close();

  // Also write SVG version of the exact banner
  const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="128" viewBox="0 0 460 128" fill="none">
  <rect width="460" height="128" rx="24" fill="#14131A"/>
  <g transform="translate(28, 24)">
    <rect width="80" height="80" rx="20" fill="#14131A"/>
    <g transform="scale(1.25)">
      <path d="M12 52L52 32L52 12C44 44 30 52 12 52Z" fill="#C6F135" opacity="0.28"/>
      <path d="M12 52C30 52 44 44 52 12" stroke="#F4F3EE" stroke-width="7" stroke-linecap="square" fill="none"/>
      <path d="M12 52L52 32" stroke="#C6F135" stroke-width="7" stroke-linecap="square" fill="none"/>
    </g>
  </g>
  <text x="136" y="81" font-family="'JetBrains Mono', monospace" font-size="64" font-weight="700" letter-spacing="-3.5" fill="#F4F3EE">noleet</text>
  <rect x="390" y="73" width="32" height="10" fill="#C6F135"/>
</svg>`;
  fs.writeFileSync(path.resolve(iconsDir, 'logo-banner.svg'), bannerSvg, 'utf-8');
  console.log('Saved logo-banner.svg');

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
