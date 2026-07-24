PEMD-SP613-Seg

Ecossistema Integrado de Monitoramento Tático, Gestão de Rotas & Alertas
URL DA PLATAFORMA WEB: https://aladdinlab.com.br/apps/pemd-sp613-seg/

1. Descritivo Técnico

   O PEMD-SP613-Seg é uma solução corporativa de alta disponibilidade e resiliência projetada para operações de
segurança, rondas patrimoniais e acompanhamento de equipes em campo. Ela une a flexibilidade de um aplicativo móvel
Android de alta precisão a uma Plataforma web intuitiva e poderosa. Este ecossistema foi desenvolvido em uma parceria
entre o coletivo de desenvolvedores Aladdin Lab e o Instituto Brasflora para fortalecer os serviços de gestão,
monitoramento e vigilância no Parque Estadual do Morro do Diabo.

   DIFERENCIAL CHAVE (Resiliência Total e Offline-First):
Ao contrário dos sistemas tradicionais que interrompem o serviço ao perder a conexão, o PEMD-SP613-Seg foi
construído sob o conceito Offline-First com banco de dados local sincronizado em tempo real com a nuvem. O usuário
em campo grava rotas, áudios, fotos, vídeos e relatórios mesmo em áreas sem acesso à internet. Assim que a conexão é
reestabelecida, o aplicativo móvel realiza a sincronização automática com a nuvem e a Plataforma web.

2. Arquitetura Técnica & Stack Tecnológica
• URL da Plataforma Web:https://aladdinlab.com.br/apps/pemd-sp613-seg/
• Frontend Web (Plataforma):React 19 + TypeScript, Vite 6, Tailwind CSS 4, Motion/Framer
• Servidor & Middlewares:Node.js com Express 4, Proxy Reverso Nginx, Docker Container
• Geolocalização & Mapas:Leaflet.js + OpenStreetMap (Renderização de Polilinhas e Marcadores)
• Compactação & Mídia:JSZip (Compactação local de anexos), Blob API & MediaSource API
• Inteligência Artificial:DeepSeek API (Auditoria Tática e Análise Automática de Incidentes)
• App Móvel (Android):Kotlin Nativo, Coroutines, Room DB, WorkManager, Foreground Services

3. Módulos da Plataforma Web

   3.1. Monitor Geral & Mapa Interativo
Exibição em tempo real de marcadores de usuários ativos no mapa georreferenciado, status das licenças e atalhos rápidos
de telemetria. *Requer conexão de internet no app Android para atualização em tempo real.

   3.2. Gestão de Rotas de Patrulha
Visualização das linhas contínuas de trajetória percorridas pelos usuários em campo, agrupadas por data e horário, com
filtros por login e setor.

   3.3. Central de Alertas & Mídias (Ocorrências)
Tratamento de alertas com anexos (áudio, foto, vídeo, texto). Suporta reprodução direta no player de áudio da plataforma
web, visualização ampliada e exportação em arquivos .ZIP.

   3.4. Gestão por Responsabilidade
Hierarquia em árvore ('Gestão por Responsabilidade'). Ao criar novos usuários, o sistema atribui automaticamente o login do
gestor como responsável pelo usuário que está sendo criado.
PEMD-SP613-Seg: Vigia • Conecta • Protege • v1.0 — Todos os direitos reservados ao AladdinLab
23/07/2026PEMD-SP613-Seg — DESCRITIVO TÉCNICO

   3.5. Assistente de IA com DeepSeek
Avaliador tático automático baseado na API do DeepSeek, identificando padrões de incidentes, níveis de vulnerabilidade e
sugestões de alocação de equipe.

  3.6. Logs de Auditoria & Atividade
Registro detalhado de ações no sistema (sincronizações, criação de alertas e alteração de licenças), garantindo
conformidade e rastreabilidade.

4. Interação com o App Android em Campo
O aplicativo Android foi desenvolvido com foco em alta eficiência energética e operação contínua em campo:
• Tracking via Foreground Service: Coleta coordenadas GPS em segundo plano com notificação persistente do sistema.
• Captura Multimídia Nativa: Gravação direta de voz em formato AAC/AMR, fotos comprimidas e vídeos curtos.
• Banco de Dados Room DB Local: Espelhamento da estrutura do banco para operação 100% offline.
• Sincronizador com WorkManager: Executa periodicamente tentativas de envio de pacotes acumulados na nuvem.
• Conectividade para Tempo Real: Para que a posição do usuário apareça instantaneamente na Plataforma web em
https://aladdinlab.com.br/apps/pemd-sp613-seg/, o dispositivo Android deve estar conectado à internet. Em caso de
ausência de rede, os pontos ficam armazenados localmente e são descarregados automaticamente ao reconectar.
• Atualização de Licença de Uso: Se o gestor altera a licença na Plataforma web (ex: 'Bloqueada'), o app Android
restringe o uso no próximo ping de verificação.
A Plataforma web PEMD-SP613-Seg está publicada e pronta para uso corporativo. Com integração nativa com o modelo
de inteligência tática DeepSeek, preenchimento automático do gestor responsável e suporte completo a mídias e
geolocalização offline, a solução atende aos mais elevados padrões de eficiência, controle operacional e auditorias
críticas.
PEMD-SP613-Seg: Vigia • Conecta • Protege • v1.0 — Todos os direitos reservados ao AladdinLab

Todo o código está sendo disponibilizado para USO NÃO COMERCIAL.

*Não estão disponíveis as bibliotecas com restrição derivada da LGPD (Lei. nº 13.709/2018)
