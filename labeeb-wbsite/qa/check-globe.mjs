import {chromium} from '../../artifacts/chat-qa/node_modules/playwright/index.mjs';
const browser=await chromium.launch({executablePath:'C:/Users/shaye/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',headless:true});
try{for(const lang of ['ar','en'])for(const width of [1440,390,320]){
 const page=await browser.newPage({viewport:{width,height:950}});
 await page.goto(`http://127.0.0.1:1439/${lang==='ar'?'':'en/'}`);await page.evaluate(()=>document.fonts.ready);
 const result=await page.evaluate(()=>{const image=document.querySelector('.product-globe').getBoundingClientRect(),title=document.querySelector('.product-title').getBoundingClientRect();return {offset:Math.abs(image.x+image.width/2-innerWidth/2),above:image.bottom<title.top,overflow:document.documentElement.scrollWidth>innerWidth,width:image.width};});
 if(result.offset>1||!result.above||result.overflow)throw Error(JSON.stringify({lang,width,...result}));
 console.log(JSON.stringify({lang,viewport:width,...result}));
 if(lang==='ar'&&width===1440)await page.screenshot({path:'qa/hero-centered.png'});
 await page.close();
}}finally{await browser.close();}
