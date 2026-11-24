// Token Radar dashboard: renders window.RADAR (written by main.ts).
// No network, no framework. Board, detail view, filters and a model
// sandbox that re-ranks the board live when a weight moves.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const fmtUsd = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + Math.round(n).toLocaleString();
const fmtPct = (n) => n === null ? '—' : (n > 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- model, mirrored from lib/model.ts so the sandbox re-ranks ----
function implied(row, m) {
  const growth = Math.min(100, Math.max(-50, (row.change_7d ?? 0) * 100));
  const w = growth < 0 ? m.down : m.up;
  const gm = 1 + (growth / 100) * w;
  const age = row.age_days ?? 180;
  const mm = 0.55 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.45;
  const bm = 1 + Math.min(Math.max(row.chains.length - 1, 0), 4) * 0.03;
  return { value: Math.max(1, Math.round(row.tvl_usd * m.base * gm * mm * bm)), gm, mm, bm, growth };
}
let model = { base: R.model.base_multiple, up: R.model.growth_weight_up, down: R.model.growth_weight_down };

function farmSteps(row) {
  const c = (row.category || '').toLowerCase();
  const chain = row.chains[0] || 'its main chain';
  const cap = row.tvl_usd >= 5e9 ? 250 : row.tvl_usd >= 1e9 ? 150 : row.tvl_usd >= 1e8 ? 100 : 50;
  const hold = row.age_days === null ? 30 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
  let act;
  if (c.includes('lend') || c.includes('cdp')) act = `Supply $${cap} of USDC to ${row.name} on ${chain} and keep the position open.`;
  else if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) act = `Provide $${cap} of liquidity to ${row.name}'s main pool on ${chain} and keep the position open.`;
  else if (c.includes('bridge')) act = `Bridge $${cap} of USDC to ${chain} through ${row.name} and use the bridged funds in its app.`;
  else if (c.includes('staking') || c.includes('restak')) act = `Stake $${cap} of the chain's staking asset through ${row.name} and keep the receipt.`;
  else if (c.includes('perpetual') || c.includes('derivative')) act = `Deposit $${cap} of USDC as margin on ${row.name} and open one small hedge.`;
  else if (c.includes('prediction')) act = `Fund $${cap} and place one market position on ${row.name}.`;
  else if (c.includes('curator') || c.includes('allocator')) act = `Deposit $${cap} into a ${row.name} vault on ${chain} and keep the shares.`;
  else if (c.includes('stable')) act = `Mint or deposit $${cap} of the stable asset through ${row.name} on ${chain}.`;
  else if (c.includes('rwa')) act = `Mint $${cap} of the protocol's yield asset on ${chain} and hold it.`;
  else if (c.includes('insurance')) act = `Buy $${cap} of cover from ${row.name} on ${chain} and keep the policy.`;
  else act = `Deposit $${cap} of USDC into ${row.name} on ${chain} and keep the position open.`;
  return [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    `${act} Cost: $${cap} of capital and about $${cap >= 150 ? 8 : 4} of gas. Time: 15 minutes to set up.`,
    `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Cost: the $${cap} stays in the position. Time: ${hold} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`,
  ];
}

// ---- state and rendering ----
let selected = null;
const watchlist = new Set(R.watchlist);
const isWatch = (r) => watchlist.has(r.slug);

function visibleRows() {
  const q = $('q').value.trim().toLowerCase();
  const cat = $('cat').value, chain = $('chain').value, wo = $('watchOnly').checked;
  let rows = R.rows.map((r) => ({ ...r, ...implied(r, model) }));
  rows.sort((a, b) => b.value - a.value);
  rows.forEach((r, i) => { r.displayRank = i + 1; });
  rows = rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
    (!cat || r.category === cat) &&
    (!chain || r.chains.includes(chain)) &&
    (!wo || isWatch(r)));
  const sort = $('sort').value;
  if (sort === 'tvl') rows.sort((a, b) => b.tvl_usd - a.tvl_usd);
  else if (sort === 'growth') rows.sort((a, b) => (b.change_7d ?? -9) - (a.change_7d ?? -9));
  else if (sort === 'age') rows.sort((a, b) => (b.age_days ?? -1) - (a.age_days ?? -1));
  else rows.sort((a, b) => a.displayRank - b.displayRank);
  return rows;
}

function render() {
  const rows = visibleRows();
  $('count').textContent = `${rows.length} of ${R.board_size} ranked protocols shown · ${R.watchlist_size} on the watchlist · ${R.early_size} found below the floor`;
  $('rows').innerHTML = rows.slice(0, 100).map((r) => `<tr data-slug="${esc(r.slug)}" class="${selected === r.slug ? 'sel' : ''}">
    <td>${r.displayRank}</td><td><b>${esc(r.name)}</b>${isWatch(r) ? ' <span class="badge">WATCHLIST</span>' : ''}</td>
    <td>${esc(r.category || '—')}</td><td>${esc(r.chains.slice(0, 2).join(', '))}</td>
    <td class="num">${fmtUsd(r.tvl_usd)}</td>
    <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'}">${fmtPct(r.change_7d)}</td>
    <td class="num"><b>${fmtUsd(r.value)}</b></td><td>›</td></tr>`).join('');
  $('rows').querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => showDetail(tr.dataset.slug)));
  if (selected) showDetail(selected, true);
}

function bar(label, mult, max) {
  const pct = Math.min(100, Math.max(0, (mult / max) * 100));
  return `<div><span>${label}</span><span class="bar"><i style="width:${pct.toFixed(0)}%"></i></span><span>×${mult.toFixed(2)}</span></div>`;
}

function showDetail(slug, keep) {
  const row = R.rows.find((r) => r.slug === slug);
  if (!row) return;
  selected = slug;
  const v = implied(row, model);
  $('detailBody').innerHTML = `
    <h3>${esc(row.name)}</h3>
    <p class="meta">${esc(row.category || 'Uncategorised')} · ${esc(row.chains.join(', ') || '—')} · tracked since ${esc(row.listed_at || 'unknown')} (${row.age_days === null ? 'age unknown' : row.age_days + ' days'}) · ${isWatch(row) ? 'on the watchlist' : 'below the watchlist floor'}</p>
    <p><b>Implied value ${fmtUsd(v.value)}</b> — TVL ${fmtUsd(row.tvl_usd)} × base ${model.base.toFixed(2)}</p>
    <div class="bars">${bar('Growth', v.gm, 1.6)}${bar('Maturity', v.mm, 1)}${bar('Breadth', v.bm, 1.12)}</div>
    <p class="meta">7-day TVL change ${fmtPct(row.change_7d)} · growth multiplier ×${v.gm.toFixed(2)}</p>
    <h3 style="font-size:16px;margin-top:14px">How to farm it</h3>
    <ol class="steps">${farmSteps(row).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  if (!keep) document.querySelectorAll('#rows tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.slug === slug));
}

// ---- filters, sandbox, live view ----
const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
cats.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; $('cat').appendChild(o); });
const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
chains.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o); });
['q', 'cat', 'chain', 'watchOnly', 'sort'].forEach((id) => $(id).addEventListener('input', render));
$('sbBase').addEventListener('input', (e) => { model.base = +e.target.value; $('sbBaseVal').textContent = model.base.toFixed(2); render(); });
$('sbUp').addEventListener('input', (e) => { model.up = +e.target.value; $('sbUpVal').textContent = model.up.toFixed(1); render(); });
$('sbDown').addEventListener('input', (e) => { model.down = +e.target.value; $('sbDownVal').textContent = model.down.toFixed(1); render(); });
$('sbReset').addEventListener('click', () => {
  model = { base: R.model.base_multiple, up: R.model.growth_weight_up, down: R.model.growth_weight_down };
  $('sbBase').value = model.base; $('sbUp').value = model.up; $('sbDown').value = model.down;
  $('sbBaseVal').textContent = model.base.toFixed(2); $('sbUpVal').textContent = model.up.toFixed(1); $('sbDownVal').textContent = model.down.toFixed(1);
  render();
});

$('mastStats').innerHTML = `<div><b>${R.board_size}</b><span>ranked</span></div><div><b>${R.watchlist_size}</b><span>watchlist</span></div><div><b>${R.early_size}</b><span>below floor</span></div><div><b>${fmtUsd(R.rows[0].implied_value_usd)}</b><span>top implied</span></div>`;
$('liveRows').innerHTML = R.live.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.category || '—')}</td><td class="num">${fmtUsd(r.tvl_usd)}</td><td class="num">${r.mcap_usd ? fmtUsd(r.mcap_usd) : '—'}</td><td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'}">${fmtPct(r.change_7d)}</td></tr>`).join('');
$('sourceLine').textContent = `Snapshot as of ${R.as_of} · source ${R.source} · model ${R.model_version} · floor ${fmtUsd(R.floor_usd)}`;
render();
if (R.rows[0]) showDetail(R.rows[0].slug, true);
