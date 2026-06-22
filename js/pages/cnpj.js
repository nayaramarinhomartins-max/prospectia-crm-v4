// WEBHOOKS
const WEBHOOK_CNPJ = 'https://painel.prospectia.space/webhook/consulta-cnpj';
const WEBHOOK_REDES_SOCIAIS = 'https://painel.prospectia.space/webhook/buscar-redes-sociais';

// ESTADO LOCAL
let _dadosConsulta = null;

// MASCARA
function mascararCnpj(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2');
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
  v = v.replace(/(\d{4})(\d)/, '$1-$2');
  input.value = v;
}

// ESTADOS DA UI
function mostrarEstado(estado) {
  document.getElementById('cnpjVazio').style.display     = estado === 'vazio'     ? 'block' : 'none';
  document.getElementById('cnpjLoading').style.display   = estado === 'loading'   ? 'block' : 'none';
  document.getElementById('cnpjErro').style.display      = estado === 'erro'      ? 'block' : 'none';
  document.getElementById('cnpjResultado').style.display = estado === 'resultado' ? 'block' : 'none';
}

// BUSCA CNPJ
async function buscarCnpj() {
  const input = document.getElementById('inputCnpj');
  const cnpj = input.value.replace(/\D/g, '');

  if (cnpj.length !== 14) {
    showToast('Informe um CNPJ valido com 14 digitos.', 'warning');
    return;
  }

  mostrarEstado('loading');
  _dadosConsulta = null;

  try {
    const r = await fetch(WEBHOOK_CNPJ, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj })
    });

    const d = await r.json();

    if (d.erro || !d.razao_social) {
      mostrarEstado('erro');
      return;
    }

    _dadosConsulta = { ...d, cnpj };
    preencherResultado(d, cnpj);
    adicionarHistorico(d, cnpj);
    mostrarEstado('resultado');

    // Busca redes sociais em paralelo sem travar a UI
    buscarRedesSociais(d.razao_social);

  } catch (e) {
    mostrarEstado('erro');
    showToast('Erro ao conectar com o servidor.', 'error');
  }
}

// BUSCA REDES SOCIAIS
async function buscarRedesSociais(nomeEmpresa) {
  preencherRedesSociais(null);

  try {
    const r = await fetch(WEBHOOK_REDES_SOCIAIS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome_empresa: nomeEmpresa })
    });

    const d = await r.json();

    if (d.erro) {
      preencherRedesSociais({});
      return;
    }

    if (_dadosConsulta) {
      _dadosConsulta.linkedin  = d.linkedin  || null;
      _dadosConsulta.instagram = d.instagram || null;
      _dadosConsulta.facebook  = d.facebook  || null;
    }

    preencherRedesSociais(d);

  } catch (e) {
    preencherRedesSociais({});
  }
}

// PREENCHE RESULTADO CNPJ
function preencherResultado(d, cnpj) {
  const set = function(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '-';
  };

  set('resRazao',    d.razao_social);
  set('resFantasia', d.nome_fantasia || d.razao_social);
  set('resCnae',     d.cnae);
  set('resPorte',    formatarPorte(d.porte));
  set('resTelefone', formatarTelefone(d.telefone));
  set('resEmail',    d.email ? d.email.toLowerCase() : '-');
  set('resAbertura', formatarData(d.data_abertura));
  set('resCapital',  formatarMoeda(d.capital_social));
  set('resEndereco', d.endereco);

  const badge = document.getElementById('resSituacaoBadge');
  if (badge) {
    const ativa = (d.situacao || '').toUpperCase().includes('ATIVA');
    badge.textContent = d.situacao || '-';
    badge.className = 'badge ' + (ativa ? 'b-green' : 'b-red');
  }

  preencherRedesSociais(null);
}

// PREENCHE REDES SOCIAIS
function preencherRedesSociais(d) {
  const bloco = document.getElementById('resRedesSociais');
  if (!bloco) return;

  if (d === null) {
    bloco.innerHTML = '<div class="text-xs tx-3" style="margin-top:4px">Buscando redes sociais...</div>';
    return;
  }

  const redes = [
    { key: 'linkedin',  label: 'LinkedIn',  cor: '#0077b5', icon: 'in' },
    { key: 'instagram', label: 'Instagram', cor: '#e1306c', icon: 'ig' },
    { key: 'facebook',  label: 'Facebook',  cor: '#1877f2', icon: 'fb' }
  ];

  const encontradas = redes.filter(function(r) { return d[r.key]; });

  if (!encontradas.length) {
    bloco.innerHTML = '<div class="text-xs tx-3" style="margin-top:4px">Nenhuma rede social encontrada.</div>';
    return;
  }

  bloco.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
    encontradas.map(function(r) {
      return '<a href="' + d[r.key] + '" target="_blank" rel="noopener" ' +
        'style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;' +
        'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);' +
        'border-radius:99px;font-size:12px;font-weight:500;color:var(--tx-2);' +
        'text-decoration:none;transition:background .15s" ' +
        'onmouseover="this.style.background=\'rgba(255,255,255,0.08)\'" ' +
        'onmouseout="this.style.background=\'rgba(255,255,255,0.04)\'">' +
        '<span style="width:18px;height:18px;background:' + r.cor + ';border-radius:4px;' +
        'display:inline-flex;align-items:center;justify-content:center;' +
        'font-size:9px;font-weight:800;color:#fff">' + r.icon + '</span>' +
        r.label + '</a>';
    }).join('') +
  '</div>';
}

// SALVAR COMO LEAD
async function salvarComoLead() {
  if (!_dadosConsulta) return;
  const u = getUser();

  const lead = {
    usuario_id:    u.id,
    nome_empresa:  _dadosConsulta.razao_social,
    nome_fantasia: _dadosConsulta.nome_fantasia || '',
    telefone:      _dadosConsulta.telefone ? _dadosConsulta.telefone.replace(/\D/g, '') : '',
    email:         _dadosConsulta.email || '',
    cidade:        _dadosConsulta.cidade || '',
    estado:        _dadosConsulta.estado || '',
    cnpj:          _dadosConsulta.cnpj,
    cnae:          _dadosConsulta.cnae || '',
    endereco:      _dadosConsulta.endereco || '',
    linkedin:      _dadosConsulta.linkedin  || null,
    instagram:     _dadosConsulta.instagram || null,
    facebook:      _dadosConsulta.facebook  || null,
    origem:        'consulta_cnpj',
    status:        'novo'
  };

  try {
    await sb.post('MARKETPLACE', lead);
    showToast('Lead salvo com sucesso!', 'success');
  } catch (e) {
    if (e?.message?.includes('duplicate') || e?.code === '23505') {
      showToast('Este CNPJ ja esta cadastrado.', 'warning');
    } else {
      showToast('Erro ao salvar lead.', 'error');
    }
  }
}

// HISTORICO
const HISTORICO_KEY = 'cnpj_historico';

function adicionarHistorico(d, cnpj) {
  const historico = carregarHistorico();
  const idx = historico.findIndex(function(h) { return h.cnpj === cnpj; });
  if (idx > -1) historico.splice(idx, 1);

  historico.unshift({
    cnpj:          cnpj,
    razao_social:  d.razao_social,
    cidade:        d.cidade,
    estado:        d.estado,
    situacao:      d.situacao,
    consultado_em: new Date().toISOString()
  });

  if (historico.length > 20) historico.pop();
  localStorage.setItem(HISTORICO_KEY, JSON.stringify(historico));
  renderizarHistorico();
}

function carregarHistorico() {
  try {
    return JSON.parse(localStorage.getItem(HISTORICO_KEY) || '[]');
  } catch (e) { return []; }
}

function limparHistorico() {
  if (!confirm('Limpar todo o historico de consultas?')) return;
  localStorage.removeItem(HISTORICO_KEY);
  renderizarHistorico();
}

function renderizarHistorico() {
  const lista = document.getElementById('historicoLista');
  const vazio = document.getElementById('historicoVazio');
  const historico = carregarHistorico();

  if (!historico.length) {
    if (lista) lista.innerHTML = '';
    if (vazio) vazio.style.display = 'block';
    return;
  }

  if (vazio) vazio.style.display = 'none';

  if (lista) {
    lista.innerHTML = historico.map(function(h) {
      return '<div onclick="reConsultar(\'' + h.cnpj + '\')" ' +
        'style="padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;transition:background .15s" ' +
        'onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" ' +
        'onmouseout="this.style.background=\'transparent\'">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
            '<div style="min-width:0">' +
              '<div class="text-sm fw-600" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + h.razao_social + '</div>' +
              '<div class="text-xs tx-3" style="margin-top:2px">' + formatarCnpjDisplay(h.cnpj) + ' - ' + (h.cidade || '') + (h.estado ? ' - ' + h.estado : '') + '</div>' +
            '</div>' +
            '<span class="badge ' + ((h.situacao || '').toUpperCase().includes('ATIVA') ? 'b-green' : 'b-red') + '" style="font-size:10px;flex-shrink:0">' + (h.situacao || '-') + '</span>' +
          '</div>' +
          '<div class="text-xs tx-3" style="margin-top:4px">' + formatarDataHora(h.consultado_em) + '</div>' +
        '</div>';
    }).join('');
  }
}

function reConsultar(cnpj) {
  document.getElementById('inputCnpj').value = formatarCnpjDisplay(cnpj);
  buscarCnpj();
}

// FORMATADORES
function formatarCnpjDisplay(cnpj) {
  const c = (cnpj || '').replace(/\D/g, '');
  if (c.length !== 14) return cnpj;
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function formatarTelefone(tel) {
  if (!tel) return '-';
  const t = tel.replace(/\D/g, '');
  if (t.length === 10) return t.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  if (t.length === 11) return t.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  return tel;
}

function formatarData(data) {
  if (!data) return '-';
  const d = new Date(data + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

function formatarDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function formatarMoeda(val) {
  if (!val) return '-';
  return parseFloat(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarPorte(porte) {
  const map = {
    'ME':     'Microempresa',
    'EPP':    'Pequeno Porte',
    'MEDIO':  'Medio Porte',
    'DEMAIS': 'Demais'
  };
  return map[porte] || porte || '-';
}

// INIT
function init_cnpj() {
  mostrarEstado('vazio');
  renderizarHistorico();
}
