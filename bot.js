
// ============================================
// CHASING IMMORTALITY BOT - CÓDIGO COMPLETO (CORRIGIDO)
// ============================================

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const sqlite3 = require('sqlite3').verbose();
const qrcode = require('qrcode-terminal');
const chalk = require('chalk');
const fs = require('fs');

// ========== CONFIGURAÇÕES ==========
const DONO_NUMERO = '120363425231463609'; // ⚠️ SUBSTITUA PELO ID/NÚMERO DO DONO
const COMMAND_PREFIX = '/';
const DB_PATH = './database.db';
const LOG_FILE = './bot.log';
const MENU_SPLIT_SIZE = 2000;

// ========== INICIALIZAÇÃO DO BANCO ==========
const db = new sqlite3.Database(DB_PATH);
const initSQL = fs.readFileSync('./init.sql', 'utf8');

function runExec(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function applyMigrations() {
    const migrations = [
        `ALTER TABLE players ADD COLUMN banido INTEGER DEFAULT 0`,
        `ALTER TABLE missoes_pessoais ADD COLUMN aceita_por INTEGER`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventario_player_item ON inventario(player_id, item_id)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_tecnicas_player_tecnica ON tecnicas_aprendidas(player_id, tecnica_id)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_profissoes_player ON profissoes(player_id)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_seita_membros_unique ON seita_membros(seita_id, player_id)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_biblioteca_seita_unique ON biblioteca_seita(seita_id, tecnica_id)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_amigos_inimigos_unique ON amigos_inimigos(player_id, alvo_id, tipo)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_loja_rpg_item_moeda_unique ON loja_rpg(item_id, moeda_tipo)`
    ];

    for (const sql of migrations) {
        try {
            await runExec(sql);
        } catch (err) {
            const msg = String(err?.message || err || '');
            if (!msg.includes('duplicate column name')) {
                log(`Migração ignorada com aviso: ${msg}`, 'INFO');
            }
        }
    }
}

db.exec(initSQL, async (err) => {
    if (err) console.error(chalk.red('Erro ao criar tabelas:', err));
    else console.log(chalk.green('Banco de dados inicializado.'));

    try {
        await applyMigrations();
        console.log(chalk.green('Migrações aplicadas/verificadas.'));
    } catch (migrationErr) {
        console.error(chalk.red('Erro ao aplicar migrações:', migrationErr));
    }
});

// ========== FUNÇÕES DE LOG ==========
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const colors = {
        INFO: chalk.blue,
        ERRO: chalk.red,
        SUCESSO: chalk.green,
        BATALHA: chalk.magenta,
        RECV: chalk.cyan
    };
    const color = colors[type] || chalk.white;
    const line = `[${timestamp}] [${type}] ${message}`;
    console.log(color(line));
    fs.appendFileSync(LOG_FILE, `${line}\n`);
}
// ========== CONTROLE DE REGISTRO PENDENTE ==========
let registroPendente = new Map();
let respostaPendente = new Map();
// ========== FUNÇÕES AUXILIARES ==========
function generateUniqueId() {
    return 'IM-' + Math.floor(Math.random() * 900000 + 100000);
}

function rollDice(max) {
    return Math.floor(Math.random() * max) + 1;
}

function weightedRandom(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    const rand = Math.random() * total;
    let accum = 0;
    for (let i = 0; i < items.length; i++) {
        accum += weights[i];
        if (rand < accum) return items[i];
    }
    return items[0];
}

function normalizeWhatsAppId(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/@c\.us$/i, '').replace(/@g\.us$/i, '').trim();
}

function getChatId(message) {
    return typeof message?.from === 'string' ? message.from : null;
}

function getSenderId(message) {
    const rawSender = typeof message?.author === 'string'
        ? message.author
        : (typeof message?.from === 'string' ? message.from : '');
    return normalizeWhatsAppId(rawSender);
}

function buildDirectId(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    if (/@c\.us$/i.test(value) || /@g\.us$/i.test(value)) return value;
    return `${normalizeWhatsAppId(value)}@c.us`;
}

function isOwner(message, telefone) {
    const ownerNormalized = normalizeWhatsAppId(DONO_NUMERO);
    const senderRaw = typeof message?.author === 'string'
        ? message.author
        : (typeof message?.from === 'string' ? message.from : '');
    const senderNormalized = normalizeWhatsAppId(senderRaw);
    return senderRaw === DONO_NUMERO ||
        senderNormalized === ownerNormalized ||
        telefone === ownerNormalized;
}

function splitText(text, maxLength = MENU_SPLIT_SIZE) {
    const safeText = String(text ?? '');
    if (safeText.length <= maxLength) return [safeText];

    const chunks = [];
    let current = '';

    for (const line of safeText.split('\n')) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length > maxLength && current) {
            chunks.push(current);
            current = line;
        } else if (line.length > maxLength) {
            if (current) chunks.push(current);
            for (let i = 0; i < line.length; i += maxLength) {
                chunks.push(line.slice(i, i + maxLength));
            }
            current = '';
        } else {
            current = next;
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

function sanitizeText(text) {
    return String(text ?? '').replace(/\r\n/g, '\n').trim() || ' ';
}

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getPlayer(telefone) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM players WHERE telefone = ?', [telefone], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function updatePlayer(playerId, campo, valor) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE players SET ${campo} = ? WHERE id = ?`, [valor, playerId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function ensurePlayerExists(telefone, message) {
    const player = await getPlayer(telefone);
    if (!player) {
        await sendReply(message, '❌ Você não está registrado! Use `/registrar <nome> <sexo>` para começar.');
        return null;
    }
    return player;
}

function getPlayerById(id) {
    return new Promise((resolve) => {
        db.get('SELECT * FROM players WHERE id = ?', [id], (_err, row) => resolve(row || null));
    });
}

function getPlayerByUniqueId(uniqueId) {
    return new Promise((resolve) => {
        db.get('SELECT * FROM players WHERE unique_id = ?', [uniqueId], (_err, row) => resolve(row || null));
    });
}

// ========== FUNÇÃO AUXILIAR PARA ENVIAR RESPOSTAS ==========
async function sendReply(message, text, media = null) {
    try {
        const chatId = getChatId(message);
        if (!chatId) throw new Error('message.from ausente');

        const safeText = sanitizeText(text);

        if (media) {
            await client.sendMessage(chatId, media, { caption: safeText });
            return;
        }

        const parts = splitText(safeText);
        for (const part of parts) {
            await client.sendMessage(chatId, part);
        }
    } catch (err) {
        log(`Erro ao enviar mensagem: ${err?.stack || err}`, 'ERRO');
    }
}

// ========== CLIENTE WHATSAPP ==========
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    log('QR Code gerado. Escaneie com o WhatsApp.', 'INFO');
});

client.on('ready', () => log('Bot conectado com sucesso!', 'SUCESSO'));

async function handlePendingResponse(message) {
    const telefone = getSenderId(message);
    if (!telefone || !respostaPendente.has(telefone)) return false;

    const pendente = respostaPendente.get(telefone);
    if (!pendente || pendente.tipo !== 'registro') return false;

    const rawBody = typeof message?.body === 'string' ? message.body.trim() : '';
    const rawChoice = rawBody.startsWith(COMMAND_PREFIX)
        ? rawBody.slice(COMMAND_PREFIX.length).trim()
        : rawBody;

    const escolha = parseInt(rawChoice, 10);
    if (Number.isNaN(escolha) || escolha < 1 || escolha > 4) {
        await sendReply(message, 'Resposta inválida. Digite apenas o número da opção (1 a 4).');
        return true;
    }

    const perguntaIndex = pendente.dados.perguntaAtual;
    const pergunta = pendente.perguntas[perguntaIndex];
    if (!pergunta) {
        respostaPendente.delete(telefone);
        return true;
    }

    const opcao = pergunta.opcoes[escolha - 1];
    pendente.dados.karmaTotal += opcao.karma;
    pendente.dados.perguntaAtual++;
    await pendente.enviarProxima(getChatId(message), pendente.dados);
    return true;
}

client.on('message', async (message) => {
    try {
        const body = typeof message?.body === 'string' ? message.body.trim() : '';
        if (!body) return;

        if (await handlePendingResponse(message)) return;

        if (!body.startsWith(COMMAND_PREFIX)) return;
        log(`Comando de ${getSenderId(message) || message.from}: ${body}`, 'RECV');
        await processCommand(message);
    } catch (err) {
        log(`Erro no handler de mensagem: ${err?.stack || err}`, 'ERRO');
    }
});

// ========== COMANDOS ==========
async function cmdRegistrar(args, message, telefone) {
    // Verifica se já está registrado
    const existing = await getPlayer(telefone);
    if (existing) {
        await sendReply(message, 'Você já está registrado! Use `/perfil`.');
        return;
    }

    if (args.length < 2) {
        await sendReply(message, 'Uso: `/registrar <nome> <sexo>` (sexo M/F)');
        return;
    }

    const nome = args[0];
    const sexo = String(args[1] || '').toUpperCase();
    if (sexo !== 'M' && sexo !== 'F') {
        await sendReply(message, 'Sexo deve ser M ou F.');
        return;
    }

    // 1. Geração aleatória de atributos
    const racas = ['Humano', 'Meio-Demônio', 'Meio-Espírito', 'Elfo da Montanha', 'Anão Guerreiro'];
    const claOptions = ['Namgung', 'Tang', 'Murong', 'Wudang', 'Emei', 'Shaolin'];
    const raizes = ['Única Inferior', 'Única Média', 'Única Avançada', 'Única Santa', 'Dupla', 'Tripla', 'Divina', 'Imortal', 'Nenhuma'];
    const pesosRaiz = [20, 25, 20, 10, 10, 5, 3, 1, 6];

    const raca = racas[Math.floor(Math.random() * racas.length)];
    const cla = claOptions[Math.floor(Math.random() * claOptions.length)];
    const raiz = weightedRandom(raizes, pesosRaiz);

    let elementos = '';
    if (raiz !== 'Nenhuma') {
        const qtd = raiz.includes('Dupla') ? 2 : (raiz.includes('Tripla') ? 3 : (raiz.includes('Divina') ? 4 : (raiz === 'Imortal' ? 12 : 1)));
        const lista = ['Água', 'Fogo', 'Terra', 'Ar', 'Madeira', 'Metal', 'Raio', 'Gelo', 'Luz', 'Trevas', 'Tempo', 'Espaço'];
        const sel = [];
        for (let i = 0; i < qtd; i++) {
            let e;
            do { e = lista[Math.floor(Math.random() * lista.length)]; } while (sel.includes(e));
            sel.push(e);
        }
        elementos = sel.join(',');
    } else {
        elementos = 'Nenhum';
    }

    const corpoDivino = (Math.random() < 0.05) ? 'Corpo de Fênix Imortal' : null;
    const orfao = (Math.random() < 0.1) ? 1 : 0;
    const fortuna = rollDice(100);
    const forca = 10 + rollDice(10);
    const vigor = 10 + rollDice(10);
    const defesa = 10 + rollDice(10);
    const inteligencia = 10 + rollDice(10);
    const espirito = 10 + rollDice(10);
    const agilidade = 10 + rollDice(10);
    const hpMax = vigor * 10;
    const qiMax = (inteligencia + espirito) * 5;
    const uniqueId = generateUniqueId();
    const localizacao = 'Vila Inicial';

    // 2. História inicial
    let historia = `✨ *Sua jornada começa...*\n\n`;
    if (orfao) {
        historia += `Você nasceu órfão, sem saber quem eram seus pais. Desde pequeno, aprendeu a sobreviver sozinho. `;
    } else {
        historia += `Você nasceu em uma família humilde do clã ${cla}, que sempre prezou pela honra e pelo cultivo. `;
    }
    historia += `Sua raça é ${raca}. `;
    if (raiz === 'Nenhuma') {
        historia += `Infelizmente, você não possui raiz espiritual. O caminho do cultivo será muito mais árduo para você. `;
    } else {
        historia += `Sua raiz espiritual é *${raiz}* com afinidade para os elementos: ${elementos}. `;
    }
    if (corpoDivino) {
        historia += `Além disso, você possui um corpo divino: *${corpoDivino}*, uma bênção raríssima! `;
    }
    historia += `Agora, aos 16 anos, você decide partir em busca do seu destino.`;

    // 3. Perguntas morais
    const perguntas = [
        {
            texto: "🧙 *Pergunta 1/3*: Você vê um ancião sendo atacado por bandidos. O que você faz?",
            opcoes: [
                { texto: "1. Intervenho para salvá-lo, mesmo correndo risco.", karma: 20, alinhamento: "Justo" },
                { texto: "2. Observo de longe e só ajudo se ele prometer recompensa.", karma: 0, alinhamento: "Neutro" },
                { texto: "3. Ignoro e sigo meu caminho. Não é problema meu.", karma: -15, alinhamento: "Cruel" },
                { texto: "4. Aproveito a confusão para roubar o ancião.", karma: -30, alinhamento: "Cruel" }
            ]
        },
        {
            texto: "⚖️ *Pergunta 2/3*: Você encontra um artefato espiritual perdido. Ninguém está vendo. O que faz?",
            opcoes: [
                { texto: "1. Procuro o dono e devolvo.", karma: 25, alinhamento: "Justo" },
                { texto: "2. Fico com o artefato, mas ajudo outros necessitados depois.", karma: 5, alinhamento: "Neutro" },
                { texto: "3. Vendo para o maior comprador.", karma: -10, alinhamento: "Cruel" },
                { texto: "4. Uso para eliminar rivais.", karma: -40, alinhamento: "Cruel" }
            ]
        },
        {
            texto: "🌿 *Pergunta 3/3*: Um discípulo mais fraco pede sua ajuda para cultivar. Você está ocupado. O que diz?",
            opcoes: [
                { texto: "1. Ajudo-o imediatamente, pois o dever do mais forte é guiar.", karma: 15, alinhamento: "Justo" },
                { texto: "2. Ensino o básico rapidamente e sigo meu caminho.", karma: 5, alinhamento: "Neutro" },
                { texto: "3. Digo que não tenho tempo e vou embora.", karma: -10, alinhamento: "Cruel" },
                { texto: "4. Zombar dele por ser fraco.", karma: -25, alinhamento: "Cruel" }
            ]
        }
    ];

    // Armazena estado do registro
    const dadosRegistro = {
        nome, sexo, raca, cla, raiz, elementos, corpoDivino, orfao, uniqueId,
        historia,
        perguntaAtual: 0,
        karmaTotal: 0,
        forca, vigor, defesa, inteligencia, espirito, agilidade, hpMax, qiMax, fortuna, localizacao
    };
    registroPendente.set(telefone, dadosRegistro);

    // Função para enviar a próxima pergunta ou finalizar
    async function enviarProximaPergunta(chatId, dados) {
        if (dados.perguntaAtual >= perguntas.length) {
            // Finaliza o registro
            let alinhamentoFinal = 'Neutro';
            if (dados.karmaTotal >= 30) alinhamentoFinal = 'Justo';
            else if (dados.karmaTotal <= -20) alinhamentoFinal = 'Cruel';

            const stmt = db.prepare(`INSERT INTO players 
                (unique_id, nome, sexo, raca, clan, raiz_espiritual, elementos, corpo_divino, orfao, alinhamento, karma, reputacao, fortuna,
                 nivel_fisico, sub_fisico, nivel_espiritual, sub_espiritual, qi_atual, qi_maximo, hp_atual, hp_maximo,
                 forca, vigor, defesa, inteligencia, espirito, agilidade, fadiga, meridianos_abertos, profissao_principal, nivel_profissao,
                 ouro, perolas_esp, cristais_esp, essencia_imortal, localizacao, telefone, online)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?, ?)`);

            stmt.run(
                dados.uniqueId, dados.nome, dados.sexo, dados.raca, dados.cla, dados.raiz, dados.elementos, dados.corpoDivino, dados.orfao,
                alinhamentoFinal, dados.karmaTotal, 0, dados.fortuna,
                1, 1, 1, 1,
                dados.qiMax, dados.qiMax, dados.hpMax, dados.hpMax,
                dados.forca, dados.vigor, dados.defesa, dados.inteligencia, dados.espirito, dados.agilidade,
                100, '', '', 0,
                100, 0, 0, 0,
                dados.localizacao, telefone, 1,
                (err) => {
                    if (err) {
                        log(`Erro registro: ${err?.stack || err}`, 'ERRO');
                        client.sendMessage(chatId, '❌ Erro interno. Tente novamente.');
                    } else {
                        let resumo = `🌟 *Bem-vindo ao Chasing Immortality, ${dados.nome}!*\n\n`;
                        resumo += `📜 *ID:* ${dados.uniqueId}\n`;
                        resumo += `🧬 *Raça:* ${dados.raca}\n`;
                        resumo += `🏮 *Clã:* ${dados.cla}\n`;
                        resumo += `🌿 *Raiz:* ${dados.raiz} (${dados.elementos})\n`;
                        if (dados.corpoDivino) resumo += `💪 *Corpo Divino:* ${dados.corpoDivino}\n`;
                        resumo += `❤️ *Órfão:* ${dados.orfao ? 'Sim' : 'Não'}\n`;
                        resumo += `⚖️ *Alinhamento:* ${alinhamentoFinal}\n`;
                        resumo += `📊 *Karma:* ${dados.karmaTotal}\n\n`;
                        resumo += `${dados.historia}\n\n`;
                        resumo += `Use /perfil para ver seus atributos. Boa sorte, cultivador!`;
                        client.sendMessage(chatId, resumo);
                    }
                    registroPendente.delete(telefone);
                    respostaPendente.delete(telefone);
                }
            );
            stmt.finalize();
        } else {
            const pergunta = perguntas[dados.perguntaAtual];
            let msg = pergunta.texto + "\n\n";
            pergunta.opcoes.forEach(op => { msg += `${op.texto}\n`; });
            msg += "\nResponda com o número da sua escolha (ex: 1).";
            await client.sendMessage(chatId, msg);
        }
    }

    // Envia a história e a primeira pergunta
    await client.sendMessage(message.from, dadosRegistro.historia);
    await enviarProximaPergunta(message.from, dadosRegistro);

    // Configura resposta pendente
    respostaPendente.set(telefone, {
        tipo: 'registro',
        dados: dadosRegistro,
        perguntas: perguntas,
        enviarProxima: enviarProximaPergunta
    });
}
async function cmdPerfil(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    const texto = `🌟 *PERFIL DE ${player.nome}*\n🆔 ${player.unique_id}\n🧬 ${player.raca} | 🏮 ${player.clan}\n🌿 ${player.raiz_espiritual} (${player.elementos})\n💪 ${player.corpo_divino || 'Comum'}\n⚖️ ${player.alinhamento} | ❤️ Karma ${player.karma} | 📈 Reputação ${player.reputacao}\n📊 *ATRIBUTOS:* 💪${player.forca} 🛡️${player.defesa} ⚡${player.agilidade} 🧠${player.inteligencia} 🧘${player.espirito} ❤️${player.hp_atual}/${player.hp_maximo} 🔋${player.qi_atual}/${player.qi_maximo} 😴${player.fadiga}\n🏆 *REINOS:* Físico ${player.nivel_fisico}-${player.sub_fisico} | Espiritual ${player.nivel_espiritual}-${player.sub_espiritual}\n💰 *MOEDAS:* 🪙${player.ouro} 🧪${player.perolas_esp} 💎${player.cristais_esp} ✨${player.essencia_imortal}`;

    if (player.avatar_url) {
        try {
            const media = await MessageMedia.fromUrl(player.avatar_url, { unsafe: true });
            await sendReply(message, texto, media);
        } catch (_e) {
            await sendReply(message, texto + '\n⚠️ Erro ao carregar avatar.');
        }
    } else {
        await sendReply(message, texto);
    }
}

async function cmdMudarAparencia(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0] || !args[0].match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
        await sendReply(message, 'Uso: `/mudaraparencia <URL_da_imagem>` (jpg, png, gif, webp)');
        return;
    }

    await updatePlayer(player.id, 'avatar_url', args[0]);
    await sendReply(message, '🧝 Avatar atualizado! Aparecerá no /perfil.');
}

async function cmdMenu(_args, message) {
    if (!message || !getChatId(message)) return;

    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR');
    const horaStr = agora.toLocaleTimeString('pt-BR');
    const versao = '0.0.2';

    let menu = `╭━━⪩ BEM VINDO! ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • Chasing Immortality\n`;
    menu += `▢ • Data: ${dataStr}\n`;
    menu += `▢ • Hora: ${horaStr}\n`;
    menu += `▢ • Prefixos: /\n`;
    menu += `▢ • Versão: ${versao}\n`;
    menu += `▢\n`;
    menu += `╰━━─「🪐」─━━\n\n`;

    menu += `╭━━⪩ 🎯 PRINCIPAL ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /registrar <nome> <M/F> - Registra seu cultivador\n`;
    menu += `▢ • /perfil - Mostra sua identidade e progresso\n`;
    menu += `▢ • /status - Mostra recursos e condição atual\n`;
    menu += `▢ • /atributos - Exibe seus atributos principais\n`;
    menu += `▢ • /inventario - Lista seus itens atuais\n`;
    menu += `▢\n`;
    menu += `╰━━─「🎯」─━━\n\n`;

    menu += `╭━━⪩ ☯️ CULTIVO ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /cultivar [fisico|espiritual] - Cultiva uma trilha\n`;
    menu += `▢ • /romper - Tenta avançar de reino\n`;
    menu += `▢ • /tecnicas - Lista técnicas conhecidas\n`;
    menu += `▢ • /compreender <id> - Estuda uma técnica\n`;
    menu += `▢ • /aprender <id> - Tenta aprender uma técnica\n`;
    menu += `▢ • /guia cultivo - Explica o sistema de cultivo\n`;
    menu += `▢\n`;
    menu += `╰━━─「☯️」─━━\n\n`;

    menu += `╭━━⪩ 🧭 MUNDO ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /andar [região] - Viaja para uma região e explora\n`;
    menu += `▢ • /parar - Para de explorar e retorna à vila\n`;
    menu += `▢ • /dominio <nome> - Entra em uma masmorra/domínio\n`;
    menu += `▢ • /eventos - Mostra eventos mundiais ativos\n`;
    menu += `▢ • /ranking [forca|reino|riqueza|karma] - Classificações\n`;
    menu += `▢\n`;
    menu += `╰━━─「🧭」─━━\n\n`;

    menu += `╭━━⪩ ⚔️ BATALHA ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /atacar - Executa um ataque básico\n`;
    menu += `▢ • /defender - Assume postura defensiva\n`;
    menu += `▢ • /usaritem <id> - Usa item em combate\n`;
    menu += `▢ • /usartecnica <id> - Usa técnica em combate\n`;
    menu += `▢ • /fugir - Tenta escapar do confronto\n`;
    menu += `▢ • /guia batalha - Explica o combate\n`;
    menu += `▢\n`;
    menu += `╰━━─「⚔️」─━━\n\n`;

    menu += `╭━━⪩ 🔄 SOCIAL ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /jogadores - Lista cultivadores próximos\n`;
    menu += `▢ • /encontrar - Verifica encontro com outro player\n`;
    menu += `▢ • /conversar <id> <msg> - Envia mensagem privada\n`;
    menu += `▢ • /trocar - Troca itens com outro jogador\n`;
    menu += `▢ • /duelar - Inicia um duelo PvP\n`;
    menu += `▢ • /amigos - Lista seus amigos\n`;
    menu += `▢ • /adicionaramigo <id> - Adiciona um amigo\n`;
    menu += `▢ • /inimigo <id> - Declara inimizade\n`;
    menu += `▢ • /lerchat - Lê mensagens não lidas\n`;
    menu += `▢\n`;
    menu += `╰━━─「🔄」─━━\n\n`;

    menu += `╭━━⪩ 🏪 ECONOMIA ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /loja - Lista itens da loja do bot\n`;
    menu += `▢ • /loja comprar <id> - Compra um item\n`;
    menu += `▢ • /loja vender <id> - Vende item para NPC mercador\n`;
    menu += `▢ • /mercado - Mercado global entre jogadores\n`;
    menu += `▢ • /profissao [listar|escolher] - Mostra ou escolhe sua profissão\n`;
    menu += `▢ • /craftar <item> - Fabricar item\n`;
    menu += `▢ • /guia profissao - Explica profissões\n`;
    menu += `▢\n`;
    menu += `╰━━─「🏪」─━━\n\n`;

    menu += `╭━━⪩ 📋 MISSÕES ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /missoes - Mostra missões da seita disponíveis\n`;
    menu += `▢ • /aceitar <id_missao> - Aceita uma missão da seita\n`;
    menu += `▢ • /completarmissao <id> - Resgata recompensa\n`;
    menu += `▢ • /criarmissao <desc> <recompensa> - Cria missão pessoal\n`;
    menu += `▢ • /missoesdisponiveis - Lista missões criadas por outros\n`;
    menu += `▢ • /minhasmissoes - Lista missões que você criou\n`;
    menu += `▢ • /npc interagir - Aceita missão ou interação de NPC\n`;
    menu += `▢\n`;
    menu += `╰━━─「📋」─━━\n\n`;

    menu += `╭━━⪩ 🏯 SEITAS ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /criarseita <nome> <desc> - Cria sua própria seita\n`;
    menu += `▢ • /convidar <id> - Convida alguém para sua seita\n`;
    menu += `▢ • /aceitarconvite <id_seita> - Aceita um convite de seita\n`;
    menu += `▢ • /sairseita - Sai da seita atual\n`;
    menu += `▢ • /doar <quantidade> - Doa ouro para o tesouro da seita\n`;
    menu += `▢ • /tecnicaseita <id_tecnica> - Adiciona técnica à biblioteca\n`;
    menu += `▢ • /biblioteca - Lista técnicas disponíveis na seita\n`;
    menu += `▢ • /aprender_seita <id> - Aprende técnica da biblioteca\n`;
    menu += `▢\n`;
    menu += `╰━━─「🏯」─━━\n\n`;

    menu += `╭━━⪩ ℹ️ INFORMAÇÕES ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /changelog - Últimas atualizações do bot\n`;
    menu += `▢ • /mudaraparencia <URL> - Define sua imagem de perfil\n`;
    menu += `▢ • /guia [social|batalha|cultivo|profissao] - Explica sistemas\n`;
    menu += `▢ • /ajuda <comando> - Ajuda detalhada de um comando\n`;
    menu += `▢ • /descansar - Recupera fadiga e Qi\n`;
    menu += `▢\n`;
    menu += `╰━━─「ℹ️」─━━\n\n`;

    menu += `╭━━⪩ FIM ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • Use os comandos com sabedoria!\n`;
    menu += `▢ • Dica: /perfil para ver seu estado completo.\n`;
    menu += `▢\n`;
    menu += `╰━━─「🎮」─━━`;

    await sendReply(message, menu);
}

async function cmdGuia(args, message) {
    if (!args.length) {
        await sendReply(message, '📖 *Guias disponíveis:*\n/guia cultivo\n/guia batalha\n/guia profissao\n/guia social\n\nUse /guia <assunto> para detalhes.');
        return;
    }

    const assunto = args[0].toLowerCase();
    let texto = '';

    switch (assunto) {
        case 'cultivo':
            texto = `🌿 *Guia de Cultivo*\n\nO cultivo é dividido em dois caminhos: *Físico* (aumenta Força, Vigor, HP) e *Espiritual* (aumenta Inteligência, Espírito, Qi).\nPara cultivar, você precisa de uma técnica de meditação.\nUse /cultivar [fisico|espiritual] – consome Qi e Fadiga. Ganhe XP para subir de subnível (1 a 9).\nAo atingir subnível 9 com XP suficiente, você enfrentará a *Tribulação do Céu*.\nCada reino aumenta seus atributos e desbloqueia novas técnicas.`;
            break;
        case 'batalha':
            texto = `⚔️ *Guia de Combate*\n\nO combate é por turnos. Comandos:\n• /atacar – dano baseado na Força\n• /defender – reduz dano pela metade\n• /usaritem <id> – usa item do inventário\n• /usartecnica <id> – usa técnica aprendida\n• /fugir – tenta escapar (baseado na Agilidade)`;
            break;
        case 'profissao':
            texto = `🛠️ *Guia de Profissões*\n\nEscolha uma profissão com /profissao escolher <nome>.\nOpções: Alquimista, Forjador, Médico, Mestre de Talismã, Mestre de Formações.\nCraft com /craftar, ganhe XP e suba de nível com /subirprofissao.`;
            break;
        case 'social':
            texto = `👥 *Guia Social*\n\n• /amigos, /adicionaramigo, /inimigo\n• /conversar <id> <msg> e /lerchat\n• Ao usar /andar, você pode encontrar outros jogadores na mesma região.`;
            break;
        default:
            texto = 'Assunto não encontrado. Use /guia sem argumentos para ver a lista.';
    }

    await sendReply(message, texto);
}

async function cmdRomper(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (player.sub_fisico === 9 || player.sub_espiritual === 9) {
        await sendReply(message, '⚡ O céu escurece... Você sente a Tribulação do Céu se aproximar!\nContinue cultivando para enfrentar o desafio e avançar de reino.');
    } else {
        await sendReply(message, 'Você ainda não atingiu o pico do seu reino atual. Continue cultivando para chegar ao subnível 9.');
    }
}

async function cmdJogadores(_args, message) {
    await sendReply(message, '👥 *Jogadores próximos*\nFuncionalidade em desenvolvimento. Use /ranking para ver a lista geral.');
}

async function cmdEncontrar(_args, message) {
    await sendReply(message, '🔍 *Encontrar jogadores*\nUse /andar em uma região e aguarde eventos. Quando outro jogador também estiver explorando, vocês poderão se encontrar.');
}

async function cmdTrocar(_args, message) {
    await sendReply(message, '🔄 *Troca de itens*\nEm breve! Por enquanto, use /loja para comprar/vender.');
}

async function cmdDuelar(_args, message) {
    await sendReply(message, '⚔️ *Duelo PvP*\nPara duelar, ambos devem estar na mesma região e se encontrar via /andar. Em desenvolvimento.');
}

async function cmdMercadoGlobal(_args, message) {
    await sendReply(message, '🏪 *Mercado Global*\nEm desenvolvimento. Use /loja para comprar itens básicos.');
}

async function cmdNPCInteragir(_args, message) {
    await sendReply(message, '👤 Para interagir com NPCs, use /andar e aguarde os eventos. Quando um NPC aparecer, siga as opções numeradas com /escolha <número>.');
}

async function cmdAjuda(args, message) {
    if (!args[0]) {
        await sendReply(message, 'Use `/ajuda <comando>`. Ex: `/ajuda cultivar`');
        return;
    }

    const ajuda = {
        cultivar: 'Treina cultivo físico ou espiritual. Requer técnica de meditação. Sintaxe: `/cultivar [fisico|espiritual]`',
        registrar: 'Registra personagem. Sintaxe: `/registrar <nome> <sexo>`',
        perfil: 'Mostra status, atributos e avatar.',
        mudaraparencia: 'Define URL da imagem do perfil.',
        andar: 'Explora a região atual. Pode encontrar monstros, NPCs ou outros jogadores.',
        combate: 'Comandos de batalha: /atacar, /defender, /usaritem, /fugir, /usartecnica'
    };

    await sendReply(message, ajuda[args[0].toLowerCase()] || 'Comando não encontrado.');
}

async function cmdDescansar(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    const novaFadiga = Math.min(100, player.fadiga + 20);
    const novoQi = Math.min(player.qi_maximo, player.qi_atual + 30);

    await updatePlayer(player.id, 'fadiga', novaFadiga);
    await updatePlayer(player.id, 'qi_atual', novoQi);

    await sendReply(message, `😴 Você descansou. Fadiga: ${player.fadiga} → ${novaFadiga} | Qi: ${player.qi_atual} → ${novoQi}`);
}

async function cmdChangelog(_args, message) {
    db.all('SELECT * FROM changelog ORDER BY data DESC LIMIT 5', async (err, rows = []) => {
        if (err) {
            await sendReply(message, 'Erro ao buscar changelog.');
            return;
        }

        if (!rows.length) {
            await sendReply(message, 'Nenhuma entrada de changelog encontrada.');
            return;
        }

        let text = '📜 *CHANGELOG*\n';
        rows.forEach((r) => {
            text += `\n*${r.versao}* (${r.data}): ${r.texto}`;
        });
        await sendReply(message, text);
    });
}

async function cmdCultivar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    const tipo = args[0]?.toLowerCase();
    if (tipo !== 'fisico' && tipo !== 'espiritual') {
        await sendReply(message, 'Especifique `/cultivar fisico` ou `/cultivar espiritual`.');
        return;
    }

    const tecnica = await new Promise((resolve) => {
        db.get(
            `SELECT * FROM tecnicas_aprendidas ta JOIN tecnicas t ON ta.tecnica_id = t.id WHERE ta.player_id = ? AND t.tipo = 'Meditacao' AND ta.aprendida = 1`,
            [player.id],
            (_err, row) => resolve(row || null)
        );
    });

    if (!tecnica) {
        await sendReply(message, 'Você não possui uma técnica de meditação. Adquira uma primeiro!');
        return;
    }

    if (player.fadiga < 20) {
        await sendReply(message, 'Você está muito cansado. Descanse (`/descansar`).');
        return;
    }

    if (player.qi_atual < 10) {
        await sendReply(message, 'Qi insuficiente. Recupere com pílulas ou descanse.');
        return;
    }

    let ganho = rollDice(20) + (tipo === 'fisico' ? player.forca : player.inteligencia);
    ganho += Math.floor(player.fortuna / 20);

    const custoQi = 10;
    const custoFadiga = 5;
    const novoQi = player.qi_atual - custoQi;
    const novaFadiga = player.fadiga - custoFadiga;

    await updatePlayer(player.id, 'qi_atual', novoQi);
    await updatePlayer(player.id, 'fadiga', novaFadiga);

    const campoSub = tipo === 'fisico' ? 'sub_fisico' : 'sub_espiritual';
    const subAtual = tipo === 'fisico' ? player.sub_fisico : player.sub_espiritual;
    let novoSub = subAtual;

    if (ganho >= 100) {
        novoSub += Math.floor(ganho / 100);
        if (novoSub > 9) {
            novoSub = 1;
            await sendReply(message, '⚡ Você sente a tribulação do céu se aproximar! Avançar de reino exigirá um desafio. (implementar depois)');
        }
        ganho = ganho % 100;
    }

    await updatePlayer(player.id, campoSub, novoSub);
    await sendReply(message, `🧘 Você cultivou ${tipo} e ganhou ${ganho} de experiência. Qi: ${player.qi_atual}→${novoQi} | Fadiga: ${player.fadiga}→${novaFadiga}`);
}

async function cmdTecnicas(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    db.all(
        `SELECT t.id, t.nome, t.tipo, ta.compreensao, ta.aprendida FROM tecnicas_aprendidas ta JOIN tecnicas t ON ta.tecnica_id = t.id WHERE ta.player_id = ?`,
        [player.id],
        async (err, rows = []) => {
            if (err || rows.length === 0) {
                await sendReply(message, 'Você não conhece nenhuma técnica ainda.');
                return;
            }

            let txt = '📜 *Suas Técnicas*\n';
            rows.forEach((r) => {
                txt += `\n${r.id} - ${r.nome} (${r.tipo}) - Compreensão: ${r.compreensao}% - ${r.aprendida ? '✅ Aprendida' : '❌ Não aprendida'}`;
            });
            await sendReply(message, txt);
        }
    );
}

async function cmdCompreender(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/compreender <id_tecnica>`');
        return;
    }

    const idTec = parseInt(args[0], 10);
    if (Number.isNaN(idTec)) {
        await sendReply(message, 'ID de técnica inválido.');
        return;
    }

    db.get(
        `SELECT * FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`,
        [player.id, idTec],
        async (err, row) => {
            if (err || !row) {
                await sendReply(message, 'Você não possui essa técnica.');
                return;
            }

            if (row.aprendida) {
                await sendReply(message, 'Você já aprendeu essa técnica completamente.');
                return;
            }

            const ganho = rollDice(20) + Math.floor(player.inteligencia / 10) + Math.floor(player.espirito / 20);
            const novaComp = Math.min(100, row.compreensao + ganho);
            db.run(`UPDATE tecnicas_aprendidas SET compreensao = ? WHERE player_id = ? AND tecnica_id = ?`, [novaComp, player.id, idTec]);
            await sendReply(message, `📖 Você estudou a técnica e aumentou a compreensão para ${novaComp}%.`);
            if (novaComp >= 100) {
                await sendReply(message, '🎉 Você compreendeu completamente a técnica! Agora pode aprendê-la com `/aprender`.');
            }
        }
    );
}

async function cmdAprender(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/aprender <id_tecnica>`');
        return;
    }

    const idTec = parseInt(args[0], 10);
    if (Number.isNaN(idTec)) {
        await sendReply(message, 'ID de técnica inválido.');
        return;
    }

    db.get(
        `SELECT * FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`,
        [player.id, idTec],
        async (err, row) => {
            if (err || !row) {
                await sendReply(message, 'Técnica não encontrada.');
                return;
            }

            if (row.aprendida) {
                await sendReply(message, 'Você já aprendeu essa técnica.');
                return;
            }

            if (row.compreensao < 50) {
                await sendReply(message, 'Você precisa de pelo menos 50% de compreensão para tentar aprender.');
                return;
            }

            const chance = 50 + Math.floor(player.inteligencia / 20);
            const sucesso = rollDice(100) <= chance;

            if (sucesso || row.compreensao === 100) {
                db.run(`UPDATE tecnicas_aprendidas SET aprendida = 1 WHERE player_id = ? AND tecnica_id = ?`, [player.id, idTec]);
                await sendReply(message, '✅ Você aprendeu a técnica! Pode usá-la em combate com `/usartecnica`.');
            } else {
                await sendReply(message, '❌ Você falhou ao aprender. Só poderá tentar novamente com 100% de compreensão.');
            }
        }
    );
}

async function cmdInventario(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    db.all(
        `SELECT i.nome, inv.quantidade, i.id FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ?`,
        [player.id],
        async (err, rows = []) => {
            if (err || rows.length === 0) {
                await sendReply(message, 'Seu inventário está vazio.');
                return;
            }

            let txt = '🎒 *INVENTÁRIO*\n';
            rows.forEach((r) => {
                txt += `\n${r.nome} x${r.quantidade} (ID:${r.id})`;
            });
            await sendReply(message, txt);
        }
    );
}

async function cmdUsarItem(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/usaritem <id_item>`');
        return;
    }

    const itemId = parseInt(args[0], 10);
    if (Number.isNaN(itemId)) {
        await sendReply(message, 'ID de item inválido.');
        return;
    }

    db.get(
        `SELECT inv.quantidade, i.* FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ? AND inv.item_id = ?`,
        [player.id, itemId],
        async (err, row) => {
            if (err || !row) {
                await sendReply(message, 'Item não encontrado.');
                return;
            }

            if (row.quantidade < 1) {
                await sendReply(message, 'Você não possui esse item.');
                return;
            }

            const efeito = String(row.efeito || '');
            let resposta = '';

            if (efeito.includes('Qi')) {
                const match = efeito.match(/\d+/);
                const valor = match ? parseInt(match[0], 10) : 0;
                const novoQi = Math.min(player.qi_maximo, player.qi_atual + valor);
                await updatePlayer(player.id, 'qi_atual', novoQi);
                resposta = `Você usou ${row.nome} e recuperou ${valor} Qi.`;
            } else if (efeito.includes('HP')) {
                const match = efeito.match(/\d+/);
                const valor = match ? parseInt(match[0], 10) : 0;
                const novoHP = Math.min(player.hp_maximo, player.hp_atual + valor);
                await updatePlayer(player.id, 'hp_atual', novoHP);
                resposta = `Você usou ${row.nome} e recuperou ${valor} HP.`;
            } else if (efeito.includes('re-roll')) {
                resposta = 'Funcionalidade de re-roll ainda não implementada completamente.';
            } else {
                resposta = `Você usou ${row.nome}. Efeito: ${row.efeito}`;
            }

            db.run(`UPDATE inventario SET quantidade = quantidade - 1 WHERE player_id = ? AND item_id = ?`, [player.id, itemId]);
            await sendReply(message, resposta);
        }
    );
}

async function cmdLoja(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (args[0] === 'comprar' && args[1]) {
        const itemId = parseInt(args[1], 10);
        if (Number.isNaN(itemId)) {
            await sendReply(message, 'ID de item inválido.');
            return;
        }

        db.get(
            `SELECT l.*, i.nome, i.valor_compra FROM loja_rpg l JOIN itens i ON l.item_id = i.id WHERE i.id = ?`,
            [itemId],
            async (err, row) => {
                if (err || !row) {
                    await sendReply(message, 'Item não encontrado na loja.');
                    return;
                }

                const preco = row.preco;
                const moeda = row.moeda_tipo;
                const saldo = Number(player[moeda] || 0);

                if (saldo >= preco) {
                    const novoSaldo = saldo - preco;
                    await updatePlayer(player.id, moeda, novoSaldo);
                    db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, 1) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + 1`, [player.id, itemId]);
                    await sendReply(message, `Você comprou ${row.nome} por ${preco} ${moeda}.`);
                } else {
                    await sendReply(message, `Moeda insuficiente. Você tem ${saldo} ${moeda}.`);
                }
            }
        );
        return;
    }

    if (args[0] === 'vender' && args[1]) {
        const itemId = parseInt(args[1], 10);
        if (Number.isNaN(itemId)) {
            await sendReply(message, 'ID de item inválido.');
            return;
        }

        db.get(
            `SELECT inv.quantidade, i.* FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ? AND inv.item_id = ?`,
            [player.id, itemId],
            async (err, row) => {
                if (err || !row || row.quantidade < 1) {
                    await sendReply(message, 'Item não encontrado.');
                    return;
                }

                const valor = row.valor_venda;
                const novoOuro = player.ouro + valor;
                await updatePlayer(player.id, 'ouro', novoOuro);
                db.run(`UPDATE inventario SET quantidade = quantidade - 1 WHERE player_id = ? AND item_id = ?`, [player.id, itemId]);
                await sendReply(message, `Você vendeu ${row.nome} por ${valor} ouro.`);
            }
        );
        return;
    }

    db.all(`SELECT i.id, i.nome, l.preco, l.moeda_tipo FROM loja_rpg l JOIN itens i ON l.item_id = i.id`, async (err, rows = []) => {
        if (err || !rows.length) {
            await sendReply(message, 'A loja está vazia no momento.');
            return;
        }

        let txt = '🏪 *LOJA DO JOGO*\nCompre: /loja comprar <id>\nVenda: /loja vender <id>\n\n';
        rows.forEach((r) => {
            txt += `${r.id} - ${r.nome} - ${r.preco} ${r.moeda_tipo}\n`;
        });
        await sendReply(message, txt);
    });
}

// ========================
// SISTEMA DE EXPLORAÇÃO
// ========================
const exploracaoAtiva = new Map();
const batalhasAtivas = new Map();
const interacoesNPC = new Map();

async function cmdAndar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (exploracaoAtiva.has(player.id)) {
        await sendReply(message, 'Você já está explorando. Use `/parar` para sair.');
        return;
    }

    if (player.fadiga < 10) {
        await sendReply(message, 'Você está exausto. Descanse primeiro (`/descansar`).');
        return;
    }

    const regiao = args.join(' ').trim() || 'Floresta Sombria';
    await updatePlayer(player.id, 'localizacao', regiao);
    await sendReply(message, `🌲 Você entrou na ${regiao} para explorar. A cada 5 minutos, eventos acontecerão. Use /parar para sair.`);

    const interval = setInterval(async () => {
        try {
            const p = await getPlayer(telefone);
            if (!p || !exploracaoAtiva.has(p.id)) return;

            if (p.fadiga <= 0) {
                clearInterval(interval);
                exploracaoAtiva.delete(p.id);
                await client.sendMessage(getChatId(message), '😴 Você desmaiou de cansaço. Volte quando descansar.');
                return;
            }

            await updatePlayer(p.id, 'fadiga', p.fadiga - 2);

            const evento = rollDice(100);
            if (evento <= 30) {
                await iniciarCombateMonstro(p, message);
            } else if (evento <= 45) {
                await encontrarNPC(p, message);
            } else if (evento <= 60) {
                const itemId = 1;
                db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, 1) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + 1`, [p.id, itemId]);
                await client.sendMessage(getChatId(message), '🍃 Você encontrou uma poção de Qi! Foi adicionada ao seu inventário.');
            } else if (evento <= 70) {
                await encontrarJogador(p, message);
            } else {
                await client.sendMessage(getChatId(message), '🍃 Nada de especial aconteceu... Você continua explorando.');
            }
        } catch (err) {
            log(`Erro na exploração: ${err?.stack || err}`, 'ERRO');
        }
    }, 300000);

    exploracaoAtiva.set(player.id, { interval, regiao });
}

async function cmdParar(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    const expl = exploracaoAtiva.get(player.id);
    if (!expl) {
        await sendReply(message, 'Você não está explorando no momento.');
        return;
    }

    clearInterval(expl.interval);
    exploracaoAtiva.delete(player.id);
    await sendReply(message, '🚶 Você parou de explorar e retornou à vila.');
}

async function iniciarCombateMonstro(player, msg) {
    const monstros = ['Lobo Selvagem', 'Espírito de Árvore', 'Goblin Ladrão'];
    const monstro = monstros[Math.floor(Math.random() * monstros.length)];
    const hpMonstro = 50 + rollDice(30);

    batalhasAtivas.set(player.id, {
        tipo: 'monstro',
        nome: monstro,
        hp: hpMonstro,
        hpMax: hpMonstro,
        msgId: msg.id,
        turno: 'jogador'
    });

    await client.sendMessage(getChatId(msg), `⚔️ *COMBATE* ⚔️\nVocê encontrou um ${monstro} (HP: ${hpMonstro}). Use /atacar, /defender, /usaritem, /fugir ou /usartecnica.`);
}

async function encontrarNPC(player, msg) {
    db.get(`SELECT * FROM npcs WHERE localizacao = ? OR localizacao = 'global' ORDER BY RANDOM() LIMIT 1`, [player.localizacao], async (err, npc) => {
        if (err || !npc) {
            await client.sendMessage(getChatId(msg), '👤 Um andarilho misterioso cruza seu caminho, mas desaparece na névoa.');
            return;
        }

        await client.sendMessage(getChatId(msg), `👤 *${npc.nome}*: "${npc.dialogo_inicial}"\n\nOpções:\n1. Perguntar sobre missões\n2. Oferecer presente\n3. Seguir em frente`);
        interacoesNPC.set(player.id, { npcId: npc.id, etapa: 0 });
    });
}

async function encontrarJogador(_player, msg) {
    await client.sendMessage(getChatId(msg), '👥 Você avista outro cultivador ao longe, mas ele desaparece na neblina.');
}

async function cmdAtacar(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) {
        await sendReply(message, 'Você não está em combate.');
        return;
    }

    let dano = player.forca + rollDice(15);

    if (batalha.tipo === 'monstro') {
        batalha.hp -= dano;
        await sendReply(message, `⚔️ Você ataca o ${batalha.nome} e causa ${dano} de dano. HP restante: ${Math.max(0, batalha.hp)}/${batalha.hpMax}`);

        if (batalha.hp <= 0) {
            const recompensaOuro = 10 + rollDice(20);
            await updatePlayer(player.id, 'ouro', player.ouro + recompensaOuro);
            await sendReply(message, `🏆 Você derrotou ${batalha.nome}! Ganhou ${recompensaOuro} ouro.`);
            batalhasAtivas.delete(player.id);

            if (rollDice(100) <= 30) {
                const itemId = 2;
                db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, 1) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + 1`, [player.id, itemId]);
                await sendReply(message, '🎁 Drop: Poção de Vida!');
            }
            return;
        }

        let danoMonstro = 5 + rollDice(10);
        if (batalha.defendendo) {
            danoMonstro = Math.floor(danoMonstro / 2);
            batalha.defendendo = false;
        }

        let novoHP = player.hp_atual - danoMonstro;
        if (novoHP < 0) novoHP = 0;
        await updatePlayer(player.id, 'hp_atual', novoHP);
        await sendReply(message, `🐺 ${batalha.nome} ataca e causa ${danoMonstro} de dano. Seu HP: ${novoHP}/${player.hp_maximo}`);

        if (novoHP <= 0) {
            await sendReply(message, '💀 Você foi derrotado! Perdeu 10 ouro e acorda na vila.');
            await updatePlayer(player.id, 'ouro', Math.max(0, player.ouro - 10));
            await updatePlayer(player.id, 'hp_atual', player.hp_maximo);
            batalhasAtivas.delete(player.id);
        }
        return;
    }

    if (batalha.tipo === 'dominio') {
        batalha.hpInimigo -= dano;
        await sendReply(message, `⚔️ Você ataca o ${batalha.inimigo.nome} e causa ${dano} de dano. HP restante: ${Math.max(0, batalha.hpInimigo)}/${batalha.inimigo.hp}`);

        if (batalha.hpInimigo <= 0) {
            await sendReply(message, `🏆 Você derrotou ${batalha.inimigo.nome}!`);
            db.get(
                `SELECT di.*, d.andares, d.recompensa_base_ouro FROM dominio_instancias di JOIN dominios d ON di.dominio_id = d.id WHERE di.player_id = ? AND di.dominio_id = ?`,
                [player.id, batalha.dominioId],
                async (err, instancia) => {
                    if (err || !instancia) return;

                    const novoAndar = batalha.andar + 1;
                    if (novoAndar > instancia.andares) {
                        db.run(`UPDATE dominio_instancias SET status = 'concluido' WHERE player_id = ? AND dominio_id = ?`, [player.id, batalha.dominioId]);
                        const recompensa = instancia.recompensa_base_ouro + (instancia.andares * 10);
                        await updatePlayer(player.id, 'ouro', player.ouro + recompensa);
                        await sendReply(message, `🎉 *DOMÍNIO CONCLUÍDO!* Você recebeu ${recompensa} ouro.`);
                        batalhasAtivas.delete(player.id);
                    } else {
                        db.run(`UPDATE dominio_instancias SET andar_atual = ? WHERE player_id = ? AND dominio_id = ?`, [novoAndar, player.id, batalha.dominioId]);
                        await sendReply(message, `✨ Você avança para o andar ${novoAndar}/${instancia.andares}. Use /dominio continuar para prosseguir.`);
                        batalhasAtivas.delete(player.id);
                    }
                }
            );
            return;
        }

        let danoInimigo = batalha.inimigo.dano + rollDice(5);
        if (batalha.defendendo) {
            danoInimigo = Math.floor(danoInimigo / 2);
            batalha.defendendo = false;
        }

        let novoHP = player.hp_atual - danoInimigo;
        if (novoHP < 0) novoHP = 0;
        await updatePlayer(player.id, 'hp_atual', novoHP);
        await sendReply(message, `💥 ${batalha.inimigo.nome} ataca e causa ${danoInimigo} de dano. Seu HP: ${novoHP}/${player.hp_maximo}`);

        if (novoHP <= 0) {
            await sendReply(message, '💀 Você foi derrotado no domínio! Perdeu o progresso e retorna à vila.');
            db.run(`DELETE FROM dominio_instancias WHERE player_id = ? AND dominio_id = ?`, [player.id, batalha.dominioId]);
            batalhasAtivas.delete(player.id);
            await updatePlayer(player.id, 'hp_atual', player.hp_maximo);
        }
        return;
    }

    await sendReply(message, 'Combate PvP em desenvolvimento.');
}

async function cmdDefender(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) {
        await sendReply(message, 'Você não está em combate.');
        return;
    }

    batalha.defendendo = true;
    await sendReply(message, '🛡️ Você se defende, reduzindo o próximo dano pela metade.');
}

async function cmdFugir(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) {
        await sendReply(message, 'Você não está em combate.');
        return;
    }

    const chance = Math.min(0.95, Math.max(0.1, player.agilidade / 100));
    if (Math.random() < chance) {
        await sendReply(message, '🏃 Você fugiu com sucesso!');
        batalhasAtivas.delete(player.id);
        return;
    }

    await sendReply(message, '😫 Você tentou fugir, mas falhou! O inimigo ataca.');

    if (batalha.tipo === 'monstro') {
        let danoMonstro = 5 + rollDice(10);
        if (batalha.defendendo) {
            danoMonstro = Math.floor(danoMonstro / 2);
            batalha.defendendo = false;
        }

        let novoHP = player.hp_atual - danoMonstro;
        if (novoHP < 0) novoHP = 0;
        await updatePlayer(player.id, 'hp_atual', novoHP);
        await sendReply(message, `🐺 ${batalha.nome} causa ${danoMonstro} de dano. HP: ${novoHP}/${player.hp_maximo}`);
    }
}

async function cmdUsarTecnica(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) {
        await sendReply(message, 'Você não está em combate.');
        return;
    }

    if (!args[0]) {
        await sendReply(message, 'Uso: `/usartecnica <id_tecnica>`');
        return;
    }

    const idTec = parseInt(args[0], 10);
    if (Number.isNaN(idTec)) {
        await sendReply(message, 'ID de técnica inválido.');
        return;
    }

    db.get(
        `SELECT t.* FROM tecnicas_aprendidas ta JOIN tecnicas t ON ta.tecnica_id = t.id WHERE ta.player_id = ? AND ta.tecnica_id = ? AND ta.aprendida = 1`,
        [player.id, idTec],
        async (err, row) => {
            if (err || !row) {
                await sendReply(message, 'Você não aprendeu essa técnica ou ela não existe.');
                return;
            }

            if (player.qi_atual < row.custo_qi) {
                await sendReply(message, `Qi insuficiente. Necessário ${row.custo_qi}.`);
                return;
            }

            const dano = row.poder_base + (row.tipo === 'Fisica' ? player.forca : player.inteligencia);
            await updatePlayer(player.id, 'qi_atual', player.qi_atual - row.custo_qi);
            await sendReply(message, `✨ Você usou *${row.nome}* e causou ${dano} de dano!`);

            if (batalha.tipo === 'monstro') {
                batalha.hp -= dano;
                if (batalha.hp <= 0) {
                    await sendReply(message, `🏆 Você derrotou ${batalha.nome}!`);
                    batalhasAtivas.delete(player.id);
                }
            } else if (batalha.tipo === 'dominio') {
                batalha.hpInimigo -= dano;
                if (batalha.hpInimigo <= 0) {
                    await sendReply(message, `🏆 Você derrotou ${batalha.inimigo.nome}! Use /atacar ou /dominio continuar para prosseguir.`);
                }
            }
        }
    );
}

// ========================
// SISTEMA DE SEITAS
// ========================
async function cmdCriarSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (args.length < 2) {
        await sendReply(message, 'Uso: `/criarseita <nome> <descricao>`');
        return;
    }

    const nome = args[0];
    const desc = args.slice(1).join(' ');

    db.get(`SELECT id FROM seitas WHERE nome = ?`, [nome], async (_err, row) => {
        if (row) {
            await sendReply(message, 'Já existe uma seita com esse nome.');
            return;
        }

        if (player.ouro < 1000 && player.cristais_esp < 1) {
            await sendReply(message, 'Você precisa de 1000 ouro ou 1 Cristal Espiritual para criar uma seita.');
            return;
        }

        if (player.ouro >= 1000) {
            await updatePlayer(player.id, 'ouro', player.ouro - 1000);
        } else {
            await updatePlayer(player.id, 'cristais_esp', player.cristais_esp - 1);
        }

        db.run(`INSERT INTO seitas (nome, descricao, lider_id, tesouro) VALUES (?, ?, ?, 0)`, [nome, desc, player.id], async function onInsert(err) {
            if (err) {
                await sendReply(message, 'Erro ao criar seita.');
                return;
            }

            const seitaId = this.lastID;
            db.run(`INSERT INTO seita_membros (seita_id, player_id, cargo) VALUES (?, ?, 'lider')`, [seitaId, player.id]);
            await sendReply(message, `🏛️ Seita *${nome}* criada com sucesso! Você é o líder. Use /convidar <id> para adicionar membros.`);
        });
    });
}

async function cmdConvidar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/convidar <id_do_jogador>`');
        return;
    }

    const alvoId = args[0];
    db.get(`SELECT s.* FROM seitas s WHERE s.lider_id = ?`, [player.id], async (_err, seita) => {
        if (!seita) {
            await sendReply(message, 'Você não é líder de nenhuma seita.');
            return;
        }

        const alvo = await getPlayerByUniqueId(alvoId);
        if (!alvo) {
            await sendReply(message, 'Jogador não encontrado.');
            return;
        }

        const target = buildDirectId(alvo.telefone);
        if (target) {
            await client.sendMessage(target, `🏮 Você foi convidado para entrar na seita *${seita.nome}*. Use /aceitarconvite ${seita.id} para aceitar.`);
        }
        await sendReply(message, `Convite enviado para ${alvo.nome}.`);
    });
}

async function cmdAceitarConvite(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/aceitarconvite <id_seita>`');
        return;
    }

    const seitaId = parseInt(args[0], 10);
    if (Number.isNaN(seitaId)) {
        await sendReply(message, 'ID de seita inválido.');
        return;
    }

    db.run(`INSERT INTO seita_membros (seita_id, player_id, cargo) VALUES (?, ?, 'membro')`, [seitaId, player.id], async (err) => {
        if (err) await sendReply(message, 'Erro ao entrar na seita. Talvez você já seja membro.');
        else await sendReply(message, '🎉 Você agora é membro da seita!');
    });
}

async function cmdSairSeita(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    db.run(`DELETE FROM seita_membros WHERE player_id = ?`, [player.id], async (err) => {
        if (err) await sendReply(message, 'Erro ao sair.');
        else await sendReply(message, 'Você saiu da seita.');
    });
}

async function cmdMissoes(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (_err, row) => {
        if (!row) {
            sendReply(message, 'Você não pertence a nenhuma seita.');
            return;
        }

        db.all(`SELECT * FROM missoes_seita WHERE seita_id = ? AND status = 'aberta'`, [row.seita_id], async (err, missoes = []) => {
            if (err || missoes.length === 0) {
                await sendReply(message, 'Nenhuma missão disponível na seita.');
                return;
            }

            let txt = '📜 *Missões da Seita*\n';
            missoes.forEach((m) => {
                txt += `\nID:${m.id} - Dificuldade:${m.dificuldade} - Recompensa:${m.recompensa_moeda} ouro - ${m.objetivo}`;
            });
            await sendReply(message, txt);
        });
    });
}

async function cmdAceitarMissao(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/aceitar <id_missao>`');
        return;
    }

    const missaoId = parseInt(args[0], 10);
    if (Number.isNaN(missaoId)) {
        await sendReply(message, 'ID de missão inválido.');
        return;
    }

    db.run(`UPDATE missoes_seita SET status = 'em_andamento', aceita_por = ? WHERE id = ? AND status = 'aberta'`, [player.id, missaoId], async function onUpdate(err) {
        if (err || this.changes === 0) await sendReply(message, 'Missão não disponível ou já aceita.');
        else await sendReply(message, 'Missão aceita! Complete o objetivo e use `/completarmissao <id>` quando terminar.');
    });
}

async function cmdCompletarMissao(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/completarmissao <id_missao>`');
        return;
    }

    const missaoId = parseInt(args[0], 10);
    if (Number.isNaN(missaoId)) {
        await sendReply(message, 'ID de missão inválido.');
        return;
    }

    db.get(`SELECT * FROM missoes_pessoais WHERE id = ? AND status = 'em_andamento' AND criador_id != ? AND aceita_por = ?`, [missaoId, player.id, player.id], async (_err, missaoPessoal) => {
        if (missaoPessoal) {
            await updatePlayer(player.id, 'ouro', player.ouro + missaoPessoal.recompensa_moeda);
            db.run(`UPDATE missoes_pessoais SET status = 'concluida' WHERE id = ?`, [missaoId]);
            await sendReply(message, `🎉 Missão concluída! Você recebeu ${missaoPessoal.recompensa_moeda} ouro.`);

            const criador = await getPlayerById(missaoPessoal.criador_id);
            const target = criador ? buildDirectId(criador.telefone) : null;
            if (target) {
                await client.sendMessage(target, `📢 Sua missão "${missaoPessoal.descricao}" foi concluída por ${player.nome}.`);
            }
            return;
        }

        db.get(`SELECT * FROM missoes_seita WHERE id = ? AND status = 'em_andamento' AND aceita_por = ?`, [missaoId, player.id], async (err, missaoSeita) => {
            if (err || !missaoSeita) {
                await sendReply(message, 'Missão não encontrada ou não está em andamento.');
                return;
            }

            const recompensa = Number(missaoSeita.recompensa_moeda || 0);
            if (recompensa > 0) {
                await updatePlayer(player.id, 'ouro', player.ouro + recompensa);
            }
            db.run(`UPDATE missoes_seita SET status = 'concluida' WHERE id = ?`, [missaoId]);
            await sendReply(message, `🎉 Missão da seita concluída! Você recebeu ${recompensa} ouro.`);
        });
    });
}

async function cmdDoar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/doar <quantidade>` (em ouro)');
        return;
    }

    const quant = parseInt(args[0], 10);
    if (Number.isNaN(quant) || quant <= 0) {
        await sendReply(message, 'Quantidade inválida.');
        return;
    }

    if (player.ouro < quant) {
        await sendReply(message, 'Você não tem ouro suficiente.');
        return;
    }

    await updatePlayer(player.id, 'ouro', player.ouro - quant);
    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (_err, row) => {
        if (row) db.run(`UPDATE seitas SET tesouro = tesouro + ? WHERE id = ?`, [quant, row.seita_id]);
    });

    await sendReply(message, `Você doou ${quant} ouro para o tesouro da seita.`);
}

async function cmdTecnicaSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/tecnicaseita <id_tecnica>`');
        return;
    }

    const tecId = parseInt(args[0], 10);
    if (Number.isNaN(tecId)) {
        await sendReply(message, 'ID de técnica inválido.');
        return;
    }

    db.get(`SELECT s.id FROM seitas s WHERE s.lider_id = ?`, [player.id], async (_err, seita) => {
        if (!seita) {
            await sendReply(message, 'Apenas o líder pode adicionar técnicas à seita.');
            return;
        }

        db.run(`INSERT OR IGNORE INTO biblioteca_seita (seita_id, tecnica_id) VALUES (?, ?)`, [seita.id, tecId]);
        await sendReply(message, 'Técnica adicionada à biblioteca da seita.');
    });
}

async function cmdBiblioteca(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (_err, row) => {
        if (!row) {
            sendReply(message, 'Você não pertence a nenhuma seita.');
            return;
        }

        db.all(`SELECT t.id, t.nome FROM biblioteca_seita bs JOIN tecnicas t ON bs.tecnica_id = t.id WHERE bs.seita_id = ?`, [row.seita_id], async (err, tecs = []) => {
            if (err || !tecs.length) {
                await sendReply(message, 'A biblioteca da seita está vazia.');
                return;
            }

            let txt = '📚 *Biblioteca da Seita*\n';
            tecs.forEach((t) => {
                txt += `\n${t.id} - ${t.nome}`;
            });
            await sendReply(message, txt);
        });
    });
}

async function cmdAprenderSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/aprender_seita <id_tecnica>`');
        return;
    }

    const tecId = parseInt(args[0], 10);
    if (Number.isNaN(tecId)) {
        await sendReply(message, 'ID de técnica inválido.');
        return;
    }

    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (_err, membro) => {
        if (!membro) {
            sendReply(message, 'Você não está em uma seita.');
            return;
        }

        db.get(`SELECT * FROM biblioteca_seita WHERE seita_id = ? AND tecnica_id = ?`, [membro.seita_id, tecId], (_err2, bib) => {
            if (!bib) {
                sendReply(message, 'Essa técnica não está na biblioteca.');
                return;
            }

            db.get(`SELECT * FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`, [player.id, tecId], (_err3, exist) => {
                if (exist) {
                    sendReply(message, 'Você já conhece essa técnica.');
                    return;
                }

                db.run(`INSERT INTO tecnicas_aprendidas (player_id, tecnica_id, compreensao, aprendida) VALUES (?, ?, 0, 0)`, [player.id, tecId]);
                sendReply(message, `Você começou a estudar a técnica *${tecId}*. Use /compreender para evoluir.`);
            });
        });
    });
}

// ========================
// SISTEMA DE PROFISSÕES
// ========================
async function cmdProfissao(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (args[0] === 'listar') {
        await sendReply(message, 'Profissões disponíveis: Alquimista, Forjador, Médico, Mestre de Talismã, Mestre de Formações. Use /profissao escolher <nome>');
        return;
    }

    if (args[0] === 'escolher' && args[1]) {
        const prof = args.slice(1).join(' ').toLowerCase();
        const validas = ['alquimista', 'forjador', 'médico', 'mestre de talismã', 'mestre de formações'];
        if (!validas.includes(prof)) {
            await sendReply(message, 'Profissão inválida.');
            return;
        }

        await updatePlayer(player.id, 'profissao_principal', prof);
        await updatePlayer(player.id, 'nivel_profissao', 1);
        db.run(`INSERT OR REPLACE INTO profissoes (player_id, profissao, nivel, experiencia) VALUES (?, ?, 1, 0)`, [player.id, prof]);
        await sendReply(message, `Você agora é um ${prof}. Use /craftar para fabricar itens.`);
        return;
    }

    await sendReply(message, `Sua profissão: ${player.profissao_principal || 'nenhuma'} (nível ${player.nivel_profissao || 0}). Use /profissao escolher <nome> para mudar.`);
}

async function cmdCraftar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!player.profissao_principal) {
        await sendReply(message, 'Você não tem uma profissão. Escolha uma com `/profissao escolher`.');
        return;
    }

    if (!args[0]) {
        await sendReply(message, 'Uso: `/craftar <item>` (ex: poção, espada)');
        return;
    }

    const itemNome = args.join(' ');
    await sendReply(message, `🧪 Você tentou craftar ${itemNome}, mas o sistema de crafting ainda está em desenvolvimento detalhado. Por hora, use /loja para comprar.`);
}

async function cmdSubirProfissao(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!player.profissao_principal) {
        await sendReply(message, 'Você não tem profissão.');
        return;
    }

    db.get(`SELECT * FROM profissoes WHERE player_id = ?`, [player.id], async (_err, row) => {
        if (!row) {
            await sendReply(message, 'Registro da profissão não encontrado.');
            return;
        }

        const xpNecessario = row.nivel * 100;
        if (row.experiencia >= xpNecessario) {
            const novoNivel = row.nivel + 1;
            db.run(`UPDATE profissoes SET nivel = ?, experiencia = ? WHERE player_id = ?`, [novoNivel, row.experiencia - xpNecessario, player.id]);
            await updatePlayer(player.id, 'nivel_profissao', novoNivel);
            await sendReply(message, `🎉 Parabéns! Sua profissão agora é nível ${novoNivel}.`);
        } else {
            await sendReply(message, `Você precisa de ${xpNecessario - row.experiencia} XP para subir de nível. Ganhe XP craftando.`);
        }
    });
}

// ========================
// SISTEMA SOCIAL
// ========================
async function cmdAmigos(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    db.all(`SELECT p.nome, p.unique_id FROM amigos_inimigos ai JOIN players p ON ai.alvo_id = p.id WHERE ai.player_id = ? AND ai.tipo = 'amigo'`, [player.id], async (_err, rows = []) => {
        let txt = '👥 *Amigos*\n';
        rows.forEach((r) => {
            txt += `\n${r.nome} (${r.unique_id})`;
        });
        if (!rows.length) txt += '\nNenhum amigo ainda.';
        await sendReply(message, txt);
    });
}

async function cmdAdicionarAmigo(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/adicionaramigo <id_do_jogador>`');
        return;
    }

    const alvo = await getPlayerByUniqueId(args[0]);
    if (!alvo) {
        await sendReply(message, 'Jogador não encontrado.');
        return;
    }

    db.run(`INSERT INTO amigos_inimigos (player_id, alvo_id, tipo) VALUES (?, ?, 'amigo')`, [player.id, alvo.id], async (err) => {
        if (err) await sendReply(message, 'Já são amigos ou ocorreu um erro.');
        else await sendReply(message, `🤝 ${alvo.nome} agora é seu amigo!`);
    });
}

async function cmdInimigo(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/inimigo <id_do_jogador>`');
        return;
    }

    const alvo = await getPlayerByUniqueId(args[0]);
    if (!alvo) {
        await sendReply(message, 'Jogador não encontrado.');
        return;
    }

    db.run(`INSERT INTO amigos_inimigos (player_id, alvo_id, tipo) VALUES (?, ?, 'inimigo')`, [player.id, alvo.id], async (err) => {
        if (err) await sendReply(message, 'Já é inimigo ou ocorreu um erro.');
        else await sendReply(message, `⚠️ Você declarou ${alvo.nome} como inimigo!`);
    });
}

async function cmdConversar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (args.length < 2) {
        await sendReply(message, 'Uso: `/conversar <id_do_jogador> <mensagem>`');
        return;
    }

    const alvo = await getPlayerByUniqueId(args[0]);
    if (!alvo) {
        await sendReply(message, 'Jogador não encontrado.');
        return;
    }

    const texto = args.slice(1).join(' ');
    db.run(`INSERT INTO mensagens_chat (de_id, para_id, mensagem, lida) VALUES (?, ?, ?, 0)`, [player.id, alvo.id, texto]);
    await sendReply(message, `Mensagem enviada para ${alvo.nome}.`);
}

async function cmdLerChat(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    db.all(`SELECT m.mensagem, p.nome as de_nome FROM mensagens_chat m JOIN players p ON m.de_id = p.id WHERE m.para_id = ? AND m.lida = 0`, [player.id], async (err, rows = []) => {
        if (err || !rows.length) {
            await sendReply(message, 'Nenhuma mensagem nova.');
            return;
        }

        let txt = '📬 *Mensagens não lidas*\n';
        rows.forEach((r) => {
            txt += `\n${r.de_nome}: ${r.mensagem}`;
        });
        db.run(`UPDATE mensagens_chat SET lida = 1 WHERE para_id = ?`, [player.id]);
        await sendReply(message, txt);
    });
}

// ========================
// SISTEMA DE DOMÍNIOS (MASMORRAS)
// ========================
async function cmdDominio(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (args.length === 0) {
        db.all(`SELECT * FROM dominios WHERE nivel_minimo <= ?`, [player.nivel_fisico], async (err, dominios = []) => {
            if (err || !dominios.length) {
                await sendReply(message, 'Nenhum domínio disponível para seu nível ainda.');
                return;
            }

            let txt = '🏰 *DOMÍNIOS DISPONÍVEIS*\n\n';
            dominios.forEach((d) => {
                txt += `*${d.nome}* (nível mínimo ${d.nivel_minimo})\n${d.descricao}\nAndares: ${d.andares} | Recompensa base: ${d.recompensa_base_ouro} ouro\nUse: \`/dominio entrar ${d.nome}\`\n\n`;
            });
            await sendReply(message, txt);
        });
        return;
    }

    const subcmd = args[0].toLowerCase();
    const nomeDominio = args.slice(1).join(' ');

    if (subcmd === 'entrar') {
        if (!nomeDominio) {
            await sendReply(message, 'Use: `/dominio entrar <nome_do_dominio>`');
            return;
        }

        db.get(`SELECT * FROM dominios WHERE nome = ? AND nivel_minimo <= ?`, [nomeDominio, player.nivel_fisico], (_err, dominio) => {
            if (!dominio) {
                sendReply(message, 'Domínio não encontrado ou seu nível é muito baixo.');
                return;
            }

            db.get(`SELECT * FROM dominio_instancias WHERE player_id = ? AND dominio_id = ?`, [player.id, dominio.id], (_err2, instancia) => {
                if (instancia && instancia.status === 'em_andamento') {
                    sendReply(message, `Você já está explorando ${dominio.nome} (andar ${instancia.andar_atual}/${dominio.andares}). Continue com /dominio continuar.`);
                    return;
                }

                if (instancia) {
                    db.run(`UPDATE dominio_instancias SET andar_atual = 1, status = 'em_andamento', data_inicio = CURRENT_TIMESTAMP WHERE player_id = ? AND dominio_id = ?`, [player.id, dominio.id], async (err3) => {
                        if (err3) {
                            log(`Erro ao reiniciar domínio ${dominio.nome}: ${err3?.message || err3}`, 'ERRO');
                            await sendReply(message, 'Erro ao reiniciar o domínio.');
                            return;
                        }
                        await sendReply(message, `🌟 Você entrou no domínio *${dominio.nome}*. Andar 1/${dominio.andares}. Use /dominio continuar para avançar.`);
                    });
                    return;
                }

                db.run(`INSERT INTO dominio_instancias (player_id, dominio_id, andar_atual, status) VALUES (?, ?, 1, 'em_andamento')`, [player.id, dominio.id], async (err3) => {
                    if (err3) {
                        log(`Erro ao criar instância de domínio ${dominio.nome}: ${err3?.message || err3}`, 'ERRO');
                        await sendReply(message, 'Erro ao entrar no domínio.');
                        return;
                    }
                    await sendReply(message, `🌟 Você entrou no domínio *${dominio.nome}*. Andar 1/${dominio.andares}. Use /dominio continuar para avançar.`);
                });
            });
        });
        return;
    }

    if (subcmd === 'continuar') {
        const batalhaAtual = batalhasAtivas.get(player.id);
        if (batalhaAtual && batalhaAtual.tipo === 'dominio') {
            await sendReply(message, 'Você já está em combate dentro do domínio. Use /atacar, /defender, /usaritem, /usartecnica ou /fugir.');
            return;
        }

        db.get(
            `SELECT di.*, d.nome, d.andares, d.recompensa_base_ouro, d.item_raro_id 
             FROM dominio_instancias di 
             JOIN dominios d ON di.dominio_id = d.id 
             WHERE di.player_id = ? AND di.status = 'em_andamento'`,
            [player.id],
            async (err, instancia) => {
                if (err) {
                    log(`Erro ao continuar domínio: ${err?.message || err}`, 'ERRO');
                    await sendReply(message, 'Erro ao carregar o domínio atual.');
                    return;
                }

                if (!instancia) {
                    await sendReply(message, 'Você não está em nenhum domínio no momento. Use `/dominio entrar <nome>` para começar.');
                    return;
                }

                const andarAtual = instancia.andar_atual;
                const totalAndares = instancia.andares;
                const nome = instancia.nome;
                const inimigo = gerarInimigoDominio(andarAtual, totalAndares);

                await sendReply(message, `🏯 *${nome} - Andar ${andarAtual}/${totalAndares}*
⚔️ Você encontra: *${inimigo.nome}* (HP: ${inimigo.hp})
Use /atacar, /defender, /usaritem, /usartecnica.`);

                batalhasAtivas.set(player.id, {
                    tipo: 'dominio',
                    dominioId: instancia.dominio_id,
                    andar: andarAtual,
                    inimigo,
                    hpInimigo: inimigo.hp,
                    msgId: message.id
                });
            }
        );
        return;
    }

    await sendReply(message, 'Comandos de domínio: `/dominio` (lista), `/dominio entrar <nome>`, `/dominio continuar`');
}

function gerarInimigoDominio(andarAtual, totalAndares) {
    const isChefe = (andarAtual === totalAndares);
    const baseHP = 30 + (andarAtual * 10);
    const baseDano = 5 + (andarAtual * 2);

    const inimigosNormais = [
        { nome: 'Esqueleto Guerreiro', hp: baseHP, dano: baseDano },
        { nome: 'Espírito Vingativo', hp: baseHP + 10, dano: baseDano - 2 },
        { nome: 'Golem de Pedra', hp: baseHP + 20, dano: baseDano - 5, defesa: 3 },
        { nome: 'Loba Sombria', hp: baseHP - 5, dano: baseDano + 5 }
    ];

    const chefes = [
        { nome: 'Rei Esqueleto', hp: baseHP * 2, dano: baseDano + 10 },
        { nome: 'Dragão Jovem', hp: baseHP * 3, dano: baseDano + 15 },
        { nome: 'Feiticeiro Maldito', hp: baseHP * 2, dano: baseDano + 8 }
    ];

    if (isChefe) {
        const chefe = chefes[Math.floor(Math.random() * chefes.length)];
        return { nome: chefe.nome, hp: chefe.hp, dano: chefe.dano, isChefe: true };
    }

    const normal = inimigosNormais[Math.floor(Math.random() * inimigosNormais.length)];
    return { nome: normal.nome, hp: normal.hp, dano: normal.dano, isChefe: false };
}

// ========================
// MISSÕES PESSOAIS
// ========================
async function cmdCriarMissaoPessoal(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (args.length < 2) {
        await sendReply(message, 'Uso: `/criarmissao <descrição> <recompensa_ouro>`');
        return;
    }

    const recompensa = parseInt(args[args.length - 1], 10);
    if (Number.isNaN(recompensa) || recompensa <= 0) {
        await sendReply(message, 'Recompensa inválida.');
        return;
    }

    const desc = args.slice(0, -1).join(' ');
    if (player.ouro < recompensa) {
        await sendReply(message, 'Você não tem ouro suficiente para pagar essa recompensa.');
        return;
    }

    await updatePlayer(player.id, 'ouro', player.ouro - recompensa);
    db.run(`INSERT INTO missoes_pessoais (criador_id, descricao, recompensa_moeda, status) VALUES (?, ?, ?, 'aberta')`, [player.id, desc, recompensa], async function onInsert(err) {
        if (err) await sendReply(message, 'Erro ao criar missão.');
        else await sendReply(message, `✅ Missão criada! ID: ${this.lastID}. Outros jogadores podem aceitá-la.`);
    });
}

async function cmdMissoesDisponiveis(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    db.all(`SELECT mp.id, mp.descricao, mp.recompensa_moeda, p.nome as criador FROM missoes_pessoais mp JOIN players p ON mp.criador_id = p.id WHERE mp.status = 'aberta' AND mp.criador_id != ?`, [player.id], async (_err, rows = []) => {
        if (!rows.length) {
            await sendReply(message, 'Nenhuma missão disponível.');
            return;
        }

        let txt = '📋 *Missões de outros jogadores*\n';
        rows.forEach((r) => {
            txt += `\nID:${r.id} - ${r.descricao} - Recompensa: ${r.recompensa_moeda} ouro - Criador: ${r.criador}`;
        });
        await sendReply(message, txt);
    });
}

async function cmdAceitarMissaoPessoal(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (!args[0]) {
        await sendReply(message, 'Uso: `/aceitarmissao <id_missao>`');
        return;
    }

    const missaoId = parseInt(args[0], 10);
    if (Number.isNaN(missaoId)) {
        await sendReply(message, 'ID de missão inválido.');
        return;
    }

    db.run(`UPDATE missoes_pessoais SET status = 'em_andamento', aceita_por = ? WHERE id = ? AND status = 'aberta'`, [player.id, missaoId], async function onUpdate(err) {
        if (err || this.changes === 0) await sendReply(message, 'Missão não disponível.');
        else await sendReply(message, 'Missão aceita! Complete o objetivo e use `/completarmissao <id>` quando terminar.');
    });
}

async function cmdMinhasMissoes(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    db.all(`SELECT * FROM missoes_pessoais WHERE criador_id = ?`, [player.id], async (_err, rows = []) => {
        let txt = '📌 *Suas missões criadas*\n';
        if (!rows.length) txt += '\nNenhuma missão criada ainda.';
        rows.forEach((r) => {
            txt += `\nID:${r.id} - ${r.descricao} - Status: ${r.status} - Recompensa: ${r.recompensa_moeda}`;
        });
        await sendReply(message, txt);
    });
}

// ========================
// EVENTOS MUNDIAIS
// ========================
async function cmdEventos(_args, message) {
    db.all(`SELECT * FROM eventos_mundiais WHERE ativo = 1 AND datetime(data_inicio) <= datetime('now') AND datetime(data_fim) >= datetime('now')`, async (_err, rows = []) => {
        if (!rows.length) {
            await sendReply(message, 'No momento não há eventos mundiais ativos.');
            return;
        }

        let txt = '🌍 *Eventos Mundiais Ativos*\n';
        rows.forEach((e) => {
            txt += `\n*${e.nome}*: ${e.descricao}\nBônus: ${e.bonus}\nVálido até ${e.data_fim}`;
        });
        await sendReply(message, txt);
    });
}

async function cmdRanking(args, message) {
    const tipo = args[0] || 'forca';
    let order = '';
    let campo = '';

    switch (tipo) {
        case 'forca':
            order = 'forca DESC';
            campo = 'forca';
            break;
        case 'reino':
            order = 'nivel_fisico DESC, sub_fisico DESC';
            campo = 'nivel_fisico';
            break;
        case 'riqueza':
            order = 'ouro DESC';
            campo = 'ouro';
            break;
        case 'karma':
            order = 'karma DESC';
            campo = 'karma';
            break;
        default:
            order = 'forca DESC';
            campo = 'forca';
            break;
    }

    db.all(`SELECT nome, ${campo} as valor FROM players ORDER BY ${order} LIMIT 10`, async (_err, rows = []) => {
        if (!rows.length) {
            await sendReply(message, 'Nenhum jogador encontrado para o ranking.');
            return;
        }

        let txt = `🏆 *Ranking de ${tipo}*\n`;
        rows.forEach((r, i) => {
            txt += `\n${i + 1}. ${r.nome} - ${r.valor}`;
        });
        await sendReply(message, txt);
    });
}

// ========================
// COMANDOS DE ADMIN (APENAS DONO)
// ========================
async function cmdBanir(args, message, telefone) {
    if (!isOwner(message, telefone)) {
        await sendReply(message, 'Apenas o dono pode usar este comando.');
        return;
    }

    if (!args[0]) {
        await sendReply(message, 'Uso: `/banir <id_do_jogador> [motivo]`');
        return;
    }

    const alvo = await getPlayerByUniqueId(args[0]);
    const motivo = args.slice(1).join(' ') || 'sem motivo';

    if (!alvo) {
        await sendReply(message, 'Jogador não encontrado.');
        return;
    }

    db.run(`UPDATE players SET banido = 1 WHERE id = ?`, [alvo.id]);
    await sendReply(message, `Jogador ${alvo.nome} foi banido. Motivo: ${motivo}`);

    const target = buildDirectId(alvo.telefone);
    if (target) {
        await client.sendMessage(target, `⚠️ Você foi banido do jogo. Motivo: ${motivo}`);
    }
}

async function cmdDarItem(args, message, telefone) {
    if (!isOwner(message, telefone)) {
        await sendReply(message, 'Apenas o dono.');
        return;
    }

    if (args.length < 2) {
        await sendReply(message, 'Uso: `/daritem <id_jogador> <id_item> <quantidade>`');
        return;
    }

    const alvo = await getPlayerByUniqueId(args[0]);
    const itemId = parseInt(args[1], 10);
    const qtd = parseInt(args[2], 10) || 1;

    if (!alvo) {
        await sendReply(message, 'Jogador não encontrado.');
        return;
    }

    if (Number.isNaN(itemId) || qtd <= 0) {
        await sendReply(message, 'Parâmetros inválidos.');
        return;
    }

    db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, ?) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + ?`, [alvo.id, itemId, qtd, qtd]);
    await sendReply(message, `Item ${itemId} x${qtd} entregue a ${alvo.nome}.`);
}

async function cmdResetar(args, message, telefone) {
    if (!isOwner(message, telefone)) {
        await sendReply(message, 'Apenas o dono.');
        return;
    }

    if (!args[0]) {
        await sendReply(message, 'Uso: `/resetar <id_jogador>`');
        return;
    }

    const alvo = await getPlayerByUniqueId(args[0]);
    if (!alvo) {
        await sendReply(message, 'Jogador não encontrado.');
        return;
    }

    db.run(`DELETE FROM players WHERE id = ?`, [alvo.id]);
    db.run(`DELETE FROM inventario WHERE player_id = ?`, [alvo.id]);
    await sendReply(message, `Jogador ${alvo.nome} foi resetado.`);
}

async function cmdAnuncio(args, message, telefone) {
    if (!isOwner(message, telefone)) {
        await sendReply(message, 'Apenas o dono.');
        return;
    }

    if (!args.length) {
        await sendReply(message, 'Uso: `/anuncio <texto>`');
        return;
    }

    const texto = args.join(' ');
    db.all(`SELECT telefone FROM players`, async (_err, rows = []) => {
        for (const row of rows) {
            const target = buildDirectId(row.telefone);
            if (target) {
                await client.sendMessage(target, `📢 *ANÚNCIO GLOBAL*: ${texto}`);
            }
        }
        await sendReply(message, 'Anúncio enviado a todos os jogadores.');
    });
}

// ========== PROCESSADOR DE COMANDOS ==========
async function processCommand(message) {
    try {
        if (!message || typeof message !== 'object') return;

        const body = typeof message.body === 'string' ? message.body.trim() : '';
        if (!body.startsWith(COMMAND_PREFIX)) return;

        const parts = body.slice(COMMAND_PREFIX.length).trim().split(/\s+/).filter(Boolean);
        const cmd = (parts[0] || '').toLowerCase();
        const args = parts.slice(1);
        const telefone = getSenderId(message);

        if (!telefone) {
            await sendReply(message, 'Não foi possível identificar o remetente da mensagem.');
            return;
        }

        const existingPlayer = await getPlayer(telefone);
        if (existingPlayer?.banido && !isOwner(message, telefone)) {
            await sendReply(message, '🚫 Seu acesso ao jogo está bloqueado.');
            return;
        }


        const commands = {
            registrar: cmdRegistrar,
            perfil: cmdPerfil,
            mudaraparencia: cmdMudarAparencia,
            cultivar: cmdCultivar,
            tecnicas: cmdTecnicas,
            compreender: cmdCompreender,
            aprender: cmdAprender,
            inventario: cmdInventario,
            usar: cmdUsarItem,
            usaritem: cmdUsarItem,
            usartecnica: cmdUsarTecnica,
            loja: cmdLoja,
            menu: cmdMenu,
            ajuda: cmdAjuda,
            descansar: cmdDescansar,
            changelog: cmdChangelog,
            andar: cmdAndar,
            parar: cmdParar,
            dominio: cmdDominio,
            criarseita: cmdCriarSeita,
            convidar: cmdConvidar,
            aceitarconvite: cmdAceitarConvite,
            sairseita: cmdSairSeita,
            missoes: cmdMissoes,
            aceitar: cmdAceitarMissao,
            doar: cmdDoar,
            tecnicaseita: cmdTecnicaSeita,
            biblioteca: cmdBiblioteca,
            aprender_seita: cmdAprenderSeita,
            profissao: cmdProfissao,
            craftar: cmdCraftar,
            subirprofissao: cmdSubirProfissao,
            amigos: cmdAmigos,
            adicionaramigo: cmdAdicionarAmigo,
            inimigo: cmdInimigo,
            conversar: cmdConversar,
            lerchat: cmdLerChat,
            criarmissao: cmdCriarMissaoPessoal,
            minhasmissoes: cmdMinhasMissoes,
            missoesdisponiveis: cmdMissoesDisponiveis,
            aceitarmissao: cmdAceitarMissaoPessoal,
            completarmissao: cmdCompletarMissao,
            eventos: cmdEventos,
            ranking: cmdRanking,
            banir: cmdBanir,
            daritem: cmdDarItem,
            resetar: cmdResetar,
            anuncio: cmdAnuncio,
            guia: cmdGuia,
            status: cmdPerfil,
            atributos: cmdPerfil,
            romper: cmdRomper,
            jogadores: cmdJogadores,
            encontrar: cmdEncontrar,
            trocar: cmdTrocar,
            duelar: cmdDuelar,
            mercado: cmdMercadoGlobal,
            npc: cmdNPCInteragir,
            interagir: cmdNPCInteragir,
            atacar: cmdAtacar,
            defender: cmdDefender,
            fugir: cmdFugir
        };

        if (commands[cmd]) {
            await commands[cmd](args, message, telefone);
        } else {
            await sendReply(message, 'Comando desconhecido. Use `/menu`.');
        }
    } catch (err) {
        log(`Erro em processCommand: ${err?.stack || err}`, 'ERRO');
        await sendReply(message, 'Ocorreu um erro ao processar seu comando.');
    }
}


async function shutdown(signal) {
    try {
        log(`Encerrando bot (${signal})...`, 'INFO');
        await client.destroy().catch(() => {});
        db.close();
    } finally {
        process.exit(0);
    }
}

process.on('SIGINT', () => {
    shutdown('SIGINT');
});

process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});

client.initialize();
