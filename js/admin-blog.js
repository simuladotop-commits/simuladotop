import { adminSidebarHtml } from './admin-sidebar.js';

export async function initAdminBlog() {
  const root = document.getElementById('admin-content');
  if (!root) return;

  renderLoading(root);

  try {
    await listarPosts(root);
  } catch (err) {
    console.error('Erro ao carregar posts do blog:', err);
    renderErrorPage(root);
  }
}

function renderLoading(root) {
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('blog', 'Administrador')}
      <section class="dashboard-main">
        <div class="skeleton-card medium"></div>
        <div class="skeleton-grid three-cols">
          <div class="skeleton-card medium"></div>
          <div class="skeleton-card medium"></div>
          <div class="skeleton-card medium"></div>
        </div>
      </section>
    </div>
  `;
}

async function fetchPosts() {
  if (!window._supabase) {
    throw new Error('Supabase não inicializado');
  }

  const { data, error } = await window._supabase
    .from('posts')
    .select('*')
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function listarPosts(root) {
  const posts = await fetchPosts();
  renderBlogPage(root, posts);
}

function renderBlogPage(root, posts) {
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('blog', 'Administrador')}
      <section class="dashboard-main">
        <div class="dashboard-header">
          <div>
            <h1>Gerenciar Blog</h1>
            <p>Crie e edite posts, publique conteúdos e mantenha o blog sempre atualizado.</p>
          </div>
          <button id="btn-novo-post" class="btn-top-primary">+ Novo Post</button>
        </div>

        <div class="dashboard-table">
          <div class="card-header">
            <div>
              <h2>Lista de Posts</h2>
              <p>Todos os posts cadastrados no blog, ordenados do mais recente ao mais antigo.</p>
            </div>
          </div>
          <div class="table-container">
            <table class="responsive-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Categoria</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="posts-table-body">
                ${posts.length === 0 ? '<tr><td colspan="5" class="empty-state">Nenhum post encontrado.</td></tr>' : posts.map((post) => `
                  <tr>
                    <td>${escapeHtml(post.titulo || 'Sem título')}</td>
                    <td>${escapeHtml(post.categoria || 'Geral')}</td>
                    <td>${escapeHtml(post.status || 'rascunho')}</td>
                    <td>${formatDate(post.criado_em)}</td>
                    <td class="action-cell">
                      <button class="action-button edit-button" data-action="editar-post" data-id="${post.id}">✏️ Editar</button>
                      <button class="action-button ${post.status === 'publicado' ? 'warning-button' : 'success-button'}" data-action="toggle-status" data-id="${post.id}" data-status="${post.status === 'publicado' ? 'inativo' : 'publicado'}">
                        ${post.status === 'publicado' ? 'Inativar' : 'Publicar'}
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  `;

  document.getElementById('btn-novo-post')?.addEventListener('click', () => abrirModalPost(null, root));
  attachTableEvents(root);
}

function attachTableEvents(root) {
  const tbody = root.querySelector('#posts-table-body');
  if (!tbody) return;

  tbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (!id) return;

    if (action === 'editar-post') {
      abrirModalPost(id, root);
    }

    if (action === 'toggle-status') {
      const novoStatus = button.dataset.status;
      if (novoStatus) {
        await alterarStatus(id, novoStatus, root);
      }
    }
  });
}

async function abrirModalPost(id = null, root) {
  document.getElementById('modal-post')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-post';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;`;
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:18px;max-width:760px;width:100%;max-height:90vh;overflow:auto;padding:28px;color:#e2e8f0;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px;">
        <div>
          <h2 style="margin:0;font-size:1.6rem;">${id ? 'Editar Post' : 'Novo Post'}</h2>
          <p style="margin:6px 0 0;color:#94a3b8;">Preencha os campos e salve para atualizar o blog.</p>
        </div>
        <button id="btn-fechar-modal-post" style="background:none;border:1px solid #334155;color:#cbd5e1;border-radius:12px;width:40px;height:40px;cursor:pointer;font-size:1.3rem;">×</button>
      </div>
      <form id="post-form" style="display:grid;gap:16px;">
        <div style="display:grid;gap:10px;"><label style="font-weight:700;">Título *</label><input id="post-title" name="titulo" type="text" required style="width:100%;padding:12px;border:1px solid #2a2a2a;border-radius:12px;background:#121212;color:#f8fafc;" /></div>
        <div style="display:grid;gap:10px;"><label style="font-weight:700;">Slug</label><input id="post-slug" name="slug" type="text" readonly style="width:100%;padding:12px;border:1px solid #2a2a2a;border-radius:12px;background:#0f172a;color:#cbd5e1;" /></div>
        <div style="display:grid;gap:10px;"><label style="font-weight:700;">Categoria</label><select id="post-category" name="categoria" style="width:100%;padding:12px;border:1px solid #2a2a2a;border-radius:12px;background:#121212;color:#f8fafc;">
            <option value="Dicas de Estudo">Dicas de Estudo</option>
            <option value="ENEM">ENEM</option>
            <option value="ETEC">ETEC</option>
            <option value="Concursos">Concursos</option>
            <option value="Geral">Geral</option>
          </select></div>
        <div style="display:grid;gap:10px;"><label style="font-weight:700;">Resumo</label><textarea id="post-summary" name="resumo" maxlength="500" rows="4" style="width:100%;padding:12px;border:1px solid #2a2a2a;border-radius:12px;background:#121212;color:#f8fafc;"></textarea></div>
        <div style="display:grid;gap:10px;"><label style="font-weight:700;">Conteúdo</label><textarea id="post-content-input" name="conteudo" rows="8" style="width:100%;padding:12px;border:1px solid #2a2a2a;border-radius:12px;background:#121212;color:#f8fafc;"></textarea></div>
        <div style="display:grid;gap:10px;"><label style="font-weight:700;">Status</label><select id="post-status" name="status" style="width:100%;padding:12px;border:1px solid #2a2a2a;border-radius:12px;background:#121212;color:#f8fafc;">
            <option value="rascunho">rascunho</option>
            <option value="publicado">publicado</option>
            <option value="inativo">inativo</option>
          </select></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px;">
          <button type="button" id="btn-cancel-modal-post" style="background:transparent;border:1px solid #334155;color:#cbd5e1;border-radius:12px;padding:12px 18px;cursor:pointer;">Cancelar</button>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            ${id ? `<button type="button" id="btn-delete-post" style="background:#dc2626;border:none;color:#fff;border-radius:12px;padding:12px 18px;cursor:pointer;">Excluir</button>` : ''}
            <button type="submit" style="background:var(--accent);border:none;color:#111;border-radius:12px;padding:12px 18px;cursor:pointer;">Salvar Post</button>
          </div>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const titleInput = overlay.querySelector('#post-title');
  const slugInput = overlay.querySelector('#post-slug');
  const categorySelect = overlay.querySelector('#post-category');
  const summaryInput = overlay.querySelector('#post-summary');
  const contentInput = overlay.querySelector('#post-content-input');
  const statusSelect = overlay.querySelector('#post-status');
  const form = overlay.querySelector('#post-form');

  const closeModal = () => overlay.remove();

  overlay.querySelector('#btn-fechar-modal-post')?.addEventListener('click', closeModal);
  overlay.querySelector('#btn-cancel-modal-post')?.addEventListener('click', closeModal);

  titleInput.addEventListener('input', () => {
    const slug = titleInput.value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase();
    slugInput.value = slug.replace(/(^-|-$)/g, '');
  });

  if (id) {
    const post = await loadPostById(id);
    if (post) {
      titleInput.value = post.titulo || '';
      categorySelect.value = post.categoria || 'Geral';
      summaryInput.value = post.resumo || '';
      contentInput.value = post.conteudo || '';
      statusSelect.value = post.status || 'rascunho';
      slugInput.value = post.slug || titleInput.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/(^-|-$)/g, '');
    }

    overlay.querySelector('#btn-delete-post')?.addEventListener('click', async () => {
      await deletarPost(id, root);
      closeModal();
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const dados = {
      titulo: titleInput.value.trim(),
      slug: slugInput.value.trim(),
      categoria: categorySelect.value,
      resumo: summaryInput.value.trim(),
      conteudo: contentInput.value.trim(),
      status: statusSelect.value
    };

    if (!dados.titulo) {
      alert('O título é obrigatório.');
      return;
    }

    try {
      await salvarPost(id, dados);
      closeModal();
      await listarPosts(root);
    } catch (err) {
      console.error('Erro ao salvar post:', err);
      alert('Não foi possível salvar o post. Tente novamente.');
    }
  });
}

async function loadPostById(id) {
  if (!window._supabase) {
    throw new Error('Supabase não inicializado');
  }

  const { data, error } = await window._supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Erro ao carregar post por ID:', error);
    return null;
  }

  return data;
}

async function salvarPost(id, dados) {
  if (!window._supabase) {
    throw new Error('Supabase não inicializado');
  }

  const slug = dados.titulo.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/(^-|-$)/g, '');

  const payload = {
    ...dados,
    slug,
    atualizado_em: new Date().toISOString()
  };

  if (id) {
    const { error } = await window._supabase
      .from('posts')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
    return;
  }

  const { error } = await window._supabase
    .from('posts')
    .insert([{ ...payload, criado_em: new Date().toISOString() }]);

  if (error) throw error;
}

async function alterarStatus(id, novoStatus, root) {
  if (!window._supabase) {
    throw new Error('Supabase não inicializado');
  }

  const { error } = await window._supabase
    .from('posts')
    .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Erro ao alterar status do post:', error);
    alert('Não foi possível alterar o status do post.');
    return;
  }

  await listarPosts(root);
}

async function deletarPost(id, root) {
  if (!window.confirm('Deseja excluir este post permanentemente?')) {
    return;
  }

  if (!window._supabase) {
    throw new Error('Supabase não inicializado');
  }

  const { error } = await window._supabase
    .from('posts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir post:', error);
    alert('Não foi possível excluir o post.');
    return;
  }

  await listarPosts(root);
}

function renderErrorPage(root) {
  root.innerHTML = `
    <div class="dashboard-shell">
      ${adminSidebarHtml('blog', 'Administrador')}
      <section class="dashboard-main">
        <div class="empty-state">
          <h2>⚠️ Erro ao carregar posts</h2>
          <p>Não foi possível carregar a lista de posts do blog. Verifique sua conexão e tente novamente.</p>
          <a href="admin.html" class="btn-secondary">Voltar ao Dashboard</a>
        </div>
      </section>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
