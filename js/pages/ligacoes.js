const VOZ_TARIFA   = 0.79;
const VOZ_MAX_SEG  = 60;
const VOZ_CHARS_SEG = 13; // ~13 caracteres por segundo de fala

async function init_ligacoes() {
  const u = getUser();
  const c = getCarteira();
  if (!u) return;

  const bonus = u.bonus_voz_restante || 0;
  const saldo = c?.saldo_reais || 0;

  document.getElementById('lVozBonus').textContent  = bonus;
  document.getElementById('lBonusChip').textContent = bonus + ' lig.';
  document.getElementById('lSaldo').textContent     = `R$ ${saldo.toFixed(2).replace('.',',')}`;
  document.getElementById('lSaldoChip').textContent = `R$ ${saldo.toFixed(2).replace('.',',')}`;

  // Mensagem padrão salva
  if (c?.mensagem_padrao) {
    document.getElementById('msgLigacao').value = c.mensagem_padrao;
    vozEstimarTempoPadrao();
  }

  calcCustoVoz();
}

function vozEstimarTempo() {
  const msg  = document.getElementById('vozMensagem')?.value || '';
  const segs = Math.round(msg.length / VOZ_CHARS_SEG);
  const pct  = (segs / VOZ_MAX_SEG) * 100;

  document.getElementById('vozTempoLabel').textContent = `${Math.min(segs, VOZ_MAX_SEG)}s / ${VOZ_MAX_SEG}s`;

  const bar = document.getElementById('vozTempoBar');
  bar.style.width      = Math.min(pct, 100) + '%';
  bar.style.background = pct < 70 ? 'var(--green)' : pct < 90 ? 'var(--yellow)' : 'var(--red)';

  const aviso = document.getElementById('vozTempoAviso');
  aviso.style.display = segs > VOZ_MAX_SEG ? 'block' : 'none';
}

function vozEstimarTempoPadrao() {
  const msg  = document.getElementById('msgLigacao')?.value || '';
  const segs = Math.round(msg.length / VOZ_CHARS_SEG);
  const el   = document.getElementById('vozPadraoLabel');
  if (el) el.textContent = `${Math.min(segs, VOZ_MAX_SEG)}s / ${VOZ_MAX_SEG}s`;
}

function calcCustoVoz() {
  const u      = getUser();
  const qtd    = parseInt(document.getElementById('calcVozQtd')?.value) || 0;
  const bonus  = u?.bonus_voz_restante || 0;
  const doBonus  = Math.min(qtd, bonus);
  const avulsos  = Math.max(0, qtd - bonus);
  const custo    = avulsos * VOZ_TARIFA;

  const elBonus  = document.getElementById('calcVozBonus');
  const elAvulso = document.getElementById('calcVozAvulso');
  const elTotal  = document.getElementById('calcVozResult');

  if (elBonus)  elBonus.textContent  = doBonus + ' lig.';
  if (elAvulso) elAvulso.textContent = `R$ ${custo.toFixed(2).replace('.',',')}`;
  if (elTotal)  elTotal.textContent  = `R$ ${custo.toFixed(2).replace('.',',')}`;
}

async function salvarMsgLigacao() {
  const u   = getUser();
  const msg = (document.getElementById('msgLigacao').value || '').trim();
  if (!msg) { showToast('Escreva a mensagem', 'warning'); return; }
  try {
    await sb.patch('CARTEIRA', `usuario_id=eq.${u.id}`, { mensagem_padrao: msg });
    if (window.S.carteira) window.S.carteira.mensagem_padrao = msg;
    showToast('Mensagem padrão salva!', 'success');
  } catch(e) { showToast('Erro ao salvar', 'error'); }
}

async function dispararVoz() {
  const u        = getUser();
  const numero   = (document.getElementById('vozNumero').value || '').replace(/\D/g, '');
  const mensagem = (document.getElementById('vozMensagem').value || '').trim();

  if (!numero || numero.length < 10) { showToast('Digite um número válido com DDD', 'warning'); return; }
  if (!mensagem)                      { showToast('Digite a mensagem da ligação', 'warning'); return; }

  // Verifica saldo
  const c     = getCarteira();
  const bonus = u.bonus_voz_restante || 0;
  const saldo = c?.saldo_reais || 0;
  if (bonus <= 0 && saldo < VOZ_TARIFA) {
    showToast('Saldo insuficiente. Recarregue sua carteira.', 'error');
    return;
  }

  const btn = document.getElementById('btnDispararVoz');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Iniciando ligação...';

  try {
    const result = await callWebhook('prospect-ia-disparo', {
      usuario_id: u.id,
      tipo: 'voz',
      telefone: numero,
      mensagem: mensagem
    });

    if (result?.ok !== false) {
      showToast('Ligação iniciada com sucesso!', 'success');
      document.getElementById('vozNumero').value   = '';
      document.getElementById('vozMensagem').value = '';
      vozEstimarTempo();
      // Atualiza bônus localmente
      if (window.S?.user && window.S.user.bonus_voz_restante > 0) {
        window.S.user.bonus_voz_restante--;
        document.getElementById('lVozBonus').textContent  = window.S.user.bonus_voz_restante;
        document.getElementById('lBonusChip').textContent = window.S.user.bonus_voz_restante + ' lig.';
      }
    } else {
      showToast(result?.erro || result?.message || 'Erro ao iniciar ligação', 'error');
    }
  } catch(e) {
    showToast('Erro de conexão. Tente novamente.', 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.36 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 5.93 5.93l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/></svg> Iniciar ligação`;
  }
}

// ── DISPARO EM LOTE (v3) ──
function toggleVozBatchSrc(src) {
  document.getElementById('vozBatchCampanha').style.display = src==='campanha' ? '' : 'none';
  document.getElementById('vozBatchUpload').style.display   = src==='upload'   ? '' : 'none';
}

function vozBatchContarChars() {
  const msg = document.getElementById('vozBatchMsg')?.value || '';
  const segs = Math.round(msg.length / VOZ_CHARS_SEG);
  const el = document.getElementById('vozBatchContador');
  if (el) el.textContent = `~${Math.min(segs,60)}s`;
}

async function dispararVozLote() {
  if (!checkPlano('voz_lote')) return;
  const u = getUser(); const c = getCarteira();
  const msg = document.getElementById('vozBatchMsg')?.value?.trim();
  if (!msg){ showToast('Escreva a mensagem da ligação','warning'); return; }

  const src = document.querySelector('input[name="vozBatchSrc"]:checked')?.value;
  let leads = [];

  if (src === 'campanha') {
    const camp = document.getElementById('vozBatchCamp')?.value;
    if (!camp){ showToast('Selecione uma campanha','warning'); return; }
    try {
      let rows = await sb.get('MARKETPLACE', `usuario_id=eq.${u.id}&campanha=eq.${encodeURIComponent(camp)}&select=telefone,empresa,cidade`);
      leads = rows || [];
    } catch(e){ showToast('Erro ao buscar leads','error'); return; }
  } else {
    const file = document.getElementById('vozBatchFile')?.files[0];
    if (!file){ showToast('Selecione o arquivo CSV','warning'); return; }
    const text = await file.text();
    const linhas = text.trim().split('\n').slice(1);
    leads = linhas.map(l => ({ telefone: l.split(',')[0]?.replace(/\D/g,'').trim() })).filter(l=>l.telefone?.length>=8);
  }

  if (!leads.length){ showToast('Nenhum lead encontrado','warning'); return; }

  const voz = u.bonus_voz_restante||0;
  const custo_unit = c?.valor_venda_minuto || VOZ_TARIFA;
  const totalCusto = Math.max(0, leads.length - voz) * custo_unit;
  if (!confirm(`Disparar ligação para ${leads.length} leads?\nBônus: ${Math.min(voz,leads.length)} | Custo: R$ ${totalCusto.toFixed(2)}`)) return;

  let ok = 0;
  const prev = document.getElementById('vozBatchPreview');
  if (prev){ prev.style.display='flex'; prev.innerHTML=`Disparando 0/${leads.length}...`; }

  for (const lead of leads) {
    const msgFinal = msg.replace('{empresa}',lead.empresa||'').replace('{cidade}',lead.cidade||'');
    try {
      await callWebhook('prospect-ia-disparo',{ tipo:'voz', telefone:lead.telefone, mensagem:msgFinal, usuario_id:u.id });
      ok++;
      if (prev) prev.innerHTML = `Disparando ${ok}/${leads.length}...`;
      await new Promise(r=>setTimeout(r,400));
    } catch(e){}
  }
  if (prev) prev.innerHTML = `✅ ${ok}/${leads.length} ligações disparadas`;
  updateFinPill();
  showToast(`${ok} ligações disparadas!`,'success');
}

async function carregarHistoricoVoz() {
  const u = getUser();
  try {
    const rows = await sb.get('CONVERSAS',
      `usuario_id=eq.${u.id}&origem=in.(humano_voz,campanha_voz)&select=telefone,created_at,origem&order=created_at.desc&limit=50`
    );
    const tbody = document.getElementById('vozHistorico');
    if (!tbody) return;
    if (!rows?.length){ tbody.innerHTML=`<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--tx-3)">Nenhuma ligação ainda</td></tr>`; return; }
    tbody.innerHTML = rows.map(r=>`<tr>
      <td style="font-size:12px">${escHtml(r.telefone||'')}</td>
      <td style="font-size:11px;color:var(--tx-4)">${r.created_at?new Date(r.created_at).toLocaleString('pt-BR'):'—'}</td>
      <td><span class="badge ${r.origem==='humano_voz'?'b-yellow':'b-purple'}" style="font-size:10px">${r.origem==='humano_voz'?'Avulsa':'Lote'}</span></td>
    </tr>`).join('');
  } catch(e){}
}

// Hook init to also load history
const _origInitLig = typeof init_ligacoes !== 'undefined' ? init_ligacoes : async function(){};
init_ligacoes = async function() {
  await _origInitLig();
  await carregarHistoricoVoz();
  // Load campanhas for lote
  const u = getUser();
  try {
    const rows = await sb.get('MARKETPLACE', `usuario_id=eq.${u.id}&select=campanha&not.campanha.is.null`);
    const cams = [...new Set((rows||[]).map(r=>r.campanha).filter(Boolean))];
    const sel = document.getElementById('vozBatchCamp');
    if (sel) cams.forEach(c => { const o=document.createElement('option'); o.value=o.textContent=c; sel.appendChild(o); });
  } catch(e){}
};

function escHtml(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
