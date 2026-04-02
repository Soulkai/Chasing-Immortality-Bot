# Chasing Immortality — Gameplay V2

Bot de WhatsApp para RPG Wuxia/Xianxia com foco em progressão, exploração e combate.

## Novidades desta versão

- Tribulação de reino funcional com `/romper [fisico|espiritual]`
- Equipamentos com bônus reais em atributos, HP, Qi e Alma
- Craft com chance de falha e qualidade de item
- Bosses por região com mérito e drops raros
- Quests completas de NPC
- Perfil em estilo RPG com barras de estado
- Menu atualizado com os novos comandos

## Comandos principais

### Perfil e equipamento
- `/perfil`
- `/inventario`
- `/equipamentos`
- `/equipar <id_item>`
- `/desequipar <slot>`
- `/mudaraparencia <url>`

### Cultivo
- `/cultivar [fisico|espiritual]`
- `/romper [fisico|espiritual]`
- `/tecnicas`
- `/compreender <id>`
- `/aprender <id>`
- `/descansar`

### Exploração e combate
- `/andar [regiao]`
- `/parar`
- `/bosses`
- `/boss <id|nome>`
- `/dominio`
- `/dominio entrar <nome>`
- `/dominio continuar`
- `/atacar`
- `/defender`
- `/usaritem <id>`
- `/usartecnica <id>`
- `/fugir`

### NPCs e missões
- `/npc`
- `/npc aceitar <id_quest>`
- `/npc entregar <id_quest>`
- `/missoesnpc`
- `/missoes`
- `/aceitar <id>`
- `/completarmissao <id>`
- `/criarmissao <descricao> <recompensa>`
- `/missoesdisponiveis`
- `/minhasmissoes`

### Profissões e craft
- `/profissao listar`
- `/profissao escolher <nome>`
- `/craftar listar`
- `/craftar detalhes <id>`
- `/craftar <id>`
- `/subirprofissao`

### Social e economia
- `/jogadores`
- `/encontrar`
- `/duelar <id>`
- `/aceitarduelo <id>`
- `/trocar <id> <item> <qtd>`
- `/mercado listar`
- `/mercado vender <id_item> <qtd> <preco> [moeda]`
- `/mercado comprar <id_listagem> [qtd]`
- `/mercado minhas`
- `/amigos`
- `/adicionaramigo <id>`
- `/inimigo <id>`
- `/conversar <id> <mensagem>`
- `/lerchat`

## Execução

```bash
npm install
npm start
```

No Windows, também dá para usar `start.bat`.

## Observações

- O bot continua usando `bot.js` como arquivo principal.
- O banco é SQLite (`database.db`).
- A inicialização agora aplica migrações automáticas para tabelas e colunas da V2.
