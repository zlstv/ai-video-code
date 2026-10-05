import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(fileURLToPath(import.meta.url));
const [,, a, b] = process.argv;
const FPS = 30, S = Number(a ?? 0), E = Number(b ?? 1799);

const browser = await puppeteer.launch({executablePath:'/opt/meta-chromium/chrome',headless:true,
  args:['--no-sandbox','--allow-file-access-from-files','--force-device-scale-factor=1']});
const page = await browser.newPage();
await page.setViewport({width:1280,height:720});
page.on('pageerror',e=>console.log('[pageerror]',e.message.slice(0,200)));
await page.goto(pathToFileURL(resolve(ROOT,'reel/index.html')).href,{waitUntil:'load'});
await page.evaluate(()=>document.fonts.ready.then(()=>1));
const t0 = Date.now();
for(let f=S; f<=E; f++){
  await page.evaluate(tt=>window.__draw(tt), f/FPS);
  await page.screenshot({path:`${ROOT}/out/frames/f${String(f).padStart(4,'0')}.png`});
  if((f-S)%150===0) console.log('frame',f,((Date.now()-t0)/1000).toFixed(0)+'s');
}
console.log('done',S,E,((Date.now()-t0)/1000).toFixed(0)+'s');
await browser.close();
