/**
 * LÓGICA DA PÁGINA DE PERFIL — perfil.js
 */

let _historicoCompleto = [];

function getCurrentWeekStart() {
  const d = new Date();
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function obterSimuladosAtivos() {
  const { data: simuladosAtivos, error } = await _supabase
    .from('simulados')
    .select('id, slug, title');

  if (error) {
    console.error('Erro ao buscar simulados ativos:', error);
    return { idsValidos: new Set(), titulosMap: {} };
  }

  const idsValidos = new Set();
  const titulosMap = {};
  (simuladosAtivos || []).forEach((s) => {
    if (s.id) {
      idsValidos.add(s.id);
      titulosMap[s.id] = s.title || s.id;
    }
    if (s.slug) {
      idsValidos.add(s.slug);
      if (s.title) titulosMap[s.slug] = s.title;
    }
    if (s.title) {
      idsValidos.add(s.title);
      titulosMap[s.title] = s.title;
    }
  });

  return { idsValidos, titulosMap };
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await obterUsuarioAtual();
  
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // 1. Configurar Identidade (Foto e Nome)
  try {
    const { data: perfilData } = await _supabase.from('perfis').select('full_name, avatar_url').eq('id', user.id).maybeSingle();
    
    // Prioridade: Tabela Perfis > Metadados Auth > "Usuário"
    const fullName = perfilData?.full_name || user.user_metadata?.full_name || user.user_metadata?.display_name;
    const avatarUrl = perfilData?.avatar_url || user.user_metadata?.avatar_url;
    
    const primeiroNome = (fullName && !fullName.includes('@')) ? fullName.split(' ')[0] : "Usuário";
    
    // Atualiza Saudação e Avatar
    const greetingEl = document.getElementById('perfil-greeting');
    if (greetingEl) greetingEl.innerHTML = `Olá, ${primeiroNome}! 👋`;

    const avatarContainer = document.getElementById('user-avatar-container');
    if (avatarContainer) {
      if (avatarUrl) {
        avatarContainer.innerHTML = `<img src="${avatarUrl}" alt="Avatar">`;
      } else {
        const iniciais = primeiroNome.charAt(0).toUpperCase();
        document.getElementById('user-initials').innerText = iniciais;
      }
    }
  } catch (e) {
    console.error("Erro ao carregar identidade:", e);
    const greetingEl = document.getElementById('perfil-greeting');
    if (greetingEl) greetingEl.innerHTML = `Olá, Usuário! 👋`;
  }

  carregarDadosPerfil(user.id);
  subscribePerfilUpdates(user.id);
});

async function carregarDadosPerfil(userId) {
  try {
    const pontos = await calcularPontosSemanaAtual(userId);
    const pontosEl = document.getElementById('stat-pontos');

    if (pontosEl) {
      if (pontos === 0) {
        pontosEl.innerHTML = '<span class="empty-state">Faça seu primeiro simulado!</span>';
      } else {
        pontosEl.innerText = pontos;
      }
    }
    // 2. Puxar Histórico de Tentativas
    const { data: tentativas, error: tentErr } = await _supabase
      .from('tentativas')
      .select('*')
      .eq('aluno_id', userId)
      .order('created_at', { ascending: false });

    if (tentErr) throw tentErr;

    const tentativasRaw = tentativas || [];
    const { idsValidos, titulosMap } = await obterSimuladosAtivos();
    const tentativasValidas = tentativasRaw.filter((t) => idsValidos.has(t.simulado_id));

    _historicoCompleto = tentativasValidas.map((t) => ({
      ...t,
      nome_exibicao: titulosMap[t.simulado_id] || t.simulado_id
    }));

    // 3. Processar Estatísticas Semanais para a Saudação Dinâmica
    processarEstatisticasSemanais(_historicoCompleto);

    renderizarEstatisticas(_historicoCompleto);
    renderizarListaHistorico(_historicoCompleto);

  } catch (error) {
    console.error("Erro ao carregar dados do perfil:", error);
    const container = document.getElementById('historico-list-items');
    if (container) {
      container.innerHTML = `<p style="padding:20px; text-align:center; color:var(--wrong);">Erro ao carregar dados. Tente novamente mais tarde.</p>`;
    }
  }
}

async function calcularPontosSemanaAtual(userId) {
  const semanaInicio = getCurrentWeekStart();
  const { data, error } = await _supabase
    .from('tentativas')
    .select('simulado_id, acertos, erros, tempo_gasto')
    .eq('aluno_id', userId)
    .gte('created_at', semanaInicio.toISOString())
    .or('is_estudo.is.null,is_estudo.eq.false');

  if (error) {
    console.error('Erro ao calcular pontos semanais do perfil:', error);
    return 0;
  }

  const { idsValidos } = await obterSimuladosAtivos();
  const tentativasValidas = (data || []).filter((t) => idsValidos.has(t.simulado_id));

  const melhorPorSimulado = {};
  tentativasValidas.forEach((r) => {
    const key = `${r.simulado_id}`;
    if (!melhorPorSimulado[key] || r.acertos > melhorPorSimulado[key].acertos) {
      melhorPorSimulado[key] = r;
    }
  });

  return Object.values(melhorPorSimulado).reduce((sum, item) => sum + Number(item.acertos || 0), 0);
}

function subscribePerfilUpdates(userId) {
  if (!window._supabase?.channel || window.__PERFIL_REALTIME_SUBSCRIBED) return;

  const channel = window._supabase.channel(`realtime-perfil-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tentativas', filter: `aluno_id=eq.${userId}` }, () => carregarDadosPerfil(userId))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tentativas', filter: `aluno_id=eq.${userId}` }, () => carregarDadosPerfil(userId))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tentativas', filter: `aluno_id=eq.${userId}` }, () => carregarDadosPerfil(userId))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfis', filter: `id=eq.${userId}` }, () => carregarDadosPerfil(userId));

  if (channel?.subscribe) {
    channel.subscribe();
  }

  window.__PERFIL_REALTIME_SUBSCRIBED = true;
}

function processarEstatisticasSemanais(tentativas) {
  const semanaInicio = getCurrentWeekStart();
  const tentativasSemana = tentativas.filter(t => new Date(t.created_at) >= semanaInicio);
  const totalSemana = tentativasSemana.length;
  
  let mediaSemana = 0;
  if (totalSemana > 0) {
    const soma = tentativasSemana.reduce((acc, curr) => acc + (curr.porcentagem_acerto || 0), 0);
    mediaSemana = Math.round(soma / totalSemana);
  }

  const summaryEl = document.getElementById('perfil-stats-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `Você concluiu <strong>${totalSemana}</strong> simulados esta semana com uma média de <strong>${mediaSemana}%</strong>. Continue assim!`;
  }
}

function renderizarEstatisticas(tentativas) {
  const total = tentativas.length;
  document.getElementById('stat-concluidos').innerText = total;

  if (total > 0) {
    const soma = tentativas.reduce((acc, curr) => acc + (curr.porcentagem_acerto || 0), 0);
    const media = Math.round(soma / total);
    document.getElementById('stat-media').innerText = media + '%';
  } else {
    document.getElementById('stat-media').innerText = '0%';
  }
}

function renderizarListaHistorico(itens) {
  const container = document.getElementById('historico-list-items');
  
  if (!itens || itens.length === 0) {
    container.innerHTML = `<p style="padding:40px; text-align:center; color:var(--muted);">Você ainda não realizou nenhum simulado.</p>`;
    return;
  }

  container.innerHTML = itens.map(item => {
    const data = new Date(item.created_at).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const nota = item.porcentagem_acerto || 0;
    const notaClass = nota >= 70 ? 'nota-high' : nota >= 50 ? 'nota-mid' : 'nota-low';
    
    const tagEstudo = item.is_estudo
      ? `<span style="
          background:rgba(59,130,246,0.15);
          color:#3b82f6;
          font-size:0.7rem;
          font-weight:700;
          padding:2px 8px;
          border-radius:999px;
          margin-left:8px;
          vertical-align:middle;
        ">ESTUDO</span>`
      : '';

    return `
      <div class="historico-row">
        <span class="simulado-nome">
          ${item.nome_exibicao || item.area || item.simulado_id || 'Simulado'}${tagEstudo}
        </span>
        <span class="simulado-data">${data}</span>
        <span class="simulado-nota ${notaClass}" style="text-align: right;">${nota}%</span>
      </div>
    `;
  }).join('');
}

/**
 * Filtra o histórico por período
 */
function filtrarHistorico(periodo, btn) {
  // Atualiza botões
  document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (periodo === 'tudo') {
    renderizarListaHistorico(_historicoCompleto);
    return;
  }

  const agora = new Date();
  let dataLimite = new Date();

  if (periodo === 'semana') {
    dataLimite = getCurrentWeekStart();
  } else if (periodo === 'mes') {
    dataLimite.setMonth(agora.getMonth() - 1);
  }

  const filtrados = _historicoCompleto.filter(item => {
    const dataItem = new Date(item.created_at);
    return dataItem >= dataLimite;
  });

  renderizarListaHistorico(filtrados);
}

// Expõe a função globalmente para os botões do HTML
window.filtrarHistorico = filtrarHistorico;
