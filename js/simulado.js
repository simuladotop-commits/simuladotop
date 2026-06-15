/**
 * LÓGICA DO SIMULADO: Estudo Ativo e Roteamento Multidisciplinar
 */

let _questoes = [];
let _indiceAtual = 0;
let _respostasUsuario = {}; 
let _tempoRestante = 60 * 60; // 60 minutos para 40 questões
let _tempoInicio;
let _timerInterval;
let _tituloSimulado = "";
let _simuladoId = null;
let _finalizado = false;

const _urlParams = new URLSearchParams(window.location.search);
let area = _urlParams.get('area');
let disciplina = _urlParams.get('disciplina');
let provaParam = _urlParams.get('prova');

async function waitForSupabase() {
  let tentativas = 0;
  while (typeof window._supabase === 'undefined' && tentativas < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    tentativas++;
  }

  if (typeof window._supabase === 'undefined') {
    throw new Error('Supabase não disponível');
  }

  return window._supabase;
}

function gerarSlug(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
}


async function carregarProvaSupabasePorSlug(areaParam, slug) {
  try {
    const supabase = await waitForSupabase();
    let prova = null;

    const resSlug = await supabase
      .from('simulados')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'ativa')
      .maybeSingle();

    if (resSlug && resSlug.data) {
      prova = resSlug.data;
    }

    if (!prova) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
      if (uuidRegex.test(slug)) {
        const resId = await supabase
          .from('simulados')
          .select('*')
          .eq('id', slug)
          .maybeSingle();
        if (resId && resId.data) prova = resId.data;
      }
    }

    if (!prova && areaParam) {
      const pattern = `%${String(areaParam).trim()}%`;
      const resArea = await supabase
        .from('simulados')
        .select('*')
        .ilike('area', pattern)
        .eq('slug', slug)
        .eq('status', 'ativa')
        .limit(1);
      if (resArea && Array.isArray(resArea.data) && resArea.data.length) {
        prova = resArea.data[0];
      }
    }

    if (!prova) {
      throw new Error('Prova não encontrada');
    }

    _simuladoId = prova.id;
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

async function carregarProvaSupabase(id, provaPreCarregada = null) {
  const introSection = document.getElementById('intro-section');
  const quizSection = document.getElementById('quiz-section');
  const resultSection = document.getElementById('resultado-final');

  if (quizSection) quizSection.style.display = 'none';
  if (resultSection) resultSection.style.display = 'none';
  if (introSection) introSection.style.display = 'block';

  try {
    const supabase = await waitForSupabase();
    let prova = provaPreCarregada;

    if (!prova) {
      const { data, error } = await supabase
        .from('simulados')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) throw error || new Error('Prova não encontrada');
      prova = data;
    }

    _tituloSimulado = prova.title || prova.titulo || 'Simulado';
    _simuladoId = prova.id;
    _questoes = (prova.questoes || []).map(q => ({
      id: q.id ?? q.numero ?? Math.random(),
      enunciado: q.enunciado || q.pergunta || 'Questão sem enunciado',
      alternativas: Array.isArray(q.alternativas)
        ? q.alternativas.map(item => (typeof item === 'object' ? item.texto || item.letra || '' : item))
        : [],
      gabarito: (() => {
        const letras = ['A', 'B', 'C', 'D'];
        const gabRaw = q.correta || q.gabarito;

        if (typeof gabRaw === 'string' && letras.includes(gabRaw.toUpperCase())) {
          return letras.indexOf(gabRaw.toUpperCase());
        }
        if (typeof gabRaw === 'number') {
          return gabRaw;
        }
        return 0;
      })(),
      explicacao: q.explicacao || q.comentario || ''
    })).filter(q => q.enunciado && Array.isArray(q.alternativas) && q.alternativas.length);

    if (_questoes.length === 0) {
      throw new Error('Esta prova não possui questões válidas.');
    }

    const tagEl = document.getElementById('tag-label');
    const titleEl = document.getElementById('simulator-title');
    const descEl = document.getElementById('intro-desc');
    const tempoEl = document.getElementById('meta-tempo');
    const qEl = document.getElementById('meta-questoes');
    const btnIniciar = document.getElementById('btn-iniciar');

    const totalQ = _questoes.length;
    const tempoMinutos = Math.max(5, totalQ * 2);
    if (tagEl) tagEl.textContent = prova.area || 'Simulado';
    if (titleEl) titleEl.textContent = _tituloSimulado;
    if (descEl) descEl.textContent = `${prova.materia || prova.area || 'Simulado'} · Prova oficial SimuladoTop`;
    if (tempoEl) tempoEl.textContent = `~${tempoMinutos} min`;
    if (qEl) qEl.textContent = totalQ === 1 ? '1 questão' : `${totalQ} questões`;
    if (btnIniciar) {
      btnIniciar.style.display = 'inline-flex';
      btnIniciar.onclick = iniciarQuiz;
    }
  } catch (err) {
    console.error('[simulado] Erro ao carregar prova:', err);
    const intro = document.getElementById('intro-section');
    if (intro) {
      intro.innerHTML = `
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

function iniciarQuiz() {
  const introSection = document.getElementById('intro-section');
  const quizSection = document.getElementById('quiz-section');
  if (introSection) introSection.style.display = 'none';
  if (quizSection) quizSection.style.display = 'block';
  const quizTitulo = document.getElementById('quiz-titulo');
  if (quizTitulo) quizTitulo.textContent = _tituloSimulado || 'Simulado';
  _tempoRestante = Math.max(300, _questoes.length * 120);
  renderizarQuestao();
  iniciarCronometro();
  configurarEventos();
}

// Roteador de Área, Disciplina, JSON de prova direto ou Supabase
async function inicializarSimulado() {
  const params = new URLSearchParams(window.location.search);
  area = params.get('area');
  disciplina = params.get('disciplina');
  provaParam = params.get('prova');
  const supabaseId = params.get('supabase_id');

  _tempoInicio = Date.now();

  if (area && provaParam) {
    await carregarProvaSupabasePorSlug(area, provaParam);
    return;
  }

  if (supabaseId) {
    await carregarProvaSupabase(supabaseId);
    return;
  }

  if (provaParam) {
    await carregarProva(provaParam);
    return;
  }

  const container = document.querySelector('.simulado-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align:center;padding:80px 20px">
        <h2 style="color:#ef4444">Prova não especificada</h2>
        <p style="color:#888;margin:12px 0">Acesse esta página através da lista de simulados.</p>
        <a href="index.html" style="color:#f5a623">Voltar ao início</a>
      </div>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarSimulado);
} else {
  inicializarSimulado();
}

async function carregarProva(provaLocal = null) {
  const container = document.querySelector('.simulado-container');
  
  if (!provaLocal && !provaParam && !area) {
    if (container) {
      container.innerHTML = `
        <div class="quiz-card" style="text-align:center;">
          <h1>Erro: Prova não especificada.</h1>
          <p style="color:var(--muted);margin:16px 0;">Acesse esta página através da lista de simulados.</p>
          <a href='index.html' class="btn-top-secondary" style="text-decoration:none;">Voltar</a>
        </div>`;
    }
    return;
  }

  const jsonPath = provaLocal ? decodeURIComponent(provaLocal) : provaParam ? decodeURIComponent(provaParam) : `data/${area}/${disciplina}.json`;

  try {
    const response = await fetch(jsonPath);
    if (!response.ok) throw new Error('Arquivo não encontrado');
    
    const dados = await response.json();
    _questoes = dados.questoes || [];
    _tituloSimulado = dados.titulo || "Simulado";

    if (_questoes.length > 0 && _questoes.length < 30) {
      alert(`Atenção: Este simulado contém apenas ${_questoes.length} questões. O recomendado é entre 30 e 40.`);
    }

    const titleEl = document.querySelector('.quiz-header h2');
    if (titleEl) titleEl.innerText = _tituloSimulado;

    if (_questoes.length > 0) {
      renderizarQuestao();
      iniciarCronometro();
      configurarEventos();
    }
  } catch (err) {
    console.error('Erro:', err);
    if (container) {
      container.innerHTML = `
        <div class="quiz-card" style="text-align:center;">
          <h1 style="font-family:var(--font-head);margin-bottom:16px;">Conteúdo em breve</h1>
          <p style="color:var(--muted);margin-bottom:24px;">A disciplina <strong>${disciplina.toUpperCase()}</strong> em <strong>${area.toUpperCase()}</strong> está sendo preparada.</p>
          <a href='index.html' class="btn-nav btn-finish" style="text-decoration:none;display:inline-block;">Voltar para o Início</a>
        </div>
      `;
    }
  }
}

function iniciarCronometro() {
  const timerEl = document.getElementById('timer');
  _timerInterval = setInterval(() => {
    if (_tempoRestante <= 0 || _finalizado) {
      clearInterval(_timerInterval);
      if (_tempoRestante <= 0) finalizarSimulado();
      return;
    }
    _tempoRestante--;
    const min = Math.floor(_tempoRestante / 60);
    const seg = _tempoRestante % 60;
    if (timerEl) timerEl.innerText = `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
  }, 1000);
}

function renderizarQuestao() {
  const questao = _questoes[_indiceAtual];
  const total = _questoes.length;
  const respondida = _respostasUsuario[questao.id] !== undefined;

  document.getElementById('question-number').innerText = `Questão ${_indiceAtual + 1} de ${total}`;
  document.getElementById('question-text').innerText = questao.enunciado;
  document.getElementById('progress-bar').style.width = `${((_indiceAtual + 1) / total) * 100}%`;

  const optionsGroup = document.getElementById('options-group');
  optionsGroup.innerHTML = '';

  const feedbackBox = document.getElementById('feedback-box');
  feedbackBox.style.display = respondida ? 'block' : 'none';

  const letras = ['A', 'B', 'C', 'D', 'E'];
  questao.alternativas.forEach((texto, index) => {
    const isSelected = _respostasUsuario[questao.id] === index;
    const isCorrect = index === questao.gabarito;
    
    const label = document.createElement('label');
    label.className = `option-label ${isSelected ? 'selected' : ''}`;
    
    if (respondida) {
      label.classList.add('disabled');
      if (isCorrect) label.classList.add('correta');
      if (isSelected && !isCorrect) label.classList.add('errada');
    }

    label.innerHTML = `
      <input type="radio" name="opcao" value="${index}" class="option-radio" ${isSelected ? 'checked' : ''} ${respondida ? 'disabled' : ''}>
      <span class="option-prefix">${letras[index]}</span>
      <span class="option-text">${texto}</span>
    `;

    if (!respondida) {
      label.onclick = () => responder(index);
    }
    optionsGroup.appendChild(label);
  });

  if (respondida) {
    const correta = _respostasUsuario[questao.id] === questao.gabarito;
    feedbackBox.className = `feedback-box ${correta ? 'correta' : 'errada'}`;
    document.getElementById('feedback-title').innerText = correta ? "✨ Correto!" : "❌ Incorreto";
    document.getElementById('feedback-text').innerText = questao.explicacao || "Sem explicação disponível.";
    
    // Mostra botões de navegação
    document.getElementById('btn-next').style.display = (_indiceAtual < total - 1) ? 'block' : 'none';
    document.getElementById('btn-finish').style.display = (_indiceAtual === total - 1) ? 'block' : 'none';
  } else {
    document.getElementById('btn-next').style.display = 'none';
    document.getElementById('btn-finish').style.display = 'none';
  }
}

function responder(index) {
  if (_respostasUsuario[_questoes[_indiceAtual].id] !== undefined) return; // Evita múltiplas respostas
  
  const questao = _questoes[_indiceAtual];
  _respostasUsuario[questao.id] = index;
  renderizarQuestao();
}

function configurarEventos() {
  document.getElementById('btn-next').onclick = () => {
    if (_indiceAtual < _questoes.length - 1) {
      _indiceAtual++;
      renderizarQuestao();
    }
  };
  document.getElementById('btn-prev').onclick = () => {
    if (_indiceAtual > 0) {
      _indiceAtual--;
      renderizarQuestao();
    }
  };
  document.getElementById('btn-finish').onclick = finalizarSimulado;
}

let _pontuacaoFinalGlobal = 0;
let _acertosGlobal = 0;

async function finalizarSimulado() {
  _finalizado = true;
  clearInterval(_timerInterval);

  const tempoFim = Date.now();
  const tempoGastoSegundos = Math.floor((tempoFim - _tempoInicio) / 1000);
  const minGasto = Math.floor(tempoGastoSegundos / 60);
  const segGasto = tempoGastoSegundos % 60;
  const tempoFormatado = `${minGasto.toString().padStart(2, '0')}:${segGasto.toString().padStart(2, '0')}`;

  let acertos = 0;
  let erros = [];

  _questoes.forEach(q => {
    if (_respostasUsuario[q.id] === q.gabarito) {
      acertos++;
    } else {
      erros.push(q);
    }
  });

  const totalQuestoes = _questoes.length;
  const aproveitamento = Math.round((acertos / totalQuestoes) * 100);
  
  const pontosPorAcerto = 100;
  const bonusTempo = _tempoRestante > 0 ? Math.floor(_tempoRestante * 0.5) : 0;
  const pontuacaoFinal = (acertos * pontosPorAcerto) + bonusTempo;

  _pontuacaoFinalGlobal = pontuacaoFinal;
  _acertosGlobal = acertos;

  // UI
  document.getElementById('quiz-screen').style.display = 'none';
  const resultScreen = document.getElementById('resultado-final');
  resultScreen.style.display = 'block'; // Ou 'flex' se preferir, mas 'block' funciona bem com quiz-card
  
  const feedbackMsg = document.getElementById('feedback-message');
  feedbackMsg.innerText = aproveitamento >= 70 ? "Excelente Desempenho! 🚀" : 
                         aproveitamento < 50 ? "Hora de revisar o conteúdo! 📚" : 
                         "Bom trabalho! Continue praticando. 👍";
  feedbackMsg.className = `feedback-msg ${aproveitamento >= 70 ? 'success' : aproveitamento < 50 ? 'warning' : ''}`;

  document.getElementById('performance-bar').style.width = `${aproveitamento}%`;
  document.getElementById('performance-percentage').innerText = `${aproveitamento}% de aproveitamento`;
  document.getElementById('total-hits').innerText = acertos;
  document.getElementById('time-used').innerText = tempoFormatado;
  const finalScoreEl = document.getElementById('final-score');
  if (finalScoreEl) finalScoreEl.innerText = pontuacaoFinal;

  // Relatório de Erros
  const errorReport = document.getElementById('error-report');
  const errorContainer = document.getElementById('error-items-container');
  if (erros.length > 0) {
    errorReport.style.display = 'block';
    errorContainer.innerHTML = erros.map((q, i) => {
      const letras = ['A', 'B', 'C', 'D', 'E'];
      const indexRespondido = _respostasUsuario[q.id];
      const respostaAluno = indexRespondido !== undefined
        ? `${letras[indexRespondido]}. ${q.alternativas[indexRespondido]}`
        : 'Não respondida';
      const respostaCorreta = `${letras[q.gabarito]}. ${q.alternativas[q.gabarito]}`;
      const cardId = `review-card-${i}`;

      return `
        <div class="review-card" id="${cardId}">
          <div class="review-header">
            <div class="review-numero">Questão ${_questoes.indexOf(q) + 1}</div>
          </div>

          <div class="review-enunciado">${q.enunciado}</div>

          <div class="review-respostas">
            <div class="review-linha errada">
              <span class="review-label">Sua resposta:</span>
              <span class="review-valor">${respostaAluno}</span>
            </div>

            <div class="review-linha correta">
              <span class="review-label">Resposta correta:</span>
              <span class="review-valor">${respostaCorreta}</span>
            </div>
          </div>

          ${q.explicacao ? `
            <button class="review-btn-explicacao" type="button" onclick="toggleExplicacao('${cardId}')">💡 Ver explicação</button>
            <div class="review-explicacao" id="exp-${cardId}" style="display:none;">
              ${q.explicacao}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // Auto-save ao finalizar
  await salvarAutomatico();
}

window.toggleExplicacao = (cardId) => {
  const exp = document.getElementById(`exp-${cardId}`);
  const btn = document.querySelector(`#${cardId} .review-btn-explicacao`);
  if (!exp) return;
  const aberto = exp.style.display === 'block';
  exp.style.display = aberto ? 'none' : 'block';
  btn.textContent = aberto ? '💡 Ver explicação' : '🔼 Ocultar explicação';
};

function getCurrentWeekStart() {
  const d = new Date();
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function salvarAutomatico() {
  const feedbackEl = document.getElementById('save-feedback');

  // Verifica se usuário está logado
  let user = null;
  try {
    const { data } = await _supabase.auth.getUser();
    user = data?.user || null;
  } catch (e) {
    user = null;
  }

  // Visitante — mostra convite
  if (!user) {
    if (feedbackEl) {
      feedbackEl.innerHTML = `
        <div style="
          background: rgba(245,166,35,0.1);
          border: 1px solid rgba(245,166,35,0.3);
          border-radius: 10px;
          padding: 16px 24px;
          margin-top: 8px;
        ">
          <p style="color:#f5a623;font-weight:700;margin-bottom:8px">
            🏆 Quer aparecer no ranking?
          </p>
          <p style="color:#aaa;font-size:0.875rem;margin-bottom:12px">
            Crie uma conta gratuita para salvar seu desempenho 
            e competir com outros estudantes.
          </p>
          <a href="login.html" style="
            display:inline-block;
            background:#f5a623;
            color:#000;
            font-weight:700;
            padding:8px 20px;
            border-radius:6px;
            text-decoration:none;
            font-size:0.875rem;
          ">Criar conta grátis</a>
        </div>
      `;
    }
    return;
  }

  // Usuário logado — verifica se é primeira tentativa no ciclo semanal atual
  try {
    console.log('[debug] _simuladoId ao salvar:', _simuladoId);
    const simuladoIdParaSalvar = _simuladoId || _tituloSimulado || 'desconhecido';
    const simuladoFilter = _simuladoId && _tituloSimulado
      ? `simulado_id.eq.${_simuladoId},simulado_id.eq.${_tituloSimulado}`
      : `simulado_id.eq.${simuladoIdParaSalvar}`;

    const { data: tentativas_anteriores } = await _supabase
      .from('tentativas')
      .select('id, is_estudo, created_at')
      .eq('aluno_id', user.id)
      .gte('created_at', getCurrentWeekStart().toISOString())
      .or(simuladoFilter);

    const isEstudo = Array.isArray(tentativas_anteriores) && tentativas_anteriores.length > 0;

    console.log('[auto-save] simulado_id:', simuladoIdParaSalvar);
    console.log('[auto-save] Tentativas anteriores na semana:', tentativas_anteriores);

    const totalQuestoes     = _questoes.length;
    const porcentagemAcerto = totalQuestoes > 0
      ? Math.round((_acertosGlobal / totalQuestoes) * 100)
      : 0;
    const tempoGasto        = Math.floor((Date.now() - _tempoInicio) / 1000);
    const erros             = totalQuestoes - _acertosGlobal;

    const { error } = await _supabase
      .from('tentativas')
      .insert([{
        aluno_id:           user.id,
        simulado_id:        simuladoIdParaSalvar,
        porcentagem_acerto: porcentagemAcerto,
        tempo_gasto:        tempoGasto,
        area:               area || 'Geral',
        acertos:            _acertosGlobal,
        erros:              erros,
        pontuacao:          _pontuacaoFinalGlobal,
        is_estudo:          isEstudo
      }]);

    if (error) throw error;

    if (!isEstudo) {
      // Primeira tentativa do ciclo semanal — conta no ranking
      const { error: rpcError } = await _supabase
        .rpc('incrementar_pontos', {
          user_id:     user.id,
          novos_pontos: _pontuacaoFinalGlobal
        });

      if (rpcError) {
        const { data: perfilAtual } = await _supabase
          .from('perfis')
          .select('pontos')
          .eq('id', user.id)
          .single();

        await _supabase
          .from('perfis')
          .update({ pontos: (perfilAtual?.pontos || 0) + _pontuacaoFinalGlobal })
          .eq('id', user.id);
      }

      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <p style="color:#22c55e;font-size:0.875rem;margin-top:8px">
            ✅ Resultado salvo no ranking! 
            <a href="perfil.html" style="color:#f5a623;text-decoration:underline">
              Ver meu perfil
            </a>
          </p>
        `;
      }

      console.log('[auto-save] ✅ Primeira tentativa do ciclo semanal salva no ranking');
    } else {
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:12px 16px;margin-top:8px;">
            <p style="color:#3b82f6;font-size:0.875rem">
              📚 Esta prova já foi feita nesta semana. Esta tentativa é registrada como estudo e não afeta seu ranking.
              <a href="perfil.html" style="color:#f5a623;text-decoration:underline;margin-left:4px">Ver histórico</a>
            </p>
          </div>`;
      }
      console.log('[auto-save] 📚 Tentativa de estudo registrada no histórico');
    }

  } catch (err) {
    console.error('[auto-save] Erro:', err);
    if (feedbackEl) {
      feedbackEl.innerHTML = `
        <p style="color:#ef4444;font-size:0.875rem">
          ⚠️ Não foi possível salvar automaticamente.
        </p>
      `;
    }
  }
}
