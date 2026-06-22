function init_ajuda() {
  buildFAQ();
  // Esconde o botão flutuante nessa página (já tem o botão inline)
  const floatBtn = document.getElementById('supportChatBtn');
  if (floatBtn) floatBtn.style.display = 'none';
}

function buildFAQ() {
  const faqs = [
    { q: 'Como conectar meu WhatsApp?', a: 'Vá em Configurações → Conexão WhatsApp → preencha o nome da sua instância → clique em "Conectar WhatsApp (QR Code)" → escaneie com seu celular. Se não souber o nome da instância, ele foi enviado no seu e-mail de boas-vindas.' },
    { q: 'O que é a captação automática?', a: 'É o sistema que busca novos contatos no Google Maps automaticamente, baseado no nicho e região que você configurou. Para ativar, vá em Captação de Leads e ligue a "Captação automática". O sistema roda todo dia útil das 8h às 16h.' },
    { q: 'Como funciona o Assistente SDR?', a: 'O Assistente SDR é uma IA que responde seus leads no WhatsApp automaticamente, conduzindo a conversa até o objetivo que você definiu (marcar reunião, fechar venda, etc). Configure em "Agente SDR" com informações sobre sua empresa e ative o toggle.' },
    { q: 'Como importar minha lista de contatos?', a: 'Vá em Leads → clique em "Importar Planilha" → baixe o modelo CSV → preencha com seus contatos → importe o arquivo. A coluna obrigatória é "telefone". As demais (empresa, cidade, categoria) são opcionais mas recomendadas.' },
    { q: 'O que significa o Score / Nível de interesse?', a: 'O score é calculado automaticamente pela IA baseado nas respostas do lead. Quanto maior o número, mais interessado está. Leads com score acima de 70 são considerados "quentes" e aparecem destacados nos relatórios.' },
    { q: 'Como assumir uma conversa manualmente?', a: 'Abra a conversa em "Conversas" → o modo de atendimento indica se está na IA ou manual. Para pausar a IA e responder você mesmo, altere o modo de atendimento do lead diretamente na conversa.' },
    { q: 'Como funcionam os bônus de SMS e voz?', a: 'Ao contratar um plano, você recebe créditos de bônus de SMS e voz. Eles são usados primeiro, antes do saldo. Os créditos vencem junto com o plano. Veja seu saldo em Carteira.' },
    { q: 'Quando o saldo é debitado?', a: 'O saldo é debitado no momento do envio de cada SMS ou ligação. Para SMS avulsos e em lote, o custo aparece na pré-visualização antes de confirmar o disparo.' },
    { q: 'Minha chave de IA fica segura?', a: 'Sim. Sua chave é armazenada de forma segura no banco de dados e usada apenas para alimentar o seu assistente SDR. Nunca é compartilhada ou usada em outras contas.' },
    { q: 'Como mudar o horário dos disparos?', a: 'Vá em Captação de Leads → ajuste as horas de início e fim → salve. O sistema só busca e envia mensagens dentro deste intervalo, em dias úteis.' },
  ];

  const container = document.getElementById('faqContainer');
  if (!container) return;

  container.innerHTML = faqs.map((f, i) => `
    <div class="faq-item" style="border:1px solid var(--border);border-radius:var(--r);margin-bottom:8px;overflow:hidden">
      <div class="faq-q" onclick="toggleFaq(${i})" style="padding:14px 16px;font-size:14px;font-weight:500;color:var(--tx);cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:var(--surface);transition:background .15s" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='var(--surface)'">
        ${f.q}
        <svg id="faq-arrow-${i}" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;transition:transform .25s"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div id="faq-${i}" style="max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s;font-size:13.5px;color:var(--tx-2);line-height:1.7;background:var(--surface-2);padding:0 16px">${f.a}</div>
    </div>`).join('');
}

function toggleFaq(i) {
  const el    = document.getElementById('faq-' + i);
  const arrow = document.getElementById('faq-arrow-' + i);
  const isOpen = el.style.maxHeight && el.style.maxHeight !== '0px';
  if (isOpen) {
    el.style.maxHeight = '0';
    el.style.padding   = '0 16px';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  } else {
    el.style.maxHeight = '300px';
    el.style.padding   = '14px 16px';
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  }
}

function baixarModeloCSV() {
  const csv = 'empresa,telefone,cidade,categoria,endereco\nPetshop Exemplo,5511999990000,São Paulo,Petshop,Rua das Flores 123\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'modelo_importacao.csv';
  a.click(); URL.revokeObjectURL(url);
}