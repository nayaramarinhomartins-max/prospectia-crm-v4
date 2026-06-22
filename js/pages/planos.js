async function init_planos() {
  const u = getUser();
  const c = getCarteira();

  const plano = u.plano || 'start';
  const chip = document.getElementById('planoAtualChip');
  if (chip) {
    chip.textContent = plano.charAt(0).toUpperCase() + plano.slice(1);
    chip.className = `plan-chip ${plano}`;
  }

  if (u.data_vencimento_plano) {
    const v = new Date(u.data_vencimento_plano);
    const dias = Math.ceil((v - new Date()) / 86400000);
    const vencEl = document.getElementById('planoVencimento');
    if (vencEl) {
      vencEl.textContent = dias > 0 ? `Vence em ${dias} dias (${v.toLocaleDateString('pt-BR')})` : 'Plano vencido';
    }
  }

  const limites = CONFIG.PLAN_LIMITS[plano] || CONFIG.PLAN_LIMITS.start;
  const captados = u.leads_captados_mes || 0;
  const sms = u.bonus_sms_restante || 0;
  const voz = u.bonus_voz_restante || 0;

  const usageEl = document.getElementById('planoUsage');
  if (usageEl) {
    usageEl.innerHTML = `
      <div style="text-align:right">
        <div class="text-xs tx-3">Leads este mês</div>
        <div class="fw-700 text-sm">${captados} / ${limites.leads_mes}</div>
      </div>
      <div class="divider-v"></div>
      <div style="text-align:right">
        <div class="text-xs tx-3">SMS bônus</div>
        <div class="fw-700 text-sm" style="color:${sms > 0 ? 'var(--green)' : 'var(--tx-4)'}">${sms}</div>
      </div>
      <div class="divider-v"></div>
      <div style="text-align:right">
        <div class="text-xs tx-3">Voz bônus</div>
        <div class="fw-700 text-sm" style="color:${voz > 0 ? 'var(--green)' : 'var(--tx-4)'}">${voz}</div>
      </div>`;
  }

  ['start', 'pro', 'business'].forEach(p => {
    const el = document.getElementById(`card${p.charAt(0).toUpperCase() + p.slice(1)}`);
    if (el && p === plano) el.style.borderColor = 'var(--blue-400)';
  });
}

async function assinarPlano(plano, valor) {
  const u = getUser();
  const c = getCarteira();

  // Função para tratar o link e evitar bloqueio de pop-up
  const abrirPagamento = (r) => {
    const link = r?.link_pagamento || r?.invoiceUrl || r?.url;
    if (link) {
      showToast('Redirecionando...', 'success', 3000);
      window.location.href = link; 
    } else {
      showToast('Erro ao gerar link. Contate o suporte.', 'error');
    }
  };

  // Fluxo para cliente que já possui cadastro no Asaas
  if (c?.asaas_customer_id) {
    showToast('Gerando link de pagamento...', 'info', 2000);
    try {
      const r = await callWebhook('solicitar-recarga-prospect', {
        usuario_id: u.id,
        asaas_customer_id: c.asaas_customer_id,
        valor: parseFloat(valor)
      });
      abrirPagamento(r);
    } catch (e) {
      showToast('Erro de conexão. Tente novamente.', 'error');
      console.error(e);
    }
    return;
  }

  // Fluxo de cadastro novo (necessário CPF)
  if (!u.cpf) {
    showToast('CPF não cadastrado. Informe o CPF nas Configurações.', 'warning', 5000);
    return;
  }

  const telefone = u.telefone || await pedirTelefone();
  if (!telefone) return;

  showToast('Gerando link de pagamento...', 'info', 2000);

  try {
    const r = await callWebhook('cadastro-prospectia', {
      usuario_id: u.id,
      nome: u.nome_cliente || u.email,
      email: u.email,
      telefone: telefone.replace(/\D/g, ''),
      cpf: u.cpf.replace(/\D/g, ''),
      plano
    });
    abrirPagamento(r);
  } catch (e) {
    showToast('Erro de conexão. Tente novamente.', 'error');
    console.error(e);
  }
}

function pedirTelefone() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay open';
    overlay.innerHTML = `
      <div class="modal" style="max-width:360px">
        <div class="modal-head">
          <h3>Confirme seu telefone</h3>
          <button class="modal-close" onclick="this.closest('.overlay').remove()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="fg">
            <label class="lbl">Telefone com DDD</label>
            <input class="inp" id="inputTelPlano" type="tel" placeholder="11999999999" maxlength="15">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="btnCancelarTel">Cancelar</button>
          <button class="btn btn-primary" id="btnConfirmarTel">Continuar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#btnCancelarTel').onclick = () => {
      overlay.remove();
      resolve(null);
    };

    overlay.querySelector('#btnConfirmarTel').onclick = () => {
      const tel = overlay.querySelector('#inputTelPlano').value.trim();
      if (!tel || tel.replace(/\D/g, '').length < 10) {
        showToast('Informe um telefone válido com DDD', 'warning');
        return;
      }
      overlay.remove();
      resolve(tel);
    };
  });
}

let _planoSelecionado = null;

function confirmarPlano(nome, valor) {
  _planoSelecionado = { nome, valor };
  const nomeEl = document.getElementById('modalPlanoNome');
  const valorEl = document.getElementById('modalPlanoValor');
  if (nomeEl) nomeEl.textContent = 'Plano ' + nome;
  if (valorEl) valorEl.textContent = valor + '/mês';
  document.getElementById('modalPlano').classList.add('open');
}

function fecharModalPlano() {
  document.getElementById('modalPlano').classList.remove('open');
  _planoSelecionado = null;
}

function irParaPagamento() {
  if (!_planoSelecionado) return;
  const plano = _planoSelecionado.nome.toLowerCase();
  const valor = _planoSelecionado.valor.replace('R$ ', '').replace(',', '.');
  fecharModalPlano();
  assinarPlano(plano, valor);
}