import { chromium } from '../artifacts/chat-qa/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir(new URL('./qa/',import.meta.url),{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Users/shaye/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',headless:true});
const errors=[],results=[];
try{
for(const lang of ['ar','en'])for(const width of [1440,768,390,320]){
const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(String(e)));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
await page.goto(`http://127.0.0.1:1439/${lang==='en'?'en/':''}`);
await page.evaluate(()=>document.fonts.ready);
await page.locator('.footer').scrollIntoViewIfNeeded();
await page.evaluate(()=>{for(const i of document.images)i.loading='eager';});
await page.evaluate(()=>Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i=>i.decode().catch(()=>{}))));
const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,missing:[...document.images].filter(i=>i.getAttribute('src')&&(!i.complete||!i.naturalWidth)).map(i=>i.src),language:document.documentElement.lang,first:document.querySelector('.hero-figure img').getAttribute('src')}));
if(state.overflow||state.missing.length||state.language!==lang||!state.first.endsWith('about.webp'))throw Error(JSON.stringify({width,lang,...state}));
for(let i=0;i<3;i++){await page.locator('[role=tab]').nth(i).click();if(!await page.locator(`#media-panel-${i}`).isVisible())throw Error('Tab failed');}
await page.locator('[role=tab]').first().click();
await page.locator('[role=tab]').first().focus();await page.keyboard.press('End');if(await page.locator('[role=tab]').last().getAttribute('aria-selected')!=='true')throw Error('Keyboard tab failed');
await page.locator('[role=tab]').first().click();
await page.locator('.hero-shot').click();if(!await page.locator('dialog').isVisible())throw Error('Lightbox failed');await page.keyboard.press('Escape');if(await page.locator('dialog').isVisible())throw Error('Close failed');
await page.locator('summary').first().click();if(await page.locator('details').first().getAttribute('open')===null)throw Error('FAQ failed');
const href=await page.locator('.hero .primary').getAttribute('href');if(!href.includes(lang==='ar'?'hl=ar-SA':'hl=en-us'))throw Error('Store language failed');
await page.locator('summary').first().click();await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
if(width===1440||width===390)await page.screenshot({path:new URL(`./qa/${lang}-${width}.png`,import.meta.url).pathname.slice(1),fullPage:true,animations:'disabled'});
results.push({lang,width,...state});await page.close();
}
if(errors.length)throw Error(errors.join('\n'));
await writeFile(new URL('./qa/results.json',import.meta.url),JSON.stringify({results,errors},null,2));console.log(`PASS: ${results.length} language/viewport combinations, tabs, keyboard, lightbox, FAQ, images and Store URLs.`);
}finally{await browser.close();}
