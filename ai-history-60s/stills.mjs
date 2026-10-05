import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const ROOT = dirname(fileURLToPath(import.meta.url));
const times = process.argv.slice(2).map(Number);
mkdirSync(`${ROOT}/out/stills`, {recursive:true});
const browser = await puppeteer.launch({executablePath:'/opt/meta-chromium/chrome',headless:true,
  args:['--no-sandbox','--allow-file-access-from-files','--force-device-scale-factor=1']});
const page = await browser.newPage();
await page.setViewport({width:1280,height:720});
page.on('pageerror',e=>console.log('[pageerror]',e.message.slice(0,300)));
await page.goto(pathToFileURL(resolve(ROOT,'reel/index.html')).href,{waitUntil:'load'});
await page.evaluate(()=>document.fonts.ready.then(()=>1));
for(const t of times){
  await page.evaluate(tt=>window.__draw(tt), t);
  await new Promise(r=>setTimeout(r,200));
  await page.screenshot({path:`${ROOT}/out/stills/s${String(t).replace('.','_')}.png`});
  console.log('still', t);
}
await browser.close();
