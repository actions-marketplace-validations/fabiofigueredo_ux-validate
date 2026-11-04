// Mensagens em português do Brasil. Mantenha as mesmas chaves de en.js.
const plural = (n, um, varios) => (n === 1 ? um : varios);

export default {
  status: {
    created: 'criado',
    kept: 'mantido',
    updated: 'atualizado',
    mcpInvalid: 'ignorado (JSON inválido; adicione o Playwright MCP manualmente)',
    mcpKept: 'mantido (Playwright MCP já configurado)',
    mcpAdded: 'atualizado (Playwright MCP adicionado)',
  },

  cli: {
    help: `ux-validate — testes de conteúdo, navegação, interface e acessibilidade guiados por personas

Uso:
  ux-validate init   [--yes] [--force]          Configura o projeto e instala os comandos no seu agente de IA
  ux-validate check  [--out <dir>] [--url <url>] Roda as checagens fixas (acessibilidade, links, ortografia, conteúdo)
  ux-validate report [--run <dir>]               Gera report.md e report.html a partir de uma execução
  ux-validate persona new [--force]              Cria uma persona com um assistente passo a passo
  ux-validate persona validate [arquivos…]       Confere arquivos de persona (padrão: todos do projeto)
  ux-validate fix    [--run <dir>] [--ids A001,C003] [--severity high] [--dry-run] [--yes]
                                                 Aplica as correções do relatório com o modelo configurado
                                                 no setup (usa a sua API key e os seus tokens)

Opções gerais:
  --config <arquivo>   Caminho do arquivo de configuração (padrão: ux-validate.config.yml)
  --lang <en|pt-BR>    Idioma das mensagens da ferramenta (padrão: o da configuração ou do sistema)
  -h, --help           Mostra esta ajuda
`,
    unknownCommand: 'Comando desconhecido: {command}',
  },

  config: {
    notFound: 'Configuração não encontrada em {path}. Rode "npx ux-validate init" primeiro.',
    unknownViewport: 'Viewport desconhecido: {list}. Use: {valid}.',
  },

  providers: {
    anthropic: 'Anthropic (Claude)',
    openai: 'OpenAI',
    google: 'Google (Gemini)',
    ollama: 'Ollama (modelo local)',
  },

  init: {
    title: 'ux-validate: configuração',
    localeQ: 'Idioma do ux-validate (mensagens, relatório e instruções do agente):',
    targetsQ: 'Em qual ferramenta de IA você vai usar os comandos?',
    soon: '(em breve)',
    urlQ: 'URL da aplicação a ser testada (ex.: http://localhost:3000):',
    startQ: 'Comando para subir a aplicação (opcional, ex.: npm run dev):',
    viewportsQ: 'Tamanhos de tela:',
    languageQ: 'Idioma do conteúdo da aplicação (para a verificação ortográfica):',
    languages: { 'pt-BR': 'Português (Brasil)', en: 'Inglês', es: 'Espanhol', other: 'Outro (sem verificação ortográfica)' },
    fixIntro:
      '\n  Para aplicar correções pelo terminal (npx ux-validate fix), o ux-validate chama um modelo de linguagem\n' +
      '  com a SUA API key; o consumo de tokens é cobrado na sua conta do provedor.',
    fixQ: 'Configurar um modelo para aplicar correções pelo terminal?',
    providerQ: 'Provedor do modelo de linguagem:',
    modelQ: 'Modelo:',
    apiKeyEnvQ: 'Nome da variável de ambiente que guarda a sua API key (a chave não fica no arquivo):',
    baseUrlQ: 'Endereço do servidor:',
    examplesQ: 'Criar personas de exemplo?',
    invalidUrl: 'URL inválida. Exemplo: http://localhost:3000',
    fileMissing: 'Esse arquivo não existe. Confira o caminho ou use a URL de um servidor (http://...).',
    urlProtocol: 'Use uma URL que comece com http://, https:// ou file://',
    configHeader:
      '# Configuração do ux-validate. Documentação: README.md do projeto ux-validate.\n' +
      '# A API key nunca fica neste arquivo: informe só o nome da variável de ambiente.\n',
    gitignoreComment: '# ux-validate: resultados das execuções',
    dictionaryTemplate:
      '# Dicionário do projeto para a verificação ortográfica do ux-validate.\n' +
      '# Uma palavra por linha: nomes próprios, marcas e termos técnicos que estão corretos\n' +
      '# mas que o dicionário não conhece. Linhas começando com # são ignoradas.\n',
    next: {
      title: '\nPróximos passos:',
      personas: '  1. Revise as personas em {dir}/ ou crie as suas: /persona-new (ou npx ux-validate persona new).',
      openTool: '  2. Abra o Claude Code neste projeto e aprove o servidor MCP "playwright".',
      runTest: '  3. Rode /persona-test  (ou /persona-test <persona> para uma só).',
      runFix: '  4. Para aplicar as correções do relatório: /persona-fix',
      cliFix: '\n  Correções pelo terminal: npx ux-validate fix (modelo {provider} · {model}).',
      setKey: '  Antes, defina a variável {env} com a sua API key:',
      keyPowerShell: '    PowerShell:  $env:{env}="sua-chave"',
      keyBash: '    macOS/Linux: export {env}=sua-chave',
    },
  },

  checks: {
    crawling: 'Rastreando {url} (até {max} páginas)…',
    cannotOpen: 'Não consegui abrir {url}. A aplicação está rodando?',
    noDictionary: '⚠ Sem dicionário para o idioma "{language}"; ortografia não será verificada.',
    spellingDisabled: '⚠ Verificação ortográfica desativada: {message}',
    analyzing: ({ n, viewport }) => `Analisando ${n} página(s) em ${viewport}…`,
    summary: ({ total, critical, high, medium, low }) =>
      `\n✔ ${total} problema(s): ${critical} crítico(s), ${high} alto(s), ${medium} médio(s), ${low} baixo(s)`,
    noText: '(sem texto)',
    nothing: 'nada',
    noResponse: 'sem resposta',
    failedRequest: 'falhou',
    targetLabel: 'Destino',
    linkedFromLabel: 'Linkado a partir de',
    emptyLink: {
      title: 'Link sem destino',
      description: 'O link "{text}" aponta para "{href}" e não leva a lugar nenhum.',
      suggestion: 'Aponte o link para a página correta ou remova-o até que o destino exista.',
    },
    externalLink: {
      title: 'Link externo quebrado',
      description: '"{text}" aponta para {url}, que respondeu {status}.',
      suggestion: 'Atualize ou remova o link externo.',
    },
    axe: {
      description: ({ text, n }) => `${text} (${n} elemento(s)).`,
      suggestion: '{help}. Veja exemplos de correção na documentação da regra "{rule}".',
      bestPractice: 'Boas práticas de acessibilidade',
    },
    console: {
      title: 'Erros de JavaScript no console',
      description: ({ n }) => `${n} erro(s) ao carregar a página. Funcionalidades podem estar quebradas.`,
      suggestion: 'Corrija os erros listados; eles costumam indicar botões ou componentes que não funcionam.',
    },
    network: {
      title: 'Recursos que não carregaram',
      description: ({ n }) => `${n} requisição(ões) falharam (imagens, scripts, APIs).`,
      suggestion: 'Verifique caminhos de arquivos e endpoints de API.',
    },
    overflow: {
      title: 'Conteúdo maior que a tela (rolagem horizontal)',
      description: 'A página é {px}px mais larga que a tela em {viewport}.',
      suggestion: 'Procure larguras fixas (width em px), imagens sem max-width: 100% ou tabelas sem rolagem própria.',
    },
    tinyText: {
      title: 'Texto pequeno demais para ler',
      description: ({ n }) => `${n} trecho(s) com fonte menor que 12px.`,
      suggestion: 'Use no mínimo 14px para texto corrido e 12px para legendas.',
    },
    leftover: {
      lorem: 'Texto de preenchimento (lorem ipsum)',
      todo: 'Marcador de desenvolvimento (TODO/FIXME) visível',
      codeValue: 'Valor de código exposto (undefined, NaN, [object Object])',
      template: 'Variável de template não renderizada',
      aiText: 'Resposta de IA colada no conteúdo',
      fakeData: 'Dado fictício de exemplo',
      placeholder: 'Texto provisório (placeholder)',
      description: 'Encontrado na página: "{match}".',
      suggestion: 'Substitua pelo conteúdo real ou remova o trecho.',
    },
    duplicateTitle: {
      title: 'Páginas diferentes com o mesmo título',
      description: '{n} páginas usam o título "{title}"; na aba do navegador e nos buscadores elas parecem iguais.',
      empty: '(vazio)',
      suggestion: 'Dê a cada página um <title> que descreva seu conteúdo.',
    },
    homeDown: {
      title: 'A página inicial não abre ({status})',
      description: '{url} respondeu {status}.',
      suggestion: 'Verifique se a aplicação está no ar e se a URL configurada está correta.',
    },
    brokenLink: {
      title404: 'Link para página que não existe (404)',
      title: 'Link interno quebrado',
      description: ({ n, url, status }) => `${n} página(s) apontam para ${url}, que não abre (${status}).`,
      suggestion: 'Corrija o endereço do link ou crie a página de destino.',
    },
    axeExtra: {
      'target-size': {
        help: 'Alvos de toque devem ter pelo menos 24×24px ou espaço suficiente ao redor',
        description: 'Garante que botões e links sejam fáceis de tocar sem acertar o vizinho por engano',
      },
    },
  },

  aria: {
    roleNoFocus: {
      title: 'Widget com papel ARIA que não recebe foco do teclado',
      description: ({ n }) =>
        `${n} elemento(s) declaram um papel interativo (role) mas não podem ser alcançados com Tab. Quem usa teclado ou leitor de tela ouve "botão", "aba"… e não consegue acioná-lo.`,
      heuristic: 'WCAG 2.1.1, 4.1.2 · WAI-ARIA APG: Keyboard Interaction',
      suggestion:
        'Prefira o elemento nativo (<button>, <a href>, <input type="checkbox">). Se precisar do role, adicione tabindex="0" e trate Enter/Espaço (ou as setas, em widgets compostos).',
    },
    clickable: {
      title: 'Elemento clicável inacessível pelo teclado',
      description: ({ n }) =>
        `${n} elemento(s) parecem clicáveis (onclick ou cursor de mão) mas não são botões nem links: não recebem foco e não são anunciados como interativos.`,
      heuristic: 'WCAG 2.1.1, 4.1.2 · WAI-ARIA: primeira regra do ARIA (use HTML nativo)',
      suggestion: 'Troque por <button type="button"> (ação) ou <a href> (navegação). Não basta adicionar role="button": ainda faltariam foco e teclado.',
    },
    placeholderOnly: {
      title: 'Campo de formulário identificado só pelo placeholder',
      description: ({ n }) =>
        `${n} campo(s) não têm rótulo (label, aria-label ou aria-labelledby). O placeholder some ao digitar e não é anunciado de forma confiável por leitores de tela.`,
      heuristic: 'WCAG 1.3.1, 3.3.2, 4.1.2',
      suggestion: 'Adicione <label for="id-do-campo"> visível. Se o layout não permitir, use aria-label com o mesmo texto.',
    },
    trap: {
      title: 'Armadilha de teclado: o foco fica preso',
      description: 'Depois de chegar em "{name}", apertar Tab não leva a lugar nenhum. Quem usa teclado fica preso e não consegue continuar na página.',
      heuristic: 'WCAG 2.1.2 (Sem armadilha de teclado)',
      suggestion: 'Verifique scripts que chamam focus() ou capturam a tecla Tab. Em diálogos modais, o foco deve circular dentro do diálogo e sair com Esc.',
    },
    noIndicator: {
      title: 'Foco do teclado invisível',
      description: ({ n }) => `${n} elemento(s) não mudam de aparência ao receber foco. Quem navega pelo teclado não sabe onde está na página.`,
      heuristic: 'WCAG 2.4.7 (Foco visível)',
      suggestion: 'Não remova o outline sem substituir. Use, por exemplo, :focus-visible { outline: 3px solid #1a5fd0; outline-offset: 2px; }.',
    },
    hiddenFocus: {
      title: 'Foco vai para elemento escondido',
      description: ({ n }) => `${n} elemento(s) recebem foco mas estão fora da tela ou sem tamanho. O usuário aperta Tab e "some" da página.`,
      heuristic: 'WCAG 2.4.3, 2.4.7',
      suggestion: 'Elementos escondidos não devem receber foco: use hidden, display:none ou inert. Links "pular para o conteúdo" devem aparecer ao receber foco.',
    },
    expanded: {
      title: 'aria-expanded não acompanha o abrir e fechar',
      description: ({ n }) =>
        `${n} controle(s) abrem ou fecham conteúdo, mas o atributo aria-expanded não muda. O leitor de tela continua anunciando o estado antigo ("recolhido" quando está aberto).`,
      heuristic: 'WCAG 4.1.2 · WAI-ARIA APG: Disclosure / Accordion',
      suggestion: 'Ao abrir, defina aria-expanded="true"; ao fechar, "false". Ligue o botão ao conteúdo com aria-controls.',
    },
  },

  spelling: {
    unknown: {
      title: 'Possíveis erros de ortografia',
      description: ({ n, language, dictionary }) =>
        `${n} palavra(s) não reconhecidas pelo dicionário (${language}). Erros de ortografia passam descuido e reduzem a confiança no site. ` +
        `Nomes próprios e termos técnicos podem aparecer aqui: adicione-os a ${dictionary} (uma palavra por linha).`,
      heuristic: 'Confiabilidade do conteúdo (ortografia)',
      suggestion: 'Corrija as palavras usando as sugestões. Para termos corretos que o dicionário não conhece, inclua-os no dicionário do projeto.',
    },
    foreign: {
      title: 'Palavras em inglês no meio do texto',
      description: ({ n, language }) =>
        `${n} palavra(s) em inglês num conteúdo em ${language}. Quem não lê inglês pode não entender rótulos e botões.`,
      heuristic: 'Nielsen #2: correspondência com o mundo real',
      suggestion:
        'Traduza os termos (ex.: "Pricing" → "Preços", "Get started" → "Começar"). Se o termo em inglês for intencional (marca, jargão do público), adicione-o ao dicionário do projeto.',
    },
  },

  report: {
    title: 'Relatório ux-validate',
    generated: '✔ Relatório gerado:',
    noRun: 'Nenhuma execução encontrada. Rode /persona-test ou "npx ux-validate check".',
    noData: 'Nem checks.json nem findings.json em {dir}.',
    invalidJson: '{file} não é um JSON válido: {message}',
    generalPersona: 'Geral (sem persona)',
    app: 'Aplicação',
    date: 'Data',
    evaluatedBy: 'Avaliado por',
    pagesAnalyzed: 'Páginas analisadas',
    pagesCount: ({ n }) => `${n} página(s)`,
    scoresTitle: 'Notas por persona',
    persona: 'Persona',
    overall: 'Geral',
    goalsDone: 'Objetivos cumpridos',
    goals: 'Objetivos',
    steps: 'passos',
    blockers: 'Bloqueios',
    fixFirst: 'Corrigir primeiro',
    noTop: 'Nenhum problema crítico ou alto. 🎉',
    applyFixes:
      '**Para aplicar as correções:** rode `/persona-fix` no Claude Code (usa o modelo e a conta da ferramenta) ou `npx ux-validate fix` no terminal (usa o modelo e a API key configurados no setup). Ambos mostram cada mudança antes de gravar.',
    applyFixesHtml:
      '<strong>Para aplicar as correções:</strong> rode <code>/persona-fix</code> no Claude Code (usa o modelo e a conta da ferramenta) ou <code>npx ux-validate fix</code> no terminal (usa o modelo e a API key configurados no setup). Ambos mostram cada mudança antes de gravar.',
    noIssues: 'Nenhum problema encontrado.',
    noIssuesHtml: 'Nenhum problema encontrado. 🎉',
    severity: 'Gravidade',
    origin: 'Origem',
    originAgent: 'avaliação por persona',
    originCheck: 'checagem ({name})',
    confidence: 'Confiança',
    confirmed: 'confirmado',
    likely: 'provável',
    personas: 'Personas',
    screens: 'Telas',
    page: 'Página',
    criterion: 'Critério',
    whereToFix: 'Onde corrigir',
    elements: 'Elemento(s)',
    element: 'Elemento',
    ariaTree: 'Árvore de acessibilidade da página',
    screenReader: 'Leitor de tela',
    howToFix: 'Como corrigir',
    reference: 'referência',
    referenceHtml: 'Referência',
    issues: 'Problemas',
    all: 'Todos',
    tagPersona: 'persona',
    tagCheck: 'checagem: {name}',
    seeScreenshot: 'Ver screenshot',
    screenshotOf: 'Screenshot de {page}',
    severities: { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo' },
    categories: { content: 'Conteúdo', navigation: 'Navegação', ui: 'Interface', accessibility: 'Acessibilidade' },
    outcomes: { success: '✅ Conseguiu', partial: '⚠️ Em parte', fail: '❌ Não conseguiu' },
  },

  fix: {
    noModel:
      'Nenhum modelo configurado para correções. Rode "npx ux-validate init" e configure um modelo para o terminal ' +
      '(provedor, modelo e API key), ou use /persona-fix dentro do Claude Code.',
    noRun: 'Nenhuma execução encontrada. Rode "npx ux-validate check" ou /persona-test primeiro.',
    invalidSeverity: 'Gravidade inválida: {value}. Use: {valid}.',
    nothingSelected: 'Nenhum problema selecionado para corrigir.',
    notLocated: 'Não encontrei o arquivo de origem no projeto.',
    plan: ({ n, files }) => `\n${n} problema(s) selecionado(s); ${files} arquivo(s) para corrigir.`,
    notLocatedList: '  (sem arquivo identificado: {ids})',
    estimate: '\nModelo: {provider} · {model}. Estimativa: ~{tokens} tokens de entrada, cobrados na sua conta.',
    needsYes: 'Confirmação necessária. Rode de novo com --yes para continuar sem perguntar.',
    confirmCall: 'Chamar o modelo para propor as correções?',
    confirmWrite: ({ n, file }) => `Gravar ${n} correção(ões) em ${file}?`,
    stopped: '  Interrompido: corrija o problema acima e rode de novo.',
    skippedLine: '  – {id}: pulado. {reason}',
    failedLine: '  ✖ {id}: edição descartada ({reason}).',
    appliedLine: '\n  ✔ {id}: {explanation}',
    reasons: {
      notSent: 'id de problema que não foi enviado para este arquivo',
      emptyFind: 'trecho a substituir vazio',
      notFound: 'o trecho a substituir não existe no arquivo',
      multiple: 'o trecho a substituir aparece mais de uma vez',
    },
    summary: {
      title: '\nResumo:',
      line1: '  {applied} aplicada(s), {proposed} proposta(s) sem gravar, {declined} recusada(s) por você,',
      line2: '  {skipped} pulada(s) pelo modelo, {failed} com erro, {notLocated} sem arquivo identificado.',
      tokens: '  Tokens usados: {input} de entrada, {output} de saída.',
      backup: '  Backup dos arquivos originais: {dir}',
      review: '  Revise as mudanças (ex.: git diff) e rode "npx ux-validate check" para confirmar as correções.',
    },
    systemPrompt: `Você corrige problemas de conteúdo, navegação, interface e acessibilidade em arquivos de uma aplicação web.
Você recebe um arquivo do projeto e uma lista de problemas encontrados por um teste de UX. Para cada problema que pode ser corrigido neste arquivo, proponha edições.

Regras:
- Cada edição troca um trecho exato do arquivo ("find") por um novo trecho ("replace"). Copie "find" exatamente como está no arquivo, com espaços e quebras de linha, e inclua contexto suficiente para que ele apareça uma única vez.
- Faça a menor mudança que resolve o problema. Mantenha o estilo, a indentação e as convenções do arquivo. Não reformate nem refatore o que não tem relação com o problema.
- Prefira HTML nativo e semântico a ARIA (ex.: <button> em vez de <div role="button">), seguindo o WAI-ARIA Authoring Practices.
- Textos para o usuário final ficam no idioma do conteúdo do site, claros e naturais.
- Nunca invente dados: telefones, preços, endereços, depoimentos, números de clientes, nomes. Se a correção depende de uma informação que você não tem, pule o problema e explique o que falta.
- Se o problema não está neste arquivo, ou a correção exige mudanças em outros arquivos, pule e explique.
- Escreva "explanation" e "reason" em português, em uma frase.`,
    promptLanguage: 'Idioma do conteúdo do site: {language}.',
    promptFile: 'Arquivo: {file}',
    promptIssues: 'Problemas a corrigir neste arquivo:',
  },

  llm: {
    unknownProvider: 'Provedor desconhecido: "{provider}". Use: {valid}.',
    noModel: 'Nenhum modelo configurado em standalone.model.',
    missingKey: ({ env }) =>
      `A variável de ambiente ${env} não está definida. Defina-a com a sua API key e rode de novo:\n` +
      `    PowerShell:   $env:${env}="sua-chave"\n` +
      `    macOS/Linux:  export ${env}=sua-chave`,
    invalidAnthropicKey: 'API key da Anthropic inválida ou sem permissão ({env}).',
    modelNotFound: 'Modelo não encontrado: {model}.',
    rateLimited: 'Limite de uso da API atingido. Tente de novo em alguns minutos.',
    badRequest: 'Pedido recusado pela API: {message}',
    apiError: 'Erro da API da Anthropic ({status}): {message}',
    refused: ({ explanation }) => `O modelo recusou o pedido${explanation ? `: ${explanation}` : ''}.`,
    truncated: 'A resposta foi cortada por ser longa demais.',
    noAnswer: ({ reason }) => `O modelo não respondeu${reason ? ` (bloqueado: ${reason})` : ''}.`,
    connect: 'Não consegui conectar a {host}: {message}',
    invalidKey: 'API key inválida ou sem permissão ({status}): {detail}',
    notFound: 'Modelo ou endereço não encontrado (404): {detail}',
    httpError: 'Erro da API ({status}): {detail}',
    invalidJson: 'O modelo não devolveu um JSON válido.',
    jsonFormat: 'Responda só com JSON neste formato (JSON Schema):',
  },

  persona: {
    title: 'ux-validate: nova persona',
    intro:
      'Descreva um tipo real de usuário da sua aplicação, não um estereótipo. Objetivos devem ser tarefas\n' +
      'concretas (ex.: "descobrir o preço do plano básico"), não desejos ("gostar do site").',
    nameQ: 'Nome (ex.: Dona Maria):',
    idQ: 'Identificador (usado no nome do arquivo e no relatório):',
    idInvalid: 'Use só letras minúsculas, números e hífen (ex.: dona-maria ou rafael-dev).',
    idExists: 'Já existe uma persona com o id "{id}". Escolha outro ou rode com --force para sobrescrever.',
    descriptionQ: 'Descrição curta (idade, ocupação, contexto, como usa tecnologia):',
    viewportQ: 'Em qual aparelho ela usa a sua aplicação?',
    viewports: { mobile: 'Celular (mobile)', tablet: 'Tablet', desktop: 'Computador (desktop)' },
    traits: {
      tech_literacy: {
        question: 'Familiaridade com tecnologia:',
        options: ['Baixa: usa o básico, se perde com jargão e ícones sem texto', 'Média: usa aplicativos do dia a dia sem dificuldade', 'Alta: experiente, usa atalhos e recursos avançados'],
      },
      vision: {
        question: 'Visão:',
        options: ['Normal', 'Reduzida: precisa de letras grandes e bom contraste', 'Daltonismo: não distingue informação passada só por cor', 'Leitor de tela: cega, navega só com teclado e leitor de tela'],
      },
      patience: {
        question: 'Paciência:',
        options: ['Baixa: desiste após poucos passos sem progresso', 'Média', 'Alta: insiste até conseguir'],
      },
      reading_level: {
        question: 'Nível de leitura:',
        options: ['Básico: pula textos longos, tem dificuldade com termos técnicos', 'Intermediário', 'Avançado: lê tudo, entende textos técnicos'],
      },
    },
    languageQ: 'Idioma em que ela lê (ex.: pt-BR, en, es):',
    goalsHint: 'Objetivos: o que essa pessoa vem fazer na sua aplicação? Um por linha; deixe vazio para terminar.',
    goalQ: 'Objetivo {n}:',
    expectationsHint: 'Expectativas (opcional): o que ela espera encontrar? Deixe vazio para pular.',
    expectationQ: 'Expectativa {n}:',
    preview: 'Arquivo da persona:',
    saveQ: 'Salvar esta persona?',
    cancelled: 'Persona não salva.',
    saved: '✔ Persona salva em {file}',
    next: '  Teste com ela: /persona-test {id}',
    fileHeader: '# Persona criada com "ux-validate persona new". Formato: .ux-validate/references/persona-format.md',
    validate: {
      parseError: 'YAML inválido: {message}',
      notObject: 'o arquivo precisa conter os campos da persona (id, name, viewport, goals…)',
      missingField: 'campo obrigatório ausente: {field}',
      invalidId: 'id inválido "{id}": use letras minúsculas, números e hífen',
      idMismatch: 'o id "{id}" é diferente do nome do arquivo ({file}); manter os dois iguais facilita achar a persona',
      invalidViewport: 'viewport inválido "{value}"; use: {valid}',
      goals: 'goals precisa ser uma lista de textos, com pelo menos um item',
      expectations: 'expectations precisa ser uma lista de textos',
      missingTrait: 'característica "{trait}" não definida; o agente vai supor um valor médio',
      invalidTrait: 'valor inválido "{value}" para {trait}; use: {valid}',
      duplicateId: 'o id "{id}" também é usado por {other}',
      fileMissing: 'arquivo não encontrado',
      noneFound: 'Nenhuma persona em {dir}. Crie uma com "npx ux-validate persona new" ou /persona-new.',
      summary: '{ok} de {total} persona(s) válidas.',
      failed: '{n} persona(s) com erro.',
    },
  },
};
