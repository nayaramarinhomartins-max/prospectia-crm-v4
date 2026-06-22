let _valorRecarga = 0;

async function init_carteira() {
  // Força releitura da carteira do Supabase para pegar dados atualizados
  await refreshCarteira();

  const u = getUser();
  const c = getCarteira();

  const plano = u.plano || 'start';
  const planoLabel = plano.charAt(0).toUpperCase() + plano.slice(1);

  document.getElementById('cPlano').textContent     = planoLabel;
  document.getElementById('cPlanoChip').textContent = planoLabel;
  document.getElementById('cSMS').textContent        = u.bonus_sms_restante || 0;
  document.getElementById('cVoz').textContent        = u.bonus_voz_restante || 0;

  const saldo = c?.saldo_reais || 0;
  document.getElementById('cSaldo').textContent   = `R$ ${saldo.toFixed(2).replace('.',',')}`;
  document.getElementById('cSaldoInfo').textContent = `R$ ${saldo.toFixed(2).replace('.',',')}`;

  if (u.data_vencimento_plano) {
    const venc = new Date(u.data_vencimento_plano);
    const dias = Math.ceil((venc - new Date()) / 86400000);
    const label = dias > 0 ? `Vence em ${dias} dias` : 'Plano vencido';
    document.getElementById('cVenc').textContent    = label;
    document.getElementById('cVencData').textContent = venc.toLocaleDateString('pt-BR');
  }
}

function selValor(val, el) {
  _valorRecarga = val;
  document.querySelectorAll('.valor-btn').forEach(b => b.className = 'btn btn-secondary valor-btn');
  el.className = 'btn btn-primary valor-btn';
  document.getElementById('valorCustom').value = '';
}

function selCustom(val) {
  _valorRecarga = parseFloat(val) || 0;
  document.querySelectorAll('.valor-btn').forEach(b => b.className = 'btn btn-secondary valor-btn');
}

async function gerarCobranca() {
  if (_valorRecarga < 5) { showToast('Valor mínimo de R$ 5,00', 'warning'); return; }
  const u = getUser();
  const c = getCarteira();

  if (!c?.asaas_customer_id) {
    showToast('Configure seu perfil antes de recarregar', 'warning'); return;
  }

  const btn = document.getElementById('btnRecarregar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Gerando...';

  try {
    const result = await callWebhook('solicitar-recarga-prospect', {
      usuario_id: u.id,
      asaas_customer_id: c.asaas_customer_id,
      valor: _valorRecarga
    });

    if (result?.link_pagamento || result?.invoiceUrl) {
      document.getElementById('pixLink').value = result.link_pagamento || result.invoiceUrl;
      document.getElementById('pixModal').classList.add('open');
    } else {
      showToast('Erro ao gerar cobrança. Tente novamente.', 'error');
    }
  } catch(e) {
    showToast('Erro de conexão com o sistema de pagamentos', 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> Gerar PIX / Cartão';
  }
}

function closePixModal() { document.getElementById('pixModal').classList.remove('open'); }
function copyPixLink() {
  navigator.clipboard.writeText(document.getElementById('pixLink').value)
    .then(() => showToast('Link copiado!', 'success'));
}
function openRecarga() { document.getElementById('valorCustom').focus(); }