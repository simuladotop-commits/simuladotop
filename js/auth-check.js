/**
 * auth-check.js
 * Centraliza a renderização do cabeçalho de autenticação e sincroniza com o Supabase.
 * Garante que o header mostre apenas um estado válido de autenticação.
 */

(function () {
  const headerElement = document.querySelector('header');
  let authSubscription = null;
  let documentListenerAttached = false;

  function getAuthContainer() {
    const node = document.getElementById('auth-container');
    if (!node) {
      console.warn('Elemento de autenticação (#auth-container) não encontrado.');
    }
    return node;
  }

  window.__AUTH_STATE = {
    session: null,
    user: null,
    role: null,
    isReady: false,
  };

  window.updateHeaderAuth = renderAuth;
  window.checkGlobalSession = initializeAuth;
  window.reloadAuthHeader = () => {
    if (window.__AUTH_STATE.isReady) {
      renderAuth(window.__AUTH_STATE.user);
    } else {
      initializeAuth().catch(console.error);
    }
  };
  window.initHeader = window.reloadAuthHeader;

  initializeAuth().catch((err) => {
    console.error('Erro crítico na autenticação:', err);
    finalizeHeaderLoading();
  });

  async function initializeAuth() {
    if (typeof _supabase === 'undefined') {
      console.warn('Supabase não inicializado. Tentando novamente...');
      await waitForSupabase();
    }

    setHeaderLoading(true);

    try {
      const {
        data: { session },
        error,
      } = await _supabase.auth.getSession();

      if (error) throw error;

      const perfil = session?.user ? await fetchUserStatus(session.user.id) : null;
      if (perfil?.bloqueado) {
        await _supabase.auth.signOut();
        window.location.href = 'login.html?bloqueado=1';
        return;
      }

      const role = perfil?.role ? normalizeRole(perfil.role) : null;
      updateAuthState(session, role);
      await waitForDomReady();
      renderAuth(window.__AUTH_STATE.user);
      subscribeAuthChanges();
    } catch (err) {
      console.error('Erro ao verificar sessão:', err);
      updateAuthState(null);
      await waitForDomReady();
      renderAuth(null);
    } finally {
      window.__AUTH_STATE.isReady = true;
      finalizeHeaderLoading();
    }
  }

  function normalizeRole(role) {
    const raw = String(role || '').trim().toLowerCase();
    if (!raw) return '';
    const normalized = raw.replace(/[^a-z]/g, '');
    if (['admin', 'administrador', 'administrator', 'adm'].includes(normalized)) return 'admin';
    if (['professor', 'prof', 'professorado'].includes(normalized)) return 'professor';
    if (['aluno', 'student'].includes(normalized)) return 'aluno';
    return raw;
  }

  function updateAuthState(session, role = null) {
    window.__AUTH_STATE.session = session || null;
    window.__AUTH_STATE.user = session?.user ?? null;
    window.__AUTH_STATE.role = role ?? null;
  }

  async function waitForDomReady() {
    if (document.readyState === 'loading') {
      await new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }
  }

  function renderAuth(user) {
    const authContainer = getAuthContainer();
    if (!authContainer) return;

    authContainer.innerHTML = '';
    authContainer.className = 'auth-actions';

    if (user) {
      const wrapper = document.createElement('div');
      wrapper.className = 'user-menu';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-login auth-toggle';
      button.setAttribute('aria-expanded', 'false');

      const avatar = document.createElement('span');
      avatar.className = 'avatar';

      const avatarUrl = user?.user_metadata?.avatar_url
        || user?.user_metadata?.picture
        || null;

      const fallbackInitial = getDisplayName(user).charAt(0).toUpperCase();
      if (avatarUrl) {
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = 'Foto de perfil';
        img.style.cssText = `
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        `;
        img.onerror = () => {
          img.remove();
          avatar.textContent = fallbackInitial;
        };
        avatar.appendChild(img);
      } else {
        avatar.textContent = fallbackInitial;
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'user-name';
      nameSpan.textContent = getDisplayName(user);

      button.append(avatar, nameSpan);

      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown-menu';
      dropdown.setAttribute('role', 'menu');

      const role = window.__AUTH_STATE?.role || null;
      if (!role) {
        setTimeout(() => {
          const container = getAuthContainer();
          if (container && window.__AUTH_STATE?.role) renderAuth(user);
        }, 1000);
      }
      console.log("[auth-check] role no dropdown:", role);
      const extraLinks = [];
      if (role === 'admin') {
        extraLinks.push('<a href="admin.html" class="dropdown-item" role="menuitem"><span>🛠️</span><span>Painel Admin</span></a>');
      } else if (role === 'professor') {
        extraLinks.push('<a href="professor.html" class="dropdown-item" role="menuitem"><span>📚</span><span>Painel Professor</span></a>');
      }

      dropdown.innerHTML = `${extraLinks.join('')}${extraLinks.length ? '<div class="dropdown-divider"></div>' : ''}<a href="perfil.html" class="dropdown-item" role="menuitem"><span>👤</span><span>Meu Perfil</span></a><div class="dropdown-divider"></div><button type="button" id="logout-btn" class="dropdown-item logout-button" role="menuitem"><span>🚪</span><span>Sair</span></button>`;

      wrapper.append(button, dropdown);
      authContainer.appendChild(wrapper);

      button.addEventListener('click', (event) => {
        event.preventDefault();
        const isActive = wrapper.classList.toggle('menu-active');
        button.setAttribute('aria-expanded', String(isActive));
      });

      const logoutBtn = wrapper.querySelector('#logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async (event) => {
          event.preventDefault();
          await handleLogout();
        });
      }

      attachOutsideClickListener();
    } else {
      const loginLink = document.createElement('a');
      loginLink.href = 'login.html';
      loginLink.className = 'btn-login';
      loginLink.innerHTML = '<span class="avatar">👤</span><span>Entrar / Criar Perfil</span>';

      authContainer.appendChild(loginLink);
    }
  }

  function attachOutsideClickListener() {
    if (documentListenerAttached) return;

    document.addEventListener('click', (event) => {
      const authContainer = getAuthContainer();
      if (!authContainer) return;
      const openMenu = authContainer.querySelector('.user-menu.menu-active');
      if (openMenu && !openMenu.contains(event.target)) {
        openMenu.classList.remove('menu-active');
        const toggle = openMenu.querySelector('.auth-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const authContainer = getAuthContainer();
      if (!authContainer) return;
      const openMenu = authContainer.querySelector('.user-menu.menu-active');
      if (openMenu) {
        openMenu.classList.remove('menu-active');
        const toggle = openMenu.querySelector('.auth-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }
    });

    documentListenerAttached = true;
  }

  function getDisplayName(user) {
    return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Perfil';
  }

  async function fetchUserStatus(userId) {
    if (typeof _supabase === 'undefined' || !userId) return null;

    try {
      const { data: perfil, error } = await _supabase
        .from('perfis')
        .select('cargo, bloqueado')
        .eq('id', userId)
        .single();

      if (error || !perfil) {
        return null;
      }

      return {
        role: perfil.cargo ? String(perfil.cargo).trim().toLowerCase() : null,
        bloqueado: perfil.bloqueado === true,
      };
    } catch (err) {
      console.warn('Não foi possível obter o perfil do usuário:', err);
      return null;
    }
  }

  async function fetchUserRole(userId) {
    const perfil = await fetchUserStatus(userId);
    return perfil?.role ?? null;
  }

  async function handleLogout() {
    try {
      const { error } = await _supabase.auth.signOut();
      if (error) throw error;
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
      alert('Erro ao sair. Tente novamente.');
    }
  }

  function subscribeAuthChanges() {
    if (authSubscription || !_supabase?.auth?.onAuthStateChange) return;

    const { data } = _supabase.auth.onAuthStateChange(async (event, session) => {
      if (!['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
        return;
      }

      const perfil = session?.user ? await fetchUserStatus(session.user.id) : null;
      if (perfil?.bloqueado) {
        if (session) await _supabase.auth.signOut();
        updateAuthState(null);
        renderAuth(null);
        return;
      }

      const role = perfil?.role ?? null;
      updateAuthState(session, role);
      renderAuth(window.__AUTH_STATE.user);
    });

    authSubscription = data?.subscription ?? null;
  }

  function setHeaderLoading(isLoading) {
    if (!headerElement) return;
    headerElement.style.opacity = isLoading ? '0' : '1';
    headerElement.style.pointerEvents = isLoading ? 'none' : 'auto';
  }

  function finalizeHeaderLoading() {
    if (!headerElement) return;
    headerElement.classList.add('header-ready');
    headerElement.style.opacity = '1';
    headerElement.style.pointerEvents = 'auto';
  }

  async function waitForSupabase(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i += 1) {
      if (typeof _supabase !== 'undefined') {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Supabase não foi inicializado após 3 segundos');
  }
})();


