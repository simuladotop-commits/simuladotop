import { adminSidebarHtml } from './admin-sidebar.js';

export async function initAdminAlunos() {
  const root = document.getElementById('admin-content');
  if (!root) return;

  renderLoading(root);

  try {
    await fetchAlunosData();
    renderAlunosPage(root);
  } catch (err) {
    console.error('Erro ao carregar dados de alunos:', err);
    renderErrorPage(root);
  }
}

function renderLoading(root, roleLabel = 'Administrador') {
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('alunos', roleLabel)}
      <section class="dashboard-main">
        <div class="skeleton-card medium"></div>
        <div class="skeleton-grid three-cols">
          <div class="skeleton-card medium"></div>
          <div class="skeleton-card medium"></div>
          <div class="skeleton-card medium"></div>
        </div>
        <div class="skeleton-card tall"></div>
      </section>
    </div>
  `;
}

async function fetchAlunosData() {
  if (!window._supabase) {
    throw new Error('Supabase não inicializado');
  }

  try {
    const { data, error } = await window._supabase
      .rpc('get_alunos_com_email');

    const alunos = Array.isArray(data) ? data : [];
    const ids = [...new Set(alunos.map((aluno) => aluno.id).filter(Boolean))];
    const semanal = await fetchPontosSemanaPorAluno(ids);

    alunos.forEach((aluno) => {
      aluno.pontos = semanal[aluno.id] || 0;
    });

    return {
      alunos,
      failed: false
    };
  } catch (err) {
    console.warn('Erro ao buscar alunos:', err);
    return {
      alunos: [],
      failed: true
    };
  }
}

function getCurrentWeekStart() {
  const d = new Date();
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function fetchPontosSemanaPorAluno(alunoIds) {
  if (!window._supabase || !alunoIds?.length) return {};

  const weekStart = getCurrentWeekStart();
  const { data, error } = await window._supabase
    .from('tentativas')
    .select('aluno_id, simulado_id, acertos, tempo_gasto')
    .in('aluno_id', alunoIds)
    .gte('created_at', weekStart.toISOString())
    .or('is_estudo.is.null,is_estudo.eq.false');

  if (error) {
    console.error('[admin-alunos] Erro ao buscar pontos semanais:', error);
    return {};
  }

  const melhorPorAlunoSimulado = {};
  (data || []).forEach((row) => {
    const key = `${row.aluno_id}::${row.simulado_id}`;
    if (!melhorPorAlunoSimulado[key] || row.acertos > melhorPorAlunoSimulado[key].acertos) {
      melhorPorAlunoSimulado[key] = row;
    }
  });

  return Object.values(melhorPorAlunoSimulado).reduce((acc, row) => {
    acc[row.aluno_id] = (acc[row.aluno_id] || 0) + Number(row.acertos || 0);
    return acc;
  }, {});
}

function calcularPontosSemanaParaAluno(alunoId, tentativasSemana) {
  const melhorPorSimulado = {};
  (tentativasSemana || []).forEach((r) => {
    if (r.aluno_id !== alunoId) return;
    const key = `${r.simulado_id}`;
    if (!melhorPorSimulado[key] || r.acertos > melhorPorSimulado[key].acertos) {
      melhorPorSimulado[key] = r;
    }
  });
  return Object.values(melhorPorSimulado).reduce((sum, item) => sum + Number(item.acertos || 0), 0);
}

function calcularPosicaoRankingSemanal(alunoId, tentativasSemana) {
  const melhorPorSimulado = {};
  (tentativasSemana || []).forEach((r) => {
    const key = `${r.aluno_id}::${r.simulado_id}`;
    if (!melhorPorSimulado[key] || r.acertos > melhorPorSimulado[key].acertos) {
      melhorPorSimulado[key] = r;
    }
  });

  const porAluno = {};
  Object.values(melhorPorSimulado).forEach((r) => {
    if (!porAluno[r.aluno_id]) {
      porAluno[r.aluno_id] = { acertos: 0, tempo: 0 };
    }
    porAluno[r.aluno_id].acertos += Number(r.acertos || 0);
    porAluno[r.aluno_id].tempo   += Number(r.tempo_gasto || 0);
  });

  const ranking = Object.entries(porAluno)
    .map(([id, s]) => ({ id, pontos: s.acertos, tempo: s.tempo }))
    .filter((r) => r.pontos > 0)
    .sort((a, b) => b.pontos !== a.pontos ? b.pontos - a.pontos : a.tempo - b.tempo);

  const index = ranking.findIndex((item) => item.id === alunoId);
  return index >= 0 ? index + 1 : null;
}

async function obterEmailAluno(alunoId, alunoRow) {
  if (alunoRow) {
    const emailFromRow = alunoRow.email || alunoRow.user_email || alunoRow.user_metadata?.email || alunoRow.user_metadata?.user_email || alunoRow.metadata?.email || alunoRow.metadata?.user_email;
    if (emailFromRow) return emailFromRow;
  }

  if (!window._supabase) return null;

  try {
    const { data: userRecord, error: userErr } = await window._supabase
      .from('users')
      .select('email, user_email')
      .eq('id', alunoId)
      .single();
    if (!userErr && userRecord) {
      return userRecord.email || userRecord.user_email || null;
    }
  } catch (e) {
    console.warn('[modal-aluno] Falha ao consultar tabela users:', e);
  }

  try {
    const { data: emailData, error: emailErr } = await window._supabase
      .rpc('get_user_email', { user_id: alunoId });

    if (!emailErr && emailData) {
      if (typeof emailData === 'string') {
        return emailData;
      }
      if (typeof emailData === 'object') {
        return emailData.email || emailData.user_email || null;
      }
    }
  } catch (e) {
    console.warn('[modal-aluno] Falha ao chamar get_user_email:', e);
  }

  return null;
}

async function carregarTitulosSimulados(simuladoIds) {
  if (!window._supabase || !simuladoIds?.length) return {};

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const resultado = {};

  const uuids = simuladoIds.filter((id) => uuidRegex.test(id));
  const slugs = simuladoIds.filter((id) => !uuidRegex.test(id) && id.match(/^[a-z0-9-]+$/));
  const directNames = simuladoIds.filter((id) => !uuidRegex.test(id) && !id.match(/^[a-z0-9-]+$/));

  directNames.forEach((id) => {
    resultado[id] = { title: id, status: 'ativa', direct: true };
  });

  if (uuids.length > 0) {
    const { data } = await window._supabase
      .from('simulados')
      .select('id, title, status')
      .in('id', uuids);

    (data || []).forEach((s) => {
      resultado[s.id] = { title: s.title || s.id, status: s.status || 'ativa' };
    });
  }

  if (slugs.length > 0) {
    const { data } = await window._supabase
      .from('simulados')
      .select('slug, title, status')
      .in('slug', slugs);

    (data || []).forEach((s) => {
      resultado[s.slug] = { title: s.title || s.slug, status: s.status || 'ativa' };
    });
  }

  return resultado;
}

function renderAlunosPage(root) {
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('alunos', 'Administrador')}
      <section class="dashboard-main">
        <div class="dashboard-header">
          <div>
            <h1>Alunos Cadastrados</h1>
            <p>Visualize todos os estudantes, suas pontuações e estatísticas de desempenho.</p>
          </div>
        </div>

        <div class="dashboard-table">
          <div class="card-header">
            <div>
              <h2>Lista de Alunos</h2>
              <p>Monitore o progresso e desempenho de cada estudante.</p>
            </div>
          </div>
          <div class="table-container">
            <table class="responsive-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Pontos</th>
                  <th>Cadastro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="alunos-table-body">
                <tr><td colspan="5" class="empty-state">Carregando dados...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  `;

  // Carregar dados de alunos de forma assíncrona
  carregarAlunosTabela();
}

async function carregarAlunosTabela() {
  const tbody = document.getElementById('alunos-table-body');
  if (!tbody) return;

  try {
    const resultado = await fetchAlunosData();
    
    if (resultado.failed || resultado.alunos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Nenhum aluno cadastrado no momento.</td></tr>`;
      return;
    }

    tbody.innerHTML = resultado.alunos.map((aluno) => `
      <tr style="${aluno.bloqueado ? 'opacity:0.6' : ''}">
        <td>
          ${escapeHtml(aluno.full_name || 'Sem nome')}
          ${aluno.bloqueado 
            ? '<span style="background:rgba(239,68,68,0.15);color:#ef4444;font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:8px">BLOQUEADO</span>' 
            : ''}
        </td>
        <td>${escapeHtml(aluno.email || '—')}</td>
        <td><strong>${aluno.pontos || 0} pts</strong></td>
        <td>${formatDate(aluno.created_at)}</td>
        <td class="action-cell">
          <button class="action-button edit-button" 
                  data-action="ver-perfil"
                  data-id="${aluno.id}"
                  data-email="${escapeHtml(aluno.email || '')}">
            👤 Gerenciar
          </button>
        </td>
      </tr>
    `).join('');

    if (!tbody.dataset.delegateAttached) {
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'ver-perfil' && id) {
          abrirModalAluno(id, btn.dataset.email);
        }
      });
      tbody.dataset.delegateAttached = 'true';
    }
  } catch (err) {
    console.error('Erro ao carregar tabela de alunos:', err);
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Erro ao carregar dados.</td></tr>`;
  }
}

function renderErrorPage(root) {
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('alunos', 'Administrador')}
      <section class="dashboard-main">
        <div class="empty-state">
          <h2>⚠️ Erro ao carregar dados</h2>
          <p>Não foi possível carregar a lista de alunos. Verifique sua conexão e tente novamente.</p>
          <a href="admin.html" class="btn-secondary">Voltar ao Dashboard</a>
        </div>
      </section>
    </div>
  `;
}

async function abrirModalAluno(alunoId, emailPassado = null) {
  document.getElementById('modal-aluno')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-aluno';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);
    display:flex;align-items:center;justify-content:center;
    z-index:9999;padding:16px;
  `;
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border-radius:14px;padding:40px;color:#888">
      Carregando dados do aluno...
    </div>`;
  document.body.appendChild(overlay);

  try {
    const { data: aluno, error: alunoErr } = await window._supabase
      .from('perfis')
      .select('*')
      .eq('id', alunoId)
      .single();

    if (alunoErr || !aluno) throw new Error('Aluno não encontrado');

    const emailAluno = emailPassado || await obterEmailAluno(alunoId, aluno);

    let posicaoRanking = null;
    let pontosSemana = 0;
    try {
      const weekStart = getCurrentWeekStart();
      const { data: tentativasSemana, error: tentativasErr } = await window._supabase
        .from('tentativas')
        .select('aluno_id, simulado_id, acertos, erros, tempo_gasto')
        .gte('created_at', weekStart.toISOString())
        .or('is_estudo.is.null,is_estudo.eq.false');

      if (tentativasErr) {
        throw tentativasErr;
      }

      const { data: simuladosAtivos, error: simuladosError } = await window._supabase
        .from('simulados')
        .select('id, slug, title');

      if (simuladosError) {
        throw simuladosError;
      }

      const idsValidos = new Set();
      (simuladosAtivos || []).forEach((s) => {
        if (s.id) idsValidos.add(s.id);
        if (s.slug) idsValidos.add(s.slug);
        if (s.title) idsValidos.add(s.title);
      });

      const tentativasFiltradas = (tentativasSemana || []).filter((t) => idsValidos.has(t.simulado_id));

      posicaoRanking = calcularPosicaoRankingSemanal(alunoId, tentativasFiltradas);
      pontosSemana = calcularPontosSemanaParaAluno(alunoId, tentativasFiltradas);
    } catch (e) {
      console.warn('[modal-aluno] Posição no ranking indisponível:', e);
    }

    const { data: tentativas, error: tentativasError } = await window._supabase
      .from('tentativas')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (tentativasError) {
      throw tentativasError;
    }

    const lista = tentativas || [];
    const titulosMap = await carregarTitulosSimulados(
      lista.map((t) => t.simulado_id).filter(Boolean)
    );
    const listaComNome = lista
      .map((t) => {
        const tituloData = t.prova_nome
          ? { title: t.prova_nome, status: 'ativa' }
          : t.simulado_titulo
            ? { title: t.simulado_titulo, status: 'ativa' }
            : t.nome
              ? { title: t.nome, status: 'ativa' }
              : t.titulo
                ? { title: t.titulo, status: 'ativa' }
                : t.title
                  ? { title: t.title, status: 'ativa' }
                  : titulosMap[t.simulado_id];

        if (!tituloData || !tituloData.title || (tituloData.title === t.simulado_id && !tituloData.direct)) {
          return null; // prova deletada ou não resolvida
        }

        return {
          ...t,
          nome_exibicao: tituloData.title,
          simulado_status: tituloData.status || 'ativa'
        };
      })
      .filter(Boolean);

    const totalSimulados = listaComNome.filter((t) => !t.is_estudo).length;
    const mediaAcertos = listaComNome.length > 0
      ? Math.round(listaComNome.reduce((s, t) => s + (t.porcentagem_acerto || 0), 0) / listaComNome.length)
      : 0;

    const nome = aluno.full_name || 'Sem nome';
    const inicial = nome.charAt(0).toUpperCase();
    const isBloqueado = aluno.bloqueado === true;

    overlay.innerHTML = `
      <div style="
        background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;
        width:100%;max-width:680px;max-height:90vh;overflow-y:auto;
        display:flex;flex-direction:column;
      ">
        <div style="
          padding:20px 24px;border-bottom:1px solid #2a2a2a;
          display:flex;justify-content:space-between;align-items:center;
          position:sticky;top:0;background:#1a1a1a;z-index:10;
          border-radius:14px 14px 0 0;
        ">
          <h2 style="margin:0;font-size:1.1rem;color:#f0f0f0">
            👤 Painel do Aluno
          </h2>
          <button id="btn-fechar-modal-aluno" style="
            background:none;border:1px solid #444;color:#aaa;
            width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:1.2rem;
          ">×</button>
        </div>

        <div style="padding:24px;border-bottom:1px solid #2a2a2a">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
            <div style="
              width:56px;height:56px;border-radius:50%;
              background:rgba(245,166,35,0.15);color:#f5a623;
              display:flex;align-items:center;justify-content:center;
              font-size:1.5rem;font-weight:700;flex-shrink:0;overflow:hidden;
            ">
              ${aluno.avatar_url 
                ? `<img src="${aluno.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
                : inicial}
            </div>
            <div>
              <div style="font-size:1.1rem;font-weight:700;color:#f0f0f0">
                ${nome}
                ${isBloqueado 
                  ? '<span style="background:rgba(239,68,68,0.15);color:#ef4444;font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:8px">BLOQUEADO</span>'
                  : ''}
              </div>
              <div style="color:#888;font-size:0.85rem;margin-top:2px">
                ${emailAluno || aluno.email || 'E-mail não disponível'}
              </div>
              <div style="color:#666;font-size:0.8rem;margin-top:2px">
                Cadastro: ${formatDate(aluno.created_at)}
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px;text-align:center">
              <div style="font-size:1.4rem;font-weight:700;color:#f5a623">
               ${pontosSemana || 0}
              </div>
              <div style="font-size:0.7rem;color:#888;margin-top:2px">PONTOS</div>
            </div>
            <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px;text-align:center">
              <div style="font-size:1.4rem;font-weight:700;color:#f0f0f0">
                ${posicaoRanking ? posicaoRanking + '°' : '—'}
              </div>
              <div style="font-size:0.7rem;color:#888;margin-top:2px">RANKING</div>
            </div>
            <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px;text-align:center">
              <div style="font-size:1.4rem;font-weight:700;color:#f0f0f0">
                ${totalSimulados}
              </div>
              <div style="font-size:0.7rem;color:#888;margin-top:2px">SIMULADOS</div>
            </div>
            <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px;text-align:center">
              <div style="font-size:1.4rem;font-weight:700;color:#22c55e">
                ${mediaAcertos}%
              </div>
              <div style="font-size:0.7rem;color:#888;margin-top:2px">MÉDIA</div>
            </div>
          </div>
        </div>

        <div style="padding:24px;border-bottom:1px solid #2a2a2a">
          <h3 style="font-size:0.875rem;font-weight:700;color:#f0f0f0;
                     text-transform:uppercase;margin:0 0 14px">
            Histórico de Tentativas
          </h3>
          ${listaComNome.length === 0 
            ? '<p style="color:#555;font-size:0.875rem">Nenhuma tentativa registrada.</p>'
            : `<div style="display:flex;flex-direction:column;gap:8px">
                ${listaComNome.map(t => {
                  const nota = t.porcentagem_acerto || 0;
                  const cor  = nota >= 70 ? '#22c55e' : nota >= 50 ? '#f5a623' : '#ef4444';
                  return `
                    <div style="
                      display:flex;justify-content:space-between;align-items:center;
                      padding:10px 14px;background:#111;border-radius:6px;
                      border:1px solid #2a2a2a;
                    ">
                      <div>
                        <div style="font-size:0.875rem;color:#f0f0f0">
                          ${escapeHtml(t.nome_exibicao)}
                          ${t.simulado_status === 'inativa'
                            ? '<span style="background:rgba(249,115,22,0.15);color:#f97316;font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:999px;margin-left:6px">INATIVA</span>'
                            : ''}
                          ${t.is_estudo 
                            ? '<span style="background:rgba(59,130,246,0.15);color:#3b82f6;font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:999px;margin-left:6px">ESTUDO</span>'
                            : ''}
                        </div>
                        <div style="font-size:0.75rem;color:#666;margin-top:2px">
                          ${formatDate(t.created_at)}
                        </div>
                      </div>
                      <span style="font-weight:700;color:${cor}">${nota}%</span>
                    </div>
                  `;
                }).join('')}
              </div>`
          }
        </div>

        <div style="padding:24px">
          <h3 style="font-size:0.875rem;font-weight:700;color:#f0f0f0;
                     text-transform:uppercase;margin:0 0 14px">
            Ações de Governança
          </h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

            <button id="btn-zerar-pontos" data-id="${alunoId}" data-nome="${nome}" style="
              padding:12px;background:rgba(245,166,35,0.1);
              border:1px solid rgba(245,166,35,0.3);color:#f5a623;
              border-radius:8px;cursor:pointer;font-size:0.875rem;font-weight:600;
              transition:all 0.2s;text-align:left;
            ">
              🔴 Zerar Pontuação<br>
              <span style="font-size:0.75rem;font-weight:400;color:#888">
                Remove todos os pontos do ranking
              </span>
            </button>

            <button id="btn-bloquear" data-id="${alunoId}" data-nome="${nome}" 
                    data-bloqueado="${isBloqueado}" style="
              padding:12px;
              background:${isBloqueado ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};
              border:1px solid ${isBloqueado ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};
              color:${isBloqueado ? '#22c55e' : '#ef4444'};
              border-radius:8px;cursor:pointer;font-size:0.875rem;font-weight:600;
              transition:all 0.2s;text-align:left;
            ">
              ${isBloqueado ? '🔓 Desbloquear Acesso' : '🔒 Bloquear Acesso'}<br>
              <span style="font-size:0.75rem;font-weight:400;color:#888">
                ${isBloqueado 
                  ? 'Restaura acesso à plataforma' 
                  : 'Impede login e some do ranking'}
              </span>
            </button>

            <button id="btn-exportar" data-id="${alunoId}" data-nome="${nome}" style="
              padding:12px;background:rgba(59,130,246,0.1);
              border:1px solid rgba(59,130,246,0.3);color:#3b82f6;
              border-radius:8px;cursor:pointer;font-size:0.875rem;font-weight:600;
              transition:all 0.2s;text-align:left;
            ">
              📊 Exportar Histórico<br>
              <span style="font-size:0.75rem;font-weight:400;color:#888">
                Baixa CSV com todas as tentativas
              </span>
            </button>

            <button id="btn-excluir-aluno" data-id="${alunoId}" data-nome="${nome}" style="
              padding:12px;background:rgba(239,68,68,0.1);
              border:1px solid rgba(239,68,68,0.3);color:#ef4444;
              border-radius:8px;cursor:pointer;font-size:0.875rem;font-weight:600;
              transition:all 0.2s;text-align:left;
            ">
              🗑️ Excluir Conta<br>
              <span style="font-size:0.75rem;font-weight:400;color:#888">
                Remove permanentemente o aluno
              </span>
            </button>
          </div>

          <div id="governanca-msg" style="
            margin-top:14px;font-size:0.8rem;min-height:20px;
          "></div>
        </div>
      </div>
    `;

    document.getElementById('btn-fechar-modal-aluno')
      .addEventListener('click', () => overlay.remove());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.getElementById('btn-zerar-pontos')
      .addEventListener('click', async () => {
        const nome = document.getElementById('btn-zerar-pontos').dataset.nome;
        if (!confirm(`Zerar TODOS os pontos de "${nome}"?\n\nEle sairá do ranking.`)) return;
        try {
          const msg = document.getElementById('governanca-msg');
          msg.textContent = 'Zerando pontos...';
          msg.style.color = '#f5a623';

          await window._supabase
            .from('perfis')
            .update({ pontos: 0 })
            .eq('id', alunoId);

          msg.textContent = `✅ Pontos de "${nome}" zerados com sucesso.`;
          msg.style.color = '#22c55e';
          await carregarAlunosTabela();
          setTimeout(() => abrirModalAluno(alunoId), 1500);
        } catch (err) {
          const msg = document.getElementById('governanca-msg');
          if (msg) {
            msg.textContent = '❌ Erro: ' + (err.message || err);
            msg.style.color = '#ef4444';
          }
        }
      });

    document.getElementById('btn-bloquear')
      .addEventListener('click', async () => {
        const btn = document.getElementById('btn-bloquear');
        const isBloq = btn.dataset.bloqueado === 'true';
        const novoEstado = !isBloq;
        const acao = novoEstado ? 'bloquear' : 'desbloquear';
        const nomeAluno = btn.dataset.nome;

        if (!confirm(`Deseja ${acao} o acesso de "${nomeAluno}"?`)) return;

        try {
          const msg = document.getElementById('governanca-msg');
          msg.textContent = `${novoEstado ? 'Bloqueando' : 'Desbloqueando'}...`;
          msg.style.color = '#f5a623';

          await window._supabase
            .from('perfis')
            .update({ bloqueado: novoEstado })
            .eq('id', alunoId);

          msg.textContent = `✅ Acesso de "${nomeAluno}" ${novoEstado ? 'bloqueado' : 'desbloqueado'}.`;
          msg.style.color = '#22c55e';
          await carregarAlunosTabela();
          setTimeout(() => abrirModalAluno(alunoId), 1500);
        } catch (err) {
          const msg = document.getElementById('governanca-msg');
          if (msg) {
            msg.textContent = '❌ Erro: ' + (err.message || err);
            msg.style.color = '#ef4444';
          }
        }
      });

    document.getElementById('btn-exportar')
      .addEventListener('click', () => {
        const nomeAluno = document.getElementById('btn-exportar').dataset.nome;
        if (listaComNome.length === 0) {
          alert('Este aluno não tem tentativas para exportar.');
          return;
        }

        const formatDateTime = (dateString) => {
          if (!dateString) return '—';
          const date = new Date(dateString);
          if (Number.isNaN(date.getTime())) return '—';
          const pad = (value) => String(value).padStart(2, '0');
          const day = pad(date.getDate());
          const month = pad(date.getMonth() + 1);
          const year = date.getFullYear();
          const hours = pad(date.getHours());
          const minutes = pad(date.getMinutes());
          return `${day}/${month}/${year} ${hours}:${minutes}`;
        };

        const escapeCsv = (value) => `"${String(value || '').replace(/"/g, '""')}"`;

        const linhas = listaComNome.map((t) => [
          t.nome_exibicao || t.simulado_id || '',
          formatDateTime(t.created_at),
          t.acertos || 0,
          t.erros || 0,
          t.porcentagem_acerto || 0,
          t.tempo_gasto || 0,
          t.is_estudo ? 'Estudo' : 'Ranking'
        ]);

        const headerInfo = [
          `Aluno: ${nomeAluno.replace(/"/g, '""')}`,
          `E-mail: ${(emailAluno || aluno.email || '—').replace(/"/g, '""')}`,
          `Exportado em: ${formatDateTime(new Date().toISOString())}`,
          ''
        ];

        const csvRows = [
          ...headerInfo,
          ['SIMULADO', 'DATA', 'ACERTOS', 'ERROS', 'NOTA (%)', 'TEMPO (s)', 'TIPO'].join(';'),
          ...linhas.map((row) => row.map((v) => escapeCsv(v)).join(';'))
        ];

        const csv = csvRows.join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateNow = new Date();
        const filenameDate = `${String(dateNow.getDate()).padStart(2, '0')}-${String(dateNow.getMonth() + 1).padStart(2, '0')}-${dateNow.getFullYear()}`;
        a.download = `historico_${nomeAluno.replace(/\s/g,'_')}_${filenameDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });

    document.getElementById('btn-excluir-aluno')
      .addEventListener('click', async () => {
        const nomeAluno = document.getElementById('btn-excluir-aluno').dataset.nome;
        const confirmacao = prompt(
          `⚠️ AÇÃO IRREVERSÍVEL\n\nDigite o nome do aluno para confirmar a exclusão:\n"${nomeAluno}"`
        );
        if (confirmacao !== nomeAluno) {
          alert('Nome incorreto. Exclusão cancelada.');
          return;
        }

        try {
          const msg = document.getElementById('governanca-msg');
          msg.textContent = 'Excluindo conta...';
          msg.style.color = '#ef4444';

          await window._supabase
            .from('tentativas')
            .delete()
            .eq('aluno_id', alunoId);

          await window._supabase
            .from('perfis')
            .delete()
            .eq('id', alunoId);

          alert(`Conta de "${nomeAluno}" excluída com sucesso.`);
          overlay.remove();
          await carregarAlunosTabela();
        } catch (err) {
          const msg = document.getElementById('governanca-msg');
          if (msg) {
            msg.textContent = '❌ Erro: ' + (err.message || err);
            msg.style.color = '#ef4444';
          }
        }
      });

  } catch (err) {
    console.error('[modal-aluno] Erro ao abrir modal para aluno:', alunoId, err);
    overlay.innerHTML = `
      <div style="background:#1a1a1a;border-radius:14px;padding:40px;text-align:center">
        <p style="color:#ef4444;margin-bottom:16px">Erro ao carregar dados do aluno.</p>
        <button onclick="document.getElementById('modal-aluno').remove()"
                style="background:#f5a623;border:none;color:#000;padding:10px 20px;
                       border-radius:6px;cursor:pointer;font-weight:700">
          Fechar
        </button>
      </div>`;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

window.abrirModalAluno = abrirModalAluno;
