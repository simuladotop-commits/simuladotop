// ranking.js — SimuladoTop v2
// Ranking de período semanal/mensal/anual baseado em tentativas e melhor pontuação por simulado

const PERIODS = {
  week:  { label: 'Esta Semana', start: getCurrentWeekStart },
  month: { label: 'Este Mês',    start: getMonthStart  },
  year:  { label: 'Este Ano',    start: getYearStart   },
};

const state = { active: 'week', ranking: [] };

function getCurrentWeekStart() {
  const d = new Date();
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function getMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function getYearStart() {
  return new Date(new Date().getFullYear(), 0, 1, 0, 0, 0, 0);
}

function fmtPct(v) {
  return `${Number(v).toFixed(1).replace('.0', '')}%`;
}
function initials(name) {
  if (!name) return '??';
  const p = name.trim().split(' ').filter(Boolean);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function avatarHtml(profile, cls = 'mini-avatar') {
  if (profile?.avatar_url)
    return `<div class="${cls}"><img src="${esc(profile.avatar_url)}" alt="" /></div>`;
  return `<div class="${cls}">${esc(initials(profile?.full_name))}</div>`;
}
function esc(v) {
  return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getSupabase() { return window._supabase || null; }

async function waitForSupabase(retries = 20, delay = 150) {
  for (let i = 0; i < retries; i++) {
    if (getSupabase()) return getSupabase();
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error('Supabase não inicializado.');
}

async function fetchRankingPorPeriodo(since) {
  const sb = getSupabase();
  if (!sb) return [];

  // Busca melhores tentativas por usuário por simulado no período
  const { data, error } = await sb
    .from('tentativas')
    .select('aluno_id, simulado_id, acertos, erros, tempo_gasto')
    .gte('created_at', since.toISOString())
    .or('is_estudo.is.null,is_estudo.eq.false');

  if (error) { console.error('tentativas:', error); return []; }

  const { data: simuladosAtivos, error: simuladosError } = await sb
    .from('simulados')
    .select('id, slug, title');

  if (simuladosError) {
    console.error('simulados:', simuladosError);
    return [];
  }

  const idsValidos = new Set();
  (simuladosAtivos || []).forEach((s) => {
    if (s.id) idsValidos.add(s.id);
    if (s.slug) idsValidos.add(s.slug);
    if (s.title) idsValidos.add(s.title);
  });

  const tentativasFiltradas = (data || []).filter((t) => idsValidos.has(t.simulado_id));

  // Agrupa por aluno+simulado, pega melhor tentativa de cada
  const melhorPorSimulado = {};
  (tentativasFiltradas || []).forEach(r => {
    const key = `${r.aluno_id}::${r.simulado_id}`;
    if (!melhorPorSimulado[key] || r.acertos > melhorPorSimulado[key].acertos) {
      melhorPorSimulado[key] = r;
    }
  });

  // Agrega por aluno
  const porAluno = {};
  Object.values(melhorPorSimulado).forEach(r => {
    if (!porAluno[r.aluno_id]) porAluno[r.aluno_id] = { acertos: 0, erros: 0, tempo: 0 };
    porAluno[r.aluno_id].acertos += Number(r.acertos || 0);
    porAluno[r.aluno_id].erros   += Number(r.erros   || 0);
    porAluno[r.aluno_id].tempo   += Number(r.tempo_gasto || 0);
  });

  // Busca perfis
  const ids = Object.keys(porAluno);
  if (!ids.length) return [];

  const { data: perfis, error: perfisErr } = await sb
    .from('perfis')
    .select('id, full_name, avatar_url')
    .in('id', ids)
    .or('bloqueado.is.null,bloqueado.eq.false');

  if (perfisErr) { console.error('perfis:', perfisErr); return []; }

  const pm = new Map((perfis || []).map(p => [p.id, p]));

  return Object.entries(porAluno).map(([id, s]) => {
    const p = pm.get(id) || {};
    const tot = s.acertos + s.erros;
    return {
      aluno_id:   id,
      full_name:  p.full_name  || 'Usuário',
      avatar_url: p.avatar_url || null,
      pontos:     s.acertos,
      tempo:      s.tempo,
      acertos:    s.acertos,
      accuracy:   tot ? (s.acertos / tot) * 100 : 0,
    };
  })
  .filter(r => r.pontos > 0)
  .sort((a, b) => b.pontos !== a.pontos ? b.pontos - a.pontos : a.tempo - b.tempo);
}

function setLoading() {
  const el = document.getElementById('ranking-content');
  if (el) el.innerHTML = `<div class="loading-box"><div class="spinner"></div></div>`;
}

function renderStats(ranking) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('summary-total',   ranking.length || '0');
  set('summary-best',    ranking.length ? ranking[0].pontos : '–');
  set('summary-average', ranking.length ? fmtPct(ranking.reduce((a, r) => a + r.accuracy, 0) / ranking.length) : '–');

  // Esconde card de tempo
  const timeEl = document.getElementById('summary-time');
  if (timeEl) {
    const card = timeEl.closest('.stat-card');
    if (card) card.style.display = 'none';
  }
}

function renderList(top10) {
  const el = document.getElementById('ranking-content');
  if (!el) return;

  if (!top10.length) {
    el.innerHTML = `<div class="empty-state">Nenhuma tentativa registrada no período selecionado.</div>`;
    return;
  }

  const [first, second, third] = top10;

  const podium = top10.length >= 3 ? `
    <div class="podium-grid">
      <div class="podium-card podium-2">
        ${avatarHtml({ full_name: second.full_name, avatar_url: second.avatar_url }, 'podium-avatar')}
        <div class="podium-name">${esc(second.full_name)}</div>
        <div class="podium-score">${second.pontos} pts</div>
        <div class="podium-block">2°</div>
      </div>
      <div class="podium-card podium-1">
        ${avatarHtml({ full_name: first.full_name, avatar_url: first.avatar_url }, 'podium-avatar')}
        <div class="podium-name">${esc(first.full_name)}</div>
        <div class="podium-score">${first.pontos} pts</div>
        <div class="podium-block">👑 1°</div>
      </div>
      <div class="podium-card podium-3">
        ${avatarHtml({ full_name: third.full_name, avatar_url: third.avatar_url }, 'podium-avatar')}
        <div class="podium-name">${esc(third.full_name)}</div>
        <div class="podium-score">${third.pontos} pts</div>
        <div class="podium-block">3°</div>
      </div>
    </div>` : '';

  const rows = top10.slice(top10.length >= 3 ? 3 : 0).map((r, i) => `
    <div class="list-item">
      <div class="list-pos">${(top10.length >= 3 ? i + 4 : i + 1)}°</div>
      ${avatarHtml(r)}
      <div class="item-name">${esc(r.full_name)}</div>
      <div class="item-pts">${r.pontos}</div>
      <div class="item-pct">${fmtPct(r.accuracy)}</div>
    </div>`).join('');

  el.innerHTML = `
    ${podium}
    <div class="list-card">
      <header>
        <span>#</span><span></span><span>Nome</span>
        <span>Pontos</span><span>Acerto</span>
      </header>
      ${rows || '<div class="empty-state" style="padding:20px">Sem mais colocados.</div>'}
    </div>`;
}

function renderTop3Sidebar(top10) {
  const el = document.getElementById('top3-sidebar');
  if (!el) return;
  if (!top10.length) { el.innerHTML = '<p style="color:var(--muted);font-size:.8rem">Sem dados ainda.</p>'; return; }
  el.innerHTML = top10.slice(0, 3).map((r, i) => `
    <div class="aside-item">
      <span class="pos-num">${i + 1}</span>
      ${avatarHtml(r)}
      <div class="item-info">
        <strong>${esc(r.full_name)}</strong>
        <span>${r.pontos} pts</span>
      </div>
      <span class="aside-pts">${fmtPct(r.accuracy)}</span>
    </div>`).join('');
}

function renderUserPanel(profile, pos, pts) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('user-name',   profile?.full_name || 'Faça login');
  set('user-status', profile ? (pos ? 'Ranking ativo' : 'Sem pontuação no período') : 'Login necessário');
  set('user-rank',   pos ? `#${pos}` : '–');
  set('user-points', pts || '0');

  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    if (profile?.avatar_url) {
      avatarEl.innerHTML = `<img src="${esc(profile.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      avatarEl.textContent = initials(profile?.full_name || '?');
    }
  }
}

function setActiveTab(key) {
  document.querySelectorAll('.period-button').forEach(b =>
    b.classList.toggle('active', b.dataset.period === key));
  const badge = document.getElementById('period-badge');
  if (badge) badge.textContent = PERIODS[key].label;
}

function subscribeRankingRealtime() {
  if (!window._supabase?.channel || window.__RANKING_REALTIME_SUBSCRIBED) return;
  const channel = window._supabase.channel('realtime-ranking-page')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tentativas' }, () => loadRanking(state.active))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tentativas' }, () => loadRanking(state.active))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tentativas' }, () => loadRanking(state.active));

  if (channel?.subscribe) {
    channel.subscribe();
  }
  window.__RANKING_REALTIME_SUBSCRIBED = true;
}

async function loadRanking(periodKey) {
  state.active = periodKey;
  setActiveTab(periodKey);
  setLoading();

  try {
    await waitForSupabase();

    const since   = PERIODS[periodKey].start();
    const ranking = await fetchRankingPorPeriodo(since);
    state.ranking = ranking;
    const top10   = ranking.slice(0, 10);

    renderStats(ranking);
    renderList(top10);
    renderTop3Sidebar(top10);

    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { renderUserPanel(null, null, 0); return; }

    const { data: meuPerfil } = await sb
      .from('perfis')
      .select('id,full_name,avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const posIdx = ranking.findIndex(r => r.aluno_id === user.id);
    const meusPts = posIdx >= 0 ? ranking[posIdx].pontos : 0;
    renderUserPanel(meuPerfil, posIdx >= 0 ? posIdx + 1 : null, meusPts);

  } catch (err) {
    console.error('Erro no ranking:', err);
    const el = document.getElementById('ranking-content');
    if (el) el.innerHTML = `<div class="empty-state">⚠️ Erro ao carregar. Verifique o console.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.period-button').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.dataset.period !== state.active) loadRanking(btn.dataset.period);
    }));
  loadRanking('week');
  subscribeRankingRealtime();
});