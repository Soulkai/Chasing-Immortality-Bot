markdown
# 🧘‍♂️ Chasing Immortality – Bot de WhatsApp (Wuxia/Xianxia RPG)

> Um jogo de imortalidade, cultivação e aventura, diretamente no seu WhatsApp!

**Chasing Immortality** é um bot para WhatsApp que transforma seu chat em um mundo de fantasia oriental, onde você pode registrar um personagem, cultivar artes marciais e espirituais, explorar regiões, lutar contra monstros, criar seitas, trocar itens e muito mais – tudo com comandos simples e uma experiência imersiva.

---

## ✨ Características

- 📝 **Registro completo** com geração aleatória de raça, clã, raiz espiritual (com elementos!), corpo divino e até a chance de nascer órfão.
- 🧘 **Sistema de cultivo** – físico e espiritual, com reinos, subníveis, fadiga e Qi.
- ⚔️ **Combate por turnos** contra monstros ou outros jogadores (PvP).
- 🌍 **Exploração dinâmica** com eventos aleatórios, NPCs e encontros entre jogadores.
- 🏛️ **Seitas (guildas)** – crie sua própria seita, convide membros, crie missões e construa uma biblioteca de técnicas.
- 🎒 **Inventário, equipamentos, loja e mercado de players** – economia completa com moedas hierárquicas (Ouro, Pérolas Espirituais, Cristais, Essência Imortal).
- 💼 **Profissões** (Alquimista, Forjador, Médico, Mestre de Talismã, Mestre de Formações) – craft e progressão.
- 👥 **Sistema social** – amigos, inimigos, chat privado e mensagens offline.
- 📜 **Missões pessoais** – jogadores podem criar e recompensar missões para outros.
- 🧩 **Eventos mundiais** e **rankings** de força, riqueza, karma e reino.
- 🖼️ **Avatar personalizado** – defina uma URL de imagem para seu personagem.
- 🛡️ **Comandos de administração** para o dono do bot.
- 💾 **Banco de dados SQLite** – leve, portátil e fácil de fazer backup.

---

## 🛠️ Tecnologias utilizadas

- [Node.js](https://nodejs.org/) (v18+)
- [whatsapp-web.js](https://wwebjs.dev/) – cliente não oficial do WhatsApp
- [SQLite3](https://www.sqlite.org/) – banco de dados embutido
- [qrcode-terminal](https://www.npmjs.com/package/qrcode-terminal) – exibe QR Code no terminal
- [chalk](https://www.npmjs.com/package/chalk) – logs coloridos

---

## 📋 Pré‑requisitos

- **Node.js** versão 18 ou superior instalado.
- Um **número de WhatsApp** secundário (não use seu número principal, pois a conta pode ser bloqueada pelo WhatsApp).
- **Windows, Linux ou macOS** – o bot funciona em qualquer sistema onde Node.js rode.

---

## 🚀 Instalação e execução

### 1. Clone o repositório

```bash
git clone https://github.com/Soulkai/Chasing-Immortality-Bot.git
cd Chasing-Immortality-Bot
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure o número do dono

Edite o arquivo `bot.js` e substitua a constante `DONO_NUMERO` pelo seu número de WhatsApp **com código do país** (ex: `5511999999999` para Brasil).

```javascript
const DONO_NUMERO = '5511999999999';
```

### 4. Inicie o bot

```bash
node bot.js
```

No **Windows**, você também pode dar duplo clique no arquivo `start.bat`.

### 5. Escaneie o QR Code

Um QR Code aparecerá no terminal. Abra o WhatsApp no celular → Configurações → Dispositivos conectados → Conectar um dispositivo → Escaneie o código.

### 6. Pronto!

O bot estará online e responderá aos comandos enviados de qualquer contato registrado.

> ⚠️ **Importante:** Mantenha o terminal aberto enquanto o bot estiver rodando. Para parar, pressione `Ctrl + C`.

---

## 📜 Comandos principais

Todos os comandos começam com `/`. Use `/menu` para ver a lista completa.

| Comando | Descrição |
|---------|------------|
| `/registrar <nome> <M/F>` | Cria seu personagem (nome e sexo). |
| `/perfil` | Exibe seus atributos, reinos e avatar. |
| `/cultivar [fisico|espiritual]` | Treina cultivo (requer técnica de meditação). |
| `/andar` | Explora a região atual (eventos a cada 5 min). |
| `/inventario` | Lista itens que você possui. |
| `/usar <id_item>` | Usa um item (poção, pílula, etc.). |
| `/equipar <id_item>` | Equipa arma/armadura/artefato. |
| `/loja` | Compra/vende itens da loja do jogo. |
| `/mercado` | Mercado entre jogadores. |
| `/criarseita <nome> <desc>` | Cria uma seita (custo 1000 ouro ou 1 cristal). |
| `/convidar <id_jogador>` | Convida alguém para sua seita. |
| `/missoes` | Lista missões da seita. |
| `/profissao escolher <nome>` | Escolha uma profissão (Alquimista, Forjador, etc.). |
| `/amigos` | Lista seus amigos. |
| `/conversar <id> <msg>` | Envia mensagem privada para outro jogador. |
| `/criarmissao <desc> <recompensa>` | Cria uma missão para outros jogadores. |
| `/ranking [forca|reino|riqueza|karma]` | Top 10 do ranking. |
| `/mudaraparencia <URL>` | Define uma imagem de perfil (jpg, png, etc.). |
| `/menu` | Exibe todos os comandos organizados. |
| `/ajuda <comando>` | Mostra ajuda detalhada. |

### Comandos de combate (quando em batalha)

- `/atacar`
- `/defender`
- `/usaritem <id>`
- `/fugir`
- `/usartecnica <id_tecnica>`

### Comandos de administração (apenas o dono)

- `/banir <id> [motivo]`
- `/daritem <id_jogador> <id_item> <quantidade>`
- `/resetar <id_jogador>`
- `/anuncio <texto>`

---

## 🗃️ Estrutura do banco de dados (SQLite)

O bot cria automaticamente um arquivo `database.db` com as seguintes tabelas principais:

- `players` – dados dos personagens (atributos, reinos, moedas, avatar...)
- `tecnicas` e `tecnicas_aprendidas` – técnicas disponíveis e progresso dos jogadores
- `itens` e `inventario` – catálogo de itens e inventário de cada jogador
- `seitas` e `seita_membros` – guildas e associações
- `missoes_seita` e `missoes_pessoais` – missões de seitas e entre jogadores
- `amigos_inimigos` – relacionamentos sociais
- `mensagens_chat` – mensagens offline
- `eventos_mundiais`, `loja_rpg`, `mercado_player`, `profissoes`, `npcs`, `changelog`

O script `init.sql` contém toda a definição do schema.

---

## 📁 Scripts auxiliares

- `start.bat` – inicia o bot no Windows (duplo clique).
- `backup.bat` – faz uma cópia do banco de dados com timestamp.

---

## 🤝 Contribuição

Contribuições são bem‑vindas! Sinta‑se à vontade para abrir **issues** ou **pull requests** com melhorias, correções de bugs ou novas funcionalidades.

1. Faça um fork do projeto.
2. Crie uma branch para sua feature (`git checkout -b feature/nova-coisa`).
3. Commit suas alterações (`git commit -m 'Adiciona nova coisa'`).
4. Push para a branch (`git push origin feature/nova-coisa`).
5. Abra um Pull Request.

---

## 📄 Licença

Este projeto está sob a licença MIT – veja o arquivo [LICENSE](LICENSE) para detalhes.

---

## 🙏 Agradecimentos

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) pela incrível biblioteca.
- Comunidade de jogadores de Wuxia/Xianxia que inspiraram este projeto.

---

## 📞 Contato

Desenvolvido por [Soulkai] – [5567981445060]  

---

⚡ *"A jornada para a imortalidade começa com um único comando."*



---

## 🌌 Etapa 3 – Mundo vivo, IA opcional e retratos persistentes

Esta versão adiciona:

- **NPCs com memória**: afinidade, confiança, medo e favor são gravados por jogador.
- **Missões de NPC com ramificações**: o tom da sua resposta influencia a leitura narrativa da rota.
- **Rumores dinâmicos**: use `/rumores` para ouvir ecos da sua região atual.
- **Eventos mundiais narrativos**: `/eventos` agora pode semear eventos vivos quando o mundo estiver quieto demais.
- **Mestres e rivais**: `/mestre` e `/rival` criam vínculos persistentes com sabor wuxia/xianxia.
- **Política de seitas**: `/politicaseita` e `/seita politica`.
- **Retratos persistentes** de **NPCs, mobs e regiões**: `/retrato <npc|mob|regiao> <nome>`.

### IA de texto opcional

O bot funciona sem IA externa, com texto temático em fallback.  
Para ativar **fala/cena dinâmica** via Ollama local:

```bash
set AI_PROVIDER=ollama
set OLLAMA_URL=http://127.0.0.1:11434/api/generate
set OLLAMA_MODEL=gemma3:4b
```

### Geração de imagem opcional

O sistema de retratos foi preparado para trabalhar com um **serviço local/bridge** que receba um prompt e devolva `imageUrl` ou `base64`.

Exemplo de variáveis:

```bash
set IMAGE_PROVIDER=bridge
set IMAGE_API_URL=http://127.0.0.1:8189/generate
```

Payload esperado pelo bridge:

```json
{
  "entityType": "npc",
  "entityKey": "Velho Lin",
  "prompt": "ancião cultivador wuxia...",
  "style": "wuxia/xianxia",
  "cacheKey": "npc:velho lin"
}
```

Resposta esperada:

```json
{
  "imageUrl": "http://127.0.0.1:8189/files/velho_lin.png"
}
```

ou

```json
{
  "base64": "<imagem em base64>",
  "extension": "png",
  "seed": "12345"
}
```

Sem esse serviço configurado, o bot **não quebra**: ele registra o pedido do retrato em cache e continua o jogo normalmente.


## 🖼️ Retratos persistentes com URL pública

Esta versão salva retratos de **NPCs, mobs e regiões** na tabela `entity_portraits` e **reaproveita sempre a mesma imagem** depois da primeira geração.

### Fluxo automático

1. O comando `/retrato <npc|mob|regiao> <nome>` tenta localizar um retrato já salvo.
2. Se existir, ele reutiliza a mesma imagem.
3. Se não existir, o bot chama seu gerador em `IMAGE_API_URL`.
4. Depois disso, ele pode publicar a imagem automaticamente em uma URL pública com **ImgBB** ou **ImageKit**.
5. A URL e o cache local ficam gravados no banco para reutilização futura.

### Variáveis de ambiente

#### Geração de imagem
- `IMAGE_PROVIDER` — nome do provedor/bridge que gera a imagem
- `IMAGE_API_URL` — endpoint local ou remoto que devolve `base64` ou `imageUrl`

#### Upload público em ImgBB
- `IMAGE_HOST_PROVIDER=imgbb`
- `IMGBB_API_KEY=<sua-chave>`

#### Upload público em ImageKit
- `IMAGE_HOST_PROVIDER=imagekit`
- `IMAGEKIT_PRIVATE_KEY=<sua-private-key>`
- `IMAGEKIT_URL_ENDPOINT=<seu-url-endpoint>`
- `IMAGEKIT_FOLDER=/chasing-immortality`

#### Self-host opcional
- `IMAGE_PUBLIC_BASE_URL=https://seu-dominio/imagens`

> Dica: se você ainda não tiver um gerador real, o bot continua registrando o retrato como pendente no banco até você configurar o provedor.
