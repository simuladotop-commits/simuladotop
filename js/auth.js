// Configurações do Supabase
const SUPABASE_URL = 'https://nkvobcmogwzrbanqofio.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rdm9iY21vZ3d6cmJhbnFvZmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzAxNjgsImV4cCI6MjA5NDkwNjE2OH0.qzD0utvl6Gmewzz2a0CLD_9OpOSN2SVaqw08EaK6YoU';

/**
 * Inicializa o cliente Supabase de forma segura.
 * Se já existir uma instância global 'supabase', nós a usamos para evitar conflitos,
 * mas garantimos que a nossa variável interna '_supabase' esteja configurada.
 */
let _supabase;
try {
  if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window._supabase = _supabase;
    console.log("Supabase Client inicializado com sucesso.");
  } else {
    console.error("SDK do Supabase não encontrado. Verifique a importação via CDN.");
  }
} catch (e) {
  console.error("Erro ao inicializar o cliente Supabase:", e);
}

/**
 * Registra um novo usuário com metadados de perfil e cria entrada na tabela 'perfis'
 */
async function registrarUsuario(email, password, nome) {
  try {
    // Tratamento de nome: se vazio ou se for um e-mail, usa "Usuário"
    let nomeReal = (nome && nome.trim() !== "" && !nome.includes('@')) ? nome.trim() : "Usuário";

    const { data, error } = await _supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          display_name: nomeReal
        }
      }
    });

    if (error) {
      console.error("Erro no signUp do Supabase:", error);
      throw error;
    }

    if (data.user) {
      console.log("Usuário criado, inserindo na tabela perfis...");
      // Salva apenas no campo full_name, garantindo que o e-mail não seja usado como nome
      const { error: profileError } = await _supabase
        .from('perfis')
        .insert([
          { 
            id: data.user.id, 
            full_name: nomeReal, 
            email: email, 
            pontos: 0 
          }
        ]);
      
      if (profileError) {
        console.error("Erro ao inserir na tabela 'perfis':", profileError);
      } else {
        console.log("Perfil criado na tabela 'perfis' com sucesso.");
      }

      // ✅ SINCRONIZAR HEADER COM NOVO ESTADO DE AUTENTICAÇÃO
      if (typeof window.updateHeaderAuth === 'function') {
        window.updateHeaderAuth(data.user);
        window.__AUTH_STATE = {
          session: data.session,
          user: data.user,
          isReady: true
        };
      }
    }

    return data;
  } catch (err) {
    console.error("Falha fatal no processo de registro:", err);
    throw err;
  }
}

/**
 * Faz login com e-mail e senha
 */
async function loginUsuario(email, password) {
  try {
    const { data, error } = await _supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      console.error("Erro no login do Supabase:", error);
      throw error;
    }

    // Lógica de sincronização no login: garante que o perfil exista na tabela 'perfis'
    if (data.user) {
      const { data: perfilExistente } = await _supabase
        .from('perfis')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!perfilExistente) {
        console.log("Perfil não encontrado no login, sincronizando...");
        const metadata = data.user.user_metadata || {};
        const nomeReal = metadata.full_name || metadata.display_name || "Usuário";
        
        await _supabase.from('perfis').insert([{
          id: data.user.id,
          full_name: nomeReal,
          email: data.user.email,
          avatar_url: metadata.avatar_url || '',
          pontos: 0
        }]);
      }

      // ✅ SINCRONIZAR HEADER COM NOVO ESTADO DE AUTENTICAÇÃO
      if (typeof window.updateHeaderAuth === 'function') {
        window.updateHeaderAuth(data.user);
        window.__AUTH_STATE = {
          session: data.session,
          user: data.user,
          isReady: true
        };
      }
    }

    return data;
  } catch (err) {
    console.error("Falha fatal no processo de login:", err);
    throw err;
  }
}

/**
 * Login com Google via OAuth
 */
async function loginComGoogle() {
  try {
    const { data, error } = await _supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/index.html'
      }
    });

    if (error) {
      console.error("Erro no login Google do Supabase:", error);
      throw error;
    }
    return data;
  } catch (err) {
    console.error("Falha fatal no processo de login Google:", err);
    throw err;
  }
}

/**
 * Recuperação de senha via Supabase
 */
async function recuperarSenha(email) {
  try {
    if (!_supabase) throw new Error('Serviço de autenticação indisponível.');
    const { data, error } = await _supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/atualizar-senha.html'
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Erro ao solicitar recuperação de senha:', err);
    throw err;
  }
}

/**
 * Obtém o usuário logado atualmente
 */
async function obterUsuarioAtual() {
  try {
    if (!_supabase) return null;
    const { data: { user }, error } = await _supabase.auth.getUser();
    if (error) {
      console.warn("Erro ao obter usuário atual ou sessão inexistente:", error.message);
      return null;
    }

    // ✅ SINCRONIZAR HEADER AO OBTER USUÁRIO (importante para páginas que carregam depois do header)
    if (user && typeof window.updateHeaderAuth === 'function' && window.__AUTH_STATE?.isReady) {
      window.updateHeaderAuth(user);
    }

    return user;
  } catch (err) {
    console.error("Erro ao verificar sessão do usuário:", err);
    return null;
  }
}

/**
 * Faz logout do usuário
 */
async function logoutUsuario() {
  try {
    const { error } = await _supabase.auth.signOut();
    if (error) throw error;
    window.location.reload();
  } catch (err) {
    console.error("Erro ao realizar logout:", err);
  }
}

// Lógica da Interface de Login
document.addEventListener('DOMContentLoaded', () => {
  console.log("auth.js carregado e pronto.");

  if (!document.getElementById('login-form') && !document.getElementById('auth-title')) {
    return;
  }

  const loginForm = document.getElementById('login-form');
  const btnGoogle = document.getElementById('btn-google');
  const toggleAuth = document.getElementById('toggle-auth');
  const groupName = document.getElementById('group-name');
  const inputName = document.getElementById('name');
  
  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  const btnSubmit = document.getElementById('btn-submit');
  const footerText = document.getElementById('footer-text');
  const authMessage = document.getElementById('auth-message');

  let isLoginMode = true;

  // Função para mudar o estado da tela
  function atualizarInterface() {
    if (!authTitle || !authSubtitle || !btnSubmit || !footerText || !toggleAuth || !authMessage) {
      return;
    }

    if (isLoginMode) {
      authTitle.innerText = 'Bem-vindo de volta';
      authSubtitle.innerText = 'Entre na sua conta para salvar seu progresso';
      btnSubmit.innerText = 'Entrar';
      footerText.innerText = 'Não tem uma conta?';
      toggleAuth.innerText = 'Criar Conta';
      if (groupName) groupName.style.display = 'none';
      if (inputName) inputName.required = false;
    } else {
      authTitle.innerText = 'Crie sua conta';
      authSubtitle.innerText = 'Comece agora a salvar seu desempenho nos simulados';
      btnSubmit.innerText = 'Registrar';
      footerText.innerText = 'Já tem uma conta?';
      toggleAuth.innerText = 'Fazer Login';
      if (groupName) groupName.style.display = 'flex';
      if (inputName) inputName.required = true;
    }
    // Atualiza o texto do botão Google sem alterar estilo ou ícone
    if (btnGoogle) {
      try {
        const img = btnGoogle.querySelector('img');
        const imgHTML = img ? img.outerHTML : '';
        const googleText = isLoginMode ? 'Entrar com o Google' : 'Criar conta com o Google';
        btnGoogle.innerHTML = imgHTML + ' ' + googleText;
      } catch (e) {
        console.warn('Não foi possível atualizar o texto do botão Google', e);
      }
    }
    authMessage.style.display = 'none';
  }

  // Alternar entre Login e Cadastro
  if (toggleAuth) {
    toggleAuth.onclick = (e) => {
      e.preventDefault();
      console.log("Alternando modo de autenticação...");
      isLoginMode = !isLoginMode;
      atualizarInterface();
    };
  }

  // Define o estado inicial da interface (garante texto do botão Google correto)
  atualizarInterface();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('bloqueado') === '1' && authMessage) {
    authMessage.textContent = '🚫 Sua conta foi suspensa. Entre em contato com o administrador.';
    authMessage.className = 'msg-error';
    authMessage.style.display = 'block';
  }

  // Submissão do Formulário
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const nome = inputName ? inputName.value : '';

      btnSubmit.disabled = true;
      const originalText = btnSubmit.innerText;
      btnSubmit.innerText = 'Processando...';
      authMessage.style.display = 'none';

      try {
        if (isLoginMode) {
          await loginUsuario(email, password);
          showMessage('Login realizado com sucesso! Redirecionando...', 'success');
          setTimeout(() => window.location.href = 'index.html', 1500);
        } else {
          await registrarUsuario(email, password, nome);
          showMessage('Conta criada! Verifique seu e-mail para confirmar o cadastro.', 'success');
        }
      } catch (error) {
        console.error('Erro na autenticação:', error);
        showMessage(error.message || 'Ocorreu um erro ao processar sua solicitação.', 'error');
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = isLoginMode ? 'Entrar' : 'Registrar';
      }
    };
  }

  // Clique no botão Google
  if (btnGoogle) {
    btnGoogle.onclick = async () => {
      try {
        await loginComGoogle();
      } catch (error) {
        showMessage('Erro ao conectar com Google: ' + error.message, 'error');
      }
    };
  }

  // Link "Esqueci minha senha" -> solicita recuperação
  const forgotLink = document.getElementById('forgot-password-link');
  if (forgotLink) {
    forgotLink.onclick = async (e) => {
      e.preventDefault();
      const emailField = document.getElementById('email');
      const email = emailField ? String(emailField.value || '').trim() : '';
      if (!email) {
        showMessage('Por favor informe o e-mail antes de solicitar recuperação.', 'error');
        return;
      }
      try {
        await recuperarSenha(email);
        showMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.', 'success');
      } catch (err) {
        console.error('Erro ao enviar recuperação:', err);
        showMessage('Erro ao enviar e-mail de recuperação: ' + (err.message || err), 'error');
      }
    };
  }

  function showMessage(text, type) {
    authMessage.innerText = text;
    authMessage.className = type === 'error' ? 'msg-error' : 'msg-success';
    authMessage.style.display = 'block';
  }
});

function obterNomeExibicao(user) {
  const metadata = user?.user_metadata || {};
  // Prioriza full_name, se não houver, retorna null para indicar que não deve exibir nome
  const name = (metadata.full_name || metadata.display_name || '').trim();
  if (name && !name.includes('@')) return name;
  return null;
}

function obterInicialNome(nome) {
  if (!nome) return 'U';
  return nome.trim().charAt(0).toUpperCase();
}

function montarAvatarHTML(avatarUrl, nome) {
  const inicial = obterInicialNome(nome);
  if (!avatarUrl) {
    return inicial;
  }

  return `<img src="${avatarUrl}" alt="Avatar" onerror="this.replaceWith(document.createTextNode('${inicial}'))" />`;
}

function atualizarHeaderUser(nome, avatarUrl) {
  const avatarEl = document.querySelector('.user-menu .avatar, .btn-login .avatar, .avatar');
  const userNameEl = document.querySelector('.user-menu .user-name, .btn-login .user-name');

  if (avatarEl) {
    avatarEl.innerHTML = montarAvatarHTML(avatarUrl, nome);
  }

  if (userNameEl) {
    userNameEl.textContent = nome || 'Olá!';
  }
}

/**
 * LÓGICA GLOBAL DE CABEÇALHO (Executa em todas as páginas)
 */
async function atualizarInterfaceGlobal() {
  const user = await obterUsuarioAtual();
  const btnLogin = document.querySelector('.btn-login');
  const rkFooter = document.querySelector('.rk-footer');

  if (user && btnLogin) {
    // Tenta buscar o full_name da tabela perfis se não estiver no metadata
    let displayName = obterNomeExibicao(user);
    const avatarUrl = user.user_metadata?.avatar_url || '';

    if (!displayName && typeof _supabase !== 'undefined') {
      try {
        const { data } = await _supabase.from('perfis').select('full_name').eq('id', user.id).single();
        if (data?.full_name) displayName = data.full_name;
      } catch (e) {}
    }

    const userMenu = document.createElement('div');
    userMenu.className = 'user-menu';
    userMenu.innerHTML = `
      <button class="btn-login">
        <span class="avatar"></span>
        <span class="user-name"></span>
      </button>
      <div class="dropdown-content">
        <a href="perfil.html">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Meu Perfil
        </a>
        <div class="divider"></div>
        <a href="#" id="btn-logout-global">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair
        </a>
      </div>
    `;

    btnLogin.replaceWith(userMenu);
    atualizarHeaderUser(displayName, avatarUrl);

    // Lógica de dropdown por clique
    const menuBtn = userMenu.querySelector('.btn-login');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu.classList.toggle('active');
      });
    }

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
      if (!userMenu.contains(e.target)) {
        userMenu.classList.remove('active');
      }
    });

    const logoutBtn = document.getElementById('btn-logout-global');
    if (logoutBtn) {
      logoutBtn.onclick = async (e) => {
        e.preventDefault();
        if(confirm("Deseja realmente sair?")) {
          await logoutUsuario();
        }
      };
    }

    if (rkFooter) {
      rkFooter.style.display = 'none';
    }
  }
}

// Executa a checagem global ao carregar qualquer página
// Removido para evitar conflito com auth-check.js
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', atualizarInterfaceGlobal);
// } else {
//   atualizarInterfaceGlobal();
// }

// =================================================================
// RECUPERAÇÃO DE SENHA (SUPABASE)
// =================================================================

// Função para disparar o e-mail de recuperação de senha pelo Supabase
async function recuperarSenha(email) {
    if (!email) {
        alert("Por favor, digite seu e-mail no campo antes de clicar em esqueci minha senha.");
        return;
    }

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/atualizar-senha.html',
        });

        if (error) {
            alert("Erro ao enviar e-mail de recuperação: " + error.message);
        } else {
            alert("E-mail de recuperação enviado com sucesso! Verifique sua caixa de entrada.");
        }
    } catch (err) {
        alert("Erro inesperado no sistema: " + err.message);
    }
}

function initMobileHeaderMenu() {
    const headerInner = document.querySelector('.header-inner');
    const headerNav = document.querySelector('.header-inner .header-nav');
    if (!headerInner || !headerNav) return;
    if (headerInner.querySelector('.mobile-nav-toggle')) return;

    const isHomePage = document.querySelector('header.home-header') !== null;
    if (isHomePage) return;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mobile-nav-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
    toggle.textContent = '☰';

    const isAdminPage = document.body.classList.contains('admin-dashboard');

    if (isAdminPage) {
        const overlay = document.createElement('div');
        overlay.className = 'ad-sidebar-overlay';
        overlay.addEventListener('click', () => {
            document.querySelectorAll('.ad-sidebar.open').forEach(sidebar => sidebar.classList.remove('open'));
            overlay.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
        });
        document.body.appendChild(overlay);

        const closeSidebar = () => {
            const sidebar = document.querySelector('.ad-sidebar');
            if (sidebar) sidebar.classList.remove('open');
            overlay.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
        };

        const openSidebar = () => {
            const sidebar = document.querySelector('.ad-sidebar');
            if (sidebar) sidebar.classList.add('open');
            overlay.classList.add('active');
            toggle.setAttribute('aria-expanded', 'true');
        };

        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const sidebar = document.querySelector('.ad-sidebar');
            if (!sidebar) return;
            if (sidebar.classList.contains('open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeSidebar();
        });

        document.addEventListener('click', (event) => {
            const sidebar = document.querySelector('.ad-sidebar');
            if (!sidebar || !sidebar.classList.contains('open')) return;
            if (overlay.contains(event.target) || toggle.contains(event.target)) return;
            if (!sidebar.contains(event.target)) closeSidebar();
        });
    } else {
        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = headerNav.classList.toggle('mobile-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });

        document.addEventListener('click', (event) => {
            if (!headerNav.contains(event.target) && !toggle.contains(event.target)) {
                if (headerNav.classList.contains('mobile-open')) {
                    headerNav.classList.remove('mobile-open');
                    toggle.setAttribute('aria-expanded', 'false');
                }
            }
        });
    }

    headerInner.insertBefore(toggle, headerNav);
}

// Vincula o link do HTML à função de recuperação
document.addEventListener("DOMContentLoaded", () => {
    initMobileHeaderMenu();
    // Escuta o clique se o link existir na página atual (login.html)
    const linkEsqueci = document.getElementById("esqueci-senha");
    
    if (linkEsqueci) {
        linkEsqueci.addEventListener("click", (e) => {
            e.preventDefault();
            
            // Tenta buscar o campo de email pelo ID ou Name comum
            const campoEmail = document.getElementById("email") || document.querySelector('input[type="email"]');
            
            if (campoEmail && campoEmail.value) {
                recuperarSenha(campoEmail.value);
            } else {
                alert("Por favor, digite seu e-mail no campo de texto antes de clicar em esqueci minha senha.");
            }
        });
    }
});