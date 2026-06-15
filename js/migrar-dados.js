const filesToMigrate = [
  { path: 'data/exatas/matematica.json', area: 'Exatas', materia: 'Matemática' },
  { path: 'data/exatas.json', area: 'Exatas', materia: '' },
  { path: 'data/biologicas.json', area: 'Biológicas', materia: '' },
  { path: 'data/humanas/historia.json', area: 'Humanas', materia: 'História' },
  { path: 'data/tecnicos.json', area: 'Técnicos', materia: '' }
];

function appendLog(text, level = 'info') {
  const log = document.getElementById('log');
  if (!log) return console.log(text);
  const el = document.createElement('div');
  el.className = level === 'err' ? 'err' : level === 'ok' ? 'ok' : 'info';
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function converterQuestao(questaoLocal) {
  const letras = ['A', 'B', 'C', 'D'];
  
  // Pega apenas as 4 primeiras alternativas (descarta a 5ª se houver)
  const alternativas = letras.map((letra, index) => ({
    letra: letra,
    texto: questaoLocal.alternativas[index] || ''
  }));

  // Converte índice numérico para letra
  const indiceGabarito = questaoLocal.gabarito ?? 0;
  const correta = letras[indiceGabarito] || 'A';

  return {
    enunciado:    questaoLocal.enunciado,
    alternativas: alternativas,
    correta:      correta,
    comentario:   questaoLocal.explicacao || ''
  };
}

async function migrateFile(file) {
  try {
    appendLog(`Lendo ${file.path}...`, 'info');
    const res = await fetch(file.path);
    if (!res.ok) throw new Error(`Falha ao carregar ${file.path}: ${res.status}`);
    const dadosJson = await res.json();

    const title = dadosJson.titulo || dadosJson.title || 'Sem título';
    const questoesRaw = Array.isArray(dadosJson.questoes) ? dadosJson.questoes : [];
    const questoes = questoesRaw.map(converterQuestao);

    const payload = {
      title: title,
      area: file.area,
      materia: file.materia || null,
      status: 'ativa',
      questoes: questoes,
      created_at: new Date().toISOString()
    };

    if (!window._supabase) {
      appendLog(`Supabase não configurado. Pulando inserção de ${file.path}`, 'err');
      return { migrated: false, error: 'no-supabase' };
    }

    // Verificação idempotente: procura por title + area
    const { data: existing, error: selErr } = await window._supabase
      .from('simulados')
      .select('id')
      .eq('title', payload.title)
      .eq('area', payload.area)
      .limit(1);

    if (selErr) {
      appendLog(`Erro ao verificar existência em Supabase para ${file.path}: ${selErr.message || selErr}`, 'err');
      return { migrated: false, error: selErr };
    }

    if (Array.isArray(existing) && existing.length > 0) {
      appendLog(`Ignorado (já existe): ${title} — ${questoes.length} questões`, 'info');
      return { migrated: false, skipped: true };
    }

    const { error } = await window._supabase
      .from('simulados')
      .insert([payload]);

    if (error) {
      appendLog(`Erro em ${file.path}: ${error.message || error}`, 'err');
      return { migrated: false, error };
    }

    appendLog(`Migrado: ${title} — ${questoes.length} questões inseridas`, 'ok');
    return { migrated: true };
  } catch (err) {
    appendLog(`Erro em ${file.path}: ${err.message || err}`, 'err');
    return { migrated: false, error: err };
  }
}

async function runMigration() {
  const btn = document.getElementById('btn-migrar');
  if (btn) btn.disabled = true;

  if (!window._supabase) {
    appendLog('window._supabase não encontrado. Configure Supabase antes de rodar.', 'err');
    if (btn) btn.disabled = false;
    return;
  }

  let migratedCount = 0;
  let errorCount = 0;

  for (const file of filesToMigrate) {
    const result = await migrateFile(file);
    if (result.migrated) migratedCount++;
    if (result.error) errorCount++;
  }

  appendLog(`\nMIGRAÇÃO CONCLUÍDA: ${migratedCount} simulados migrados, ${errorCount} erros`, 'info');
  if (btn) btn.disabled = false;
}

// Bind button when loaded
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-migrar');
  if (!btn) return;
  btn.addEventListener('click', () => {
    runMigration();
  });
});
