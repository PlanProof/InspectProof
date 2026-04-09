import { chromium } from 'playwright';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:22333';
const EMAIL = 'contact@inspectproof.com.au';
const PASSWORD = 'InspectProof2024!';
const PHOTO_PATH = path.resolve('artifacts/web/public/how-it-works-real.png');
const OUTPUT_PATH = path.resolve('artifacts/web/public/how-it-works-composited.png');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 700 });

  // Log in
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|inspections|home)/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Navigate to inspections list
  await page.goto(`${BASE_URL}/inspections`);
  await page.waitForTimeout(3000);

  // Take screenshot of the app UI
  const uiScreenshot = await page.screenshot({ type: 'png' });
  await fs.promises.writeFile('/tmp/dashboard-ui.png', uiScreenshot);
  console.log('Dashboard screenshot captured');

  await browser.close();

  // Now composite onto the tablet photo using sharp
  // The photo is 1092×613 (16:9). The tablet screen in the image is approximately:
  // - Starts at about x=550, y=175
  // - Width ~280px, height ~380px
  // These values were estimated from the image composition.
  const photo = sharp(PHOTO_PATH);
  const photoMeta = await photo.metadata();
  console.log(`Photo size: ${photoMeta.width}x${photoMeta.height}`);

  const tabletW = Math.round(photoMeta.width * 0.25);
  const tabletH = Math.round(photoMeta.height * 0.58);
  const tabletLeft = Math.round(photoMeta.width * 0.495);
  const tabletTop = Math.round(photoMeta.height * 0.18);

  // Resize the UI screenshot to fit the tablet screen area
  const uiResized = await sharp('/tmp/dashboard-ui.png')
    .resize(tabletW, tabletH, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer();

  // Composite onto photo
  await photo
    .composite([{
      input: uiResized,
      left: tabletLeft,
      top: tabletTop,
      blend: 'over',
    }])
    .png()
    .toFile(OUTPUT_PATH);

  console.log(`Composited image saved to: ${OUTPUT_PATH}`);
}

run().catch(e => { console.error(e); process.exit(1); });
