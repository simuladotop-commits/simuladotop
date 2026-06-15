const ADMIN_REDIRECT = 'index.html';

async function waitForAuthReady(timeout = 10000) {
  const start = Date.now();
  while (true) {
    if (window.__AUTH_STATE?.isReady === true) return window.__AUTH_STATE;
    if (Date.now() - start > timeout) return null;
    await new Promise(r => setTimeout(r, 200));
  }
}

export async function verificarAdmin() { return checkAccess('admin'); }

export async function checkAccess(roles) {
  const state = await waitForAuthReady();
  if (!state?.user) { window.location.href = ADMIN_REDIRECT; return false; }
  const cargo = state.role ? String(state.role).trim().toLowerCase() : null;
  if (!cargo) { window.location.href = ADMIN_REDIRECT; return false; }
  const rolesArray = Array.isArray(roles) ? roles.map(r => r.toLowerCase()) : [String(roles).toLowerCase()];
  if (!rolesArray.includes(cargo)) { window.location.href = ADMIN_REDIRECT; return false; }
  return true;
}

window.verificarAdmin = verificarAdmin;
window.checkAccess = checkAccess;
