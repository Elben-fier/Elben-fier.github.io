/* ==========================================================
   个人财政分析中心 - 应用逻辑
   纯前端 + localStorage，无后端
   ========================================================== */
'use strict';

// ========== 常量 ==========
const STORAGE_KEY = 'finance_data_v2';
const THEME_KEY = 'finance_theme_v1';

// Chart.js 异步加载（多 CDN 备用 + 超时控制，避免单个 CDN 不可用导致页面卡死）
const CHART_CDNS = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.staticfile.org/Chart.js/4.4.1/chart.umd.min.js',
    'https://cdn.bootcdn.net/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];
const CHART_LOAD_TIMEOUT = 8000; // 每个 CDN 最多等待 8 秒
let chartLibFailed = false;
let chartLibLoading = false;

function loadChartLib() {
    return new Promise(resolve => {
        if (window.Chart) { resolve(); return; }
        if (chartLibLoading) { resolve(); return; }
        chartLibLoading = true;
        let idx = 0;
        const tryNext = () => {
            if (idx >= CHART_CDNS.length) {
                chartLibFailed = true;
                chartLibLoading = false;
                resolve();
                return;
            }
            const src = CHART_CDNS[idx++];
            const s = document.createElement('script');
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (window.Chart) {
                    chartLibFailed = false;
                    chartLibLoading = false;
                    resolve();
                } else {
                    tryNext();
                }
            };
            const timer = setTimeout(done, CHART_LOAD_TIMEOUT);
            s.src = src;
            s.onload = done;
            s.onerror = done;
            document.head.appendChild(s);
        };
        tryNext();
    });
}

const EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '其他'];
const INCOME_CATEGORIES = ['工资', '兼职', '理财收益', '红包', '其他'];
const ACCOUNT_TYPES = ['现金', '银行卡', '电子钱包', '信用卡', '其他'];
const CHART_COLORS = ['#165DFF', '#00B42A', '#FF7D00', '#F53F3F', '#722ED1', '#14C9C9', '#F7BA1E', '#E84A5F'];

// ========== 工具函数 ==========
function formatMoney(n) {
    return '¥' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function getMonthStr(d = new Date()) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}

function monthStrOf(y, m0) {
    return y + '-' + pad2(m0 + 1);
}

function isSameMonth(dateStr, monthStr) {
    return dateStr.startsWith(monthStr);
}

function daysInMonth(y, m0) {
    return new Date(y, m0 + 1, 0).getDate();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function genId() {
    return Date.now() + Math.floor(Math.random() * 10000);
}

function $(id) {
    return document.getElementById(id);
}

// ========== 数据存储层 ==========
function getDefaultData(withDemo = false) {
    return {
        records: withDemo ? genDemoRecords() : [],
        budgets: {
            '餐饮': 1500,
            '交通': 500,
            '购物': 1000,
            '住房': 2000,
            '娱乐': 800,
            '医疗': 300,
            '教育': 500,
            '其他': 500
        },
        accounts: [
            { id: 1, name: '现金', balance: 500, type: '现金' },
            { id: 2, name: '储蓄卡', balance: 10000, type: '银行卡' },
            { id: 3, name: '支付宝', balance: 2000, type: '电子钱包' },
            { id: 4, name: '微信钱包', balance: 800, type: '电子钱包' }
        ]
    };
}

// 生成示例数据（近 3 个月），让图表首次打开就有内容
function genDemoRecords() {
    const records = [];
    const now = new Date();
    const foodDays = [1, 3, 6, 9, 12, 15, 18, 21, 24, 27];

    for (let back = 2; back >= 0; back--) {
        const base = new Date(now.getFullYear(), now.getMonth() - back, 1);
        const y = base.getFullYear();
        const m = base.getMonth();
        const monthStr = monthStrOf(y, m);
        const today = now.getDate();

        records.push({ id: genId(), type: 'income', amount: 12000, category: '工资', date: monthStr + '-10', remark: '月度工资' });
        records.push({ id: genId(), type: 'expense', amount: 2200, category: '住房', date: monthStr + '-01', remark: '房租' });

        foodDays.forEach(day => {
            if (back === 0 && day > today) return;
            const ds = monthStr + '-' + pad2(day);
            records.push({ id: genId(), type: 'expense', amount: 18 + ((day * 7) % 35), category: '餐饮', date: ds, remark: '日常餐饮' });
            records.push({ id: genId(), type: 'expense', amount: 2 + ((day * 3) % 8), category: '交通', date: ds, remark: '通勤' });
        });

        if (16 <= (back === 0 ? today : 31)) {
            records.push({ id: genId(), type: 'expense', amount: 260 + (back * 80), category: '购物', date: monthStr + '-16', remark: '生活用品' });
        }
        if (20 <= (back === 0 ? today : 31)) {
            records.push({ id: genId(), type: 'expense', amount: 68, category: '娱乐', date: monthStr + '-20', remark: '电影' });
        }
        if (back === 0) {
            records.push({ id: genId(), type: 'income', amount: 520, category: '理财收益', date: monthStr + '-' + pad2(today), remark: '活期利息' });
        }
    }
    return records.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        const data = getDefaultData(true); // 首次打开载入示例数据
        saveData(data);
        return data;
    }
    try {
        const parsed = JSON.parse(raw);
        // 兼容旧版本数据（v1 缺少教育预算等字段）
        if (!parsed.budgets) parsed.budgets = getDefaultData().budgets;
        if (!parsed.accounts) parsed.accounts = getDefaultData().accounts;
        if (!Array.isArray(parsed.records)) parsed.records = [];
        return parsed;
    } catch (e) {
        const data = getDefaultData(true);
        saveData(data);
        return data;
    }
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let appData = loadData();

// ========== 全局状态 ==========
let currentType = 'expense';          // 记账页当前类型
let dashMonth = { y: new Date().getFullYear(), m: new Date().getMonth() }; // 仪表盘查看的月份
let recordFilters = { search: '', type: 'all', category: 'all' };          // 记录页筛选

// 图表实例
let trendChartInst = null;
let categoryChartInst = null;
let analysisTrendChartInst = null;
let analysisPieChartInst = null;
let assetChartInst = null;

// ========== Toast 轻提示 ==========
const TOAST_ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

function showToast(msg, type = 'success') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-icon">' + (TOAST_ICONS[type] || 'ℹ️') + '</span><span>' + escapeHtml(msg) + '</span>';
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2400);
}

// ========== 模态框 ==========
function openModal(html) {
    const overlay = $('modalOverlay');
    const box = $('modalBox');
    box.innerHTML = html;
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('open'));
    return box;
}

function closeModal() {
    const overlay = $('modalOverlay');
    overlay.classList.remove('open');
    setTimeout(() => { overlay.hidden = true; }, 180);
}

function confirmModal({ title, message, danger = false }) {
    return new Promise(resolve => {
        const box = openModal(`
            <div class="modal-title">${escapeHtml(title)}</div>
            <div class="modal-body">${message}</div>
            <div class="modal-actions">
                <button class="btn" data-act="cancel">取消</button>
                <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">确定</button>
            </div>`);
        box.querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => {
                closeModal();
                resolve(b.dataset.act === 'ok');
            });
        });
    });
}

$('modalOverlay').addEventListener('click', e => {
    if (e.target === $('modalOverlay')) closeModal();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('modalOverlay').hidden) closeModal();
});

// ========== 主题 ==========
function isDark() {
    return document.body.classList.contains('dark');
}

function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
    const state = $('themeState');
    if (state) state.textContent = '当前：' + (isDark() ? '🌙 深色模式' : '☀️ 浅色模式');
}

function toggleTheme() {
    applyTheme(isDark() ? 'light' : 'dark');
    // 主题变化后重绘当前页图表
    renderCurrentPageCharts();
    showToast(isDark() ? '已切换为深色模式' : '已切换为浅色模式', 'info');
}

// 图表配色随主题切换
function chartTheme() {
    return {
        grid: isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
        tick: isDark() ? '#C9CDD4' : '#4E5969'
    };
}

function chartEmpty(id, message) {
    const canvas = $(id);
    if (!canvas) return;
    const box = canvas.parentElement;
    let tip = box.querySelector('.chart-empty');
    if (!tip) {
        tip = document.createElement('div');
        tip.className = 'chart-empty';
        box.appendChild(tip);
    }
    tip.textContent = message;
}

function chartNotEmpty(id) {
    const canvas = $(id);
    if (!canvas) return;
    const tip = canvas.parentElement.querySelector('.chart-empty');
    if (tip) tip.remove();
}

// 图表库不可用时的提示文案
function chartLibMsg() {
    return chartLibFailed
        ? '图表库加载失败（网络受限），记账等功能不受影响，可稍后刷新重试'
        : '图表加载中…';
}

// ========== 数字滚动动画 ==========
function animateValue(el, target, duration = 650) {
    const start = performance.now();
    function step(now) {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = formatMoney(target * eased);
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ========== 导航（支持 URL hash 路由） ==========
const navItems = document.querySelectorAll('.nav-item');

function getPageFromHash() {
    const p = location.hash.replace('#', '');
    return document.getElementById(p) ? p : 'dashboard';
}

function switchPage(page) {
    navItems.forEach(i => i.classList.toggle('active', i.dataset.page === page));
    document.querySelectorAll('.page-section').forEach(s => {
        s.classList.toggle('active', s.id === page);
    });
    $('sidebar').classList.remove('open');

    if (page === 'dashboard') renderDashboard();
    if (page === 'record') renderRecordList();
    if (page === 'analysis') renderAnalysis();
    if (page === 'budget') renderBudget();
    if (page === 'asset') renderAsset();
}

function renderCurrentPageCharts() {
    const page = getPageFromHash();
    if (page === 'dashboard') renderDashboard();
    if (page === 'analysis') renderAnalysis();
    if (page === 'asset') renderAsset();
}

// ========== 仪表盘 ==========
function renderDashboard() {
    const monthStr = monthStrOf(dashMonth.y, dashMonth.m);
    const monthLabel = dashMonth.y + '年' + (dashMonth.m + 1) + '月';
    const monthRecords = appData.records.filter(r => isSameMonth(r.date, monthStr));

    const monthIncome = monthRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const monthExpense = monthRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const monthBalance = monthIncome - monthExpense;
    const totalAsset = appData.accounts.reduce((s, a) => s + a.balance, 0);

    $('monthLabel').textContent = monthLabel;
    $('monthIncomeDesc').textContent = monthLabel + ' 全部入账';
    $('monthExpenseDesc').textContent = monthLabel + ' 全部花销';
    $('nextMonth').disabled = isCurrentMonth(dashMonth.y, dashMonth.m);

    animateValue($('monthIncome'), monthIncome);
    animateValue($('monthExpense'), monthExpense);
    animateValue($('monthBalance'), monthBalance);
    animateValue($('totalAsset'), totalAsset);

    renderTrendChart(monthStr);
    renderCategoryChart(monthStr);
    renderRecentRecords();
}

function isCurrentMonth(y, m0) {
    const now = new Date();
    return y === now.getFullYear() && m0 === now.getMonth();
}

function renderTrendChart(monthStr) {
    const months = [];
    const incomeData = [];
    const expenseData = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date(dashMonth.y, dashMonth.m - i, 1);
        const ms = monthStrOf(d.getFullYear(), d.getMonth());
        months.push((d.getMonth() + 1) + '月');
        const recs = appData.records.filter(r => isSameMonth(r.date, ms));
        incomeData.push(recs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0));
        expenseData.push(recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0));
    }

    chartNotEmpty('trendChart');
    const ctx = $('trendChart').getContext('2d');
    if (trendChartInst) trendChartInst.destroy();
    if (!window.Chart) { chartEmpty('trendChart', chartLibMsg()); return; }

    const t = chartTheme();
    window.Chart.defaults.color = t.tick;
    trendChartInst = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: '收入',
                    data: incomeData,
                    borderColor: '#00B42A',
                    backgroundColor: 'rgba(0, 180, 42, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3
                },
                {
                    label: '支出',
                    data: expenseData,
                    borderColor: '#F53F3F',
                    backgroundColor: 'rgba(245, 63, 63, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function (ctx) { return ctx.dataset.label + '：' + formatMoney(ctx.parsed.y); }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: t.grid },
                    ticks: { callback: v => '¥' + v }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderCategoryChart(monthStr) {
    const expenseRecords = appData.records.filter(r => r.type === 'expense' && isSameMonth(r.date, monthStr));
    const map = {};
    expenseRecords.forEach(r => { map[r.category] = (map[r.category] || 0) + r.amount; });

    const labels = Object.keys(map);
    const data = Object.values(map);

    if (labels.length === 0) {
        if (categoryChartInst) { categoryChartInst.destroy(); categoryChartInst = null; }
        chartEmpty('categoryChart', '该月暂无支出记录');
        return;
    }
    if (!window.Chart) { chartEmpty('categoryChart', chartLibMsg()); return; }
    chartNotEmpty('categoryChart');
    const ctx = $('categoryChart').getContext('2d');
    if (categoryChartInst) categoryChartInst.destroy();

    const t = chartTheme();
    window.Chart.defaults.color = t.tick;
    categoryChartInst = new window.Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderWidth: 2,
                borderColor: isDark() ? '#1E1E1E' : '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                            return ctx.label + '：' + formatMoney(ctx.parsed) + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

function renderRecentRecords() {
    const container = $('recentRecords');
    const recent = appData.records.slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = '<div class="empty-tip">暂无记录，点击右上角「去记账」开始吧</div>';
        return;
    }

    container.innerHTML = recent.map(r => recordItemHTML(r, false)).join('');
}

// 单条记录 HTML
function recordItemHTML(r, withActions) {
    const actions = withActions
        ? `<div class="record-actions">
              <button class="icon-btn" title="编辑" onclick="editRecordById(${r.id})">✏️</button>
              <button class="icon-btn danger" title="删除" onclick="deleteRecordById(${r.id})">🗑</button>
          </div>`
        : '';
    return `
        <div class="record-item">
            <div class="record-left">
                <div class="record-icon ${r.type}">${r.type === 'expense' ? '💸' : '💰'}</div>
                <div class="record-info">
                    <div class="category">${escapeHtml(r.category)}</div>
                    <div class="remark">${escapeHtml(r.remark || '无备注')}</div>
                </div>
            </div>
            <div class="record-right">
                <div>
                    <div class="record-amount ${r.type}">${r.type === 'expense' ? '-' : '+'}${formatMoney(r.amount)}</div>
                    <div class="record-date">${escapeHtml(r.date)}</div>
                </div>
                ${actions}
            </div>
        </div>`;
}

// ========== 记账模块 ==========
function populateCategorySelect(select, type, selected) {
    const cats = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    select.innerHTML = cats.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
}

document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        currentType = btn.dataset.type;
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        populateCategorySelect($('category'), currentType);
    });
});

// 默认日期为今天
$('date').valueAsDate = new Date();

// Enter 键快速提交
['amount', 'remark'].forEach(id => {
    $(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addRecord();
        }
    });
});

function addRecord() {
    const amount = parseFloat($('amount').value);
    const category = $('category').value;
    const date = $('date').value;
    const remark = $('remark').value.trim();

    if (!amount || amount <= 0) {
        showToast('请输入有效金额', 'warning');
        $('amount').focus();
        return;
    }
    if (!date) {
        showToast('请选择日期', 'warning');
        return;
    }

    appData.records.unshift({
        id: genId(),
        type: currentType,
        amount: amount,
        category: category,
        date: date,
        remark: remark
    });
    saveData(appData);

    $('amount').value = '';
    $('remark').value = '';

    renderRecordList();
    updateSidebarStats();
    showToast('记录添加成功', 'success');
}

function getFilteredRecords() {
    let list = appData.records.slice();
    if (recordFilters.type !== 'all') list = list.filter(r => r.type === recordFilters.type);
    if (recordFilters.category !== 'all') list = list.filter(r => r.category === recordFilters.category);
    if (recordFilters.search) {
        const kw = recordFilters.search.toLowerCase();
        list = list.filter(r =>
            (r.remark || '').toLowerCase().includes(kw) ||
            r.category.toLowerCase().includes(kw)
        );
    }
    return list.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function renderRecordList() {
    const container = $('allRecords');
    const records = getFilteredRecords();

    $('recordCount').textContent = records.length === appData.records.length
        ? `共 ${records.length} 条`
        : `显示 ${records.length} / 共 ${appData.records.length} 条`;

    if (records.length === 0) {
        container.innerHTML = '<div class="empty-tip">' + (appData.records.length === 0 ? '暂无记录，添加第一笔收支吧 💪' : '没有符合筛选条件的记录') + '</div>';
        return;
    }

    container.innerHTML = records.map(r => recordItemHTML(r, true)).join('');
}

// 编辑记录（模态框）
function editRecordById(id) {
    const record = appData.records.find(r => r.id === id);
    if (!record) return;

    const box = openModal(`
        <div class="modal-title">编辑记录</div>
        <div class="form-group" style="margin-bottom: 14px;">
            <label>类型</label>
            <select id="editType">
                <option value="expense" ${record.type === 'expense' ? 'selected' : ''}>支出</option>
                <option value="income" ${record.type === 'income' ? 'selected' : ''}>收入</option>
            </select>
        </div>
        <div class="form-group" style="margin-bottom: 14px;">
            <label>金额</label>
            <input type="number" id="editAmount" step="0.01" min="0" value="${record.amount}">
        </div>
        <div class="form-group" style="margin-bottom: 14px;">
            <label>分类</label>
            <select id="editCategory"></select>
        </div>
        <div class="form-group" style="margin-bottom: 14px;">
            <label>日期</label>
            <input type="date" id="editDate" value="${record.date}">
        </div>
        <div class="form-group">
            <label>备注</label>
            <input type="text" id="editRemark" value="${escapeHtml(record.remark || '')}" placeholder="可选">
        </div>
        <div class="modal-actions">
            <button class="btn" data-act="cancel">取消</button>
            <button class="btn btn-primary" data-act="save">保存</button>
        </div>`);

    const typeSelect = box.querySelector('#editType');
    const catSelect = box.querySelector('#editCategory');
    populateCategorySelect(catSelect, record.type, record.category);

    typeSelect.addEventListener('change', () => populateCategorySelect(catSelect, typeSelect.value));

    box.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
    box.querySelector('[data-act="save"]').addEventListener('click', () => {
        const amount = parseFloat(box.querySelector('#editAmount').value);
        const date = box.querySelector('#editDate').value;
        if (!amount || amount <= 0) { showToast('请输入有效金额', 'warning'); return; }
        if (!date) { showToast('请选择日期', 'warning'); return; }

        record.type = typeSelect.value;
        record.amount = amount;
        record.category = catSelect.value;
        record.date = date;
        record.remark = box.querySelector('#editRemark').value.trim();

        saveData(appData);
        closeModal();
        renderRecordList();
        renderDashboard();
        updateSidebarStats();
        showToast('记录已更新', 'success');
    });
}

// 删除记录
async function deleteRecordById(id) {
    const ok = await confirmModal({
        title: '删除记录',
        message: '确定删除这条收支记录吗？此操作无法撤销。',
        danger: true
    });
    if (!ok) return;
    appData.records = appData.records.filter(r => r.id !== id);
    saveData(appData);
    renderRecordList();
    renderDashboard();
    updateSidebarStats();
    showToast('记录已删除', 'info');
}

// ========== 记录筛选 ==========
function rebuildCategoryFilter() {
    const select = $('filterCategory');
    const cats = Array.from(new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]));
    select.innerHTML = '<option value="all">全部分类</option>' +
        cats.map(c => `<option value="${c}" ${recordFilters.category === c ? 'selected' : ''}>${c}</option>`).join('');
}

$('recordSearch').addEventListener('input', e => {
    recordFilters.search = e.target.value.trim().toLowerCase();
    renderRecordList();
});

$('filterType').addEventListener('change', e => {
    recordFilters.type = e.target.value;
    renderRecordList();
});

$('filterCategory').addEventListener('change', e => {
    recordFilters.category = e.target.value;
    renderRecordList();
});

$('clearFilter').addEventListener('click', () => {
    recordFilters = { search: '', type: 'all', category: 'all' };
    $('recordSearch').value = '';
    $('filterType').value = 'all';
    $('filterCategory').value = 'all';
    renderRecordList();
    showToast('已重置筛选', 'info');
});

// ========== 分析报表 ==========
$('timeRange').addEventListener('change', renderAnalysis);

function renderAnalysis() {
    const range = $('timeRange').value;
    const records = getRecordsByRange(range);

    const totalIncome = records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const totalExpense = records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const balance = totalIncome - totalExpense;
    const avgExpense = totalExpense / Math.max(1, getRangeDays(range));

    animateValue($('rangeIncome'), totalIncome);
    animateValue($('rangeExpense'), totalExpense);
    animateValue($('rangeBalance'), balance);
    animateValue($('avgExpense'), avgExpense);

    renderAnalysisTrend(range);
    renderAnalysisPie(records);
    renderExpenseRank(records);
}

function getRecordsByRange(range) {
    const now = new Date();
    let startDate;

    switch (range) {
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'lastMonth': {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
            return appData.records.filter(r => {
                const d = new Date(r.date);
                return d >= startDate && d <= lastMonthEnd;
            });
        }
        case 'quarter':
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 3);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
    }

    return appData.records.filter(r => new Date(r.date) >= startDate);
}

function getRangeDays(range) {
    const now = new Date();
    switch (range) {
        case 'month': return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        case 'lastMonth': return new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        case 'quarter': return 90;
        case 'year': return 365;
        default: return 30;
    }
}

function renderAnalysisTrend(range) {
    const labels = [];
    const incomeData = [];
    const expenseData = [];
    const now = new Date();

    if (range === 'month' || range === 'lastMonth') {
        const target = range === 'month'
            ? new Date(now.getFullYear(), now.getMonth(), 1)
            : new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const days = daysInMonth(target.getFullYear(), target.getMonth());
        const ms = monthStrOf(target.getFullYear(), target.getMonth());

        for (let i = 1; i <= days; i++) {
            labels.push(i + '日');
            const dayStr = ms + '-' + pad2(i);
            const dayRecords = appData.records.filter(r => r.date === dayStr);
            incomeData.push(dayRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0));
            expenseData.push(dayRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0));
        }
    } else {
        const months = range === 'quarter' ? 3 : 12;
        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const ms = monthStrOf(d.getFullYear(), d.getMonth());
            labels.push((d.getMonth() + 1) + '月');
            const monthRecords = appData.records.filter(r => isSameMonth(r.date, ms));
            incomeData.push(monthRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0));
            expenseData.push(monthRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0));
        }
    }

    if (analysisTrendChartInst) analysisTrendChartInst.destroy();
    if (!window.Chart) { chartEmpty('analysisTrendChart', chartLibMsg()); return; }
    chartNotEmpty('analysisTrendChart');

    const t = chartTheme();
    window.Chart.defaults.color = t.tick;
    const ctx = $('analysisTrendChart').getContext('2d');
    analysisTrendChartInst = new window.Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '收入', data: incomeData, backgroundColor: 'rgba(0, 180, 42, 0.7)', borderRadius: 4 },
                { label: '支出', data: expenseData, backgroundColor: 'rgba(245, 63, 63, 0.7)', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: ctx2 => ctx2.dataset.label + '：' + formatMoney(ctx2.parsed.y) } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: t.grid }, ticks: { callback: v => '¥' + v } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderAnalysisPie(records) {
    const expenseRecords = records.filter(r => r.type === 'expense');
    const map = {};
    expenseRecords.forEach(r => { map[r.category] = (map[r.category] || 0) + r.amount; });

    const labels = Object.keys(map);
    const data = Object.values(map);

    if (analysisPieChartInst) analysisPieChartInst.destroy();
    if (labels.length === 0) {
        analysisPieChartInst = null;
        chartEmpty('analysisPieChart', '该时段暂无支出数据');
        return;
    }
    if (!window.Chart) { chartEmpty('analysisPieChart', chartLibMsg()); return; }
    chartNotEmpty('analysisPieChart');

    const t = chartTheme();
    window.Chart.defaults.color = t.tick;
    const ctx = $('analysisPieChart').getContext('2d');
    analysisPieChartInst = new window.Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderWidth: 2,
                borderColor: isDark() ? '#1E1E1E' : '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function (ctx2) {
                            const total = ctx2.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx2.parsed / total) * 100).toFixed(1) : 0;
                            return ctx2.label + '：' + formatMoney(ctx2.parsed) + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

function renderExpenseRank(records) {
    const expenseRecords = records.filter(r => r.type === 'expense');
    const map = {};
    expenseRecords.forEach(r => { map[r.category] = (map[r.category] || 0) + r.amount; });

    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, item) => s + item[1], 0) || 1;

    const container = $('expenseRank');
    if (sorted.length === 0) {
        container.innerHTML = '<div class="empty-tip">该时段暂无支出数据</div>';
        return;
    }

    container.innerHTML = sorted.map(([cat, amount], idx) => {
        const percent = ((amount / total) * 100).toFixed(1);
        const rankColor = idx === 0 ? 'var(--danger)' : (idx === 1 ? 'var(--warning)' : 'var(--primary)');
        return `
            <div class="budget-item">
                <div class="budget-header">
                    <span>${idx + 1}. ${escapeHtml(cat)}</span>
                    <span style="font-weight: 600; color: ${rankColor};">${formatMoney(amount)} (${percent}%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%; background: ${rankColor};"></div>
                </div>
            </div>`;
    }).join('');
}

// ========== 预算管理 ==========
$('editBudgetBtn').addEventListener('click', () => {
    const form = $('budgetForm');
    const show = form.style.display === 'none';
    form.style.display = show ? 'block' : 'none';
    if (show) renderBudgetInputs();
});

$('cancelBudget').addEventListener('click', () => {
    $('budgetForm').style.display = 'none';
});

function renderBudgetInputs() {
    const container = $('budgetInputs');
    container.innerHTML = EXPENSE_CATEGORIES.map(cat => `
        <div class="form-group">
            <label>${cat}预算 (元)</label>
            <input type="number" class="budget-input" data-category="${cat}" value="${appData.budgets[cat] || 0}" min="0" step="0.01">
        </div>`).join('');
}

$('saveBudget').addEventListener('click', () => {
    document.querySelectorAll('.budget-input').forEach(input => {
        appData.budgets[input.dataset.category] = parseFloat(input.value) || 0;
    });
    saveData(appData);
    $('budgetForm').style.display = 'none';
    renderBudget();
    showToast('预算保存成功', 'success');
});

function renderBudget() {
    const currentMonth = getMonthStr();
    const monthExpenseRecords = appData.records.filter(
        r => r.type === 'expense' && isSameMonth(r.date, currentMonth)
    );

    const categoryExpense = {};
    monthExpenseRecords.forEach(r => {
        categoryExpense[r.category] = (categoryExpense[r.category] || 0) + r.amount;
    });

    const container = $('budgetList');
    container.innerHTML = EXPENSE_CATEGORIES.map(cat => {
        const budget = appData.budgets[cat] || 0;
        const used = categoryExpense[cat] || 0;
        const percent = budget > 0 ? Math.min(100, (used / budget) * 100) : 0;
        const remain = budget - used;

        let statusClass = '';
        if (percent >= 100) statusClass = 'danger';
        else if (percent >= 80) statusClass = 'warning';

        const over = remain < 0;
        const remainColor = over ? 'var(--danger)' : (percent >= 80 ? 'var(--warning)' : 'var(--text-tertiary)');

        return `
            <div class="budget-item">
                <div class="budget-header">
                    <span>${escapeHtml(cat)}</span>
                    <span>${formatMoney(used)} / ${formatMoney(budget)}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${statusClass}" style="width: ${percent}%"></div>
                </div>
                <div style="margin-top: 6px; font-size: 12px; color: ${remainColor};">
                    ${over ? `⚠️ 超支 ${formatMoney(Math.abs(remain))}` : `剩余 ${formatMoney(remain)}`}
                </div>
            </div>`;
    }).join('');
}

// ========== 账户资产 ==========
$('addAccountBtn').addEventListener('click', () => accountModal());

function accountModal(account = null) {
    const isEdit = !!account;
    const box = openModal(`
        <div class="modal-title">${isEdit ? '编辑账户' : '添加账户'}</div>
        <div class="form-group" style="margin-bottom: 14px;">
            <label>账户名称</label>
            <input type="text" id="accName" value="${isEdit ? escapeHtml(account.name) : ''}" placeholder="例如：招商银行">
        </div>
        <div class="form-group" style="margin-bottom: 14px;">
            <label>账户类型</label>
            <select id="accType">
                ${ACCOUNT_TYPES.map(t => `<option value="${t}" ${isEdit && account.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>当前余额</label>
            <input type="number" id="accBalance" step="0.01" value="${isEdit ? account.balance : ''}" placeholder="0.00">
        </div>
        <div class="modal-actions">
            <button class="btn" data-act="cancel">取消</button>
            <button class="btn btn-primary" data-act="save">保存</button>
        </div>`);

    box.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
    box.querySelector('[data-act="save"]').addEventListener('click', () => {
        const name = box.querySelector('#accName').value.trim();
        const type = box.querySelector('#accType').value;
        const balance = parseFloat(box.querySelector('#accBalance').value) || 0;
        if (!name) { showToast('请输入账户名称', 'warning'); return; }

        if (isEdit) {
            Object.assign(account, { name, type, balance });
            showToast('账户已更新', 'success');
        } else {
            appData.accounts.push({ id: genId(), name, type, balance });
            showToast('账户已添加', 'success');
        }
        saveData(appData);
        closeModal();
        renderAsset();
    });

    // Enter 键保存
    box.querySelectorAll('input').forEach(input => {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') box.querySelector('[data-act="save"]').click();
        });
    });
}

window.editAccountById = function (id) {
    const account = appData.accounts.find(a => a.id === id);
    if (account) accountModal(account);
};

window.deleteAccountById = async function (id) {
    const account = appData.accounts.find(a => a.id === id);
    const ok = await confirmModal({
        title: '删除账户',
        message: `确定删除账户「${escapeHtml(account ? account.name : '')}」吗？此操作无法撤销。`,
        danger: true
    });
    if (!ok) return;
    appData.accounts = appData.accounts.filter(a => a.id !== id);
    saveData(appData);
    renderAsset();
    showToast('账户已删除', 'info');
};

function renderAsset() {
    const container = $('accountCards');

    if (appData.accounts.length === 0) {
        container.innerHTML = '<div class="empty-tip" style="grid-column: 1 / -1;">暂无账户，点击右上角「添加账户」开始吧</div>';
    } else {
        container.innerHTML = appData.accounts.map(acc => `
            <div class="stat-card account-card">
                <div class="stat-label">
                    <span>${escapeHtml(acc.name)}</span>
                    <span style="font-size: 12px; color: var(--text-tertiary);">${escapeHtml(acc.type)}</span>
                </div>
                <div class="stat-value balance">${formatMoney(acc.balance)}</div>
                <div class="account-actions">
                    <button class="btn" onclick="editAccountById(${acc.id})">✏️ 编辑</button>
                    <button class="btn btn-danger" onclick="deleteAccountById(${acc.id})">删除</button>
                </div>
            </div>`).join('');
    }

    renderAssetChart();
}

function renderAssetChart() {
    if (assetChartInst) assetChartInst.destroy();
    assetChartInst = null;

    if (appData.accounts.length === 0) {
        chartEmpty('assetChart', '暂无账户数据');
        return;
    }
    if (!window.Chart) { chartEmpty('assetChart', chartLibMsg()); return; }
    chartNotEmpty('assetChart');

    const labels = appData.accounts.map(a => a.name);
    const data = appData.accounts.map(a => a.balance);

    const t = chartTheme();
    window.Chart.defaults.color = t.tick;
    const ctx = $('assetChart').getContext('2d');
    assetChartInst = new window.Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderWidth: 2,
                borderColor: isDark() ? '#1E1E1E' : '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function (ctx2) {
                            const total = ctx2.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx2.parsed / total) * 100).toFixed(1) : 0;
                            return ctx2.label + '：' + formatMoney(ctx2.parsed) + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

// ========== 设置与数据 ==========
$('exportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finance-backup-' + getMonthStr().replace('-', '') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('数据已导出', 'success');
});

$('importData').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!data || typeof data !== 'object' || !Array.isArray(data.records)) {
                throw new Error('bad format');
            }
            appData = {
                records: Array.isArray(data.records) ? data.records : [],
                budgets: data.budgets || getDefaultData().budgets,
                accounts: Array.isArray(data.accounts) ? data.accounts : getDefaultData().accounts
            };
            saveData(appData);
            renderAll();
            showToast('数据导入成功', 'success');
        } catch (err) {
            showToast('导入失败：文件格式不正确', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // 允许重复导入同一文件
});

$('clearData').addEventListener('click', async () => {
    const ok = await confirmModal({
        title: '清空所有数据',
        message: '将删除全部收支记录、预算与账户信息，且<strong>无法恢复</strong>。确定继续吗？',
        danger: true
    });
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    appData = getDefaultData(false); // 清空后回到空数据 + 默认账户
    saveData(appData);
    renderAll();
    showToast('已清空所有数据', 'info');
});

$('loadDemoData').addEventListener('click', async () => {
    const ok = await confirmModal({
        title: '载入示例数据',
        message: '当前数据将被示例数据<strong>覆盖</strong>。确定继续吗？',
        danger: true
    });
    if (!ok) return;
    appData = getDefaultData(true);
    saveData(appData);
    renderAll();
    showToast('示例数据已载入', 'success');
});

// ========== 全局渲染 / 统计 ==========
function updateSidebarStats() {
    const size = (JSON.stringify(appData).length / 1024).toFixed(1);
    $('sidebarStats').innerHTML = `共 ${appData.records.length} 条记录<br>占用 ${size} KB · 仅存本地`;
}

function updateStorageInfo() {
    const size = (JSON.stringify(appData).length / 1024).toFixed(1);
    $('storageInfo').textContent = `当前数据量：${appData.records.length} 条记录 / ${appData.accounts.length} 个账户，共 ${size} KB。`;
}

function renderAll() {
    renderDashboard();
    renderRecordList();
    renderBudget();
    renderAsset();
    updateSidebarStats();
    updateStorageInfo();
}

// ========== 事件绑定 ==========
function bindEvents() {
    // 导航（hash 路由）
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            location.hash = item.dataset.page;
        });
    });

    // 主题切换（页头 + 设置页共用 class）
    document.querySelectorAll('.theme-toggle').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    // 仪表盘月份导航
    $('prevMonth').addEventListener('click', () => {
        dashMonth.m -= 1;
        if (dashMonth.m < 0) { dashMonth.m = 11; dashMonth.y -= 1; }
        renderDashboard();
    });

    $('nextMonth').addEventListener('click', () => {
        if (isCurrentMonth(dashMonth.y, dashMonth.m)) return;
        dashMonth.m += 1;
        if (dashMonth.m > 11) { dashMonth.m = 0; dashMonth.y += 1; }
        renderDashboard();
    });

    // 添加记录
    $('addRecord').addEventListener('click', addRecord);

    // 去记账
    $('goRecord').addEventListener('click', () => { location.hash = 'record'; });

    // 移动端菜单
    $('hamburger').addEventListener('click', () => {
        $('sidebar').classList.toggle('open');
    });

    // hash 变化
    window.addEventListener('hashchange', () => switchPage(getPageFromHash()));
}

// ========== 初始化 ==========
function init() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');

    // 初始化分类下拉框
    populateCategorySelect($('category'), 'expense');
    rebuildCategoryFilter();

    bindEvents();

    if (!location.hash) {
        history.replaceState(null, '', '#dashboard');
    }
    switchPage(getPageFromHash());

    renderRecordList();
    renderBudget();
    renderAsset();
    updateSidebarStats();
    updateStorageInfo();

    // 异步加载图表库，加载完成后重绘当前页图表（不阻塞页面交互）
    loadChartLib().then(() => {
        if (window.Chart) {
            renderCurrentPageCharts();
        } else {
            showToast('图表库加载失败，记账等功能不受影响', 'warning');
        }
    });

    showToast('欢迎回来 👋', 'info');
}

// 暴露给内联 onclick 的全局函数（editAccountById / deleteAccountById 已通过 window.xxx 赋值）
window.editRecordById = editRecordById;
window.deleteRecordById = deleteRecordById;

init();
