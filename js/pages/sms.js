
function calcCustoSMS() {
  const u   = getUser();
  const c   = getCarteira();
  const qtd = parseInt(document.getElementById('calcSmsQtd')?.value) || 0;
  const bonus = u?.bonus_sms_restante || 0;
  const custo = c?.valor_venda_sms || 0.22;

  const doBonus  = Math.min(qtd, bonus);
  const avulsos  = Math.max(0, qtd - bonus);
  const total    = avulsos * custo;

  const elBonus = document.getElementById('calcSmsBonus');
  const elCusto = document.getElementById('calcSmsCusto');
  const elTotal = document.getElementById('calcSmsTotal');
  if (elBonus) elBonus.textContent = doBonus + ' SMS';
  if (elCusto) elCusto.textContent = `R$ ${(avulsos * custo).toFixed(2).replace('.', ',')}`;
  if (elTotal) elTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

async function init_sms() {
  const u = getUser();
  const c = getCarteira();
  document.getElementById('sSMSBonus').textContent = u.bonus_sms_restante || 0;
  document.getElementById('sSaldo').textContent = `R$ ${(c?.saldo_reais||0).toFixed(2).replace('.',',')}`;
  const custo = c?.valor_venda_sms || 0.22;
  document.getElementById('sCustoSMS').textContent = `R$ ${custo.toFixed(2).replace('.',',')}`;

  // Carrega campanhas
  try {
    const rows = await sb.get('MARKETPLACE', `usuario_id=eq.${u.id}&select=campanha&not.campanha.is.null`);
    const cams = [...new Set((rows||[]).map(r=>r.campanha).filter(Boolean))];
    const sel = document.getElementById('smsBatchCamp');
    cams.forEach(c => { const o=document.createElement('option'); o.value=o.textContent=c; sel.appendChild(o); });
  } catch(e){}

  // Histórico
  await carregarHistoricoSMS();
  calcCustoSMS();
}

async function carregarHistoricoSMS() {
  const u = getUser();
  try {
    const rows = await sb.get('CONVERSAS',
      `usuario_id=eq.${u.id}&origem=in.(humano_sms,campanha_sms)&select=telefone,mensagem,created_at,origem&order=created_at.desc&limit=50`
    );
    const tbody = document.getElementById('smsHistorico');
    if (!rows?.length){ tbody.innerHTML=`<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--tx-3)">Nenhum SMS enviado ainda</td></tr>`; return; }
    tbody.innerHTML = rows.map(r=>`<tr>
      <td style="font-size:12px">${escHtml(r.telefone||'')}</td>
      <td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(truncate(r.mensagem||'',60))}</td>
      <td style="font-size:11px;color:var(--tx-4)">${r.created_at?new Date(r.created_at).toLocaleString('pt-BR'):'—'}</td>
      <td><span class="badge ${r.origem==='humano_sms'?'b-blue':'b-purple'}" style="font-size:10px">${r.origem==='humano_sms'?'Avulso':'Lote'}</span></td>
    </tr>`).join('');
  } catch(e){}
}

function smsContarChars() {
  const n = document.getElementById('smsMensagem').value.length;
  document.getElementById('smsCharsUsados').textContent = n;
  // Preview de custo
  const c = getCarteira();
  const custo = c?.valor_venda_sms || 0.22;
  const u = getUser();
  const bonus = u.bonus_sms_restante || 0;
  const prev = document.getElementById('smsCustoPreview');
  if (n > 0) {
    prev.style.display='flex';
    prev.innerHTML = bonus > 0
      ? `Custo estimado: <strong>R$ 0,00</strong> — usará 1 bônus SMS (restam ${bonus})`
      : `Custo estimado: <strong>R$ ${custo.toFixed(2).replace('.',',')}</strong> — debitado do saldo`;
  } else { prev.style.display='none'; }
}

function smsBatchContarChars() {
  const n = document.getElementById('smsBatchMsg').value.length;
  document.getElementById('smsBatchContador').textContent = `${n}/160`;
}

async function enviarSMSAvulso() {
  const u = getUser(); const c = getCarteira();
  const numero = document.getElementById('smsNumero').value.trim().replace(/\D/g,'');
  const msg    = document.getElementById('smsMensagem').value.trim();
  if (!numero){ showToast('Informe o número de destino','warning'); return; }
  if (!msg)   { showToast('Escreva a mensagem','warning'); return; }

  const sms = u.bonus_sms_restante||0, saldo = c?.saldo_reais||0;
  if (sms===0 && saldo<=0){ showToast('Sem saldo. Recarregue na Carteira.','warning'); nav('carteira'); return; }
  const custo = c?.valor_venda_sms||0.22;
  if (!confirm(`Enviar SMS para ${numero}?\nCusto: R$ ${custo.toFixed(2)} ${sms>0?'(bônus)':'(saldo)'}`)) return;
  try {
    await callWebhook('prospect-ia-disparo',{ tipo:'sms', telefone:numero, mensagem:msg, usuario_id:u.id });
    if (sms>0){ await sb.patch('USUARIOS',`id=eq.${u.id}`,{bonus_sms_restante:sms-1}); window.S.user.bonus_sms_restante=sms-1; }
    await sb.post('CONVERSAS',{ usuario_id:u.id, telefone:numero, mensagem:msg, origem:'humano_sms', lida:true });
    document.getElementById('smsNumero').value='';
    document.getElementById('smsMensagem').value='';
    document.getElementById('smsCustoPreview').style.display='none';
    document.getElementById('smsCharsUsados').textContent='0';
    updateFinPill(); await carregarHistoricoSMS();
    showToast('SMS enviado!','success');
  } catch(e){ showToast('Erro ao enviar SMS','error'); console.error(e); }
}

async function dispararSMSLote() {
  if (!checkPlano('sms_lote')) return;
  const u = getUser(); const c = getCarteira();
  const msg = document.getElementById('smsBatchMsg').value.trim();
  if (!msg){ showToast('Escreva a mensagem do lote','warning'); return; }

  const src = document.querySelector('input[name="smsBatchSrc"]:checked')?.value;
  let leads = [];

  if (src === 'campanha') {
    const camp = document.getElementById('smsBatchCamp').value;
    if (!camp){ showToast('Selecione uma campanha','warning'); return; }
    const filtroStatus = document.getElementById('smsBatchFiltroStatus').value;
    const filtroScore  = document.getElementById('smsBatchFiltroScore').value;
    let q = `usuario_id=eq.${u.id}&campanha=eq.${encodeURIComponent(camp)}&select=telefone,empresa,cidade,score,status_crm`;
    if (filtroStatus) q += `&status_crm=eq.${filtroStatus}`;
    try {
      let rows = await sb.get('MARKETPLACE', q);
      if (filtroScore === 'hot')  rows = rows.filter(r=>parseInt(r.score||0)>=70);
      if (filtroScore === 'warm') rows = rows.filter(r=>{ const s=parseInt(r.score||0); return s>=40&&s<70; });
      leads = rows || [];
    } catch(e){ showToast('Erro ao buscar leads','error'); return; }
  } else {
    const file = document.getElementById('smsBatchFile').files[0];
    if (!file){ showToast('Selecione o arquivo CSV','warning'); return; }
    const text = await file.text();
    const linhas = text.trim().split('\n').slice(1);
    leads = linhas.map(l => ({ telefone: l.split(',')[0]?.replace(/\D/g,'').trim() })).filter(l=>l.telefone?.length>=8);
  }

  if (!leads.length){ showToast('Nenhum lead encontrado para disparar','warning'); return; }

  const sms = u.bonus_sms_restante||0, saldo = c?.saldo_reais||0;
  const custo = c?.valor_venda_sms||0.22;
  const totalCusto = Math.max(0, leads.length - sms) * custo;
  if (!confirm(`Enviar SMS para ${leads.length} leads?\nBônus: ${Math.min(sms,leads.length)} | Saldo: R$ ${totalCusto.toFixed(2)}\n\nTotal: ${leads.length} mensagens`)) return;

  const prev = document.getElementById('smsBatchPreview');
  prev.style.display='flex'; prev.innerHTML=`Disparando 0/${leads.length}...`;

  let ok=0;
  for (const lead of leads) {
    const msgFinal = msg.replace('{empresa}',lead.empresa||'').replace('{cidade}',lead.cidade||'');
    try {
      await callWebhook('prospect-ia-disparo',{ tipo:'sms', telefone:lead.telefone, mensagem:msgFinal, usuario_id:u.id });
      await sb.post('CONVERSAS',{ usuario_id:u.id, telefone:lead.telefone, mensagem:msgFinal, origem:'campanha_sms', lida:true });
      ok++;
      prev.innerHTML = `Disparando ${ok}/${leads.length}...`;
      await new Promise(r=>setTimeout(r,300));
    } catch(e){}
  }
  prev.innerHTML = `✅ ${ok}/${leads.length} SMS enviados`;
  updateFinPill(); await carregarHistoricoSMS();
  showToast(`${ok} SMS enviados!`,'success');
}

function toggleSmsBatchSrc(src) {
  document.getElementById('smsBatchCampanha').style.display = src==='campanha' ? '' : 'none';
  document.getElementById('smsBatchUpload').style.display   = src==='upload'   ? '' : 'none';
}

function truncate(s,n) { return s.length>n?s.substring(0,n)+'…':s; }
function escHtml(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
