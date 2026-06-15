export async function waitForSupabase(timeout = 5000) {
  const start = Date.now();
  while (typeof window._supabase === 'undefined') {
    if (Date.now() - start > timeout) {
      throw new Error('Supabase não inicializou em tempo hábil.');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window._supabase;
}

export function normalizeCargo(cargo) {
  const raw = String(cargo || '').trim().toLowerCase();
  if (!raw) return '';
  const normalized = raw.replace(/[^a-z]/g, '');

  if (['admin', 'administrador', 'administrator', 'adm'].includes(normalized)) {
    return 'admin';
  }
  if (['professor', 'prof', 'professorado'].includes(normalized)) {
    return 'professor';
  }
  if (['aluno', 'student', 'estudante'].includes(normalized)) {
    return 'aluno';
  }

  return normalized;
}

export async function getCurrentUserCargo() {
  const supabase = await waitForSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[admin-auth] Erro ao obter sessão:', error);
    return null;
  }

  const session = data?.session;
  if (!session?.user?.id) {
    return null;
  }

  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('cargo')
    .eq('id', session.user.id)
    .single();

  if (perfilError) {
    console.error('[admin-auth] Erro ao buscar perfil:', perfilError);
    return null;
  }

  return normalizeCargo(perfil?.cargo || '');
}

export async function isAdminUser() {
  const cargo = await getCurrentUserCargo();
  return cargo === 'admin';
}

export async function enforceAdminAccess({ redirectTo = 'index.html', hideSelector = null } = {}) {
  const isAdmin = await isAdminUser().catch((err) => {
    console.error('[admin-auth] Erro ao verificar admin:', err);
    return false;
  });

  if (isAdmin) {
    return true;
  }

  if (hideSelector) {
    const element = document.querySelector(hideSelector);
    if (element) {
      element.style.display = 'none';
    }
  }

  if (redirectTo) {
    window.location.href = redirectTo;
  }

  return false;
}
