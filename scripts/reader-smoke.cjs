// Exercises only the local UI with local corpus fixtures; no login or model calls.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
(async()=>{
 const corpus=JSON.parse(await fs.readFile('data/corpus.json','utf8'));
 const doc=structuredClone(corpus.documents.find(d=>d.sections.length>=8));doc.status='ready';
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let previous='ready';
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());let body;
  if(url.pathname==='/api/session')body={mode:'connected',user:{id:'fixture',email:'reader@example.invalid',role:'admin'},configured:true,aiReady:false};
  else if(url.pathname==='/api/documents')body={documents:[{...doc,sections:undefined,pairCount:doc.sections.reduce((n,s)=>n+s.pairs.length,0)}]};
  else if(url.pathname===`/api/documents/${doc.id}`){
   if(req.method()==='PATCH'){const {action}=req.postDataJSON();if(action==='archive'){previous=doc.status;doc.status='archived';}else if(action==='restore')doc.status=previous;else throw new Error('Unexpected mutation');body={ok:true};}
   else body=doc;
  }else throw new Error('Unexpected API request: '+url.pathname);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 try{
  await page.goto('http://localhost:3100');await page.locator('.document-card').first().click();await page.locator('.reader-section').first().waitFor();
  const reader=page.locator('.reader-body');const initial=await page.locator('.reader-section').count();assert.ok(initial<doc.sections.length,'initial render should be bounded');
  await page.locator('.pair').first().locator('div').first().click();assert.equal(await page.locator('.pair.selected').count(),1);
  const top=await reader.evaluate(el=>{el.scrollTop=el.scrollHeight-el.clientHeight;return el.scrollTop;});
  await page.waitForFunction(n=>document.querySelectorAll('.reader-section').length>n,initial);
  assert.ok(await reader.evaluate(el=>el.scrollTop)>=top-2,'appending pages must not jump back');
  assert.equal(await page.locator('.pair.selected').count(),1,'selected bilingual pair remains highlighted');
  await page.waitForFunction(()=>Number(document.querySelector('[aria-label="选择章节"]').value)>0);
  const bookmark=await page.getByLabel('选择章节').inputValue();
  await page.getByRole('button',{name:'返回资料库',exact:true}).click();await page.locator('.document-card').first().click();
  await page.waitForFunction(n=>document.querySelector('[aria-label="选择章节"]').value===n,bookmark);
  await page.getByLabel('选择章节').selectOption(String(doc.sections.length-1));await page.getByText('已读到文档末尾',{exact:true}).waitFor();
  await page.getByLabel('选择章节').selectOption('0');await page.waitForFunction(()=>document.querySelector('.reader-body').scrollTop<3);
  const box=await reader.boundingBox();assert.ok(box.height>450);assert.ok(box.y<310);
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/reader-continuous-desktop.png'});
  await page.getByRole('button',{name:'删除资料',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(doc.status,'ready');
  await page.getByRole('button',{name:'删除资料',exact:true}).click();await page.getByRole('button',{name:'移入回收站',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.document-card').length===0);
  await page.locator('.sidebar nav').getByRole('button',{name:/回收站/}).click();await page.locator('.trash-item').waitFor();
  await page.getByRole('button',{name:'恢复',exact:true}).click();await page.locator('.document-card').first().waitFor();assert.equal(doc.status,'ready');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'关闭助手'}).click();await page.locator('.document-card').first().click();await page.locator('.reader-body').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok((await reader.boundingBox()).height>350);
  await page.screenshot({path:'test-results/reader-continuous-mobile.png'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({continuousAppend:true,stableScroll:true,pairedHighlight:true,bookmark:true,chapterJump:true,deleteCancel:true,trashRestore:true,desktopReaderHeight:Math.round(box.height),mobileNoOverflow:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
