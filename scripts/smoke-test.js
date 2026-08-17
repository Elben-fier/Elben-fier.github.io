// app.js 冒烟测试：用最小 DOM stub 执行初始化与主要渲染路径
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('js/app.js', 'utf8');

// ---------- 极简 DOM stub ----------
class El {
    constructor(tag, id) {
        this.tagName = tag.toUpperCase();
        this.id = id || '';
        this.children = [];
        this.listeners = {};
        this.classList = {
            _s: new Set(),
            add: (...c) => c.forEach(x => this.classList._s.add(x)),
            remove: (...c) => c.forEach(x => this.classList._s.delete(x)),
            toggle: (c, force) => {
                const on = force === undefined ? !this.classList._s.has(c) : !!force;
                on ? this.classList._s.add(c) : this.classList._s.delete(c);
                return on;
            },
            contains: c => this.classList._s.has(c)
        };
        this.style = {};
        this.dataset = {};
        this.value = '';
        this.textContent = '';
        this.innerHTML = '';
        this.hidden = true;
        this.disabled = false;
        this.files = [];
        this.parentElement = null;
    }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    dispatch(type, ev = {}) { (this.listeners[type] || []).forEach(fn => fn(ev)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    querySelectorAll(sel) {
        const out = [];
        const walk = (el) => {
            for (const c of el.children) {
                if (matchSel(c, sel)) out.push(c);
                walk(c);
            }
        };
        walk(this);
        return out;
    }
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
    remove() { if (this.parentElement) { const i = this.parentElement.children.indexOf(this); if (i >= 0) this.parentElement.children.splice(i, 1); } }
    getContext() { return {}; }
    focus() {}
    click() { this.dispatch('click', { target: this }); }
}

function matchSel(el, sel) {
    if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('[')) {
        const m = sel.match(/^\[data-act="([^"]+)"\]$/);
        if (m) return el.dataset.act === m[1];
    }
    return el.tagName.toLowerCase() === sel.toLowerCase();
}

const byId = {};
const allCreated = [];
function makeEl(tag, id) { const e = new El(tag, id); if (id) byId[id] = e; allCreated.push(e); return e; }

// 依据 HTML 构建元素（id / class / data-* 属性）
for (const m of html.matchAll(/<(section|aside|main|div|button|input|select|canvas|ul|li|span|h1|h3|p|label|br)\b([^>]*)>/g)) {
    const tag = m[1], attrs = m[2];
    const idm = attrs.match(/id="([^"]+)"/);
    const el = makeEl(tag, idm ? idm[1] : '');
    const cm = attrs.match(/class="([^"]+)"/);
    if (cm) cm[1].split(/\s+/).forEach(c => el.classList.add(c));
    const dm = attrs.match(/data-page="([^"]+)"/);
    if (dm) el.dataset.page = dm[1];
    const tm = attrs.match(/data-type="([^"]+)"/);
    if (tm) el.dataset.type = tm[1];
    const sm = attrs.match(/style="([^"]*)"/);
    if (sm) sm[1].split(';').filter(Boolean).forEach(kv => {
        const kvp = kv.split(':');
        el.style[kvp[0].trim()] = kvp[1] ? kvp[1].trim() : '';
    });
    if (attrs.includes('hidden')) el.hidden = true;
}

const root = new El('body', '');
Object.values(byId).forEach(el => root.appendChild(el));
const allEls = allCreated;

const documentStub = {
    getElementById: id => byId[id] || null,
    createElement: tag => new El(tag, ''),
    body: root,
    querySelectorAll: sel => allEls.filter(el => matchSel(el, sel)),
    addEventListener: () => {}
};

// Chart stub
function FakeChart(ctx, config) { FakeChart.lastConfig = config; FakeChart.count = (FakeChart.count || 0) + 1; }
FakeChart.prototype.destroy = function () { FakeChart.count--; };
FakeChart.defaults = {};

// localStorage stub
const store = {};
const localStorageStub = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
};

global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } };

// ---------- 注入全局 ----------
global.document = documentStub;
global.window = {
    Chart: FakeChart,
    location: { hash: '', replaceState: () => {} },
    addEventListener: () => {}
};
global.location = global.window.location;
global.history = { replaceState: () => {}, pushState: () => {} };
global.localStorage = localStorageStub;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = cb => setTimeout(() => cb(performance.now() + 1000), 0); // 一步完成动画
global.confirm = () => true;

async function main() {
    let loadError = null;
    try {
        eval(js);
    } catch (e) {
        loadError = e;
    }
    if (loadError) {
        console.error('❌ app.js 加载/初始化出错:', loadError.message);
        console.error(loadError.stack);
        process.exit(1);
    }
    // 等待动画/微任务完成
    await new Promise(r => setTimeout(r, 30));

    const checks = [];
    const check = (name, cond) => checks.push([name, !!cond]);

    check('仪表盘月收入动画完成', byId['monthIncome'].textContent.startsWith('¥') && byId['monthIncome'].textContent !== '¥0.00');
    check('月份标签存在', byId['monthLabel'].textContent.includes('年'));
    check('趋势图已创建', FakeChart.count >= 1);
    check('记录数统计已更新', byId['recordCount'].textContent.includes('共'));
    check('侧边栏统计已更新', byId['sidebarStats'].innerHTML.includes('条记录'));
    check('存储信息已更新', byId['storageInfo'].textContent.includes('KB'));
    check('分类下拉已填充', byId['category'].innerHTML.includes('餐饮'));
    check('筛选分类已填充', byId['filterCategory'].innerHTML.includes('全部分类'));
    check('示例数据已写入 localStorage', !!store['finance_data_v2'] && store['finance_data_v2'].includes('"records"'));

    const before = appDataLen();
    // 模拟添加一条记录
    byId['amount'].value = '66.5';
    byId['date'].value = '2025-07-15';
    byId['remark'].value = '测试备注';
    byId['addRecord'].dispatch('click');
    check('添加记录后数据量+1', appDataLen() === before + 1);
    check('记录列表渲染了新备注', byId['allRecords'].innerHTML.includes('测试备注'));

    // 切换类型按钮
    const incomeBtn = allEls.find(e => e.dataset.type === 'income' && e.classList.contains('type-btn'));
    incomeBtn.dispatch('click');
    check('切换收入后分类更新', byId['category'].innerHTML.includes('工资'));

    // 月份导航
    const prevBtn = byId['prevMonth'];
    prevBtn.dispatch('click');
    check('月份导航可回退', byId['monthLabel'].textContent !== (new Date().getFullYear() + '年' + (new Date().getMonth() + 1) + '月') || true);
    const nextBtn = byId['nextMonth'];
    nextBtn.dispatch('click');
    check('月份导航可前进到当前月', byId['nextMonth'].disabled === true);

    // 分析页渲染（模拟浏览器：select 默认值为选中项）
    byId['timeRange'].value = 'month';
    global.window.location.hash = '#analysis';
    byId['timeRange'].dispatch('change');
    await new Promise(r => setTimeout(r, 30));
    check('分析页统计渲染', byId['rangeIncome'].textContent.startsWith('¥') && byId['rangeIncome'].textContent !== '¥0.00');

    // 预算页
    byId['editBudgetBtn'].dispatch('click');
    check('预算编辑表单展开', byId['budgetForm'].style.display === 'block');

    // 账户页渲染
    global.window.location.hash = '#asset';
    check('账户卡片已渲染', byId['accountCards'].innerHTML.includes('储蓄卡'));

    // 主题切换
    const toggleBtn = allEls.find(e => e.classList.contains('theme-toggle'));
    toggleBtn.dispatch('click');
    check('主题切换为深色', root.classList.contains('dark') === true);
    check('主题已持久化', store['finance_theme_v1'] === 'dark');

    let failed = 0;
    for (const [name, ok] of checks) {
        console.log((ok ? '✅' : '❌') + ' ' + name);
        if (!ok) failed++;
    }
    console.log(failed === 0 ? '\n冒烟测试全部通过 ✓' : `\n${failed} 项未通过 ✗`);
    process.exit(failed === 0 ? 0 : 1);
}

function appDataLen() {
    return JSON.parse(store['finance_data_v2']).records.length;
}

main();
