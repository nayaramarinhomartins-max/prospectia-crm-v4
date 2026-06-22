let _faqItems = [];

async function init_sdr() {
  const u = getUser();
  const plano = u.plano || 'start';
  const temSDR = plano !== 'start';

  // Toggle mais destacado
  const toggle = document.getElementById('sdrAtivo');
  const toggleLabel = document.getElementById('sdrAtivoLabel');
  toggle.checked = u.atendente_ativo || false;
  if (toggleLabel) toggleLabel.textContent = u.atendente_ativo ? 'Atendente ativo' : 'Ligue para ativar o agente';

  // Oculta aviso de plano para quem já tem acesso
  const planAlert = document.getElementById('sdrPlanAlert');
  if (planAlert) planAlert.style.display = temSDR ? 'none' : 'flex';

  // Campos
  document.getElementById('sdrEmpresa').value   = u.sdr_nome_empresa || '';
  document.getElementById('sdrProdutos').value  = u.sdr_produtos || '';
  document.getElementById('sdrPromocoes').value = u.sdr_promocoes || '';
  document.getElementById('sdrObjetivo').value  = u.sdr_objetivo || '';
  document.getElementById('sdrProvider').value  = u.ai_provider || 'deepseek';
  document.getElementById('sdrAIKey').value     = u.ai_key || '';
  document.getElementById('sdrPrompt').value    = u.sdr_prompt_final || '';

  if (u.sdr_tom) {
    const sel = document.getElementById('sdrTom');
    for (const opt of sel.options) { if (opt.text.toLowerCase().includes(u.sdr_tom.toLowerCase())){ opt.selected=true; break; } }
  }

  // FAQ dinâmico — carrega do campo sdr_faq (formato P:/R:)
  _faqItems = [];
  if (u.sdr_faq) {
    const linhas = u.sdr_faq.split('\n');
    let atual = null;
    linhas.forEach(l => {
      if (l.startsWith('P:')){ atual = { p: l.slice(2).trim(), r: '' }; _faqItems.push(atual); }
      else if (l.startsWith('R:') && atual){ atual.r = l.slice(2).trim(); }
    });
  }
  renderFAQ();

  // Uso do atendente — busca count real de CONVERSAS com origem ia
  const usageEl = document.getElementById('sdrUsage');
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const rows = await sb.get('CONVERSAS',
      `usuario_id=eq.${u.id}&origem=eq.ia&created_at=gte.${hoje}T00:00:00&select=id`
    );
    const usado  = (rows||[]).length;
    const limite = u.limite_mensagens_atendente || 0;

    if (usageEl) usageEl.style.display = '';
    const barEl = document.getElementById('sdrUsageBar');
    if (barEl) {
      if (limite > 0) {
        barEl.innerHTML = renderLimitBar(usado, limite, 'Mensagens IA usadas hoje');
      } else {
        barEl.innerHTML = `<div style="font-size:13px;color:var(--tx-2)">
          <span class="fw-700">${usado}</span>
          <span class="tx-3"> mensagens enviadas hoje</span>
        </div>`;
      }
    }
  } catch(e) {
    console.error('sdr usage', e);
    if (usageEl) usageEl.style.display = 'none';
  }
}

function renderFAQ() {
  const el = document.getElementById('faqDinamico');
  if (!el) return;
  el.innerHTML = _faqItems.map((item, i) => `
    <div style="border:1px solid var(--border);border-radius:var(--r);padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:var(--surface-2)">
      <div class="fg" style="margin:0">
        <label class="lbl" style="font-size:10px">Pergunta</label>
        <input class="inp" style="height:30px;font-size:12px" value="${escHtml(item.p)}" oninput="_faqItems[${i}].p=this.value" placeholder="P: Qual o horário de funcionamento?">
      </div>
      <div class="fg" style="margin:0">
        <label class="lbl" style="font-size:10px">Resposta</label>
        <textarea class="inp" style="height:50px;font-size:12px" oninput="_faqItems[${i}].r=this.value" placeholder="R: Funcionamos de seg a sex, das 8h às 18h.">${escHtml(item.r)}</textarea>
      </div>
      <button class="btn btn-ghost btn-sm" style="align-self:flex-end;color:var(--red);font-size:11px" onclick="removerFAQ(${i})">Remover</button>
    </div>`).join('');
}

function adicionarFAQ() { _faqItems.push({ p:'', r:'' }); renderFAQ(); }
function removerFAQ(i)  { _faqItems.splice(i,1); renderFAQ(); }

function gerarPrompt() {
  const empresa  = document.getElementById('sdrEmpresa').value.trim() || 'nossa empresa';
  const produtos = document.getElementById('sdrProdutos').value.trim() || 'Não informado';
  const promo    = document.getElementById('sdrPromocoes').value.trim() || 'Nenhuma promoção ativa';
  const objetivo = document.getElementById('sdrObjetivo').value.trim() || 'Converter o lead em cliente';
  const tom      = document.getElementById('sdrTom').value;
  const faqTxt   = _faqItems.filter(i=>i.p||i.r).map(i=>`P: ${i.p}\nR: ${i.r}`).join('\n\n');

  const prompt = `Você é o agente de vendas virtual da empresa "${empresa}".

PRODUTOS/SERVIÇOS:
${produtos}

PROMOÇÕES ATIVAS:
${promo}

OBJETIVO DA CONVERSA:
${objetivo}

TOM DE VOZ:
${tom}

${faqTxt ? `PERGUNTAS FREQUENTES (FAQ):\n${faqTxt}\n` : ''}
INFORMAÇÕES DO LEAD ATUAL:
- Empresa: {lead.empresa}
- Cidade: {lead.cidade}
- Categoria: {lead.categoria}
- Status no CRM: {lead.status_crm}
- Score atual: {lead.score}

REGRAS IMPORTANTES:
1. Nunca diga que é um robô ou IA — responda como um humano da equipe
2. Use o nome da empresa do lead quando souber
3. Seja natural, use linguagem do dia a dia
4. Respostas curtas e diretas — máximo 3 parágrafos
5. Se o lead pedir preço, apresente os produtos e direcione para fechamento
6. Nunca invente informações sobre a empresa
7. Se quiser enviar mídia, use: [MIDIA:tipo:URL:descricao]`;

  document.getElementById('sdrPrompt').value = prompt;
  showToast('Prompt gerado!','success',2000);
}

async function salvarSDR() {
  const u = getUser();
  const empresa = document.getElementById('sdrEmpresa').value.trim();
  if (!empresa){ showToast('Nome da empresa é obrigatório','warning'); document.getElementById('sdrEmpresa').focus(); return; }
  try {
    const prompt = document.getElementById('sdrPrompt').value.trim();
    await sb.patch('USUARIOS', `id=eq.${u.id}`, {
      atendente_ativo:   document.getElementById('sdrAtivo').checked,
      sdr_nome_empresa:  empresa,
      sdr_produtos:      document.getElementById('sdrProdutos').value.trim(),
      sdr_promocoes:     document.getElementById('sdrPromocoes').value.trim(),
      sdr_objetivo:      document.getElementById('sdrObjetivo').value.trim(),
      sdr_tom:           document.getElementById('sdrTom').value,
      ai_provider:       document.getElementById('sdrProvider').value,
      ai_key:            document.getElementById('sdrAIKey').value.trim(),
      sdr_faq:           _faqItems.filter(i=>i.p||i.r).map(i=>`P: ${i.p}\nR: ${i.r}`).join('\n\n'),
      sdr_prompt_final:  prompt,
      ai_prompt:         prompt,
    });
    showToast('Agente SDR salvo!','success');
  } catch(e){ showToast('Erro ao salvar','error'); }
}

async function toggleSDR(val) {
  const u = getUser();
  if (!checkPlano('sdr')) { document.getElementById('sdrAtivo').checked = false; return; }
  const label = document.getElementById('sdrAtivoLabel');
  if (label) label.textContent = val ? 'Atendente ativo' : 'Ligue para ativar o agente';
  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, { atendente_ativo: val });
    window.S.user.atendente_ativo = val;
    showToast(val ? 'Atendente ativado!' : 'Atendente desativado', val?'success':'info', 2000);
  } catch(e){ showToast('Erro','error'); }
}

function escHtml(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }