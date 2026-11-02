// Local browser regression: serve this directory, open its url.html with
// playwright-cli, then: playwright-cli -s=<session> run-code --filename=ui-regression.js
async page => {
  const base = new URL(page.url()).origin;
  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Run against the local preview server.');
  // This is a local preview: always test current files, not cached CSS.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', {cacheDisabled:true});
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const reports = [];
  const url = 'https://example.com/#/page?a=1\\u0026b=2';
  const sizes = [[1680,900],[1440,900],[1280,720],[1024,576],[853,480],[375,812],[320,740]];
  for (const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    await page.goto(base+'/url.html');
    // Options are visible immediately, including the reported empty-input state.
    const empty = await page.evaluate(() => ({panel:document.querySelector('.options').offsetWidth,
      grid:document.querySelector('.results').offsetWidth,noticeTop:document.querySelector('.notice').getBoundingClientRect().top,
      panelBottom:document.querySelector('.options').getBoundingClientRect().bottom}));
    check(Math.abs(empty.panel-empty.grid)<=1 && empty.noticeTop>=empty.panelBottom,'Empty settings layout: '+JSON.stringify(empty));
    check(await page.locator('.result button:disabled').count()===6,'Empty result actions enabled');
    check(await page.locator('.options input:visible').count()===3,'Empty settings must be visible without expanding');
    check(!await page.locator('.format-help').evaluate(el=>el.open),'Long explanations must start collapsed');
    reports.push({page:'url',width,height,state:'empty',optionsWidth:empty.panel,gridWidth:empty.grid});
    await page.locator('#input').fill(url);
    for (const state of ['settings','help']) {
      if (state === 'help') await page.locator('.format-help > summary').click();
      await page.evaluate(() => scrollTo(0,0));
      const layout = await page.evaluate(state => {
        const box = selector => { const r=document.querySelector(selector).getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
        const visibleBoxes = selector => [...document.querySelectorAll(selector)].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
        return {state,width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth,
          options:box('.options'),results:box('.results'),notice:box('.notice'),utility:box('.utility-row'),
          labels:visibleBoxes('.options label'),help:visibleBoxes('.help dt,.help dd'),
          copies:visibleBoxes('.result button')};
      },state);
      check(layout.docWidth<=width, 'URL horizontal overflow: '+JSON.stringify(layout));
      check(layout.results.top>=layout.utility.bottom-1, 'Result cards overlap options');
      {
        check(layout.labels.length===3,'Missing conversion option');
        if (state==='help') check(layout.help.length===12,'Missing conversion descriptions');
        check(Math.abs(layout.options.left-layout.results.left)<=1 && Math.abs(layout.options.right-layout.results.right)<=1,
          'Options must span the result grid: '+JSON.stringify({width,state,options:layout.options,results:layout.results}));
        check(layout.notice.top>=layout.options.bottom, 'Notice competes with expanded options');
        for(const box of [...layout.labels,...layout.help]) check(box.left>=layout.options.left && box.right<=layout.options.right+1,'Option/help content escapes panel');
      }
      check(layout.copies.length===6,'Missing copy actions');
      if (width>=1280 && state!=='help') check(layout.copies.every(b=>b.bottom<=height),'Primary copies below fold with settings open: '+JSON.stringify({width,state,copies:layout.copies}));
      reports.push({page:'url',width,height,state,optionsWidth:Math.round(layout.options.width),gridWidth:Math.round(layout.results.width)});
    }
    // Keyboard and repeat-toggle regression: help can never hide the controls
    // or cause the former half-width layout.
    await page.locator('.format-help > summary').focus();
    await page.keyboard.press('Enter');
    check(!await page.locator('.format-help').evaluate(el=>el.open),'Help keyboard collapse');
    await page.locator('.format-help > summary').click();
    await page.locator('.format-help > summary').click();
    const fullWidth=await page.locator('.options').evaluate(el=>Math.abs(el.offsetWidth-document.querySelector('.results').offsetWidth)<=1);
    check(fullWidth,'Toggling help shrank options');
    check(await page.locator('.options input:visible').count()===3,'Toggling help hid options');
    await page.locator('#qtitle').click();
    check(await page.locator('#qbody tbody tr').count()===2,'Query table inaccessible');
    await page.locator('#input').fill('https://example.com/?bad=%ZZ');
    check(await page.locator('#copy-decode').isDisabled(),'Invalid output can be copied');
    await page.locator('#input').fill('');
    check(await page.locator('.result button:disabled').count()===6,'Empty output actions');
    // Every SQL setting is directly available; no extra disclosure click.
    await page.goto(base+'/sql-in.html');
    const sql=await page.evaluate(()=>({width:innerWidth,docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight,fields:[...document.querySelectorAll('.sql-settings input,.sql-settings select')].filter(e=>e.getClientRects().length).length,groups:document.querySelectorAll('.settings-row').length}));
    check(sql.docWidth<=width && sql.fields===10 && sql.groups===2,'SQL settings clipped or missing: '+JSON.stringify(sql));
    check(await page.locator('.sql-settings details').count()===0,'SQL options hidden in disclosure');
    if(width>=1280) check(sql.docHeight<=height,'SQL no longer fits one screen: '+JSON.stringify(sql));
    reports.push({page:'sql-in',width,height,state:'settings',fields:sql.fields});
  }
  return {passed:true,reports,scope:'Viewport geometry and real DOM interactions; 1024x576 and 853x480 represent the layout space of a 1280x720 browser at 125%/150%. Native browser zoom UI is not exercised.'};
}
