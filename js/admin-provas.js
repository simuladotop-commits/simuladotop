import { adminSidebarHtml } from './admin-sidebar.js';

let AREA_OPTIONS = {
  Exatas: ['Matemática', 'Física', 'Química'],
  Humanas: ['História', 'Geografia', 'Filosofia'],
  Biológicas: ['Biologia', 'Química', 'Saúde'],
  Técnicos: ['ETEC', 'Profissionalizante', 'Prática'],
};

async function carregarAreasDoBanco() {
  if (!window._supabase) return;
  try {
    const { data, error } = await window._supabase
      .from('areas_materias')
      .select('id, area, materia')
      .order('area', { ascending: true });

    if (error) throw error;
    const map = {};
    (data || []).forEach((r) => {
      const area = r.area || 'Indefinida';
      map[area] = map[area] || [];
      if (r.materia && !map[area].includes(r.materia)) map[area].push(r.materia);
    });
    if (Object.keys(map).length) AREA_OPTIONS = map;
    console.log('[admin-provas] carregarAreasDoBanco ->', AREA_OPTIONS);
  } catch (err) {
    console.warn('[admin-provas] falha ao carregar areas/materias:', err);
  }
}

let questoesLista = [];
window.questoesLista = questoesLista;
// Controla o gabarito selecionado no formulário de questão
let _gabaritoSelecionado = 'A';

export async function initAdminProvas() {
  const root = document.getElementById('admin-content');
  if (!root) return;

  questoesLista = [];
  renderLoading(root);

  // Carrega áreas/materias do banco para popular os selects dinamicamente
  await carregarAreasDoBanco();

  const [userRole, provasResult] = await Promise.all([getLoggedRole(), fetchProvas()]);
  const isAdmin = userRole === 'admin';
  renderProvasPage(root, userRole, isAdmin, provasResult);
}

function renderLoading(root, roleLabel = 'Administrador') {
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('provas', roleLabel)}
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

async function getLoggedRole() {
  if (!window._supabase) return null;

  try {
    const { data: { session }, error: sessionError } =
      await window._supabase.auth.getSession();
    if (sessionError || !session?.user) return null;

    const { data: perfil, error } = await window._supabase
      .from('perfis')
      .select('cargo')
      .eq('id', session.user.id)
      .single();

    if (error || !perfil?.cargo) return null;

    const rawCargo = String(perfil.cargo).trim().toLowerCase();
    if (['admin', 'administrador', 'administrator', 'adm'].includes(rawCargo.replace(/[^a-z]/g, ''))) {
      return 'admin';
    }
    if (['professor', 'prof', 'professorado'].includes(rawCargo.replace(/[^a-z]/g, ''))) {
      return 'professor';
    }
    if (['aluno', 'student'].includes(rawCargo.replace(/[^a-z]/g, ''))) {
      return 'aluno';
    }

    return rawCargo;
  } catch (err) {
    console.warn('Falha ao obter cargo do usuário:', err);
    return null;
  }
}

async function fetchProvas() {
  if (!window._supabase) {
    return { failed: true, provas: [] };
  }

  try {
    const { data, error } = await window._supabase
      .from('simulados')
      .select('id, title, area, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !Array.isArray(data)) {
      console.warn('Erro ao buscar provas:', error);
      return { failed: true, provas: [] };
    }

    return { failed: false, provas: data };
  } catch (err) {
    console.warn('Falha no fetchProvas:', err);
    return { failed: true, provas: [] };
  }
}

function renderProvasPage(root, userRole, isAdmin, provasResult) {
  const warning = provasResult.failed
    ? `<div class="warning-banner">Alguns dados não puderam ser carregados. A listagem permanece disponível.</div>`
    : '';

  const roleLabel = userRole === 'admin' ? 'Administrador' : 'Professor';
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('provas', roleLabel)}
      <section class="dashboard-main">
        <div class="dashboard-header">
          <div>
            <h1>Provas Lançadas</h1>
            <p>Aqui você gerencia os simulados existentes e adiciona novas provas com controles avançados.</p>
          </div>
          <button id="open-create-modal" class="btn-primary">+ Adicionar Nova Prova</button>
        </div>

        ${warning}

        <div class="dashboard-table">
          <div class="card-header">
            <div>
              <h2>Listagem de Provas</h2>
              <p>Visualize e ative/inative ou exclua cada prova.</p>
            </div>
          </div>
          <div class="table-container">
            <table class="responsive-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Área</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${provasResult.provas.length ? provasResult.provas.map((prova) => `
                  <tr>
                    <td>${escapeHtml(prova.title || 'Título não informado')}</td>
                    <td>${escapeHtml(prova.area || 'Indefinida')}</td>
                    <td><span class="status-pill ${getStatusClass(prova.status)}">${toStatusLabel(prova.status)}</span></td>
                    <td>${formatDate(prova.created_at)}</td>
                    <td class="action-cell">
                      <button class="action-button edit-button btn-secondary" data-id="${prova.id}" data-action="edit">Editar</button>
                      <button class="action-button btn-secondary" data-id="${prova.id}" data-action="toggle-status">${prova.status === 'inativa' ? 'Ativar' : 'Inativar'}</button>
                      <button class="action-button danger-button" data-id="${prova.id}" data-action="delete">Excluir</button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="5" class="empty-state">Nenhuma prova cadastrada no momento.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <div id="prova-modal" class="modal-backdrop hidden" aria-modal="true" role="dialog">
      <div class="modal-panel">
        <div class="modal-header">
          <div>
            <h2 id="modal-title">Criar novo simulado</h2>
            <p id="modal-subtitle">Preencha os dados do simulado, adicione questões à lista e depois salve o simulado completo.</p>
          </div>
          <button type="button" class="modal-close" aria-label="Fechar modal">×</button>
        </div>

        <div class="modal-tabs">
          <button type="button" class="modal-tab active" data-tab="manual">Criar Manualmente</button>
          <button type="button" class="modal-tab ${isAdmin ? '' : 'disabled'}" data-tab="json" ${isAdmin ? '' : 'disabled'}>Importar via JSON</button>
        </div>

        <div class="modal-body">
          <div class="tab-panel" data-panel="manual">
            <div class="modal-grid">
              <div class="modal-form-column">
                <section class="form-section">
                  <h3>Dados Gerais do Simulado</h3>
                  <div class="form-grid two-column-grid">
                    <div class="form-field">
                      <label for="manual-title">Título do Simulado</label>
                      <input id="manual-title" type="text" placeholder="Ex: Simulado ENEM 2026" required />
                    </div>
                    <div class="form-field">
                      <label for="manual-area">Área do Simulado</label>
                      <select id="manual-area" required>
                        <option value="">Selecione a área</option>
                        <option value="Exatas">Exatas</option>
                        <option value="Humanas">Humanas</option>
                        <option value="Biológicas">Biológicas</option>
                        <option value="Técnicos">Técnicos</option>
                      </select>
                    </div>
                    <div class="form-field full-width">
                      <label for="manual-materia">Matéria</label>
                      <select id="manual-materia" required>
                        <option value="">Escolha primeiro a área</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section class="form-section">
                  <h3>Adicionar Questão</h3>
                  <div class="form-field full-width">
                    <label for="manual-enunciado">Enunciado</label>
                    <textarea id="manual-enunciado" rows="4" placeholder="Digite o texto da questão" required></textarea>
                  </div>

                  <div class="form-grid alternatives-grid">
                    ${['A', 'B', 'C', 'D'].map((letter) => `
                      <div class="form-field alternative-field">
                        <label for="alt-${letter}">Alternativa ${letter}</label>
                        <input type="text" id="alt-${letter}" placeholder="Texto da alternativa ${letter}" required />
                      </div>
                    `).join('')}
                  </div>

                  <div class="form-field radio-group">
                    <span class="radio-label">Alternativa correta</span>
                    <div class="radio-row">
                      ${['A', 'B', 'C', 'D'].map((letter, index) => `
                        <label class="radio-option">
                          <input type="radio" name="correct-option" value="${letter}" ${index === 0 ? 'checked' : ''}>
                          <span>${letter}</span>
                        </label>
                      `).join('')}
                    </div>
                  </div>

                  <div class="form-field full-width">
                    <label for="manual-comentario">Comentário do Professor</label>
                    <textarea id="manual-comentario" rows="4" placeholder="Explique por que essa alternativa é correta" required></textarea>
                  </div>

                  <div class="form-actions full-width">
                    <button type="button" id="add-question-btn" class="btn-primary">➕ Adicionar questão à lista</button>
                    <span id="question-status" class="form-status">Clique aqui para incluir esta questão ao simulado. Depois, use "Salvar simulado" para finalizar.</span>
                  </div>
                </section>
              </div>

              <aside class="question-preview-panel">
                <div class="preview-header">
                  <h3>Questões Adicionadas</h3>
                  <span id="question-count">0</span>
                </div>
                <div id="question-list" class="question-list"></div>
              </aside>
            </div>
          </div>

          <div class="tab-panel hidden" data-panel="json">
            ${isAdmin ? `
              <form id="json-prova-form" class="form-grid">
                <div class="form-field full-width">
                  <label for="json-payload">JSON da Prova</label>
                  <textarea id="json-payload" rows="12" placeholder='Cole o objeto JSON completo aqui. Ex: {"title":"Simulado","area":"Exatas","materia":"Matemática","questoes":[...]} ' required></textarea>
                </div>
                <div class="form-actions full-width">
                  <button type="submit" class="btn-primary">Importar via JSON</button>
                  <span id="json-status" class="form-status"></span>
                </div>
              </form>
            ` : `
              <div class="subtext">Apenas Administradores podem importar via JSON.</div>
            `}
          </div>
        </div>

        <div class="modal-footer">
          <button id="cancel-simulado-btn" type="button" class="btn-secondary">Cancelar</button>
          <button id="save-simulado-btn" type="button" class="btn-primary">💾 Salvar simulado</button>
          <span id="save-status" class="form-status">Use este botão apenas depois de adicionar todas as questões necessárias.</span>
        </div>
      </div>
    </div>
  `;

  bindModalEvents(isAdmin);
  bindTableActions();
}

// Atualiza a renderização de loading para usar sidebar padrão
window.addEventListener('DOMContentLoaded', () => {
  // Este evento não altera o fluxo real da página, mas garante que o helper esteja carregado.
});

/* ══════════════════════════════════════════════════════════════════
   FUNÇÕES DE CONTROLE VISUAL (MODAL, ABAS E FORMULÁRIOS)
══════════════════════════════════════════════════════════════════ */

function openModal() {
  const modal = document.getElementById('prova-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeModal() {
  const modal = document.getElementById('prova-modal');
  if (!modal) return;

  // Avisa se há questões não salvas
  const temQuestoes = (window.questoesLista || typeof questoesLista !== 'undefined' && questoesLista) ? (window.questoesLista || questoesLista).length > 0 : false;
  const temTitulo = Boolean(document.getElementById('manual-title')?.value.trim());

  if (temQuestoes || temTitulo) {
    const confirmar = window.confirm(
      'Você tem questões não salvas. Deseja realmente sair?\n\nTodo o progresso será perdido.'
    );
    if (!confirmar) return;
  }

  modal.classList.add('hidden');
}

function switchTab(tabName) {
  const tabs = document.querySelectorAll('.modal-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach((tab) => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  panels.forEach((panel) => {
    if (panel.dataset.panel === tabName) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  });
}

function populateMateriaOptions(area, selectEl) {
  if (!selectEl) return;

  if (!area) {
    selectEl.innerHTML = '<option value="">Escolha primeiro a área</option>';
    return;
  }

  const materias = AREA_OPTIONS[area] || [];
  selectEl.innerHTML = `
    <option value="">Selecione a matéria</option>
    ${materias.map((materia) => `<option value="${materia}">${materia}</option>`).join('')}
  `;
}

function bindModalEvents(isAdmin) {
  const modal = document.getElementById('prova-modal');
  const openButton = document.getElementById('open-create-modal');
  const closeButton = modal.querySelector('.modal-close');
  const tabButtons = modal.querySelectorAll('.modal-tab');
  const manualArea = document.getElementById('manual-area');
  const manualMateria = document.getElementById('manual-materia');
  const addQuestionBtn = document.getElementById('add-question-btn');
  const cancelBtn = document.getElementById('cancel-simulado-btn');
  const saveBtn = document.getElementById('save-simulado-btn');
  const jsonForm = document.getElementById('json-prova-form');

  if (openButton) {
    openButton.addEventListener('click', () => {
      openModal();
      resetModalState();
      switchTab('manual');
    });
  }

  closeButton.addEventListener('click', closeModal);
  // Removido: fechar ao clicar fora
  // Professor pode perder questões não salvas
  // Use apenas o botão X ou Cancelar para fechar

  tabButtons.forEach((button) => {
    if (button.disabled) return;
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  manualArea?.addEventListener('change', () => {
    populateMateriaOptions(manualArea.value, manualMateria);
  });

  addQuestionBtn?.addEventListener('click', addQuestionToList);
  cancelBtn?.addEventListener('click', () => {
    const temQuestoes = (window.questoesLista || typeof questoesLista !== 'undefined' && questoesLista) ? (window.questoesLista || questoesLista).length > 0 : false;
    const temTitulo = Boolean(document.getElementById('manual-title')?.value.trim());

    if (temQuestoes || temTitulo) {
      const confirmar = window.confirm(
        'Você tem questões não salvas. Deseja realmente cancelar?\n\nTodo o progresso será perdido.'
      );
      if (!confirmar) return;
    }

    resetModalState();
    closeModal();
  });

  if (saveBtn) {
    const newBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);
    newBtn.addEventListener('click', () => saveCompleteSimulado());
  }

  bindGabaritoListeners();

  if (isAdmin && jsonForm) {
    jsonForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitJsonProva(jsonForm);
    });
  }
}

function addQuestionToList() {
  const statusEl = document.getElementById('question-status');
  statusEl.textContent = '';

  const enunciado = document.getElementById('manual-enunciado')?.value.trim();
  const alternativas = ['A', 'B', 'C', 'D'].map((letter) => ({
    letra: letter,
    texto: document.getElementById(`alt-${letter}`)?.value.trim(),
  }));
  const correta = _gabaritoSelecionado ||
    document.querySelector('input[name="correct-option"]:checked')?.value ||
    'A';
  const comentario = document.getElementById('manual-comentario')?.value.trim();

  console.log('[admin] Questão adicionada com gabarito:', correta);

  if (!enunciado || alternativas.some((alt) => !alt.texto) || !correta || !comentario) {
    statusEl.textContent = 'Preencha todos os campos da questão antes de adicionar.';
    statusEl.className = 'form-status form-status-error';
    return;
  }

  questoesLista.push({ enunciado, alternativas, correta, comentario });
  window.questoesLista = questoesLista;
  console.log('[lista] Total:', questoesLista.length, '| Último gabarito:', questoesLista[questoesLista.length - 1]?.correta);
  renderQuestionList();
  clearQuestionFields();

  statusEl.textContent = 'Questão adicionada à lista.';
  statusEl.className = 'form-status form-status-success';
}

function renderQuestionList() {
  const listContainer = document.getElementById('question-list');
  const countEl = document.getElementById('question-count');

  if (!listContainer || !countEl) return;

  countEl.textContent = String(questoesLista.length);

  listContainer.innerHTML = questoesLista.length
    ? questoesLista.map((questao, index) => `
        <div class="question-item">
          <strong>Q${index + 1} — ${questao.correta}</strong>
          ${escapeHtml(questao.enunciado.slice(0, 85))}${questao.enunciado.length > 85 ? '...' : ''}
          <button type="button" class="remove-question-button hidden" data-index="${index}">×</button>
        </div>
      `).join('')
    : '<div class="empty-state">Nenhuma questão adicionada ainda</div>';

  listContainer.querySelectorAll('.question-item').forEach((item, idx) => {
    item.addEventListener('click', () => {
      const removeBtn = item.querySelector('.remove-question-button');
      if (removeBtn) removeQuestion(idx);
    });
  });
}

function removeQuestion(index) {
  questoesLista.splice(index, 1);
  renderQuestionList();
}

function bindGabaritoListeners() {
  document.querySelectorAll('input[name="correct-option"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      _gabaritoSelecionado = e.target.value;
      console.log('[admin] Gabarito selecionado:', _gabaritoSelecionado);
    });
  });
}

function clearQuestionFields() {
  document.getElementById('manual-enunciado').value = '';
  ['A', 'B', 'C', 'D'].forEach((letter) => {
    document.getElementById(`alt-${letter}`).value = '';
  });
  document.getElementById('manual-comentario').value = '';
  document.querySelectorAll('input[name="correct-option"]').forEach((input, index) => {
    input.checked = index === 0;
  });
  _gabaritoSelecionado = 'A';
}

function resetModalState() {
  questoesLista = [];
  window.questoesLista = questoesLista;
  renderQuestionList();
  document.getElementById('manual-title').value = '';
  document.getElementById('manual-area').value = '';
  document.getElementById('manual-materia').innerHTML = '<option value="">Escolha primeiro a área</option>';
  clearQuestionFields();
  document.getElementById('question-status').textContent = '';
  document.getElementById('save-status').textContent = '';
  switchTab('manual');
  _gabaritoSelecionado = 'A';
}

async function saveCompleteSimulado() {
  const saveStatus = document.getElementById('save-status');
  const saveBtn = document.getElementById('save-simulado-btn');

  if (saveStatus) {
    saveStatus.textContent = '';
    saveStatus.className = 'form-status';
  }

  const title = document.getElementById('manual-title')?.value.trim();
  const area = document.getElementById('manual-area')?.value.trim();
  const materia = document.getElementById('manual-materia')?.value.trim();

  if (!title || !area || !materia) {
    if (saveStatus) {
      saveStatus.textContent = 'Preencha título, área e matéria.';
      saveStatus.className = 'form-status form-status-error';
    }
    return;
  }

  const questoesParaSalvar = [...(window.questoesLista || questoesLista || [])];

  console.log('[save] Questões para salvar:', questoesParaSalvar.length);
  console.log('[save] Gabariots:', questoesParaSalvar.map((q) => q.correta));

  if (!questoesParaSalvar.length) {
    if (saveStatus) {
      saveStatus.textContent = 'Adicione pelo menos uma questão.';
      saveStatus.className = 'form-status form-status-error';
    }
    return;
  }

  if (saveStatus) {
    saveStatus.textContent = 'Salvando simulado...';
    saveStatus.className = 'form-status form-status-loading';
  }
  if (saveBtn) saveBtn.disabled = true;

  try {
    await saveProva({
      title,
      area,
      materia,
      status: 'ativa',
      questoes: questoesParaSalvar,
    });

    console.log('[save] ✅ saveProva concluiu sem erro');

    // Feedback visual imediato
    if (saveStatus) {
      saveStatus.textContent = '✅ Simulado salvo com sucesso!';
      saveStatus.className = 'form-status form-status-success';
    }
    if (saveBtn) saveBtn.textContent = '✅ Salvo!';

    // Aguarda 1.5s para o usuário ver o feedback
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Reseta e fecha
    resetModalState();
    closeModal();

    // Atualiza a lista
    await refreshProvasList();
  } catch (err) {
    console.error('[save] Erro final:', err);
    const msg = err?.message || err?.code || JSON.stringify(err) || 'Erro desconhecido';
    alert('❌ Erro ao salvar: ' + msg);
    if (saveStatus) {
      saveStatus.textContent = '❌ Erro: ' + msg;
      saveStatus.className = 'form-status form-status-error';
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Salvar simulado';
    }
  }
}

// Expõe globalmente
window.saveCompleteSimulado = saveCompleteSimulado;

async function submitJsonProva(form) {
  const statusEl = document.getElementById('json-status');
  if (!statusEl) return;
  statusEl.textContent = '';
  statusEl.className = 'form-status';

  const rawValue = form.querySelector('#json-payload')?.value.trim();
  if (!rawValue) {
    statusEl.textContent = 'Insira um objeto JSON válido antes de importar.';
    statusEl.className = 'form-status form-status-error';
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch (err) {
    statusEl.textContent = 'JSON inválido. Verifique a sintaxe e tente novamente.';
    statusEl.className = 'form-status form-status-error';
    return;
  }

  statusEl.textContent = 'Importando prova...';
  statusEl.className = 'form-status form-status-loading';

  try {
    const area = parsed.area || 'Indefinida';
    const title = parsed.title || `Prova ${area}`;

    await saveProva({
      title,
      area,
      materia: parsed.materia || null,
      status: parsed.status || 'ativa',
      questoes: parsed.questoes || [],
    });

    statusEl.textContent = 'JSON importado com sucesso!';
    statusEl.className = 'form-status form-status-success';
    form.reset();
    await refreshProvasList();
  } catch (err) {
    console.error('Erro ao importar prova JSON:', err);
    statusEl.textContent = 'Falha ao importar o JSON. Verifique o formato e tente novamente.';
    statusEl.className = 'form-status form-status-error';
  }
}

function gerarSlug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')                    // separa letra do acento
    .replace(/[\u0300-\u036f]/g, '')     // remove os acentos separados
    .replace(/[çÇ]/g, 'c')             // ç separado
    .replace(/[^a-z0-9\s-]/g, '')       // remove tudo que não é letra/número
    .trim()
    .replace(/\s+/g, '-')               // espaços viram hífens
    .replace(/-+/g, '-');               // hífens duplos viram um
}

async function saveProva(record) {
  // Pega as credenciais do cliente Supabase
  const supabaseUrl  = window._supabase?.supabaseUrl
    || 'https://nkvobcmogwzrbanqofio.supabase.co';
  const supabaseKey  = window._supabase?.supabaseKey
    || document.querySelector('script[src*="supabase"]')?.dataset?.key
    || '';

  // Pega a chave anon do cliente
  const anonKey = window._supabase
    ?.realtime?.accessToken
    || window._supabase?.headers?.Authorization?.replace('Bearer ', '')
    || '';

  // Pega token da sessão atual
  let accessToken = '';
  try {
    const stored = Object.keys(localStorage)
      .find(k => k.includes('auth-token'));
    if (stored) {
      const parsed = JSON.parse(localStorage.getItem(stored));
      accessToken = parsed?.access_token || '';
    }
  } catch(e) {}

  if (!accessToken) {
    try {
      const { data } = await window._supabase.auth.getSession();
      accessToken = data?.session?.access_token || '';
    } catch(e) {}
  }

  const titleSlug = gerarSlug(record.title || 'simulado')
    + '-' + Date.now();

  const payload = {
    title:      record.title,
    area:       record.area,
    materia:    record.materia  || null,
    status:     record.status   || 'ativa',
    questoes:   record.questoes || [],
    slug:       titleSlug,
    created_at: new Date().toISOString(),
  };

  console.log('[saveProva] Enviando via fetch direto:', {
    title:    payload.title,
    questoes: payload.questoes.length
  });

  const SUPABASE_URL = 'https://nkvobcmogwzrbanqofio.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rdm9iY21vZ3d6cmJhbnFvZmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzAxNjgsImV4cCI6MjA5NDkwNjE2OH0.qzD0utvl6Gmewzz2a0CLD_9OpOSN2SVaqw08EaK6YoU';

  const headers = {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    'Prefer':        'return=minimal'
  };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/simulados`,
    {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify(payload)
    }
  );

  console.log('[saveProva] Status HTTP:', response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.error('[saveProva] Erro HTTP:', response.status, errText);
    throw new Error(`Erro ${response.status}: ${errText}`);
  }

  console.log('[saveProva] ✅ Inserido com sucesso via fetch!');
  return true;
}

window.saveProva = saveProva;

function bindTableActions() {
  const tbody = document.querySelector('.responsive-table tbody');
  if (!tbody) return;

  // Remove listener anterior clonando o elemento
  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);

  // Delegação: um listener captura todos os botões presentes e futuros
  newTbody.addEventListener('click', async (e) => {
    const button = e.target.closest('.action-button');
    if (!button) return;

    const id     = button.dataset.id;
    const action = button.dataset.action;
    if (!id) return;

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = '...';

    try {
      if (action === 'delete') {
        await handleDeleteProva(id);
      } else if (action === 'toggle-status') {
        await handleToggleStatus(id, button);
      } else if (action === 'edit') {
        await handleEditProva(id);
        button.disabled = false;
        button.textContent = originalText;
      }
    } catch (err) {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

async function handleDeleteProva(id) {
  const confirmDelete = window.confirm(
    'Deseja realmente excluir esta prova? Esta ação é irreversível. Isso também removerá todo o histórico de tentativas dos alunos nesta prova.'
  );
  if (!confirmDelete) return;

  try {
    const { data: prova, error: provaError } = await window._supabase
      .from('simulados')
      .select('id, title, slug')
      .eq('id', id)
      .single();

    if (provaError) throw provaError;
    if (!prova) throw new Error('Prova não encontrada para exclusão.');

    await window._supabase.from('tentativas').delete().eq('simulado_id', prova.id);
    if (prova.slug) await window._supabase.from('tentativas').delete().eq('simulado_id', prova.slug);
    if (prova.title) await window._supabase.from('tentativas').delete().eq('simulado_id', prova.title);

    const { error } = await window._supabase.from('simulados').delete().eq('id', id);
    if (error) throw error;
    await refreshProvasList();
  } catch (err) {
    console.error('Erro ao excluir prova:', err);
    window.alert('Não foi possível excluir a prova. Tente novamente.');
  }
}

async function handleToggleStatus(id, buttonEl) {
  try {
    const { data, error } = await window._supabase
      .from('simulados')
      .select('status')
      .eq('id', id)
      .single();

    if (error || !data) throw error || new Error('Registro não encontrado');

    const nextStatus = data.status === 'inativa' ? 'ativa' : 'inativa';

    const { error: updateError } = await window._supabase
      .from('simulados')
      .update({ status: nextStatus })
      .eq('id', id);

    if (updateError) throw updateError;

    if (buttonEl) {
      buttonEl.textContent = nextStatus === 'ativa' ? 'Inativar' : 'Ativar';
    }

    await refreshProvasList();
  } catch (err) {
    console.error('Erro ao alterar status:', err);
    window.alert('Não foi possível atualizar o status. Tente novamente.');
  }
}

async function handleEditProva(id) {
  try {
    const { data: prova, error } = await window._supabase
      .from('simulados')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !prova) throw error || new Error('Prova não encontrada');

    abrirModalEdicao(prova);
  } catch (err) {
    console.error('Erro ao carregar prova para edição:', err);
    window.alert('Não foi possível carregar os dados da prova.');
  }
}

function abrirModalEdicao(prova) {
  const existente = document.getElementById('modal-edicao');
  if (existente) existente.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-edicao';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.8);
    display:flex;align-items:center;justify-content:center;
    z-index:9999;padding:16px;
  `;

  const letras = ['A', 'B', 'C', 'D'];

  const questoesHtml = (prova.questoes || []).map((q, i) => {
    const alts = Array.isArray(q.alternativas)
      ? q.alternativas.map(a => typeof a === 'object' ? a.texto : a)
      : [];
    const gabLetra = typeof q.gabarito === 'number'
      ? (letras[q.gabarito] || 'A')
      : (q.correta || q.gabarito || 'A');

    return `
      <div class="edit-questao-card" style="
        background:#1a1a1a;border:1px solid #333;border-radius:8px;
        padding:16px;margin-bottom:12px;
      ">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="color:#f5a623;font-weight:700;font-size:0.8rem">
            QUESTÃO ${i + 1}
          </span>
          <button onclick="removerQuestaoEdit(${i})"
            style="background:none;border:1px solid #ef4444;color:#ef4444;
                   padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.75rem">
            Remover
          </button>
        </div>
        <textarea data-q="${i}" data-field="enunciado"
          style="width:100%;background:#111;border:1px solid #333;color:#f0f0f0;
                 border-radius:6px;padding:8px;font-size:0.85rem;resize:vertical;
                 min-height:60px;box-sizing:border-box;margin-bottom:8px"
          >${escapeHtml(q.enunciado || '')}</textarea>
        ${alts.map((texto, ai) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="color:#888;font-size:0.8rem;width:20px">${letras[ai]}</span>
            <input type="text" data-q="${i}" data-field="alt${ai}"
              value="${escapeHtml(texto)}"
              style="flex:1;background:#111;border:1px solid #333;color:#f0f0f0;
                     border-radius:6px;padding:6px 10px;font-size:0.85rem" />
          </div>
        `).join('')}
        <div style="margin-top:8px">
          <span style="color:#888;font-size:0.8rem">Resposta correta: </span>
          <select data-q="${i}" data-field="gabarito"
            style="background:#111;border:1px solid #333;color:#f0f0f0;
                   border-radius:6px;padding:4px 8px;font-size:0.85rem">
            ${letras.map(l => `
              <option value="${l}" ${gabLetra === l ? 'selected' : ''}>${l}</option>
            `).join('')}
          </select>
        </div>
        <div style="margin-top:8px">
          <span style="color:#888;font-size:0.8rem">Comentário: </span>
          <textarea data-q="${i}" data-field="comentario"
            style="width:100%;background:#111;border:1px solid #333;color:#f0f0f0;
                   border-radius:6px;padding:8px;font-size:0.85rem;resize:vertical;
                   min-height:40px;box-sizing:border-box;margin-top:4px"
            >${escapeHtml(q.comentario || q.explicacao || '')}</textarea>
        </div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div style="
      background:#1a1a1a;border:1px solid #333;border-radius:14px;
      width:100%;max-width:700px;max-height:90vh;overflow-y:auto;
      display:flex;flex-direction:column;
    ">
      <div style="
        padding:20px 24px;border-bottom:1px solid #2a2a2a;
        display:flex;justify-content:space-between;align-items:center;
        position:sticky;top:0;background:#1a1a1a;z-index:10;
      ">
        <div>
          <h2 style="margin:0;font-size:1.1rem;color:#f0f0f0">Editar Prova</h2>
          <p style="margin:4px 0 0;font-size:0.8rem;color:#888">${escapeHtml(prova.title)}</p>
        </div>
        <button data-action="fechar"
          style="background:none;border:1px solid #444;color:#aaa;width:32px;height:32px;
                 border-radius:6px;cursor:pointer;font-size:1.2rem">×</button>
      </div>

      <div style="padding:24px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px">
          <div>
            <label style="font-size:0.8rem;color:#888;font-weight:600;
                          text-transform:uppercase;display:block;margin-bottom:6px">
              Título
            </label>
            <input id="edit-title" type="text" value="${escapeHtml(prova.title)}"
              style="width:100%;background:#111;border:1px solid #333;color:#f0f0f0;
                     border-radius:6px;padding:8px 12px;font-size:0.875rem;box-sizing:border-box"/>
          </div>
          <div>
            <label style="font-size:0.8rem;color:#888;font-weight:600;
                          text-transform:uppercase;display:block;margin-bottom:6px">
              Status
            </label>
            <select id="edit-status"
              style="width:100%;background:#111;border:1px solid #333;color:#f0f0f0;
                     border-radius:6px;padding:8px 12px;font-size:0.875rem;box-sizing:border-box">
              <option value="ativa"   ${prova.status === 'ativa'   ? 'selected' : ''}>Ativa</option>
              <option value="inativa" ${prova.status === 'inativa' ? 'selected' : ''}>Inativa</option>
            </select>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:0.875rem;font-weight:700;color:#f0f0f0;
                     text-transform:uppercase;margin:0;">
            Questões <span id="edit-question-count">${(prova.questoes || []).length}</span>
          </h3>
          <button id="add-new-question-btn" type="button" style="
            padding:10px 16px;background:#1f2937;color:#f0f0f0;border:1px solid #333;
            border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:700;
          ">+ Adicionar Questão</button>
        </div>

        <div id="edit-questoes-container"
             data-prova-id="${prova.id}"
             data-questoes='${escapeHtml(JSON.stringify(prova.questoes || []))}'>
          ${questoesHtml}
        </div>
      </div>

      <div style="
        padding:16px 24px;border-top:1px solid #2a2a2a;
        display:flex;gap:12px;justify-content:flex-end;
        position:sticky;bottom:0;background:#1a1a1a;
      ">
        <span id="edit-status-msg" style="flex:1;font-size:0.8rem;color:#888;
              align-self:center"></span>
        <button data-action="fechar"
          style="padding:10px 20px;background:transparent;border:1px solid #444;
                 color:#f0f0f0;border-radius:6px;cursor:pointer;font-size:0.875rem">
          Cancelar
        </button>
        <button id="btn-salvar-edicao"
          style="padding:10px 20px;background:#f5a623;border:none;color:#000;
                 font-weight:700;border-radius:6px;cursor:pointer;font-size:0.875rem">
          💾 Salvar Alterações
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const btnSalvarEdicao = document.getElementById('btn-salvar-edicao');
  if (btnSalvarEdicao) {
    btnSalvarEdicao.addEventListener('click', () => {
      salvarEdicaoProva(prova.id);
    });
  }

  modal.querySelectorAll('button[data-action="fechar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-edicao')?.remove();
    });
  });

  document.getElementById('add-new-question-btn')?.addEventListener('click', () => {
    adicionarQuestaoEdit();
  });

  renderEditQuestoes();

  // Removido: fechar ao clicar fora
  // Use apenas o botão X ou Cancelar para fechar a edição
}

window.removerQuestaoEdit = function(index) {
  const container = document.getElementById('edit-questoes-container');
  if (!container) return;
  let questoes = JSON.parse(container.dataset.questoes || '[]');
  questoes.splice(index, 1);
  container.dataset.questoes = JSON.stringify(questoes);
  renderEditQuestoes();
};

function adicionarQuestaoEdit() {
  const container = document.getElementById('edit-questoes-container');
  if (!container) return;

  const questoes = JSON.parse(container.dataset.questoes || '[]');
  questoes.push({
    enunciado: '',
    alternativas: [
      { letra: 'A', texto: '' },
      { letra: 'B', texto: '' },
      { letra: 'C', texto: '' },
      { letra: 'D', texto: '' }
    ],
    correta: 'A',
    comentario: ''
  });
  container.dataset.questoes = JSON.stringify(questoes);
  renderEditQuestoes();
}

function renderEditQuestoes() {
  const container = document.getElementById('edit-questoes-container');
  const countEl = document.getElementById('edit-question-count');
  if (!container || !countEl) return;

  const questoes = JSON.parse(container.dataset.questoes || '[]');
  const letras = ['A', 'B', 'C', 'D'];

  countEl.textContent = String(questoes.length);

  container.innerHTML = questoes.map((q, i) => {
    const alts = Array.isArray(q.alternativas)
      ? q.alternativas.map(a => typeof a === 'object' ? a.texto : a)
      : [];
    const gabLetra = typeof q.gabarito === 'number'
      ? (letras[q.gabarito] || 'A')
      : (q.correta || q.gabarito || 'A');

    return `
      <div class="edit-questao-card" style="
        background:#1a1a1a;border:1px solid #333;border-radius:8px;
        padding:16px;margin-bottom:12px;
      ">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="color:#f5a623;font-weight:700;font-size:0.8rem">
            QUESTÃO ${i + 1}
          </span>
          <button type="button" onclick="removerQuestaoEdit(${i})"
            style="background:none;border:1px solid #ef4444;color:#ef4444;
                   padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.75rem">
            Remover
          </button>
        </div>
        <textarea data-q="${i}" data-field="enunciado"
          style="width:100%;background:#111;border:1px solid #333;color:#f0f0f0;
                 border-radius:6px;padding:8px;font-size:0.85rem;resize:vertical;
                 min-height:60px;box-sizing:border-box;margin-bottom:8px"
          >${escapeHtml(q.enunciado || '')}</textarea>
        ${letras.map((texto, ai) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="color:#888;font-size:0.8rem;width:20px">${letras[ai]}</span>
            <input type="text" data-q="${i}" data-field="alt${ai}"
              value="${escapeHtml(alts[ai] || '')}"
              style="flex:1;background:#111;border:1px solid #333;color:#f0f0f0;
                     border-radius:6px;padding:6px 10px;font-size:0.85rem" />
          </div>
        `).join('')}
        <div style="margin-top:8px">
          <span style="color:#888;font-size:0.8rem">Resposta correta: </span>
          <select data-q="${i}" data-field="gabarito"
            style="background:#111;border:1px solid #333;color:#f0f0f0;
                   border-radius:6px;padding:4px 8px;font-size:0.85rem">
            ${letras.map(l => `
              <option value="${l}" ${gabLetra === l ? 'selected' : ''}>${l}</option>
            `).join('')}
          </select>
        </div>
        <div style="margin-top:8px">
          <span style="color:#888;font-size:0.8rem">Comentário: </span>
          <textarea data-q="${i}" data-field="comentario"
            style="width:100%;background:#111;border:1px solid #333;color:#f0f0f0;
                   border-radius:6px;padding:8px;font-size:0.85rem;resize:vertical;
                   min-height:40px;box-sizing:border-box;margin-top:4px"
            >${escapeHtml(q.comentario || q.explicacao || '')}</textarea>
        </div>
      </div>
    `;
  }).join('');
}

async function salvarEdicaoProva(id) {
  const statusMsg = document.getElementById('edit-status-msg');
  if (statusMsg) {
    statusMsg.textContent = 'Salvando...';
    statusMsg.style.color = '#f5a623';
  }

  try {
    const container  = document.getElementById('edit-questoes-container');
    const novoTitulo = document.getElementById('edit-title')?.value.trim();
    const novoStatus = document.getElementById('edit-status')?.value;
    let   questoes   = JSON.parse(container?.dataset.questoes || '[]');

    const letras = ['A', 'B', 'C', 'D'];
    questoes = questoes.map((q, i) => {
      const enunciado  = container.querySelector(`textarea[data-q="${i}"][data-field="enunciado"]`)?.value.trim() || q.enunciado;
      const gabLetra   = container.querySelector(`select[data-q="${i}"][data-field="gabarito"]`)?.value || 'A';
      const comentario = container.querySelector(`textarea[data-q="${i}"][data-field="comentario"]`)?.value.trim() || '';

      const alternativas = letras.map((l, ai) => ({
        letra: l,
        texto: container.querySelector(`input[data-q="${i}"][data-field="alt${ai}"]`)?.value.trim() || ''
      }));

      return {
        ...q,
        enunciado,
        alternativas,
        correta:    gabLetra,
        comentario,
        explicacao: comentario
      };
    });

    const questoesInvalidas = questoes.some((q) =>
      !q.enunciado ||
      !q.comentario ||
      !Array.isArray(q.alternativas) ||
      q.alternativas.length !== 4 ||
      q.alternativas.some((alt) => !alt.texto)
    );

    if (questoesInvalidas) {
      throw new Error('Preencha todos os campos de cada questão antes de salvar.');
    }

    const novoSlug = gerarSlug(novoTitulo || '');

    const { error } = await window._supabase
      .from('simulados')
      .update({
        title:   novoTitulo,
        status:  novoStatus,
        slug:    novoSlug,
        questoes: questoes
      })
      .eq('id', id);

    if (error) throw error;

    if (statusMsg) {
      statusMsg.textContent = '✅ Salvo com sucesso!';
      statusMsg.style.color = '#22c55e';
    }

    setTimeout(async () => {
      document.getElementById('modal-edicao')?.remove();
      await refreshProvasList();
    }, 1000);
  } catch (err) {
    console.error('Erro ao salvar edição:', err);
    if (statusMsg) {
      statusMsg.textContent = '❌ Erro ao salvar. Tente novamente.';
      statusMsg.style.color = '#ef4444';
    }
  }
}

async function refreshProvasList() {
  const root = document.getElementById('admin-content');
  if (!root) return;
  const role = await getLoggedRole();
  const isAdmin = role === 'admin';
  const provasResult = await fetchProvas();
  renderProvasPage(root, role, isAdmin, provasResult);
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (err) {
    return '-';
  }
}

function toStatusLabel(status) {
  if (status === 'inativa') return 'Inativa';
  if (status === 'ativa') return 'Ativa';
  return 'Desconhecido';
}

function getStatusClass(status) {
  if (status === 'ativa') return 'status-active';
  if (status === 'inativa') return 'status-inactive';
  return 'status-unknown';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}