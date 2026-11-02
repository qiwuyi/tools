// Run: node url.test.cjs. Keep conversion checks out of the live page.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(__dirname + '/url.html', 'utf8');
const elements = {};
const element = id => elements[id] ||= { value: '', checked: false, textContent: '', innerHTML: '',
  disabled: false, hidden: false, className: '', listeners: {},
  addEventListener(type, fn) { this.listeners[type] = fn; } };
element('ent').checked = element('parsed').checked = true;
let copied;
const context = vm.createContext({ URL, URLSearchParams,
  document: { getElementById: element },
  navigator: { clipboard: { async writeText(text) { copied = text; } } },
});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
const run = code => vm.runInContext(code, context);
const normalize = text => { context.sample = text; return run('normalize(sample).text'); };
const render = text => { element('input').value = text; run('convert()'); };
const output = id => element('out-' + id).textContent;
const ids = ['normal', 'uri', 'component', 'decode', 'html', 'htmlDecode'];

assert.equal(element('state').textContent, '等待输入');
assert.ok(ids.every(id => element('copy-' + id).disabled));
assert.equal(element('qbox').hidden, true);

const clean = 'https://example.com/v1/#/transferPage?appId=3&orderId=123&timestamp=456&brandId=7&sign=example&extra=ylx';
const escaped = clean.replaceAll('&', '\\u0026');
assert.equal(normalize(escaped), clean);
assert.equal(normalize(clean.replaceAll('&', '&amp;')), clean);
assert.equal(normalize(clean.replaceAll('&', '&#38;')), clean);
assert.equal(normalize(clean.replaceAll('&', '&#x26;')), clean);
assert.equal(normalize(JSON.stringify(clean).replaceAll('&', '\\u0026')), clean);
assert.equal(normalize(clean.replaceAll('/', '\\/')), clean);
assert.equal(normalize(clean.replace('&', '\\u0026').replace('&', '&amp;')), clean);
assert.equal(normalize(encodeURIComponent(clean)), clean);
assert.equal(normalize(encodeURIComponent(encodeURIComponent(clean))), clean);
assert.equal(normalize(encodeURIComponent(encodeURIComponent(encodeURIComponent(clean)))), clean);
assert.equal(normalize('%E4%B8%AD%E6%96%87'), '中文');
assert.equal(normalize('hello+world'), 'hello+world');
assert.equal(normalize('not a url'), 'not a url');
assert.equal(normalize('%E4%B8'), '%E4%B8');
assert.equal(normalize('bad%ZZ'), 'bad%ZZ');
assert.equal(normalize('\\uZZZZ'), '\\uZZZZ');

const nested = 'https://example.com/?next=https%3A%2F%2Fx.test%2F%3Fa%3D1%26b%3D2&sign=a%2Bb+c%25&x=1&x=2';
assert.equal(normalize(nested), nested);
assert.equal(normalize(encodeURIComponent(nested)), nested);
context.sample = nested;
assert.equal(run('encodeURL(sample)'), nested);
assert.equal(run('parseURL(sample).params.length'), 4);
assert.equal(run('parseURL(sample).params[0][1]'), 'https://x.test/?a=1&b=2');
assert.equal(run('parseURL(sample).params[1][1]'), 'a+b c%');
assert.equal(run("parseURL('https://a.test/?x=1#/p?y=2').params[0][0]"), 'x');
assert.equal(run("parseURL('//a.test/#/p?x=1').where"), 'hash');
assert.equal(run("parseURL('next=https://a.test/?x=1&b=2').params.length"), 2);
assert.equal(run("decodeEntities('&constructor; &#12ab; &#xD800; &unknown;')"), '&constructor; &#12ab; &#xD800; &unknown;');

render(escaped);
assert.equal(output('normal'), clean);
assert.equal(output('uri'), clean);
assert.equal(output('component'), encodeURIComponent(clean));
assert.match(element('qtitle').textContent, /6 个查询参数.*# 路由内/);
assert.ok(ids.every(id => !element('copy-' + id).disabled));
element('ent').checked = false;
render(escaped);
assert.equal(output('normal'), escaped);
assert.match(output('uri'), /%5Cu0026/);
element('ent').checked = true;
render('a b+c');
assert.equal(output('component'), 'a%20b%2Bc');
element('plus').checked = true;
render('a b+c');
assert.equal(output('component'), 'a+b%2Bc');
assert.equal(output('decode'), 'a b c');
assert.equal(output('normal'), 'a b+c');
assert.equal(output('uri'), 'a+b+c');
element('plus').checked = false;
render('https://a.test/?q=中文 词&x=%26');
assert.equal(output('uri'), 'https://a.test/?q=%E4%B8%AD%E6%96%87%20%E8%AF%8D&x=%26');
render('<img src=x onerror=alert(1)>');
assert.equal(output('html'), '&lt;img src=x onerror=alert(1)&gt;');
render('&amp;');
assert.equal(output('html'), '&amp;amp;');
assert.equal(output('htmlDecode'), '&');
render('?q=%3Cscript%3E');
assert.ok(!element('qbody').innerHTML.includes('<script>'));
render('https://a.test/?x=%ZZ');
assert.equal(element('copy-decode').disabled, true);
assert.equal(element('copy-normal').disabled, false);
assert.match(output('decode'), /无法转换/);
render('ok');
assert.equal(element('copy-decode').disabled, false);
assert.equal(element('out-decode').className, 'out');
element('parsed').checked = false;
render(clean);
assert.equal(element('qbox').hidden, true);

(async () => {
  for (const id of ids) {
    await element('copy-' + id).listeners.click();
    assert.equal(copied, output(id), id + ' copies its own result');
    assert.match(element('status').textContent, /已复制/);
    assert.equal(element('copy-' + id).textContent, '已复制');
  }
  render('   ');
  assert.ok(ids.every(id => element('copy-' + id).disabled));
  assert.equal(element('status').textContent, '');
  assert.equal(element('qbox').hidden, true);
  console.log('PASS: escaped URLs, nested encoding, query boundaries, six outputs, copy, options and error/empty states');
})().catch(error => { console.error(error); process.exitCode = 1; });
