/* ══════════════════════════════════════════
   ENGINE DO QUIZ — script.js v3
   Suporta dois formatos automaticamente:
   → "multipla_escolha" (ETEC, ENEM, etc.)
   → "certo_errado" (CEBRASPE — PRF, PF, etc.)
   Com seleção de nível quando disponível.
══════════════════════════════════════════ */

let QUIZ_DATA = null;
let Q         = [];
let TOTAL     = 0;
let NIVEL_KEY = null;
let FORMATO   = 'multipla_escolha';
let SIMULADO_ID = null;

/** Pasta dos JSON na raiz do site (HTML na raiz → sempre data/…). */
const DATA_PATH = 'data/';

async function waitForSupabaseScript(timeout = 5000) {
  const start = Date.now();
  while (typeof _supabase === 'undefined') {
    if (Date.now() - start > timeout) return false;
    await new Promise(r => setTimeout(r, 50));
  }
  return true;
}

/** Embaralha um array (Fisher-Yates) */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

let state = {
  current: 0,
  answers: {},
  answered: {},
  timerInterval: null,
  secondsLeft: 0
};

const STORAGE_KEY_RESULT = 'simuladoTop:lastResult';
const CLEANUP_PATTERNS = [
  /\bQuestão adicional\b/gi,
  /\bQuestão adicional\s*[:\-]?\s*/gi,
  /\bEnunciado de nível concursal\b/gi,
  /\bNível concursal\b/gi
];
const PLACEHOLDER_PATTERNS = [
  /\bQuestão adicional\b/gi,
  /\benunciado de nível concursal\b/gi,
  /\bDistrator plausível\b/gi,
  /\bAlternativa correta sobre\b/gi,
  /Resposta\s+[A-E]\s*:/gi
];

function cleanText(value) {
  if (typeof value !== 'string') return value;
  let cleaned = value.replace(/\s+/g, ' ').trim();
  CLEANUP_PATTERNS.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, '').replace(/\s+/g, ' ').trim();
  });
  return cleaned;
}

function hasPlaceholderText(value) {
  if (typeof value !== 'string') return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeAlternativas(alternativas) {
  if (!Array.isArray(alternativas)) return [];
  return alternativas.map((alternativa) => ({
    ...alternativa,
    texto: cleanText(alternativa.texto),
    letra: alternativa.letra
  }));
}

function isUsableQuestion(question) {
  if (!question || typeof question !== 'object') return false;

  const enunciado = typeof question.enunciado === 'string' ? question.enunciado.trim() : '';
  if (!enunciado || enunciado.length < 8 || hasPlaceholderText(enunciado)) return false;

  if (!Array.isArray(question.alternativas) || question.alternativas.length < 2) return false;

  const letras = new Set(question.alternativas
    .filter((alternativa) => alternativa && alternativa.letra)
    .map((alternativa) => alternativa.letra));

  if (!letras.has(question.gabarito)) return false;

  return question.alternativas.every((alternativa) => {
    const texto = typeof alternativa?.texto === 'string' ? alternativa.texto.trim() : '';
    return Boolean(texto) && !hasPlaceholderText(texto);
  });
}

function sanitizeQuestion(question) {
  if (!question || typeof question !== 'object') return question;
  return {
    ...question,
    disciplina: cleanText(question.disciplina),
    enunciado: cleanText(question.enunciado),
    explicacao: cleanText(question.explicacao),
    referencia: cleanText(question.referencia),
    alternativas: sanitizeAlternativas(question.alternativas),
    gabarito: question.gabarito
  };
}

function sanitizeQuizData(data) {
  if (!data || typeof data !== 'object') return data;

  const sanitizeNestedQuestions = (collection) => {
    if (!Array.isArray(collection)) return collection;
    return collection
      .filter((item) => {
        const valid = isUsableQuestion(item);
        if (!valid) {
          console.warn('Questão descartada por sanitização:', item?.id || item?.enunciado || 'sem identificação');
        }
        return valid;
      })
      .map((item) => sanitizeQuestion(item));
  };

  return {
    ...data,
    titulo: cleanText(data.titulo),
    descricao: cleanText(data.descricao),
    questoes: sanitizeNestedQuestions(data.questoes),
    niveis: data.niveis
      ? Object.fromEntries(Object.entries(data.niveis).map(([key, nivel]) => [
          key,
          {
            ...nivel,
            descricao: cleanText(nivel.descricao),
            label: cleanText(nivel.label),
            questoes: sanitizeNestedQuestions(nivel.questoes)
          }
        ]))
      : undefined
  };
}

function resetQuizState() {
  state = {
    current: 0,
    answers: {},
    answered: {},
    timerInterval: null,
    secondsLeft: 0
  };
}

function getStoredResult() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESULT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('Não foi possível ler o resultado salvo no localStorage:', error);
    localStorage.removeItem(STORAGE_KEY_RESULT);
    return null;
  }
}

function persistStoredResult(resultadoFinal) {
  try {
    localStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(resultadoFinal));
  } catch (error) {
    console.warn('Não foi possível persistir o resultado no localStorage:', error);
  }
}

function clearStoredResult() {
  try {
    localStorage.removeItem(STORAGE_KEY_RESULT);
  } catch (error) {
    console.warn('Não foi possível limpar o resultado salvo no localStorage:', error);
  }
}

function getCurrentQuizLabel() {
  const titleEl = document.getElementById('simulator-title');
  const headerTag = document.getElementById('tag-label');
  const fallback = QUIZ_DATA?.titulo || QUIZ_DATA?.nome || SIMULADO_ID || 'Simulado';
  return cleanText(titleEl?.textContent || headerTag?.textContent || fallback) || fallback;
}

function buildQuestionResults() {
  return Q.map((q, index) => ({
    numero: index + 1,
    disciplina: cleanText(q.disciplina),
    enunciado: cleanText(q.enunciado),
    gabarito: q.gabarito,
    respostaUsuario: state.answers[index] ?? null,
    correta: state.answers[index] === q.gabarito,
    explicacao: cleanText(q.explicacao)
  }));
}

function buildResultSnapshot() {
  const questionResults = buildQuestionResults();
  const acertos = questionResults.filter((item) => item.correta).length;
  const erros = questionResults.length - acertos;

  return {
    simuladoId: SIMULADO_ID,
    nomeProva: getCurrentQuizLabel(),
    area: cleanText(document.getElementById('simulator-title')?.textContent || getCurrentQuizLabel()),
    timestamp: new Date().toISOString(),
    total: questionResults.length,
    acertos,
    erros,
    respostas: Object.fromEntries(questionResults.map((item) => [item.numero - 1, item.respostaUsuario])),
    questionResults
  };
}

function restoreStateFromSnapshot(snapshot) {
  resetQuizState();
  if (!snapshot || !snapshot.respostas) return;

  Object.entries(snapshot.respostas).forEach(([index, resposta]) => {
    const numericIndex = Number(index);
    if (resposta !== undefined && resposta !== null) {
      state.answers[numericIndex] = resposta;
      state.answered[numericIndex] = true;
    }
  });
}

function renderResultPanel(snapshot) {
  const activeSnapshot = snapshot || buildResultSnapshot();
  const total = activeSnapshot.total || TOTAL;
  const acertos = activeSnapshot.acertos ?? 0;
  const pct = total ? Math.round((acertos / total) * 100) : 0;

  const intro = document.getElementById('intro-section');
  const quiz = document.getElementById('quiz-section');
  const result = document.getElementById('result-section');

  if (intro) intro.style.display = 'none';
  if (quiz) quiz.style.display = 'none';
  if (result) result.style.display = 'block';

  document.getElementById('progress-bar').style.width = '100%';
  document.getElementById('score-pct').textContent = pct + '%';
  setTimeout(() => {
    const ring = document.getElementById('ring-val');
    if (ring) {
      ring.style.strokeDashoffset = 264 - (264 * pct / 100);
    }
  }, 100);

  let titulo, sub;
  if (pct >= 80) { titulo = 'Excelente resultado! 🏆'; sub = 'Você está preparado. Continue firme!'; }
  else if (pct >= 60) { titulo = 'Bom desempenho! 📈'; sub = 'Reforce os erros antes da prova.'; }
  else if (pct >= 40) { titulo = 'Resultado regular 📚'; sub = 'Revise o conteúdo e tente novamente.'; }
  else { titulo = 'Vamos estudar mais! 💪'; sub = 'Identifique os pontos fracos e avance.'; }

  const resultTitle = document.getElementById('result-title');
  const resultSub = document.getElementById('result-sub');
  if (resultTitle) resultTitle.textContent = titulo;
  if (resultSub) resultSub.textContent = `${acertos} de ${total} corretas · ${sub}`;

  const discs = {};
  activeSnapshot.questionResults.forEach((question) => {
    const d = cleanText(question.disciplina).split('/')[0].split('—')[0].trim();
    if (!discs[d]) discs[d] = { total: 0, correct: 0 };
    discs[d].total += 1;
    if (question.correta) discs[d].correct += 1;
  });

  const breakdownList = document.getElementById('breakdown-list');
  if (breakdownList) {
    breakdownList.innerHTML = Object.entries(discs).map(([name, d]) => {
      const p = Math.round((d.correct / d.total) * 100);
      return `<div class="disc-row">
        <span class="disc-name">${name}</span>
        <div class="disc-bar-wrap"><div class="disc-bar" data-w="${p}"></div></div>
        <span class="disc-pct">${p}%</span>
      </div>`;
    }).join('');
  }

  setTimeout(() => {
    document.querySelectorAll('.disc-bar').forEach((bar) => {
      bar.style.width = bar.dataset.w + '%';
    });
  }, 200);

  const gabGrid = document.getElementById('gab-grid');
  if (gabGrid) {
    gabGrid.innerHTML = activeSnapshot.questionResults.map((question) => {
      const cls = question.respostaUsuario === null || question.respostaUsuario === undefined
        ? ''
        : (question.correta ? 'ok' : 'err');
      return `<div class="gab-item ${cls}" title="${question.disciplina}">
        <span class="gab-n">Q${question.numero}</span>
        <span class="gab-a">${question.respostaUsuario === null || question.respostaUsuario === undefined ? '—' : question.gabarito}</span>
      </div>`;
    }).join('');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function enviarParaSupabase(resultadoFinal) {
  if (typeof _supabase === 'undefined') {
    console.error('Supabase não inicializado. Não foi possível enviar o resultado.');
    return;
  }

  try {
    // ✅ REUTILIZAR ESTADO GLOBAL SE DISPONÍVEL (evita múltiplas chamadas getSession)
    let session = window.__AUTH_STATE?.session || null;
    
    if (!session) {
      const { data: { session: freshSession }, error: sessionError } = await _supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }
      session = freshSession;
    }

    if (!session?.user) {
      console.error('Sessão não ativa no Supabase. Não foi possível enviar o resultado da tentativa.');
      return;
    }

    const aluno_id = session.user.id;
    const simulado_id = resultadoFinal.simuladoId || SIMULADO_ID || 'desconhecido';
    const porcentagem_acerto = resultadoFinal.total ? Math.round((resultadoFinal.acertos / resultadoFinal.total) * 100) : 0;

    // Busca a tentativa existente para comparar a pontuação
    const { data: tentativaExistente, error: searchError } = await _supabase
      .from('tentativas')
      .select('porcentagem_acerto')
      .eq('aluno_id', aluno_id)
      .eq('simulado_id', simulado_id)
      .maybeSingle();

    if (searchError) throw searchError;

    const payload = {
      aluno_id,
      simulado_id,
      porcentagem_acerto,
      acertos: resultadoFinal.acertos,
      erros: resultadoFinal.erros,
      area: resultadoFinal.area || resultadoFinal.nomeProva || 'Não informado',
      timestamp: resultadoFinal.timestamp,
      respostas: resultadoFinal.respostas || {}
    };

    // Só salva (upsert) se não houver tentativa anterior ou se a nova pontuação for maior
    if (!tentativaExistente || porcentagem_acerto > (tentativaExistente.porcentagem_acerto || 0)) {
      const { error: upsertError } = await _supabase
        .from('tentativas')
        .upsert(payload, { onConflict: 'aluno_id, simulado_id' });
      
      if (upsertError) throw upsertError;
      console.log('Resultado salvo/atualizado via upsert (melhor pontuação):', payload);
    } else {
      console.log('Resultado não atualizado: a pontuação anterior era melhor ou igual.');
    }

  } catch (error) {
    const isPermissionError = error.code === '42501' || /permission|rls/i.test(error.message || '');
    console.error(isPermissionError
      ? 'Erro de permissão (RLS) no Supabase:'
      : 'Erro ao salvar tentativa no Supabase:', error);
  }
}

/** Garante caminho data/... válido (remove ./ ../ e duplicados). */
function normalizeQuizDataPath(path) {
  if (!path || typeof path !== 'string') return path;
  let p = path.trim().replace(/\\/g, '/');
  if (/^https?:\/\//i.test(p)) return p;

  p = p.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!p.startsWith('data/')) {
    p = 'data/' + p;
  }
  return p.replace(/\/+/g, '/');
}

/** URL para fetch (sempre data/). */
function resolveQuizFetchUrl(path) {
  return normalizeQuizDataPath(path);
}

function setStartButtonsEnabled(on) {
  document.querySelectorAll('button.btn-start').forEach((el) => {
    if (on) el.removeAttribute('disabled');
    else el.setAttribute('disabled', '');
  });
}

/* ════════════════════════════════
   1. CARREGA O JSON
════════════════════════════════ */

/**
 * Carrega prova do Supabase por ID e injeta no engine legado (simulado.js)
 */
async function carregarProvaSupabasePorSlug(area, slug) {
  // Aguarda _supabase
  let tentativas = 0;
  while (typeof window._supabase === 'undefined' && tentativas < 50) {
    await new Promise(r => setTimeout(r, 100));
    tentativas++;
  }

  if (typeof window._supabase === 'undefined') {
    console.error('[simulado] Supabase não disponível');
    return;
  }

  try {
    // Busca por slug de forma resiliente: primeiro por slug exato, depois por id, por fim tenta ilike com pattern
    let prova = null;

    // 1) Tenta por slug exato
    try {
      const res = await window._supabase
        .from('simulados')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'ativa')
        .maybeSingle();
      if (res && res.data) prova = res.data;
      else if (res && res.error) console.warn('[simulado] Erro ao consultar por slug:', res.error);
    } catch (e) {
      console.warn('[simulado] Exceção ao consultar por slug:', e);
    }

    // 2) Se não achou, e o slug parece UUID, tenta pelo id
    if (!prova) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
      if (uuidRegex.test(slug)) {
        try {
          const res = await window._supabase
            .from('simulados')
            .select('*')
            .eq('id', slug)
            .maybeSingle();
          if (res && res.data) prova = res.data;
          else if (res && res.error) console.warn('[simulado] Erro ao consultar por id:', res.error);
        } catch (e) {
          console.warn('[simulado] Exceção ao consultar por id:', e);
        }
      }
    }

    // 3) Por segurança, se ainda não achou e area foi fornecida, tenta ilike com padrão (limit 1)
    if (!prova && area) {
      try {
        const pattern = `%${String(area).trim()}%`;
        const res = await window._supabase
          .from('simulados')
          .select('*')
          .ilike('area', pattern)
          .eq('slug', slug)
          .eq('status', 'ativa')
          .limit(1);
        if (res && Array.isArray(res.data) && res.data.length) prova = res.data[0];
        else if (res && res.error) console.warn('[simulado] Erro ao consultar por area+slug:', res.error);
      } catch (e) {
        console.warn('[simulado] Exceção ao consultar por area+slug:', e);
      }
    }

    if (!prova) throw new Error('Prova não encontrada');

    // Delega para a função principal de carregamento (aceita prova pré-carregada)
    await carregarProvaSupabase(prova.id, prova);

  } catch (err) {
    console.error('[simulado] Erro ao buscar por slug:', err);
    const intro = document.getElementById('intro-section');
    if (intro) {
      intro.innerHTML = `
        <div style="text-align:center;padding:60px 20px">
          <p style="color:#ef4444;margin-bottom:16px">
            Prova não encontrada.
          </p>
          <a href="javascript:history.back()"
             style="color:#f5a623">← Voltar</a>
        </div>`;
    }
  }
}


/**
 * Carrega prova do Supabase por ID e injeta no engine legado (simulado.js)
 * Aceita opcionalmente a prova já carregada como segundo parâmetro.
 */
async function carregarProvaSupabase(id, provaPreCarregada = null) {
  setStartButtonsEnabled(false);

  // Esconde tela de quiz, mostra intro com loading
  const introSection = document.getElementById('intro-section');
  const quizSection  = document.getElementById('quiz-section');
  const resultSection = document.getElementById('result-section');

  if (quizSection)   quizSection.style.display   = 'none';
  if (resultSection) resultSection.style.display = 'none';
  if (introSection)  introSection.style.display  = 'block';

  // Aguarda _supabase se necessário
  if (!provaPreCarregada) {
    let tent = 0;
    while (typeof window._supabase === 'undefined' && tent < 50) {
      await new Promise(r => setTimeout(r, 100));
      tent++;
    }
    if (typeof window._supabase === 'undefined') {
      console.error('[simulado] Supabase não disponível');
      return;
    }
  }

  try {
    let prova = provaPreCarregada;

    if (!prova) {
      const { data, error } = await window._supabase
        .from('simulados')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) throw error || new Error('Prova não encontrada');
      prova = data;
    }

    // Converte questões do formato Supabase para o formato do engine
    const letras = ['A', 'B', 'C', 'D'];

    const questoesConvertidas = (prova.questoes || []).map(q => {
      // Formato novo: alternativas já são objetos {letra, texto}
      if (Array.isArray(q.alternativas) && q.alternativas.length > 0 && typeof q.alternativas[0] === 'object' && q.alternativas[0].letra) {
        return {
          enunciado:    q.enunciado,
          disciplina:   prova.materia || prova.area || 'Geral',
          alternativas: q.alternativas,
          gabarito:     q.correta || q.gabarito,
          explicacao:   q.comentario || q.explicacao || ''
        };
      }

      // Formato legado: alternativas são strings
      const alts = letras
        .map((letra, i) => ({
          letra,
          texto: Array.isArray(q.alternativas) ? (q.alternativas[i] || '') : ''
        }))
        .filter(a => a.texto);

      const gabaritoLetra = typeof q.gabarito === 'number' ? (letras[q.gabarito] || 'A') : (q.correta || q.gabarito || 'A');

      return {
        enunciado:    q.enunciado,
        disciplina:   prova.materia || prova.area || 'Geral',
        alternativas: alts,
        gabarito:     gabaritoLetra,
        explicacao:   q.comentario || q.explicacao || ''
      };
    }).filter(q => q.enunciado && q.alternativas && q.alternativas.length > 0);

    if (questoesConvertidas.length === 0) {
      throw new Error('Esta prova não possui questões válidas.');
    }

    // Monta QUIZ_DATA no formato esperado pelo engine
    QUIZ_DATA = {
      titulo:        prova.title,
      area:          prova.area,
      materia:       prova.materia,
      formato:       'multipla_escolha',
      tempo_minutos: Math.max(5, Math.ceil(questoesConvertidas.length * 2)),
      questoes:      questoesConvertidas
    };

    FORMATO     = 'multipla_escolha';
    SIMULADO_ID = prova.id;
    Q           = shuffleArray([...QUIZ_DATA.questoes]);
    TOTAL       = Q.length;

    // Atualiza elementos da tela de introdução
    const tagEl     = document.getElementById('tag-label');
    const titleEl   = document.getElementById('simulator-title');
    const descEl    = document.getElementById('intro-desc');
    const tempoEl   = document.getElementById('meta-tempo');
    const qEl       = document.getElementById('meta-questoes');
    const btnIniciar = document.getElementById('btn-iniciar');

    if (tagEl)      tagEl.textContent    = prova.area || 'Simulado';
    if (titleEl)    titleEl.textContent  = prova.title;
    if (descEl)     descEl.textContent   = `${prova.materia || prova.area} · Prova oficial SimuladoTop`;
    if (tempoEl)    tempoEl.textContent  = `~${QUIZ_DATA.tempo_minutos} min`;
    if (qEl)        qEl.textContent      = `${TOTAL} questão${TOTAL !== 1 ? 'ões' : ''}`;
    if (btnIniciar) {
  btnIniciar.style.display = 'inline-flex';
  btnIniciar.onclick = startQuiz; // ← linha que estava faltando
}

    // Verifica resultado anterior salvo
    const storedResult = getStoredResult();
    if (storedResult && storedResult.simuladoId === SIMULADO_ID) {
      restoreStateFromSnapshot(storedResult);
      renderResultPanel(storedResult);
      return;
    }

    setStartButtonsEnabled(true);

  } catch (err) {
    console.error('[simulado] Erro ao carregar prova:', err);
    if (introSection) {
      introSection.innerHTML = `
        <div style="text-align:center;padding:60px 20px">
          <p style="color:#ef4444;margin-bottom:8px">
            ${err.message || 'Não foi possível carregar esta prova.'}
          </p>
          <a href="javascript:history.back()"
             style="color:#f5a623;margin-top:12px;display:inline-block">
            ← Voltar
          </a>
        </div>`;
    }
  }
}

async function loadQuiz(jsonPath) {
  setStartButtonsEnabled(false);
  const url = resolveQuizFetchUrl(jsonPath);
  try {
    document.querySelectorAll('.quiz-json-error').forEach((n) => n.remove());
    let res;
    try {
      res = await fetch(url, { cache: 'no-store' });
    } catch (netErr) {
      const isFile = window.location.protocol === 'file:';
      const extra = isFile
        ? 'Você está em file:// (arquivo aberto direto do disco). Navegadores bloqueiam carregar JSON assim. Solução: no VS Code abra a pasta do projeto e use Live Server (Go Live), ou no terminal na pasta do projeto execute: python -m http.server 8080 e acesse http://localhost:8080/ mais o nome do seu HTML (ex.: etec-portugues.html).'
        : ('Rede: ' + (netErr && netErr.message ? netErr.message : String(netErr)));
      throw new Error(extra);
    }
    if (!res.ok) {
      throw new Error('HTTP ' + res.status + ' em ' + url + ' (arquivo não encontrado ou pasta errada no servidor).');
    }
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      throw new Error('O arquivo não é JSON válido em ' + url);
    }

    QUIZ_DATA = sanitizeQuizData(data);
    FORMATO = QUIZ_DATA.formato || 'multipla_escolha';
    SIMULADO_ID = jsonPath.split('/').pop().replace('.json', '');

    if (QUIZ_DATA.niveis) {
      mostrarTelaDeNivel();
    } else {
      if (!Array.isArray(QUIZ_DATA.questoes)) {
        throw new Error('JSON sem array "questoes".');
      }
      Q = shuffleArray([...QUIZ_DATA.questoes]);
      TOTAL = Q.length;
      atualizarMeta();
    }

    const storedResult = getStoredResult();
    if (storedResult && storedResult.simuladoId === SIMULADO_ID) {
      restoreStateFromSnapshot(storedResult);
      renderResultPanel(storedResult);
    }

    setStartButtonsEnabled(true);
  } catch (e) {
    console.error('Erro ao carregar questões:', url, e);
    const area = document.getElementById('question-area');
    if (area) area.innerHTML =
      '<p style="color:#ef4444;padding:20px">Erro ao carregar. Use o Live Server (botão Go Live no VS Code).</p>';
    const intro = document.getElementById('intro-section');
    if (intro) {
      intro.querySelectorAll('.quiz-json-error').forEach((n) => n.remove());
      const err = document.createElement('p');
      err.className = 'quiz-json-error';
      err.style.cssText = 'color:#ef4444;padding:12px 0;font-size:.9rem;line-height:1.55';
      const detail = (e && e.message) ? e.message : String(e);
      err.textContent =
        window.location.protocol === 'file:'
          ? 'Não dá para carregar dados/ pelo protocolo file://. ' + detail
          : 'Não foi possível carregar o JSON. ' + detail + ' URL tentada: ' + url;
      intro.insertBefore(err, intro.firstChild);
    }
    setStartButtonsEnabled(false);
  }
}

/* ════════════════════════════════
   2. TELA DE NÍVEL (opcional)
════════════════════════════════ */
function mostrarTelaDeNivel() {
  const intro = document.getElementById('intro-section');
  const nivel = document.getElementById('nivel-section');
  if (intro) intro.style.display = 'none';
  if (nivel) nivel.style.display = 'block';
}

function selecionarNivel(key) {
  NIVEL_KEY = key;
  const nivel = QUIZ_DATA.niveis[key];
  
  // Embaralha as questões do nível selecionado
  Q     = shuffleArray([...nivel.questoes]);
  TOTAL = Q.length;
  FORMATO = QUIZ_DATA.formato || 'certo_errado';

  // Atualiza o SIMULADO_ID para incluir o nível (ex: prf-transito-iniciante)
  if (SIMULADO_ID && !SIMULADO_ID.includes(key)) {
    SIMULADO_ID = SIMULADO_ID + '-' + key;
  }

  const nivelSec = document.getElementById('nivel-section');
  const introSec = document.getElementById('intro-section');
  if (nivelSec) nivelSec.style.display = 'none';
  if (introSec) introSec.style.display = 'block';

  const tagEl   = document.getElementById('tag-label');
  const descEl  = document.getElementById('intro-desc');
  const tempoEl = document.getElementById('meta-tempo');
  const qEl     = document.getElementById('meta-questoes');
  const btnI    = document.getElementById('btn-iniciar');
  const btnT    = document.getElementById('btn-trocar');

  if (tagEl)   tagEl.textContent   = `Simulado PRF 2026 • ${nivel.label}`;
  if (descEl)  descEl.textContent  = nivel.descricao;
  if (tempoEl) tempoEl.textContent = `~${nivel.tempo_minutos} minutos`;
  if (qEl)     qEl.textContent     = `${TOTAL} questões`;
  if (btnI)    btnI.style.display  = 'inline-flex';
  if (btnT)    btnT.style.display  = 'inline-flex';
}

function trocarNivel() {
  const nivelSec = document.getElementById('nivel-section');
  const introSec = document.getElementById('intro-section');
  const btnI     = document.getElementById('btn-iniciar');
  const btnT     = document.getElementById('btn-trocar');
  if (introSec) introSec.style.display = 'none';
  if (nivelSec) nivelSec.style.display = 'block';
  if (btnI) btnI.style.display = 'none';
  if (btnT) btnT.style.display = 'none';
}

function atualizarMeta() {
  const tempoEl = document.getElementById('meta-tempo');
  const qEl     = document.getElementById('meta-questoes');
  if (tempoEl && QUIZ_DATA.tempo_minutos)
    tempoEl.textContent = `~${QUIZ_DATA.tempo_minutos} minutos`;
  if (qEl)
    qEl.textContent = `${TOTAL} questões`;
}

/* ════════════════════════════════
   3. INICIA O QUIZ
════════════════════════════════ */
function startQuiz() {
  if (!QUIZ_DATA) {
    alert('Ainda carregando as questões. Aguarde um instante e tente novamente.');
    return;
  }
  if (QUIZ_DATA.niveis && !NIVEL_KEY) {
    alert('Escolha um nível de dificuldade antes de iniciar.');
    return;
  }
  if (TOTAL === 0) {
    alert('Não há questões disponíveis para este simulado.');
    return;
  }

  resetQuizState();
  const resultSection = document.getElementById('result-section');
  if (resultSection) resultSection.style.display = 'none';

  document.getElementById('intro-section').style.display = 'none';
  document.getElementById('quiz-section').style.display  = 'block';

  const minutos = NIVEL_KEY
    ? QUIZ_DATA.niveis[NIVEL_KEY].tempo_minutos
    : QUIZ_DATA.tempo_minutos;
  state.secondsLeft = minutos * 60;
  renderQuestion();
  startTimer();
}

/* ════════════════════════════════
   4. TIMER
════════════════════════════════ */
function startTimer() {
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.secondsLeft--;
    updateTimerDisplay();
    if (state.secondsLeft <= 120)
      document.getElementById('timer').classList.add('warning');
    if (state.secondsLeft <= 0) {
      clearInterval(state.timerInterval);
      finishQuiz();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(state.secondsLeft / 60).toString().padStart(2, '0');
const s = (state.secondsLeft % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
}

/* ════════════════════════════════
   5. RENDERIZA QUESTÃO
════════════════════════════════ */
function renderQuestion() {
  const q      = Q[state.current];
  const isLast = state.current === TOTAL - 1;

  // Progresso
  document.getElementById('progress-bar').style.width =
    ((state.current + 1) / TOTAL * 100) + '%';
  document.getElementById('q-counter').textContent =
    `Questão ${state.current + 1} de ${TOTAL}`;

  // Botões de navegação
  document.getElementById('btn-prev').style.display =
    state.current === 0 ? 'none' : '';
  document.getElementById('btn-next').textContent =
    isLast ? 'Ver Resultado →' : 'Próxima →';

  const answered = state.answered[state.current];
  const chosen   = state.answers[state.current];

  // Referência (se existir)
  const refHtml = q.referencia
    ? `<span class="q-ref">${q.referencia}</span>` : '';

  // ── FORMATO: MÚLTIPLA ESCOLHA ──
  if (FORMATO === 'multipla_escolha') {
    const optsHtml = q.alternativas.map(a => {
      let cls = 'option-btn';
      if (answered) {
        if (a.letra === q.gabarito) cls += ' correct';
        else if (a.letra === chosen) cls += ' wrong';
      } else if (a.letra === chosen) cls += ' selected';

      return `<li>
        <button class="${cls}" onclick="selectOption('${a.letra}')" ${answered ? 'disabled' : ''}>
          <span class="opt-label">${a.letra}</span>
          <span>${a.texto}</span>
        </button>
      </li>`;
    }).join('');

    const feedbackHtml = answered
      ? `<div class="feedback ${chosen === q.gabarito ? 'correct' : 'wrong'}">
          <strong>${chosen === q.gabarito ? '✓ Correto!' : `✗ Incorreto. Gabarito: ${q.gabarito}`}</strong><br>
          ${q.explicacao}
         </div>`
      : '';

    document.getElementById('question-area').innerHTML = `
      <div class="question-card">
        <div class="question-num">Questão ${state.current + 1} · ${q.disciplina}${refHtml}</div>
        <p class="question-text">${q.enunciado}</p>
        <ul class="options-list">${optsHtml}</ul>
        ${feedbackHtml}
      </div>`;

  // ── FORMATO: CERTO/ERRADO ──
  } else {
    const mkCE = (letra, icon, label) => {
      let cls = `ce-btn ${letra === 'C' ? 'certo' : 'errado'}`;
      if (answered) {
        if (letra === q.gabarito)  cls += ' gabarito-ok';
        else if (letra === chosen) cls += ' gabarito-err';
        else                       cls += ' neutro';
      } else if (letra === chosen) cls += ' selecionado';

      return `<button class="${cls}" onclick="selectOption('${letra}')" ${answered ? 'disabled' : ''}>
        <span class="ce-icon">${icon}</span>
        <span class="ce-label">${label}</span>
      </button>`;
    };

    const feedbackHtml = answered
      ? `<div class="feedback ${chosen === q.gabarito ? 'correct' : 'wrong'}">
          <strong>${chosen === q.gabarito ? '✓ Correto!' : `✗ Incorreto. Gabarito: ${q.gabarito === 'C' ? 'CERTO' : 'ERRADO'}`}</strong><br>
          ${q.explicacao}
         </div>`
      : '';

    document.getElementById('question-area').innerHTML = `
      <div class="question-card">
        <div class="question-num">Questão ${state.current + 1} · ${q.disciplina}${refHtml}</div>
        <p class="question-text">${q.enunciado}</p>
        <div class="ce-row">
          ${mkCE('C', '✓', 'CERTO')}
          ${mkCE('E', '✗', 'ERRADO')}
        </div>
        ${feedbackHtml}
      </div>`;
  }
}

/* ════════════════════════════════
   6. SELECIONA RESPOSTA
════════════════════════════════ */
function selectOption(letra) {
  if (state.answered[state.current]) return;
  state.answers[state.current]  = letra;
  state.answered[state.current] = true;
  renderQuestion();
}

/* ════════════════════════════════
   7. NAVEGAÇÃO
════════════════════════════════ */
function nextQuestion() {
  if (!state.answered[state.current]) {
    const card = document.querySelector('.question-card');
    if (card) {
      card.style.border = '1px solid var(--wrong)';
      setTimeout(() => card.style.border = '1px solid var(--border)', 800);
    }
    return;
  }
  if (state.current < TOTAL - 1) {
    state.current++;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    finishQuiz();
  }
}

function prevQuestion() {
  if (state.current > 0) {
    state.current--;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* ════════════════════════════════
   8. RESULTADO FINAL
════════════════════════════════ */
async function finishQuiz() {
  clearInterval(state.timerInterval);
  const resultadoFinal = buildResultSnapshot();
  persistStoredResult(resultadoFinal);
  await enviarParaSupabase(resultadoFinal);
  renderResultPanel(resultadoFinal);
}

/* ════════════════════════════════
   9. REINICIA
════════════════════════════════ */
function restartQuiz() {
  clearInterval(state.timerInterval);
  clearStoredResult();
  NIVEL_KEY = null;
  state = { current: 0, answers: {}, answered: {}, timerInterval: null, secondsLeft: 0 };
  document.getElementById('result-section').style.display  = 'none';
  document.getElementById('timer').classList.remove('warning');

  // Se tinha níveis, volta para seleção de nível
  if (QUIZ_DATA && QUIZ_DATA.niveis) {
    document.getElementById('nivel-section').style.display = 'block';
  } else {
    document.getElementById('intro-section').style.display = 'block';
  }
}

/**
 * Carrega o Ranking Geral baseado na pontuação total dos perfis
 */
function getCurrentWeekStart() {
  const d = new Date();
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function carregarRankingGeral() {
  const rankingList = document.getElementById('ranking-list');
  const rkFooter = document.querySelector('.rk-footer');
  if (!rankingList) return;

  if (!(await waitForSupabaseScript())) {
    console.error('Erro: _supabase não inicializado no tempo esperado.');
    return;
  }

  try {
    let session = window.__AUTH_STATE?.session || null;
    if (!session) {
      const { data: { session: freshSession }, error: sessionError } = await _supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }
      session = freshSession;
    }

    const isLoggedIn = Boolean(session?.user);

    const weekStart = getCurrentWeekStart();
    const { data: tentativas, error: tentativasError } = await _supabase
      .from('tentativas')
      .select('aluno_id, simulado_id, acertos, erros, tempo_gasto')
      .gte('created_at', weekStart.toISOString())
      .or('is_estudo.is.null,is_estudo.eq.false');

    if (tentativasError) throw tentativasError;

    const { data: simuladosAtivos, error: simuladosError } = await _supabase
      .from('simulados')
      .select('id, slug, title');

    if (simuladosError) {
      throw simuladosError;
    }

    const idsValidos = new Set();
    (simuladosAtivos || []).forEach((s) => {
      if (s.id) idsValidos.add(s.id);
      if (s.slug) idsValidos.add(s.slug);
      if (s.title) idsValidos.add(s.title);
    });

    const tentativasFiltradas = (tentativas || []).filter((t) => idsValidos.has(t.simulado_id));

    const melhorPorSimulado = {};
    (tentativasFiltradas || []).forEach((r) => {
      const key = `${r.aluno_id}::${r.simulado_id}`;
      if (!melhorPorSimulado[key] || r.acertos > melhorPorSimulado[key].acertos) {
        melhorPorSimulado[key] = r;
      }
    });

    const porAluno = {};
    Object.values(melhorPorSimulado).forEach((r) => {
      if (!porAluno[r.aluno_id]) {
        porAluno[r.aluno_id] = { acertos: 0, erros: 0, tempo: 0 };
      }
      porAluno[r.aluno_id].acertos += Number(r.acertos || 0);
      porAluno[r.aluno_id].erros   += Number(r.erros || 0);
      porAluno[r.aluno_id].tempo   += Number(r.tempo_gasto || 0);
    });

    const ids = Object.keys(porAluno);
    let avatarMap = {};
    let ranking = [];

    if (ids.length > 0) {
      const { data: perfisComAvatar, error: avatarError } = await _supabase
        .from('perfis')
        .select('id, full_name, avatar_url')
        .in('id', ids)
        .or('bloqueado.is.null,bloqueado.eq.false');

      if (avatarError) {
        console.warn('Não foi possível buscar perfis do ranking:', avatarError);
      }

      const perfilMap = new Map((perfisComAvatar || []).map((p) => [p.id, p]));

      ranking = Object.entries(porAluno).map(([id, s]) => {
        const perfil = perfilMap.get(id) || {};
        const total = s.acertos + s.erros;
        return {
          id,
          full_name: perfil.full_name || 'Usuário',
          nome: perfil.full_name || perfil.nome || 'Usuário',
          pontos: s.acertos,
          tempo: s.tempo,
          acertos: s.acertos,
          accuracy: total ? (s.acertos / total) * 100 : 0,
          avatar_url: perfil.avatar_url || null,
        };
      }).filter((r) => r.pontos > 0)
        .sort((a, b) => b.pontos !== a.pontos ? b.pontos - a.pontos : a.tempo - b.tempo);

      (ranking || []).forEach((perfil) => {
        avatarMap[perfil.id] = perfil.avatar_url || null;
      });
    }

    console.log('[ranking] avatarMap:', avatarMap);
    if (Array.isArray(ranking) && ranking.length > 0) {
      const ids = ranking.map((r) => r.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: perfisComAvatar, error: avatarError } = await _supabase
          .from('perfis')
          .select('id, avatar_url')
          .in('id', ids);

        if (avatarError) {
          console.warn('Não foi possível buscar avatares dos perfis:', avatarError);
        } else if (Array.isArray(perfisComAvatar)) {
          perfisComAvatar.forEach((p) => {
            avatarMap[p.id] = p.avatar_url || null;
          });
        }
      }
    }

    console.log('[ranking] avatarMap:', avatarMap);

    const perfis = Array.isArray(ranking)
      ? (isLoggedIn ? ranking : ranking.slice(0, 10))
      : [];

    if (rkFooter) {
      rkFooter.textContent = isLoggedIn
        ? '🏅 Ranking completo atualizado com empate por tempo total.'
        : '🔒 Top 10 público. Faça login para ver o ranking completo e suas posições.';
    }

    if (!perfis || perfis.length === 0) {
      rankingList.innerHTML = `
        <div class="rk-placeholder">
          <div class="rk-placeholder-icon">🏆</div>
          <p>O ranking está vazio. Faça o primeiro simulado e conquiste seu lugar!</p>
          <a href="#categorias" class="btn-secondary btn-small">Começar Simulado</a>
        </div>
      `;
      return;
    }

    const userId = session?.user?.id;

    rankingList.innerHTML = perfis.map((perfil, index) => {
      const posClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'normal';
      const posText = `${index + 1}°`;
      const nomeExibicao = perfil.full_name || perfil.nome || 'Usuário';
      const initial = nomeExibicao.charAt(0).toUpperCase();
      const color = index === 0 ? '#f5c518' : index === 1 ? '#b0b0b0' : index === 2 ? '#cd7f32' : 'var(--muted)';
      const bgColor = index < 3 ? color + '20' : 'var(--border)';
      const isMe = perfil.id === userId;
      const destaqueClass = isMe ? 'meu-ranking' : '';
      const safeName = (perfil.full_name || perfil.nome || 'Usuário').replace(/"/g, '&quot;');
      const avatarUrl = avatarMap[perfil.id] || null;
      const avatarHtml = avatarUrl
        ? `<img src="${avatarUrl}" alt="${safeName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.innerHTML='${initial}'">`
        : initial;

      return `
        <div class="rk-row ${destaqueClass}"
             style="${isMe ? 'border:1px solid rgba(245,166,35,0.4);border-radius:8px;' : ''}">
          <span class="rk-pos ${posClass}">${posText}</span>
          <div class="rk-avatar" style="background:${bgColor};color:${color};overflow:hidden;">
            ${avatarHtml}
          </div>
          <div class="rk-info">
            <div class="rk-name">${nomeExibicao}</div>
            <div class="rk-sub">${perfil.pontos} pts</div>
          </div>
          <span class="rk-score">${perfil.pontos} pts</span>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Erro crítico no ranking:', err);
    rankingList.innerHTML = `
      <div class="rk-placeholder">
        <div class="rk-placeholder-icon">🎯</div>
        <p>O ranking não pôde ser carregado. Tente novamente mais tarde.</p>
      </div>
    `;
  }
}

function ativarAtualizacaoRankingPorAuth() {
  if (typeof _supabase === 'undefined' || !_supabase.auth?.onAuthStateChange) return;
  if (window.__RANKING_AUTH_CHANGE_SUBSCRIBED) return;

  _supabase.auth.onAuthStateChange((event) => {
    if (!['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
      return;
    }
    carregarRankingGeral();
  });

  window.__RANKING_AUTH_CHANGE_SUBSCRIBED = true;
}

async function iniciarAssinaturaRankingHome() {
  if (typeof _supabase === 'undefined' || !window._supabase?.channel || window.__HOME_RANKING_REALTIME_SUBSCRIBED) return;

  try {
    const channel = window._supabase.channel('realtime-ranking-home')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tentativas' }, () => carregarRankingGeral())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tentativas' }, () => carregarRankingGeral())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tentativas' }, () => carregarRankingGeral());

    if (channel?.subscribe) {
      await channel.subscribe();
    }

    window.__HOME_RANKING_REALTIME_SUBSCRIBED = true;
  } catch (err) {
    console.warn('Não foi possível iniciar assinatura realtime do ranking:', err);
  }
}

async function carregarEstatisticasHome() {
  if (!(await waitForSupabaseScript())) return;

  try {
    // 1. Busca o total de cadastros reais via RPC (função contar_usuarios)
    const { data, error } = await _supabase.rpc('contar_usuarios');
    
    const total = data ?? 0;
    const statNum = document.getElementById('stat-cadastros');
    const statLabel = statNum?.nextElementSibling;

    if (error === null && statNum) {
      // ✅ REUTILIZAR ESTADO GLOBAL SE DISPONÍVEL (evita múltiplas chamadas getSession)
      let session = window.__AUTH_STATE?.session || null;
      
      if (!session) {
        const { data: { session: freshSession } } = await _supabase.auth.getSession();
        session = freshSession;
      }
      
      statNum.innerText = String(total);
      
      if (session) {
        if (statLabel) {
          statLabel.innerText = total === 1 ? 'Cadastro Ativo' : 'Cadastros';
        }
      } else {
        if (statLabel) {
          statLabel.innerText = total === 1 ? 'Cadastro' : 'Cadastros';
        }
      }
    }
  } catch (err) {
    console.error('Erro ao buscar total de cadastros:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    carregarEstatisticasHome();
    carregarRankingGeral();
    ativarAtualizacaoRankingPorAuth();
    iniciarAssinaturaRankingHome();
  });
} else {
  carregarEstatisticasHome();
  carregarRankingGeral();
  ativarAtualizacaoRankingPorAuth();
  iniciarAssinaturaRankingHome();
}