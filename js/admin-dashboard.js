// ─────────────────────────────────────────────
//  admin-dashboard.js  — SimuladoTop
// ─────────────────────────────────────────────

import { adminSidebarHtml } from './admin-sidebar.js';

export async function initAdminDashboard() {
  const root = document.getElementById('admin-content');
  if (!root) return;

  injectStyles();
  renderSkeleton(root);

  const [metricsResult, attemptsResult] = await Promise.allSettled([
    fetchDashboardMetrics(),
    fetchRecentAttempts(),
  ]);

  const metrics  = metricsResult.status  === 'fulfilled' ? metricsResult.value  : { failed: true };
  const attempts = attemptsResult.status === 'fulfilled' ? attemptsResult.value : [];

  renderDashboard(root, metrics, attempts);
  setupAdminDashboardRealtime();
}

async function refreshAdminDashboard() {
  const root = document.getElementById('admin-content');
  if (!root) return;

  const [metricsResult, attemptsResult] = await Promise.allSettled([
    fetchDashboardMetrics(),
    fetchRecentAttempts(),
  ]);

  const metrics  = metricsResult.status  === 'fulfilled' ? metricsResult.value  : { failed: true };
  const attempts = attemptsResult.status === 'fulfilled' ? attemptsResult.value : [];

  renderDashboard(root, metrics, attempts);
}

function setupAdminDashboardRealtime() {
  if (!window._supabase?.channel || window.__ADMIN_DASH_REALTIME_SUBSCRIBED) return;

  const channel = window._supabase.channel('realtime-admin-dashboard')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tentativas' }, () => refreshAdminDashboard())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tentativas' }, () => refreshAdminDashboard())
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tentativas' }, () => refreshAdminDashboard())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'perfis' }, () => refreshAdminDashboard())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfis' }, () => refreshAdminDashboard())
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'perfis' }, () => refreshAdminDashboard());

  if (channel?.subscribe) {
    channel.subscribe();
  }

  window.__ADMIN_DASH_REALTIME_SUBSCRIBED = true;
}

// ── STYLES ────────────────────────────────────
function injectStyles() {
  if (document.getElementById('admin-dash-styles')) return;
  const style = document.createElement('style');
  style.id = 'admin-dash-styles';
  style.textContent = `
    /* reset inside dashboard */
    #admin-content *, #admin-content *::before, #admin-content *::after { box-sizing: border-box; }

    /* tokens */
    #admin-content {
      --ad-bg:      #111111;
      --ad-surface: #1a1a1a;
      --ad-border:  #2a2a2a;
      --ad-accent:  #f5a623;
      --ad-accent2: #ffcc66;
      --ad-text:    #f0ede8;
      --ad-muted:   #6b6b6b;
      --ad-danger:  #ff5c5c;
      --ad-r:       12px;
      font-family: 'Barlow', sans-serif;
      color: var(--ad-text);
      background: var(--ad-bg);
      min-height: 100vh;
    }

    /* ── SHELL ── */
    .ad-shell { display: flex; min-height: 100vh; }

    /* ── SIDEBAR ── */
    .ad-sidebar {
      width: 220px; flex-shrink: 0;
      background: var(--ad-surface);
      border-right: 1px solid var(--ad-border);
      display: flex; flex-direction: column;
      padding: 24px 16px;
      position: sticky; top: 0; height: 100vh;
      gap: 28px;
    }
    .ad-brand { display: flex; flex-direction: column; gap: 2px; }
    .ad-brand-logo {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 20px; font-weight: 700; letter-spacing: -0.5px;
      color: var(--ad-accent); text-decoration: none;
    }
    .ad-brand-sub { font-size: 11px; color: var(--ad-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .ad-divider { height: 1px; background: var(--ad-border); }
    .ad-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .ad-nav-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
      color: var(--ad-muted); padding: 0 10px; margin: 8px 0 2px;
    }
    .ad-nav a {
      display: flex; align-items: center; gap: 9px;
      padding: 8px 10px; border-radius: 8px;
      font-size: 13.5px; font-weight: 500;
      color: var(--ad-muted); text-decoration: none;
      transition: background .15s, color .15s;
    }
    .ad-nav a:hover { background: var(--ad-border); color: var(--ad-text); }
    .ad-nav a.active { background: #2a1f00; color: var(--ad-accent); }
    .ad-sidebar-footer {
      background: var(--ad-border); border-radius: var(--ad-r);
      padding: 10px 12px; display: flex; align-items: center; gap: 10px;
    }
    .ad-avatar {
      width: 30px; height: 30px; border-radius: 50%;
      background: var(--ad-accent);
      display: grid; place-items: center;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 14px; font-weight: 700; color: #111;
      flex-shrink: 0;
    }
    .ad-footer-name { font-size: 13px; font-weight: 600; display: block; }
    .ad-footer-role { font-size: 11px; color: var(--ad-muted); display: block; }

    /* ── MAIN ── */
    .ad-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    /* topbar */
    .ad-topbar {
      height: 56px; border-bottom: 1px solid var(--ad-border);
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 28px; background: var(--ad-bg);
      position: sticky; top: 0; z-index: 10;
    }
    .ad-topbar-title {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 16px; font-weight: 700; letter-spacing: 0.2px;
    }
    .ad-topbar-actions { display: flex; align-items: center; gap: 10px; }
    .ad-badge {
      font-size: 11px; font-weight: 600;
      background: #2a1f00; color: var(--ad-accent);
      border: 1px solid #4a3800;
      padding: 3px 10px; border-radius: 20px;
    }
    .ad-icon-btn {
      width: 32px; height: 32px; border-radius: 7px;
      background: var(--ad-surface); border: 1px solid var(--ad-border);
      display: grid; place-items: center; cursor: pointer;
      color: var(--ad-muted); transition: color .15s, background .15s;
    }
    .ad-icon-btn:hover { color: var(--ad-text); background: var(--ad-border); }

    /* content */
    .ad-content {
      flex: 1; padding: 28px;
      overflow-y: auto; display: flex; flex-direction: column; gap: 24px;
    }

    /* page header */
    .ad-page-head { display: flex; align-items: flex-end; justify-content: space-between; }
    .ad-page-head h1 {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 30px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.1;
    }
    .ad-page-head h1 span { color: var(--ad-accent); }
    .ad-page-head p { font-size: 13px; color: var(--ad-muted); margin-top: 3px; }
    .ad-btn-primary {
      background: var(--ad-accent); color: #111; border: none;
      padding: 8px 16px; border-radius: 8px;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap;
      transition: opacity .15s;
    }
    .ad-btn-primary:hover { opacity: .85; }

    /* metrics */
    .ad-metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
    .ad-metric-card {
      background: var(--ad-surface); border: 1px solid var(--ad-border);
      border-radius: var(--ad-r); padding: 20px 22px;
      display: flex; flex-direction: column; gap: 6px;
      position: relative; overflow: hidden;
      transition: border-color .2s;
    }
    .ad-metric-card:hover { border-color: #3a3a3a; }
    .ad-metric-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    }
    .ad-metric-card.c-orange::before { background: var(--ad-accent); }
    .ad-metric-card.c-yellow::before { background: var(--ad-accent2); }
    .ad-metric-card.c-red::before    { background: #ff8c00; }
    .ad-metric-label {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 1px; color: var(--ad-muted);
    }
    .ad-metric-value {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 40px; font-weight: 700; letter-spacing: -1px; line-height: 1;
    }
    .ad-metric-card.c-orange .ad-metric-value { color: var(--ad-accent); }
    .ad-metric-card.c-yellow .ad-metric-value { color: var(--ad-accent2); }
    .ad-metric-card.c-red    .ad-metric-value { color: #ff8c00; }
    .ad-metric-desc { font-size: 12.5px; color: var(--ad-muted); }

    /* two-col */
    .ad-two-col { display: grid; grid-template-columns: 1fr 320px; gap: 14px; }

    /* card */
    .ad-card {
      background: var(--ad-surface); border: 1px solid var(--ad-border);
      border-radius: var(--ad-r); overflow: hidden;
      animation: adFadeUp .3s ease both;
    }
    .ad-card-head {
      padding: 16px 20px; border-bottom: 1px solid var(--ad-border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .ad-card-head h2 {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 16px; font-weight: 700; letter-spacing: 0.2px;
    }
    .ad-card-head p { font-size: 12px; color: var(--ad-muted); margin-top: 2px; }
    .ad-card-tag {
      font-size: 11px; font-weight: 600;
      background: var(--ad-border); color: var(--ad-muted);
      padding: 3px 10px; border-radius: 20px; white-space: nowrap;
    }

    /* table */
    .ad-table-wrap { overflow-x: auto; }
    .ad-table { width: 100%; border-collapse: collapse; }
    .ad-table thead th {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.8px; color: var(--ad-muted);
      padding: 10px 20px; text-align: left;
      border-bottom: 1px solid var(--ad-border); white-space: nowrap;
    }
    .ad-table tbody tr { transition: background .12s; }
    .ad-table tbody tr:hover { background: #1f1f1f; }
    .ad-table tbody td {
      padding: 11px 20px; font-size: 13px;
      border-bottom: 1px solid var(--ad-border); color: var(--ad-text);
    }
    .ad-table tbody tr:last-child td { border-bottom: none; }
    .ad-empty td { text-align: center; color: var(--ad-muted); font-size: 13px; padding: 36px; }
    .ad-mono { font-family: 'Roboto Mono', monospace; font-size: 12px; color: var(--ad-muted); }

    /* pills */
    .ad-pill { display: inline-block; font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 20px; }
    .ad-pill-hi  { background: #2a1f00; color: var(--ad-accent); }
    .ad-pill-mid { background: #2a1f00; color: var(--ad-accent2); }
    .ad-pill-low { background: #2a0d0d; color: var(--ad-danger); }

    /* panel stack */
    .ad-panel-stack { display: flex; flex-direction: column; gap: 14px; }
    .ad-quick-links { display: flex; flex-direction: column; gap: 7px; padding: 14px; }
    .ad-quick-link {
      display: flex; align-items: center; justify-content: space-between;
      padding: 11px 13px;
      background: var(--ad-bg); border: 1px solid var(--ad-border);
      border-radius: 8px; text-decoration: none;
      color: var(--ad-text); font-size: 13.5px; font-weight: 500;
      transition: border-color .15s, background .15s, color .15s;
    }
    .ad-quick-link:hover { border-color: #4a3800; background: #2a1f00; color: var(--ad-accent); }

    /* stat bars */
    .ad-stat-row { padding: 14px; display: flex; flex-direction: column; gap: 13px; }
    .ad-stat-info { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 5px; }
    .ad-stat-name { color: var(--ad-muted); }
    .ad-stat-pct  { font-weight: 600; }
    .ad-bar-track { height: 4px; background: var(--ad-border); border-radius: 99px; overflow: hidden; }
    .ad-bar-fill  { height: 100%; border-radius: 99px; }

    /* skeleton */
    .ad-skeleton { background: var(--ad-surface); border-radius: var(--ad-r); animation: adPulse 1.4s ease infinite; }
    @keyframes adPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    @keyframes adFadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }

    /* animations stagger */
    .ad-metrics .ad-metric-card:nth-child(1){animation-delay:.05s}
    .ad-metrics .ad-metric-card:nth-child(2){animation-delay:.10s}
    .ad-metrics .ad-metric-card:nth-child(3){animation-delay:.15s}
    .ad-metric-card { animation: adFadeUp .3s ease both; }
  `;
  document.head.appendChild(style);
}

// ── SKELETON ──────────────────────────────────
function renderSkeleton(root) {
  root.innerHTML = `
    <div class="ad-shell">
      ${adminSidebarHtml('dashboard', 'Administrador')}
      <div class="ad-main">
        <header class="ad-topbar">
          <span class="ad-topbar-title">Carregando...</span>
        </header>
        <div class="ad-content">
          <div class="ad-metrics">
            <div class="ad-skeleton" style="height:110px"></div>
            <div class="ad-skeleton" style="height:110px"></div>
            <div class="ad-skeleton" style="height:110px"></div>
          </div>
          <div class="ad-skeleton" style="height:320px"></div>
        </div>
      </div>
    </div>`;
}

// ── DATA FETCH ────────────────────────────────
async function fetchDashboardMetrics() {
  if (!window._supabase) return { failed: true };
  try {
    const { data, error } = await window._supabase
      .from('tentativas')
      .select('aluno_id, porcentagem_acerto', { count: 'exact' });
    if (error) return { failed: true };
    const totalAttempts = Array.isArray(data) ? data.length : 0;
    const uniqueUsers   = Array.isArray(data) ? new Set(data.map(i => i?.aluno_id || '')).size : 0;
    const average       = totalAttempts
      ? data.reduce((s, i) => s + Number(i?.porcentagem_acerto || 0), 0) / totalAttempts
      : 0;
    return { totalUsers: uniqueUsers, totalAttempts, averagePerformance: Number(average.toFixed(1)), failed: false };
  } catch { return { failed: true }; }
}

async function fetchRecentAttempts() {
  if (!window._supabase) return [];
  try {
    // Busca as 8 tentativas mais recentes
    const { data: tentativas, error } = await window._supabase
      .from('tentativas')
      .select('id, aluno_id, area, porcentagem_acerto, created_at')
      .order('created_at', { ascending: false })
      .limit(8);

    console.log('tentativas:', tentativas, 'erro:', error);

    if (error || !tentativas?.length) {
      return [];
    }

    // Busca os nomes
    const ids = [...new Set(tentativas.map(t => t.aluno_id))];
    const { data: perfis } = await window._supabase
      .from('perfis')
      .select('id, full_name')
      .in('id', ids);

    const nomeMap = Object.fromEntries((perfis || []).map(p => [p.id, p.full_name]));

    return tentativas.map(item => ({
      id:        item?.id ?? '-',
      alunoId:   item?.aluno_id ?? '-',
      alunoName: nomeMap[item?.aluno_id] || item?.aluno_id || '--',
      score:     Number(item?.porcentagem_acerto || 0),
      area:      item?.area || 'Não informado',
      timestamp: item?.created_at
        ? new Date(item.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '-',
    }));
  } catch (err) {
    console.error('fetchRecentAttempts error:', err);
    return [];
  }
}

// ── RENDER ────────────────────────────────────
function renderDashboard(root, metrics, attempts) {
  const na = metrics.failed;

  const pillClass = s => s >= 75 ? 'ad-pill-hi' : s >= 50 ? 'ad-pill-mid' : 'ad-pill-low';

  const attemptsRows = attempts.length
    ? attempts.map(a => `
        <tr>
          <td class="ad-mono">${a.id !== "-" ? String(a.id).slice(0, 8) : "-"}</td>
          <td>${a.alunoName || a.alunoId}</td>
          <td>${a.area}</td>
          <td><span class="ad-pill ${pillClass(a.score)}">${a.score}%</span></td>
          <td style="color:var(--ad-muted);font-size:12px">${a.timestamp}</td>
        </tr>`).join('')
    : `<tr class="ad-empty"><td colspan="5">Nenhuma tentativa cadastrada no momento.</td></tr>`;

  root.innerHTML = `
  <div class="ad-shell">

    ${adminSidebarHtml('dashboard', 'Administrador')}

    <!-- MAIN -->
    <div class="ad-main">
      <header class="ad-topbar">
        <span class="ad-topbar-title">Dashboard</span>
        <div class="ad-topbar-actions">
          <span class="ad-badge">● Sistema online</span>
          <button class="ad-icon-btn" title="Atualizar" onclick="location.reload()">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          </button>
        </div>
      </header>

      <div class="ad-content">

        <!-- page header -->
        <div class="ad-page-head">
          <div>
            <h1>Visão <span>Geral</span></h1>
            <p>Resumo operacional do SimuladoTop.</p>
          </div>
          <a href="admin-provas.html" class="ad-btn-primary">+ Nova Prova</a>
        </div>

        <!-- metrics -->
        <div class="ad-metrics">
          <div class="ad-metric-card c-orange">
            <span class="ad-metric-label">Usuários ativos</span>
            <span class="ad-metric-value">${na ? '—' : metrics.totalUsers}</span>
            <span class="ad-metric-desc">${na ? 'Dados indisponíveis' : 'Alunos com simulados concluídos'}</span>
          </div>
          <div class="ad-metric-card c-yellow">
            <span class="ad-metric-label">Tentativas registradas</span>
            <span class="ad-metric-value">${na ? '—' : metrics.totalAttempts}</span>
            <span class="ad-metric-desc">${na ? 'Conexão instável com o banco' : 'Total de provas processadas'}</span>
          </div>
          <div class="ad-metric-card c-red">
            <span class="ad-metric-label">Média de acertos</span>
            <span class="ad-metric-value">${na ? '—' : `${metrics.averagePerformance}%`}</span>
            <span class="ad-metric-desc">${na ? 'Aguardando dados' : 'Desempenho médio nos simulados'}</span>
          </div>
        </div>

        <!-- two-col -->
        <div class="ad-two-col">

          <!-- table -->
          <div class="ad-card">
            <div class="ad-card-head">
              <div>
                <h2>Últimas tentativas</h2>
                <p>As 8 tentativas mais recentes cadastradas no banco.</p>
              </div>
              <span class="ad-card-tag">Ao vivo</span>
            </div>
            <div class="ad-table-wrap">
              <table class="ad-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Aluno</th><th>Área</th><th>Desempenho</th><th>Data</th>
                  </tr>
                </thead>
                <tbody>${attemptsRows}</tbody>
              </table>
            </div>
          </div>

          <!-- right panel -->
          <div class="ad-panel-stack">

            <div class="ad-card">
              <div class="ad-card-head">
                <div>
                  <h2>Ações rápidas</h2>
                  <p>Acesso direto às seções principais.</p>
                </div>
              </div>
              <div class="ad-quick-links">
                <a class="ad-quick-link" href="perfil.html">
                  Painel de perfil
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </a>
                <a class="ad-quick-link" href="ranking.html">
                  Ranking atual
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </a>
                <a class="ad-quick-link" href="admin-provas.html">
                  Gerenciar provas
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </a>
                <a class="ad-quick-link" href="admin-alunos.html">
                  Gerenciar alunos
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </a>
              </div>
            </div>

            <div class="ad-card">
              <div class="ad-card-head">
                <div>
                  <h2>Distribuição de notas</h2>
                  <p>Faixas de desempenho dos alunos.</p>
                </div>
              </div>
              <div class="ad-stat-row">
                <div>
                  <div class="ad-stat-info">
                    <span class="ad-stat-name">Acima de 75%</span>
                    <span class="ad-stat-pct" style="color:var(--ad-accent)">Alta</span>
                  </div>
                  <div class="ad-bar-track"><div class="ad-bar-fill" style="width:60%;background:var(--ad-accent)"></div></div>
                </div>
                <div>
                  <div class="ad-stat-info">
                    <span class="ad-stat-name">Entre 50–75%</span>
                    <span class="ad-stat-pct" style="color:var(--ad-accent2)">Média</span>
                  </div>
                  <div class="ad-bar-track"><div class="ad-bar-fill" style="width:25%;background:var(--ad-accent2)"></div></div>
                </div>
                <div>
                  <div class="ad-stat-info">
                    <span class="ad-stat-name">Abaixo de 50%</span>
                    <span class="ad-stat-pct" style="color:var(--ad-danger)">Baixa</span>
                  </div>
                  <div class="ad-bar-track"><div class="ad-bar-fill" style="width:15%;background:var(--ad-danger)"></div></div>
                </div>
              </div>
            </div>

          </div>
        </div><!-- /two-col -->

      </div><!-- /content -->
    </div><!-- /main -->
  </div><!-- /shell -->`;
}

function truncateId(id) {
  if (!id) return '-';
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}
