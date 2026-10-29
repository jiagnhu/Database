const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__spoken=[];window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return[{lang:'en-US',localService:true}]},speak(u){window.__spoken.push(u.text);u.onstart?.();}}});});
 try{
  await page.goto('http://localhost:3100');await page.locator('.document-card').first().waitFor();
  assert.equal(await page.locator('.document-card').count(),9);
  assert.ok((await page.locator('.hero-stats').innerText()).includes('2,509'));
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await page.getByRole('button',{name:'培训课件',exact:true}).click();assert.equal(await page.locator('.document-card').count(),7);
  await page.getByRole('button',{name:'全部',exact:true}).click();await page.locator('.document-card').first().click();await page.locator('.pair').first().waitFor();
  const first=page.locator('.pair').first();await first.locator('div').first().click();assert.ok((await first.getAttribute('class')).includes('selected'));
  await first.getByRole('button',{name:'朗读这句英文'}).click();assert.equal((await page.evaluate(()=>window.__spoken)).length,1);
  await page.screenshot({path:'test-results/reader.png',fullPage:true});
  await page.getByRole('button',{name:'返回资料库'}).click();await page.getByRole('textbox',{name:'搜索资料',exact:true}).fill('WALE');await page.getByRole('button',{name:'搜索',exact:true}).click();await page.locator('.search-result').first().waitFor();assert.ok(await page.locator('.search-result').count()>0);
  await page.getByRole('textbox',{name:'向资料助手提问'}).fill('市场价值');await page.getByRole('button',{name:'搜索相关原文',exact:true}).click();await page.locator('.raw-source').first().waitFor();assert.ok((await page.locator('.message.assistant').last().innerText()).includes('尚未调用 AI'));
  const denied=await page.request.post('http://localhost:3100/api/chat',{headers:{Origin:'http://localhost:3100'},data:{}});assert.equal(denied.status(),403);
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'关闭助手'}).click();await page.getByRole('button',{name:'清除搜索'}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  await page.locator('.document-card').first().click();await page.locator('.pair').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('PASS: real corpus, filtering, reader alignment + speech action, keyword search, preview truthfulness, denied writes, desktop/mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
