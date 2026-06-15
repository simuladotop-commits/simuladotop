export function adminSidebarHtml(activePage = 'dashboard', roleLabel = 'Administrador') {
  const navLink = (href, label, iconSvg, pageKey) => `
    <a href="${href}" class="${activePage === pageKey ? 'active' : ''}"${activePage === pageKey ? ' aria-current="page"' : ''}>
      ${iconSvg}
      ${label}
    </a>`;

  const icons = {
    dashboard: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    provas: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9l-6-6z"/><path d="M9 3v6h6"/></svg>`,
    alunos: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`,
    blog: `📝`,
    configuracoes: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
  };

  return `
    <aside class="dashboard-sidebar ad-sidebar">
      <div class="dashboard-brand">
        <div>
          <h2>SimuladoTop</h2>
          <p class="dashboard-brand-sub">Admin Console</p>
        </div>
      </div>
      <nav class="dashboard-nav">
        <span class="dashboard-nav-section">PRINCIPAL</span>
        ${navLink('admin.html', 'Dashboard', icons.dashboard, 'dashboard')}
        <span class="dashboard-nav-section">GERENCIAR</span>
        ${navLink('admin-provas.html', 'Provas', icons.provas, 'provas')}
        ${navLink('admin-alunos.html', 'Alunos', icons.alunos, 'alunos')}
        ${navLink('admin-blog.html', 'Blog', icons.blog, 'blog')}
        ${navLink('admin-configuracoes.html', 'Configurações', icons.configuracoes, 'configuracoes')}
      </nav>
      <div class="sidebar-footer">
        <span>Permissão</span>
        <strong>${roleLabel}</strong>
      </div>
    </aside>`;
}
