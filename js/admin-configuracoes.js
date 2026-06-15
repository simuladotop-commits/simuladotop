import { adminSidebarHtml } from './admin-sidebar.js';

// Funções utilitárias
function agruparPorArea(registros) {
  const mapa = {};
  registros.forEach(r => {
    if (!mapa[r.area]) mapa[r.area] = [];
    mapa[r.area].push(r);
  });
  return mapa;
}

export async function initAdminConfiguracoes() {
  const root = document.getElementById('admin-content');
  if (!root) return;

  renderLoading(root);

  try {
    const areas = await fetchAreasMaterias();
    renderConfiguracoes(root, areas);
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
    renderErrorPage(root);
  }
}

function renderLoading(root, roleLabel = 'Administrador') {
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('configuracoes', roleLabel)}
      <section class="dashboard-main">
        <div class="skeleton-card medium"></div>
        <div class="skeleton-card tall"></div>
      </section>
    </div>`;
}

async function fetchAreasMaterias() {
  if (!window._supabase) throw new Error('Supabase não inicializado');

  const { data, error } = await window._supabase
    .from('areas_materias')
    .select('*')
    .order('area')
    .order('ordem');

  if (error) throw error;
  return data || [];
}

async function recarregarAreas() {
  const root = document.getElementById('admin-content');
  if (!root) return;

  const areas = await fetchAreasMaterias();
  renderConfiguracoes(root, areas);
  setupEventos();
}

function setupEventos() {
  const btnAddArea = document.getElementById('btn-adicionar-area');
  if (btnAddArea && !btnAddArea.dataset.eventSetup) {
    btnAddArea.addEventListener('click', async () => {
      const input = document.getElementById('nova-area-input');
      const msg = document.getElementById('area-msg');
      const area = input?.value.trim();

      if (!area) {
        if (msg) {
          msg.textContent = '⚠️ Digite o nome da área.';
          msg.style.color = '#ef4444';
        }
        return;
      }

      try {
        if (msg) {
          msg.textContent = 'Salvando...';
          msg.style.color = '#f5a623';
        }

        const { error } = await window._supabase
          .from('areas_materias')
          .insert([{ area, materia: 'Geral', ordem: 1 }]);

        if (error) throw error;

        if (msg) {
          msg.textContent = `✅ Área "${area}" adicionada!`;
          msg.style.color = '#22c55e';
        }
        input.value = '';
        await recarregarAreas();
      } catch (err) {
        if (msg) {
          msg.textContent = '❌ Erro: ' + (err.message || 'Tente novamente.');
          msg.style.color = '#ef4444';
        }
      }
    });
    btnAddArea.dataset.eventSetup = 'true';
  }

  const container = document.getElementById('areas-container');
  if (!container || container.dataset.eventSetup) return;

  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const area = btn.dataset.area;
    const id = btn.dataset.id;
    const materia = btn.dataset.materia;

    if (action === 'remover-area') {
      if (!confirm(`Remover a área "${area}" e TODAS as suas matérias?\n\nEsta ação não pode ser desfeita.`)) return;
      try {
        const { error } = await window._supabase
          .from('areas_materias')
          .delete()
          .eq('area', area);
        if (error) throw error;
        await recarregarAreas();
      } catch (err) {
        alert('Erro ao remover área: ' + err.message);
      }
    }

    if (action === 'adicionar-materia') {
      const inputId = `nova-materia-${area.replace(/\s/g, '-')}`;
      const input = document.getElementById(inputId);
      const novaMateria = input?.value.trim();

      if (!novaMateria) {
        alert('Digite o nome da matéria.');
        return;
      }

      try {
        const { error } = await window._supabase
          .from('areas_materias')
          .insert([{ area, materia: novaMateria, ordem: 99 }]);

        if (error) {
          if (error.code === '23505') {
            alert(`A matéria "${novaMateria}" já existe em ${area}.`);
          } else {
            throw error;
          }
          return;
        }

        if (input) input.value = '';
        await recarregarAreas();
      } catch (err) {
        alert('Erro ao adicionar matéria: ' + err.message);
      }
    }

    if (action === 'remover-materia') {
      if (!confirm(`Remover a matéria "${materia}" de ${area}?`)) return;
      try {
        const { error } = await window._supabase
          .from('areas_materias')
          .delete()
          .eq('id', id);
        if (error) throw error;
        await recarregarAreas();
      } catch (err) {
        alert('Erro ao remover matéria: ' + err.message);
      }
    }
  });
  container.dataset.eventSetup = 'true';
}

function renderConfiguracoes(root, areas) {
  const agrupado = agruparPorArea(areas || []);
  const areasHtml = Object.entries(agrupado).map(([area, materias]) => `
    <div class="area-card" data-area="${area}">
      <div class="area-header">
        <h3 class="area-nome">${area}</h3>
        <button class="btn-danger-sm"
                data-action="remover-area"
                data-area="${area}">
          🗑️ Remover Área
        </button>
      </div>
      <div class="materias-lista">
        ${materias.map(m => `
          <div class="materia-item" data-id="${m.id}">
            <span>${m.materia}</span>
            <button class="btn-remove-materia"
                    data-action="remover-materia"
                    data-id="${m.id}"
                    data-area="${area}"
                    data-materia="${m.materia}">
              ×
            </button>
          </div>
        `).join('')}
      </div>
      <div class="add-materia-form">
        <input type="text"
               id="nova-materia-${area.replace(/\s/g,'-')}"
               placeholder="Nome da nova matéria..."
               class="input-materia" />
        <button class="btn-add-materia"
                data-action="adicionar-materia"
                data-area="${area}">
          + Adicionar
        </button>
      </div>
    </div>
  `).join('');

  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('configuracoes', 'Administrador')}
      <section class="dashboard-main">
        <div class="dashboard-header">
          <div>
            <h1>Configurações do Sistema</h1>
            <p>Gerencie áreas, matérias e preferências da plataforma.</p>
          </div>
        </div>

        <!-- SEÇÃO: ÁREAS E MATÉRIAS -->
        <div class="admin-card">
          <div class="card-header">
            <div>
              <h2>📚 Áreas e Matérias</h2>
              <p>Gerencie as áreas de conhecimento e suas matérias disponíveis para os simulados.</p>
            </div>
          </div>
          <div class="card-body">

            <!-- Adicionar nova área -->
            <div class="add-area-form">
              <h3>Adicionar Nova Área</h3>
              <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                <input type="text"
                       id="nova-area-input"
                       placeholder="Ex: Linguagens, Ciências Humanas..."
                       style="flex:1;min-width:200px;padding:10px 14px;
                              background:#111;border:1px solid #333;
                              color:#f0f0f0;border-radius:6px;font-size:0.875rem" />
                <button class="btn-padrao" id="btn-adicionar-area">
                  + Adicionar Área
                </button>
              </div>
              <p id="area-msg" style="font-size:0.8rem;margin-top:8px;min-height:0"></p>
            </div>

            <hr style="border:none;border-top:1px solid #2a2a2a;margin:12px 0">

            <!-- Lista de áreas -->
            <div id="areas-container" style="
              display:grid;
              grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
              gap:20px;
            ">
              ${areasHtml}
            </div>
          </div>
        </div>

        <!-- SEÇÃO: CONFIGURAÇÕES GERAIS -->
        <div class="admin-card">
          <div class="card-header">
            <div>
              <h2>⚙️ Configurações Gerais</h2>
              <p>Preferências gerais da plataforma.</p>
            </div>
          </div>
          <div class="card-body">
            <section class="form-section">
              <div class="form-grid two-column-grid">
                <div class="form-field full-width">
                  <label class="toggle-switch">
                    <input type="checkbox" id="config-ranking" checked />
                    <span class="toggle-slider"></span>
                    <span class="toggle-label">Mostrar ranking em tempo real</span>
                  </label>
                </div>
                <div class="form-field full-width">
                  <label class="toggle-switch">
                    <input type="checkbox" id="config-notificacoes" checked />
                    <span class="toggle-slider"></span>
                    <span class="toggle-label">Ativar notificações de novos simulados</span>
                  </label>
                </div>
              </div>
            </section>
            <section class="form-section">
              <h3>Informações do Sistema</h3>
              <div class="system-info-panel">
                <p><strong>Versão:</strong> 1.0.0</p>
                <p><strong>API Supabase:</strong> Conectado ✓</p>
                <p><strong>Data atual:</strong> ${new Date().toLocaleString('pt-BR')}</p>
              </div>
            </section>
          </div>
        </div>

      </section>
    </div>

    <style>
      .area-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .area-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid #2a2a2a; }
      .area-nome { font-size: 0.9rem; font-weight: 700; color: #f5a623; margin: 0; }
      .btn-danger-sm { background: none; border: 1px solid rgba(239,68,68,0.3); color: #ef4444; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
      .btn-danger-sm:hover { background: #ef4444; color: #fff; }
      .materias-lista { display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; }
      .materia-item { display: inline-flex; align-items: center; gap: 4px; background: #2a1f00; border: 1px solid #4a3800; color: #f5a623; padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; }
      .btn-remove-materia { background: none; border: none; color: #f5a623; cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 0; opacity: 0.5; }
      .btn-remove-materia:hover { opacity: 1; }
      .add-materia-form { display: flex; gap: 6px; align-items: center; }
      .input-materia { flex: 1; min-width: 0; padding: 5px 10px; background: #111; border: 1px solid #333; color: #f0f0f0; border-radius: 6px; font-size: 0.78rem; }
      .input-materia:focus { outline: none; border-color: #f5a623; }
      .btn-add-materia { padding: 5px 12px; background: #f5a623; border: none; color: #111; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
      .btn-add-materia:hover { opacity: 0.85; }
      .add-area-form h3 { font-size: 0.875rem; color: #f0f0f0; margin: 0 0 10px; font-weight: 600; }
    </style>
  `;

  setupEventos();
}

function renderErrorPage(root) {
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('configuracoes', 'Administrador')}
      <section class="dashboard-main">
        <div class="error-panel">
          <h2 class="error-heading">⚠️ Erro ao carregar configurações</h2>
          <p>Não foi possível carregar as configurações do sistema. Verifique sua conexão e tente novamente.</p>
          <a href="admin.html" class="btn-padrao error-link">Voltar ao Dashboard</a>
        </div>
      </section>
    </div>
  `;
}

// Funções de ação (stub implementations)
window.limparCache = function() {
  alert('Cache limpo com sucesso!');
  console.log('Cache limpado');
};

window.exportarDados = function() {
  alert('Dados sendo preparados para exportação...');
  console.log('Exportação iniciada');
};

window.sincronizarBanco = function() {
  alert('Sincronização com banco iniciada...');
  console.log('Sincronização iniciada');
};

window.restaurarPadrao = function() {
  if (confirm('Deseja restaurar todas as configurações para o padrão?')) {
    document.getElementById('config-timeout').value = '30';
    document.getElementById('config-max-alunos').value = '50';
    document.getElementById('config-ranking').checked = true;
    document.getElementById('config-notificacoes').checked = true;
    alert('Configurações restauradas ao padrão!');
  }
};

window.salvarConfiguracoes = function() {
  const timeout = document.getElementById('config-timeout').value;
  const maxAlunos = document.getElementById('config-max-alunos').value;
  const ranking = document.getElementById('config-ranking').checked;
  const notificacoes = document.getElementById('config-notificacoes').checked;

  const config = {
    timeout_inatividade: parseInt(timeout),
    limite_alunos_lote: parseInt(maxAlunos),
    ranking_tempo_real: ranking,
    notificacoes_simulados: notificacoes
  };

  try {
    localStorage.setItem('admin_config', JSON.stringify(config));
    alert('Configurações salvas com sucesso!');
    console.log('Configurações salvas:', config);
  } catch (err) {
    alert('Erro ao salvar configurações. Tente novamente.');
    console.error('Erro:', err);
  }
};




