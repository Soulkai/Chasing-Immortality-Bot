
// ============================================
// CHASING IMMORTALITY BOT - CÓDIGO COMPLETO (CORRIGIDO)
// ============================================

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const sqlite3 = require('sqlite3').verbose();
const qrcode = require('qrcode-terminal');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function normalizeKey(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
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

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
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

// ========================
// COMANDOS DE VIAGEM
// ========================
async function cmdViajarCidade(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args.length) {
        db.all(`SELECT nome, nivel_minimo FROM locais_mae WHERE tipo = 'cidade' ORDER BY nivel_minimo`, (err, rows) => {
            if (err || !rows.length) return sendReply(message, 'Nenhuma cidade disponível.');
            let lista = '🏙️ *Cidades disponíveis:*\n';
            rows.forEach(r => lista += `- ${r.nome} (mínimo nível ${r.nivel_minimo})\n`);
            lista += '\nUse `/viajarcidade <nome>` para viajar.';
            sendReply(message, lista);
        });
        return;
    }
    const nomeCidade = args.join(' ');
    db.get(`SELECT * FROM locais_mae WHERE LOWER(nome) = LOWER(?) AND tipo = 'cidade'`, [nomeCidade], async (err, cidade) => {
        if (err || !cidade) return sendReply(message, `Cidade "${nomeCidade}" não encontrada.`);
        if (player.nivel_fisico < cidade.nivel_minimo) {
            return sendReply(message, `Seu nível (${player.nivel_fisico}) é muito baixo para ${cidade.nome} (mínimo ${cidade.nivel_minimo}).`);
        }
        await updatePlayer(player.id, 'localizacao', cidade.nome);
        sendReply(message, `✨ Você viajou para *${cidade.nome}*. ${cidade.descricao}\nUse /regioes para explorar as regiões próximas.`);
    });
}

async function cmdViajarReino(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args.length) {
        db.all(`SELECT nome, nivel_minimo FROM locais_mae WHERE tipo = 'reino' ORDER BY nivel_minimo`, (err, rows) => {
            if (err || !rows.length) return sendReply(message, 'Nenhum reino disponível.');
            let lista = '🏰 *Reinos disponíveis:*\n';
            rows.forEach(r => lista += `- ${r.nome} (mínimo nível ${r.nivel_minimo})\n`);
            lista += '\nUse `/viajarreino <nome>` para viajar.';
            sendReply(message, lista);
        });
        return;
    }
    const nomeReino = args.join(' ');
    db.get(`SELECT * FROM locais_mae WHERE LOWER(nome) = LOWER(?) AND tipo = 'reino'`, [nomeReino], async (err, reino) => {
        if (err || !reino) return sendReply(message, `Reino "${nomeReino}" não encontrado.`);
        if (player.nivel_fisico < reino.nivel_minimo) {
            return sendReply(message, `Seu nível (${player.nivel_fisico}) é muito baixo para ${reino.nome} (mínimo ${reino.nivel_minimo}).`);
        }
        await updatePlayer(player.id, 'localizacao', reino.nome);
        sendReply(message, `✨ Você viajou para *${reino.nome}*. ${reino.descricao}\nUse /regioes para explorar.`);
    });
}

async function cmdViajarImperio(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args.length) {
        db.all(`SELECT nome, nivel_minimo FROM locais_mae WHERE tipo = 'imperio' ORDER BY nivel_minimo`, (err, rows) => {
            if (err || !rows.length) return sendReply(message, 'Nenhum império disponível.');
            let lista = '🏛️ *Impérios disponíveis:*\n';
            rows.forEach(r => lista += `- ${r.nome} (mínimo nível ${r.nivel_minimo})\n`);
            lista += '\nUse `/viajarimperio <nome>` para viajar.';
            sendReply(message, lista);
        });
        return;
    }
    const nomeImperio = args.join(' ');
    db.get(`SELECT * FROM locais_mae WHERE LOWER(nome) = LOWER(?) AND tipo = 'imperio'`, [nomeImperio], async (err, imperio) => {
        if (err || !imperio) return sendReply(message, `Império "${nomeImperio}" não encontrado.`);
        if (player.nivel_fisico < imperio.nivel_minimo) {
            return sendReply(message, `Seu nível (${player.nivel_fisico}) é muito baixo para ${imperio.nome} (mínimo ${imperio.nivel_minimo}).`);
        }
        await updatePlayer(player.id, 'localizacao', imperio.nome);
        sendReply(message, `✨ Você viajou para *${imperio.nome}*. ${imperio.descricao}\nUse /regioes para explorar.`);
    });
}

// Adicione esses comandos ao objeto 'commands' no processCommand:
// viajarcidade: cmdViajarCidade,
// viajarreino: cmdViajarReino,
// viajarimperio: cmdViajarImperio,
async function cmdRegioes(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    // Se passou um nome de região como argumento, mostra detalhes
    if (args.length > 0) {
        const nomeRegiao = args.join(' ').toLowerCase();
        db.get(`SELECT * FROM regioes WHERE LOWER(nome) = ?`, [nomeRegiao], (err, regiao) => {
            if (err || !regiao) {
                sendReply(message, `Região "${args.join(' ')}" não encontrada. Use /regioes para listar todas.`);
                return;
            }
            let detalhes = `🏞️ *${regiao.nome}*\n`;
            detalhes += `📖 ${regiao.descricao}\n`;
            detalhes += `🎯 Nível recomendado: ${regiao.nivel_minimo} - ${regiao.nivel_maximo}\n`;
            detalhes += `⚠️ Perigo: ${regiao.perigo.toUpperCase()}\n`;
            detalhes += `💰 Recompensa base: ${regiao.recompensa_base} ouro\n`;
            if (regiao.localizacao_pai) detalhes += `🗺️ Localização: ${regiao.localizacao_pai}\n`;
            sendReply(message, detalhes);
        });
        return;
    }

    // Lista todas as regiões
    db.all(`SELECT nome, nivel_minimo, nivel_maximo, perigo FROM regioes ORDER BY nivel_minimo ASC`, (err, rows) => {
        if (err || !rows.length) {
            sendReply(message, 'Nenhuma região cadastrada ainda.');
            return;
        }
        let lista = `🗺️ *REGIÕES DISPONÍVEIS*\n\n`;
        rows.forEach(r => {
            lista += `📍 *${r.nome}* (nível ${r.nivel_minimo}-${r.nivel_maximo}) - Perigo: ${r.perigo}\n`;
        });
        lista += `\nUse /regioes <nome> para ver detalhes de uma região.`;
        sendReply(message, lista);
    });
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
            regioes: cmdRegioes,
            viajarcidade: cmdViajarCidade,
            viajarregiao: cmdViajarRegiao,
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



// ========================
// ETAPA 3 - MUNDO VIVO, IA OPCIONAL E RETRATOS PERSISTENTES
// ========================
const GENERATED_DIR = path.join(__dirname, 'generated_assets');
const GENERATED_IMAGES_DIR = path.join(GENERATED_DIR, 'images');
const AI_PROVIDER = normalizeKey(process.env.AI_PROVIDER || 'fallback');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';
const IMAGE_PROVIDER = normalizeKey(process.env.IMAGE_PROVIDER || 'disabled');
const IMAGE_API_URL = process.env.IMAGE_API_URL || '';
const IMAGE_TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS || 45000);
const IMAGE_HOST_PROVIDER = normalizeKey(process.env.IMAGE_HOST_PROVIDER || process.env.IMAGE_UPLOAD_PROVIDER || 'disabled');
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';
const IMAGEKIT_PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY || '';
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY || '';
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT || '';
const IMAGEKIT_FOLDER = process.env.IMAGEKIT_FOLDER || '/chasing-immortality';
const IMAGE_PUBLIC_BASE_URL = process.env.IMAGE_PUBLIC_BASE_URL || '';
const npcDialogueSessions = new Map();
globalThis.__npcDialogueSessions = npcDialogueSessions;

function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDirSync(GENERATED_DIR);
ensureDirSync(GENERATED_IMAGES_DIR);

function capFirst(value) {
    const s = String(value || '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function formatBar(value, max, size = 10) {
    const safeMax = Math.max(1, Number(max || 1));
    const safeVal = clamp(Number(value || 0), 0, safeMax);
    const filled = Math.round((safeVal / safeMax) * size);
    return `${'█'.repeat(filled)}${'░'.repeat(size - filled)}`;
}
function signedNumber(value) {
    const num = Number(value || 0);
    return num > 0 ? `+${num}` : String(num);
}
function safeJsonParse(value, fallback = {}) {
    try { return value ? JSON.parse(value) : fallback; } catch (_err) { return fallback; }
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }
function normalizeEntityKey(entityType, entityKey) {
    return `${normalizeKey(entityType)}:${normalizeKey(entityKey)}`;
}

async function ensureColumn(tableName, columnName, definition) {
    const cols = await allQuery(`PRAGMA table_info(${tableName})`);
    if (!cols.some((col) => col.name === columnName)) {
        await runQuery(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    }
}

async function ensureStage3Schema() {
    await ensureColumn('players', 'alma_atual', 'alma_atual INTEGER DEFAULT 50');
    await ensureColumn('players', 'alma_maxima', 'alma_maxima INTEGER DEFAULT 50');
    await ensureColumn('players', 'merito', 'merito INTEGER DEFAULT 0');
    await ensureColumn('players', 'banido', 'banido INTEGER DEFAULT 0');
    await ensureColumn('entity_portraits', 'entity_name', 'entity_name TEXT');
    await ensureColumn('entity_portraits', 'public_url', 'public_url TEXT');
    await ensureColumn('entity_portraits', 'host_provider', 'host_provider TEXT');
    await ensureColumn('entity_portraits', 'source_url', 'source_url TEXT');
    await ensureColumn('entity_portraits', 'mime_type', 'mime_type TEXT');
    await ensureColumn('entity_portraits', 'content_hash', 'content_hash TEXT');
    await ensureColumn('entity_portraits', 'updated_at', 'updated_at TEXT DEFAULT CURRENT_TIMESTAMP');

    const statements = [
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventario_player_item_unique ON inventario(player_id, item_id)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_equipamentos_player_slot_unique ON equipamentos(player_id, slot)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_biblioteca_seita_unique ON biblioteca_seita(seita_id, tecnica_id)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_amigos_inimigos_unique ON amigos_inimigos(player_id, alvo_id, tipo)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_npcs_nome_local_unique ON npcs(nome, localizacao)`,
        `CREATE TABLE IF NOT EXISTS npc_profiles (
            npc_id INTEGER PRIMARY KEY,
            titulo TEXT,
            personalidade TEXT,
            arquetipo TEXT,
            estilo TEXT,
            prompt_base TEXT,
            FOREIGN KEY(npc_id) REFERENCES npcs(id)
        )`,
        `CREATE TABLE IF NOT EXISTS npc_relacoes (
            npc_id INTEGER,
            player_id INTEGER,
            afinidade INTEGER DEFAULT 0,
            confianca INTEGER DEFAULT 0,
            medo INTEGER DEFAULT 0,
            favor INTEGER DEFAULT 0,
            memoria_curta TEXT DEFAULT '',
            ultima_interacao TEXT DEFAULT CURRENT_TIMESTAMP,
            flags_json TEXT DEFAULT '{}',
            PRIMARY KEY (npc_id, player_id)
        )`,
        `CREATE TABLE IF NOT EXISTS npc_quests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            npc_id INTEGER,
            nome TEXT,
            descricao TEXT,
            objetivo_tipo TEXT,
            objetivo_alvo TEXT,
            objetivo_quantidade INTEGER DEFAULT 1,
            recompensa_ouro INTEGER DEFAULT 0,
            recompensa_item_id INTEGER,
            recompensa_merito INTEGER DEFAULT 0,
            branch_benevolente TEXT,
            branch_pragmatica TEXT,
            branch_cruel TEXT,
            UNIQUE(npc_id, nome)
        )`,
        `CREATE TABLE IF NOT EXISTS npc_quest_progress (
            player_id INTEGER,
            quest_id INTEGER,
            status TEXT DEFAULT 'oferecida',
            progresso INTEGER DEFAULT 0,
            branch_escolhida TEXT DEFAULT 'pragmatica',
            data_inicio TEXT DEFAULT CURRENT_TIMESTAMP,
            data_conclusao TEXT,
            PRIMARY KEY (player_id, quest_id)
        )`,
        `CREATE TABLE IF NOT EXISTS entity_portraits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT,
            entity_key TEXT,
            entity_name TEXT,
            image_path TEXT,
            remote_url TEXT,
            public_url TEXT,
            source_url TEXT,
            prompt TEXT,
            provider TEXT,
            host_provider TEXT,
            seed TEXT,
            mime_type TEXT,
            content_hash TEXT,
            status TEXT DEFAULT 'cached',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(entity_type, entity_key)
        )`,
        `CREATE TABLE IF NOT EXISTS sect_relations (
            fac_a TEXT,
            fac_b TEXT,
            relacao INTEGER DEFAULT 0,
            descricao TEXT,
            PRIMARY KEY (fac_a, fac_b)
        )`,
        `CREATE TABLE IF NOT EXISTS player_bonds (
            player_id INTEGER,
            bond_type TEXT,
            bond_key TEXT,
            bond_name TEXT,
            data_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (player_id, bond_type)
        )`,
        `CREATE TABLE IF NOT EXISTS rumor_cache (
            scope_key TEXT,
            rumor_date TEXT,
            rumors_json TEXT,
            PRIMARY KEY (scope_key, rumor_date)
        )`
    ];
    for (const statement of statements) await runQuery(statement);
    await seedStage3Data();
}

async function seedStage3Data() {
    const npcSeeds = [
        ['Velho Lin','Floresta Sombria','O velho apoia-se no cajado de bambu e observa sua respiração, como se lesse os meridianos da sua alma.','Mestre Errante da Névoa','solene, perspicaz, paciente, testa o coração antes da lâmina','mestre','wuxia/xianxia, montanhas, névoa, vestes simples, presença serena','ancião cultivador wuxia, mestre errante, barba longa, cajado de bambu, névoa de floresta, arte xianxia detalhada'],
        ['Madame Xue','Vila Inicial','O perfume do incenso e do chá de ameixa envolve o pátio enquanto a mercadora sorri como quem esconde três segredos.','Mercadora das Mil Histórias','astuta, cordial, mercantil, observa o valor das pessoas','mercadora','mercado oriental, seda, lanternas, luxo contido','mercadora wuxia elegante, roupas de seda vermelha, mercado oriental, lanternas douradas, arte xianxia refinada'],
        ['Monge Shen','Templo Antigo','Cada pedra do templo parece ecoar sutras antigos quando o monge cruza as mãos diante do peito.','Guardião do Sino Vazio','disciplinado, austero, compassivo, inimigo do caos','guardiao','templo antigo, pedras, sinos, iluminação dourada','monge guerreiro wuxia, templo antigo, contas de oração, luz dourada, arte xianxia detalhada'],
        ['Bai Qinghe','global','Um jovem de sobrancelhas afiadas fita você como se esta fosse apenas mais uma página da história que pretende dominar.','Lâmina Rival do Rio Branco','orgulhoso, competitivo, ambicioso, não esquece humilhações','rival','espadachim jovem, vento, rio, roupas brancas','espadachim rival wuxia, roupas brancas, margem de rio, olhar frio, arte xianxia cinematográfica']
    ];
    for (const seed of npcSeeds) {
        await runQuery(`INSERT OR IGNORE INTO npcs (nome, localizacao, dialogo_inicial, opcoes, missao_id) VALUES (?, ?, ?, ?, NULL)`, [seed[0], seed[1], seed[2], '[]']);
        const npc = await getQuery(`SELECT id FROM npcs WHERE nome = ? AND localizacao = ?`, [seed[0], seed[1]]);
        if (npc) {
            await runQuery(`INSERT OR REPLACE INTO npc_profiles (npc_id, titulo, personalidade, arquetipo, estilo, prompt_base) VALUES (?, ?, ?, ?, ?, ?)`, [npc.id, seed[3], seed[4], seed[5], seed[6], seed[7]]);
        }
    }

    const herb = await getOrCreateItemByName('Erva do Orvalho Noturno', { tipo: 'material', raridade: 'Comum', efeito: 'Ingrediente espiritual', valor_venda: 8, valor_compra: 16 });
    const bone = await getOrCreateItemByName('Fragmento de Osso Espiritual', { tipo: 'material', raridade: 'Incomum', efeito: 'Ingrediente de bestas espirituais', valor_venda: 12, valor_compra: 25 });
    await getOrCreateItemByName('Selo de Jade Partido', { tipo: 'material', raridade: 'Raro', efeito: 'Vestígio de artefato antigo', valor_venda: 35, valor_compra: 70 });

    const velhoLin = await getQuery(`SELECT id FROM npcs WHERE nome = 'Velho Lin' LIMIT 1`);
    const madameXue = await getQuery(`SELECT id FROM npcs WHERE nome = 'Madame Xue' LIMIT 1`);
    const mongeShen = await getQuery(`SELECT id FROM npcs WHERE nome = 'Monge Shen' LIMIT 1`);

    if (velhoLin) await runQuery(`INSERT OR IGNORE INTO npc_quests (npc_id, nome, descricao, objetivo_tipo, objetivo_alvo, objetivo_quantidade, recompensa_ouro, recompensa_item_id, recompensa_merito, branch_benevolente, branch_pragmatica, branch_cruel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [velhoLin.id, 'Ecos na Floresta Sombria', 'Derrote criaturas hostis na Floresta Sombria e retorne com o coração disciplinado.', 'kill', 'Lobo Selvagem', 2, 45, bone.id, 3, 'Velho Lin reconhece sua compaixão e abre um raro conselho sobre respiração.', 'Velho Lin aceita seu pragmatismo e entrega uma rota segura pela mata.', 'Velho Lin percebe o cheiro de sangue em você, mas ainda aproveita sua ferocidade.']);
    if (madameXue) await runQuery(`INSERT OR IGNORE INTO npc_quests (npc_id, nome, descricao, objetivo_tipo, objetivo_alvo, objetivo_quantidade, recompensa_ouro, recompensa_item_id, recompensa_merito, branch_benevolente, branch_pragmatica, branch_cruel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [madameXue.id, 'Perfume da Lua de Ameixa', 'Entregue ervas raras para Madame Xue preparar um lote especial de incenso espiritual.', 'item', 'Erva do Orvalho Noturno', 2, 35, herb.id, 2, 'A mercadora marca seu nome entre os clientes confiáveis.', 'A mercadora elogia sua eficiência e oferece informações úteis.', 'A mercadora sorri, mas nunca esquecerá sua ganância.']);
    if (mongeShen) await runQuery(`INSERT OR IGNORE INTO npc_quests (npc_id, nome, descricao, objetivo_tipo, objetivo_alvo, objetivo_quantidade, recompensa_ouro, recompensa_item_id, recompensa_merito, branch_benevolente, branch_pragmatica, branch_cruel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [mongeShen.id, 'Passos entre Sinos Antigos', 'Explore o Templo Antigo e retorne com a mente clara.', 'explore', 'Templo Antigo', 2, 55, null, 4, 'O monge aprofunda sua serenidade com um sutra oral.', 'O monge considera seu foco aceitável e lhe entrega um aviso sobre espíritos.', 'O monge detecta sua impaciência, mas ainda lhe concede passagem.']);

    const sectSeeds = [
        ['Wudang', 'Tang', -10, 'A tensão é fria, mas controlada.'],
        ['Wudang', 'Murong', 12, 'Uma aliança cautelosa mantém as estradas seguras.'],
        ['Shaolin', 'Emei', 18, 'As duas facções cooperam contra artes proibidas.'],
        ['Namgung', 'Tang', -18, 'Velhas dívidas mancham as relações.'],
        ['Pavilhão da Lua Sangrenta', 'Shaolin', -35, 'Sangue e sutras jamais concordaram.'],
        ['Senda Demoníaca do Norte', 'Wudang', -40, 'O conflito é quase inevitável.']
    ];
    for (const [a, b, rel, desc] of sectSeeds) {
        await runQuery(`INSERT OR IGNORE INTO sect_relations (fac_a, fac_b, relacao, descricao) VALUES (?, ?, ?, ?)`, [a, b, rel, desc]);
        await runQuery(`INSERT OR IGNORE INTO sect_relations (fac_a, fac_b, relacao, descricao) VALUES (?, ?, ?, ?)`, [b, a, rel, desc]);
    }
    await runQuery(`INSERT OR IGNORE INTO changelog (versao, data, texto) VALUES (?, date('now'), ?)`, ['v3.0.0', 'Etapa 3: memória de NPC, rumores dinâmicos, eventos narrativos, mestres, rivais, política de seitas e retratos persistentes.']);
}

async function initializeNarrativeStats(player) {
    if (!player) return player;
    let almaMax = Number(player.alma_maxima || 0);
    let almaAtual = Number(player.alma_atual || 0);
    if (!almaMax || !almaAtual) {
        almaMax = Math.max(50, Math.floor((Number(player.espirito || 10) * 4) + (Number(player.inteligencia || 10) * 2)));
        almaAtual = almaMax;
        await updatePlayer(player.id, 'alma_maxima', almaMax);
        await updatePlayer(player.id, 'alma_atual', almaAtual);
    }
    if (player.merito == null) await updatePlayer(player.id, 'merito', 0);
    return { ...player, alma_maxima: almaMax, alma_atual: almaAtual, merito: Number(player.merito || 0) };
}

async function getNpcProfile(npcId) { return getQuery(`SELECT * FROM npc_profiles WHERE npc_id = ?`, [npcId]); }

async function getOrCreateNpcRelation(playerId, npcId) {
    await runQuery(`INSERT OR IGNORE INTO npc_relacoes (npc_id, player_id) VALUES (?, ?)`, [npcId, playerId]);
    return getQuery(`SELECT * FROM npc_relacoes WHERE npc_id = ? AND player_id = ?`, [npcId, playerId]);
}

async function updateNpcRelation(playerId, npcId, delta = {}, memoryLine = null) {
    const current = await getOrCreateNpcRelation(playerId, npcId);
    const memoria = [current.memoria_curta, memoryLine].filter(Boolean).join(' | ').slice(-400);
    await runQuery(`UPDATE npc_relacoes SET afinidade = ?, confianca = ?, medo = ?, favor = ?, memoria_curta = ?, ultima_interacao = ? WHERE npc_id = ? AND player_id = ?`, [
        clamp(Number(current.afinidade || 0) + Number(delta.afinidade || 0), -100, 100),
        clamp(Number(current.confianca || 0) + Number(delta.confianca || 0), -100, 100),
        clamp(Number(current.medo || 0) + Number(delta.medo || 0), -100, 100),
        clamp(Number(current.favor || 0) + Number(delta.favor || 0), -100, 100),
        memoria,
        nowIso(),
        npcId,
        playerId
    ]);
    return getQuery(`SELECT * FROM npc_relacoes WHERE npc_id = ? AND player_id = ?`, [npcId, playerId]);
}

async function getPlayerSeita(playerId) {
    return getQuery(`SELECT s.* FROM seita_membros sm JOIN seitas s ON sm.seita_id = s.id WHERE sm.player_id = ? LIMIT 1`, [playerId]);
}

async function getOrAssignBond(player, bondType) {
    let bond = await getQuery(`SELECT * FROM player_bonds WHERE player_id = ? AND bond_type = ?`, [player.id, bondType]);
    if (bond) return bond;
    if (bondType === 'mestre') {
        const masters = await allQuery(`SELECT n.id, n.nome, n.localizacao, np.titulo FROM npcs n JOIN npc_profiles np ON np.npc_id = n.id WHERE np.arquetipo IN ('mestre','guardiao')`);
        const chosen = masters[Math.floor(Math.random() * Math.max(1, masters.length))] || { id: 0, nome: 'Mestre Sem Rosto', localizacao: 'Montanhas Distantes', titulo: 'Recluso' };
        const data = { provas: 0, ensinou: false, localizacao: chosen.localizacao, titulo: chosen.titulo };
        await runQuery(`INSERT INTO player_bonds (player_id, bond_type, bond_key, bond_name, data_json) VALUES (?, ?, ?, ?, ?)`, [player.id, bondType, String(chosen.id), chosen.nome, JSON.stringify(data)]);
    } else if (bondType === 'rival') {
        const names = ['Han Jue', 'Su Lian', 'Qin Yue', 'Mo Chen', 'Ye Rong', 'Lan Ruoxi'];
        const temperamentos = ['orgulhoso', 'frio', 'vingativo', 'genial', 'feroz'];
        const chosenName = names[Math.floor(Math.random() * names.length)];
        const data = { reino: Math.max(Number(player.nivel_fisico || 1), Number(player.nivel_espiritual || 1)), rancor: 12, ultima_vista: player.localizacao || 'Vila Inicial', temperamento: temperamentos[Math.floor(Math.random() * temperamentos.length)] };
        await runQuery(`INSERT INTO player_bonds (player_id, bond_type, bond_key, bond_name, data_json) VALUES (?, ?, ?, ?, ?)`, [player.id, bondType, normalizeKey(chosenName), chosenName, JSON.stringify(data)]);
    }
    return getQuery(`SELECT * FROM player_bonds WHERE player_id = ? AND bond_type = ?`, [player.id, bondType]);
}

async function callOptionalAI(prompt, fallbackText) {
    if (AI_PROVIDER !== 'ollama') return fallbackText;
    try {
        const res = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: OLLAMA_MODEL, stream: false, prompt, options: { temperature: 0.85, top_p: 0.92 } })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return sanitizeText(data?.response || '') || fallbackText;
    } catch (err) {
        log(`IA opcional indisponível, usando fallback: ${err?.message || err}`, 'INFO');
        return fallbackText;
    }
}

function buildEntityPrompt(entityType, entityKey, extra = '') {
    if (entityType === 'npc') return `${entityKey}, personagem wuxia/xianxia, retrato vertical, pintura digital refinada, atmosfera mística, ${extra}`.trim();
    if (entityType === 'mob') return `${entityKey}, criatura espiritual wuxia/xianxia, arte detalhada, fundo atmosférico, ${extra}`.trim();
    if (entityType === 'regiao') return `${entityKey}, paisagem wuxia/xianxia, fantasia oriental, pintura digital cinematográfica, ${extra}`.trim();
    return `${entityKey}, fantasia oriental wuxia/xianxia, ${extra}`.trim();
}


async function fetchImageToFile(url, outPath) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
        return outPath;
    } finally {
        clearTimeout(timer);
    }
}

function relativeAssetPath(filePath) {
    try {
        return path.relative(__dirname, filePath).replace(/\\/g, '/');
    } catch (_err) {
        return path.basename(filePath || '');
    }
}
function buildPublicUrlFromBase(filePath) {
    if (!IMAGE_PUBLIC_BASE_URL || !filePath) return null;
    const base = String(IMAGE_PUBLIC_BASE_URL).replace(/\/$/, '');
    return `${base}/${relativeAssetPath(filePath)}`;
}
function fileToBase64(filePath) {
    return fs.readFileSync(filePath).toString('base64');
}
function guessMimeType(filePath) {
    const ext = String(path.extname(filePath || '')).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/png';
}
function computeFileHash(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

async function uploadToImgBB(filePath, entityType, entityKey) {
    if (!IMGBB_API_KEY) throw new Error('IMGBB_API_KEY não configurada');
    const form = new FormData();
    form.append('image', fileToBase64(filePath));
    form.append('name', `${entityType}_${normalizeKey(entityKey).replace(/\s+/g, '_') || 'retrato'}`);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(IMGBB_API_KEY)}`, {
        method: 'POST',
        body: form
    });
    if (!response.ok) throw new Error(`ImgBB HTTP ${response.status}`);
    const data = await response.json();
    const url = data?.data?.url || data?.data?.display_url || data?.data?.image?.url;
    if (!url) throw new Error('ImgBB não retornou URL');
    return { publicUrl: url, hostProvider: 'imgbb' };
}

async function uploadToImageKit(filePath, entityType, entityKey) {
    if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_URL_ENDPOINT) throw new Error('IMAGEKIT_PRIVATE_KEY/IMAGEKIT_URL_ENDPOINT não configurados');
    const form = new FormData();
    const safeName = `${entityType}_${normalizeKey(entityKey).replace(/\s+/g, '_') || 'retrato'}${path.extname(filePath) || '.png'}`;
    form.append('file', fileToBase64(filePath));
    form.append('fileName', safeName);
    form.append('useUniqueFileName', 'false');
    form.append('overwriteFile', 'true');
    form.append('folder', IMAGEKIT_FOLDER);
    form.append('tags', `chasing-immortality,${entityType}`);
    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}`
        },
        body: form
    });
    if (!response.ok) throw new Error(`ImageKit HTTP ${response.status}`);
    const data = await response.json();
    const url = data?.url || data?.thumbnailUrl;
    if (!url) throw new Error('ImageKit não retornou URL');
    return { publicUrl: url, hostProvider: 'imagekit' };
}

async function ensureHostedPortraitUrl(record) {
    if (!record) return null;
    if (record.public_url) return record;

    let filePath = record.image_path && fs.existsSync(record.image_path) ? record.image_path : null;
    if (!filePath && record.source_url) {
        const ext = '.png';
        filePath = path.join(GENERATED_IMAGES_DIR, `${record.entity_type}_${crypto.createHash('md5').update(record.entity_key || '').digest('hex').slice(0, 12)}${ext}`);
        try {
            await fetchImageToFile(record.source_url, filePath);
        } catch (err) {
            log(`Falha ao baixar origem do retrato ${record.entity_type}/${record.entity_key}: ${err?.message || err}`, 'ERRO');
            filePath = null;
        }
    }

    if (!filePath && record.remote_url && record.remote_url !== record.public_url) {
        const ext = '.png';
        filePath = path.join(GENERATED_IMAGES_DIR, `${record.entity_type}_${crypto.createHash('md5').update(record.entity_key || '').digest('hex').slice(0, 12)}${ext}`);
        try {
            await fetchImageToFile(record.remote_url, filePath);
        } catch (err) {
            log(`Falha ao baixar remote_url do retrato ${record.entity_type}/${record.entity_key}: ${err?.message || err}`, 'ERRO');
            filePath = null;
        }
    }

    let publicUrl = buildPublicUrlFromBase(filePath);
    let hostProvider = publicUrl ? 'selfhost' : null;

    if (!publicUrl && filePath) {
        try {
            if (IMAGE_HOST_PROVIDER === 'imgbb') {
                ({ publicUrl, hostProvider } = await uploadToImgBB(filePath, record.entity_type, record.entity_name || record.entity_key));
            } else if (IMAGE_HOST_PROVIDER === 'imagekit') {
                ({ publicUrl, hostProvider } = await uploadToImageKit(filePath, record.entity_type, record.entity_name || record.entity_key));
            }
        } catch (err) {
            log(`Falha ao hospedar retrato ${record.entity_type}/${record.entity_key}: ${err?.message || err}`, 'ERRO');
        }
    }

    if (publicUrl || filePath) {
        await runQuery(`UPDATE entity_portraits SET image_path = COALESCE(?, image_path), public_url = COALESCE(?, public_url), host_provider = COALESCE(?, host_provider), mime_type = COALESCE(?, mime_type), content_hash = COALESCE(?, content_hash), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [filePath, publicUrl, hostProvider, filePath ? guessMimeType(filePath) : null, filePath ? computeFileHash(filePath) : null, record.id]);
        return getQuery(`SELECT * FROM entity_portraits WHERE id = ?`, [record.id]);
    }
    return record;
}

async function ensureEntityPortrait(entityType, entityKey, prompt) {
    const key = normalizeEntityKey(entityType, entityKey);
    let existing = await getQuery(`SELECT * FROM entity_portraits WHERE entity_type = ? AND entity_key = ?`, [entityType, key]);
    if (existing) {
        if (existing.image_path && !fs.existsSync(existing.image_path)) existing.image_path = null;
        if (!existing.public_url && (IMAGE_HOST_PROVIDER !== 'disabled' || IMAGE_PUBLIC_BASE_URL)) {
            existing = await ensureHostedPortraitUrl(existing);
        }
        if (existing && (existing.image_path || existing.public_url || existing.remote_url || existing.source_url)) return existing;
    }

    if (!IMAGE_API_URL || IMAGE_PROVIDER === 'disabled') {
        await runQuery(`INSERT INTO entity_portraits (entity_type, entity_key, entity_name, prompt, provider, host_provider, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(entity_type, entity_key) DO UPDATE SET entity_name = excluded.entity_name, prompt = excluded.prompt, provider = excluded.provider, host_provider = excluded.host_provider, status = excluded.status, updated_at = CURRENT_TIMESTAMP`, [entityType, key, entityKey, prompt, IMAGE_PROVIDER || 'disabled', IMAGE_HOST_PROVIDER || 'disabled', 'pending']);
        return getQuery(`SELECT * FROM entity_portraits WHERE entity_type = ? AND entity_key = ?`, [entityType, key]);
    }

    try {
        const response = await fetch(IMAGE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityType, entityKey, prompt, style: 'wuxia/xianxia', cacheKey: key })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        let imagePath = null;
        const sourceUrl = data?.imageUrl || null;
        let publicUrl = null;
        let hostProvider = null;
        if (data?.base64) {
            const extension = String(data.extension || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
            imagePath = path.join(GENERATED_IMAGES_DIR, `${entityType}_${crypto.createHash('md5').update(key).digest('hex').slice(0, 12)}.${extension}`);
            fs.writeFileSync(imagePath, Buffer.from(data.base64, 'base64'));
        } else if (sourceUrl) {
            imagePath = path.join(GENERATED_IMAGES_DIR, `${entityType}_${crypto.createHash('md5').update(key).digest('hex').slice(0, 12)}.png`);
            await fetchImageToFile(sourceUrl, imagePath);
        }

        if (imagePath) {
            publicUrl = buildPublicUrlFromBase(imagePath);
            hostProvider = publicUrl ? 'selfhost' : null;
            if (!publicUrl) {
                try {
                    if (IMAGE_HOST_PROVIDER === 'imgbb') {
                        ({ publicUrl, hostProvider } = await uploadToImgBB(imagePath, entityType, entityKey));
                    } else if (IMAGE_HOST_PROVIDER === 'imagekit') {
                        ({ publicUrl, hostProvider } = await uploadToImageKit(imagePath, entityType, entityKey));
                    }
                } catch (hostErr) {
                    log(`Falha ao hospedar nova imagem ${entityType}/${entityKey}: ${hostErr?.message || hostErr}`, 'ERRO');
                }
            }
        }

        await runQuery(`INSERT INTO entity_portraits (entity_type, entity_key, entity_name, image_path, remote_url, public_url, source_url, prompt, provider, host_provider, seed, mime_type, content_hash, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(entity_type, entity_key) DO UPDATE SET entity_name = excluded.entity_name, image_path = excluded.image_path, remote_url = excluded.remote_url, public_url = COALESCE(excluded.public_url, entity_portraits.public_url), source_url = excluded.source_url, prompt = excluded.prompt, provider = excluded.provider, host_provider = COALESCE(excluded.host_provider, entity_portraits.host_provider), seed = excluded.seed, mime_type = excluded.mime_type, content_hash = excluded.content_hash, status = excluded.status, updated_at = CURRENT_TIMESTAMP`, [entityType, key, entityKey, imagePath, publicUrl || sourceUrl, publicUrl, sourceUrl, prompt, IMAGE_PROVIDER, hostProvider, String(data?.seed || ''), imagePath ? guessMimeType(imagePath) : null, imagePath ? computeFileHash(imagePath) : null, imagePath || publicUrl || sourceUrl ? 'cached' : 'pending']);
        return getQuery(`SELECT * FROM entity_portraits WHERE entity_type = ? AND entity_key = ?`, [entityType, key]);
    } catch (err) {
        log(`Falha ao gerar retrato ${entityType}/${entityKey}: ${err?.message || err}`, 'ERRO');
        await runQuery(`INSERT INTO entity_portraits (entity_type, entity_key, entity_name, prompt, provider, host_provider, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(entity_type, entity_key) DO UPDATE SET entity_name = excluded.entity_name, prompt = excluded.prompt, provider = excluded.provider, host_provider = excluded.host_provider, status = excluded.status, updated_at = CURRENT_TIMESTAMP`, [entityType, key, entityKey, prompt, IMAGE_PROVIDER || 'disabled', IMAGE_HOST_PROVIDER || 'disabled', 'error']);
        return getQuery(`SELECT * FROM entity_portraits WHERE entity_type = ? AND entity_key = ?`, [entityType, key]);
    }
}

async function maybeSendEntityPortrait(message, entityType, entityKey, prompt, caption = '') {
    let portrait = await ensureEntityPortrait(entityType, entityKey, prompt);
    if (portrait && !portrait.public_url && (IMAGE_HOST_PROVIDER !== 'disabled' || IMAGE_PUBLIC_BASE_URL)) {
        portrait = await ensureHostedPortraitUrl(portrait);
    }
    try {
        if (portrait?.image_path && fs.existsSync(portrait.image_path)) {
            await sendReply(message, caption || `${capFirst(entityType)}: ${entityKey}`, MessageMedia.fromFilePath(portrait.image_path));
            return true;
        }
        const externalUrl = portrait?.public_url || portrait?.remote_url || portrait?.source_url;
        if (externalUrl) {
            const media = await MessageMedia.fromUrl(externalUrl, { unsafe: true });
            await sendReply(message, caption || `${capFirst(entityType)}: ${entityKey}`, media);
            return true;
        }
    } catch (err) {
        log(`Falha ao enviar retrato ${entityType}/${entityKey}: ${err?.message || err}`, 'ERRO');
    }
    return false;
}

async function resolveNpcForPlayer(player, token = '') {
    const cleaned = String(token || '').trim();
    if (!cleaned) {
        return getQuery(`SELECT * FROM npcs WHERE localizacao = ? OR localizacao = 'global' ORDER BY CASE WHEN localizacao = ? THEN 0 ELSE 1 END, RANDOM() LIMIT 1`, [player.localizacao, player.localizacao]);
    }
    if (/^\d+$/.test(cleaned)) {
        const byId = await getQuery(`SELECT * FROM npcs WHERE id = ?`, [Number(cleaned)]);
        if (byId) return byId;
    }
    return getQuery(`SELECT * FROM npcs WHERE LOWER(nome) = LOWER(?) AND (localizacao = ? OR localizacao = 'global') LIMIT 1`, [cleaned, player.localizacao]);
}

function buildNpcOptions(npc, profile, relation, player) {
    const arq = normalizeKey(profile?.arquetipo || 'andarilho');
    const options = [
        { label: 'Pedir orientação sobre o caminho do cultivo', delta: { afinidade: 4, confianca: 3 }, type: 'guidance', branch: 'benevolente' },
        { label: 'Perguntar por rumores e movimentos recentes', delta: { afinidade: 1, confianca: 1 }, type: 'rumor', branch: 'pragmatica' },
        { label: 'Solicitar ou discutir uma missão', delta: { favor: 1, confianca: 2 }, type: 'quest', branch: 'pragmatica' },
        { label: 'Pressionar o NPC e testar seus limites', delta: { medo: 6, afinidade: -5 }, type: 'threat', branch: 'cruel' }
    ];
    if (arq === 'mercadora') options[0] = { label: 'Negociar em tom cordial e buscar favores comerciais', delta: { afinidade: 3, favor: 2 }, type: 'trade', branch: 'pragmatica' };
    if (arq === 'mestre') options[0] = { label: 'Curvar-se e pedir julgamento do seu coração marcial', delta: { afinidade: 5, confianca: 4 }, type: 'master', branch: 'benevolente' };
    if (arq === 'rival') options[3] = { label: 'Provocar um duelo verbal e medir sua hostilidade', delta: { medo: 1, afinidade: -8 }, type: 'rival', branch: 'cruel' };
    if (Number(relation?.medo || 0) > 35) options[3] = { label: 'Recuar e medir as consequências do medo que inspira', delta: { medo: -3, confianca: 1 }, type: 'retreat', branch: 'pragmatica' };
    if (normalizeKey(player.alinhamento).includes('justo')) options[0].delta.afinidade += 1;
    return options;
}

async function openNpcDialogue(player, message, npc) {
    const profile = await getNpcProfile(npc.id);
    const relation = await getOrCreateNpcRelation(player.id, npc.id);
    await maybeSendEntityPortrait(message, 'npc', npc.nome, buildEntityPrompt('npc', npc.nome, profile?.prompt_base || profile?.estilo || npc.dialogo_inicial || ''), `🖼️ Retrato de ${npc.nome}`);
    const options = buildNpcOptions(npc, profile, relation, player);
    const fallback = `👤 *${npc.nome}*${profile?.titulo ? ` — ${profile.titulo}` : ''}\n📍 ${npc.localizacao}\n“${npc.dialogo_inicial}”\n\n` +
        `Você sente que este encontro carrega peso real no mundo marcial.\n\n` +
        options.map((opt, idx) => `${idx + 1}. ${opt.label}`).join('\n') +
        `\n\nUse \`/npc responder <1-4>\` ou apenas envie o número.`;
    const prompt = [
        'Escreva uma cena curta de RPG wuxia/xianxia em português brasileiro.',
        'Não invente recompensas nem mude regras.',
        `NPC: ${npc.nome}`,
        `Título: ${profile?.titulo || 'sem título'}`,
        `Personalidade: ${profile?.personalidade || 'misterioso'}`,
        `Local: ${npc.localizacao}`,
        `Jogador: ${player.nome}, alinhamento ${player.alinhamento}, karma ${player.karma}.`,
        `Memória curta do NPC sobre o jogador: ${relation.memoria_curta || 'nenhuma'}.`,
        'Mostre 4 opções numeradas exatamente uma por linha no final.',
        options.map((opt, idx) => `${idx + 1}. ${opt.label}`).join('\n')
    ].join('\n');
    const textOut = await callOptionalAI(prompt, fallback);
    npcDialogueSessions.set(player.id, { npcId: npc.id, options, openedAt: Date.now() });
    await sendReply(message, textOut);
}

async function offerNpcQuest(player, message, npcId, branchChoice = 'pragmatica') {
    const quest = await getQuery(`SELECT * FROM npc_quests WHERE npc_id = ? ORDER BY RANDOM() LIMIT 1`, [npcId]);
    if (!quest) {
        await sendReply(message, '📜 Este NPC ainda não possui uma missão concreta para oferecer.');
        return;
    }
    const progress = await getQuery(`SELECT * FROM npc_quest_progress WHERE player_id = ? AND quest_id = ?`, [player.id, quest.id]);
    if (!progress) {
        await runQuery(`INSERT INTO npc_quest_progress (player_id, quest_id, status, progresso, branch_escolhida) VALUES (?, ?, 'oferecida', 0, ?)`, [player.id, quest.id, branchChoice]);
    }
    const branchText = quest[`branch_${normalizeKey(branchChoice).replace(/[^a-z]/g, '')}`] || quest.branch_pragmatica || '';
    const targetLabel = quest.objetivo_tipo === 'kill' ? `Derrote ${quest.objetivo_quantidade}x ${quest.objetivo_alvo}` : quest.objetivo_tipo === 'explore' ? `Explore ${quest.objetivo_quantidade}x a região ${quest.objetivo_alvo}` : `Entregue ${quest.objetivo_quantidade}x ${quest.objetivo_alvo}`;
    await sendReply(message, `📜 *Missão Oferecida* — ${quest.nome}\n${quest.descricao}\n\n🎯 Objetivo: ${targetLabel}\n💰 Recompensa: ${quest.recompensa_ouro || 0} ouro • 🎖️ ${quest.recompensa_merito || 0} mérito${branchText ? `\n🧭 Tom desta rota: ${branchText}` : ''}\n\nUse \`/npc aceitar ${quest.id}\` para assumir a missão.`);
}

async function handleNpcChoice(player, message, choice) {
    const session = npcDialogueSessions.get(player.id);
    if (!session) {
        await sendReply(message, 'Nenhum diálogo de NPC está aberto no momento.');
        return;
    }
    const option = session.options[choice - 1];
    if (!option) {
        await sendReply(message, 'Escolha inválida. Use uma opção de 1 a 4.');
        return;
    }
    const npc = await getQuery(`SELECT * FROM npcs WHERE id = ?`, [session.npcId]);
    const profile = npc ? await getNpcProfile(npc.id) : null;
    if (!npc) {
        npcDialogueSessions.delete(player.id);
        await sendReply(message, 'Esse encontro já se dissipou como névoa ao amanhecer.');
        return;
    }
    const relation = await updateNpcRelation(player.id, npc.id, option.delta, `${player.nome} escolheu: ${option.label}`);
    if (option.type === 'quest') {
        npcDialogueSessions.delete(player.id);
        await offerNpcQuest(player, message, npc.id, option.branch);
        return;
    }
    let fallback = '';
    if (option.type === 'rumor') {
        const rumors = await buildRumorsForPlayer(player, 2);
        fallback = `👤 *${npc.nome}* inclina a cabeça e baixa a voz.\n\n${rumors.map((r, idx) => `${idx + 1}. ${r}`).join('\n')}`;
    } else if (option.type === 'master') {
        const masterBond = await getOrAssignBond(player, 'mestre');
        const data = safeJsonParse(masterBond?.data_json, {});
        data.provas = Number(data.provas || 0) + 1;
        await runQuery(`UPDATE player_bonds SET data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE player_id = ? AND bond_type = 'mestre'`, [JSON.stringify(data), player.id]);
        fallback = `🕯️ *${npc.nome}* observa seu dantian por um longo instante.\n“Cultivo sem coração é apenas violência polida. Volte quando seus passos soarem mais leves.”\n\nAfinidade: ${signedNumber(relation.afinidade)} • Confiança: ${signedNumber(relation.confianca)} • Medo: ${signedNumber(relation.medo)}`;
    } else if (option.type === 'rival') {
        const rivalBond = await getOrAssignBond(player, 'rival');
        const data = safeJsonParse(rivalBond?.data_json, {});
        data.rancor = clamp(Number(data.rancor || 0) + 8, 0, 100);
        data.ultima_vista = player.localizacao;
        await runQuery(`UPDATE player_bonds SET data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE player_id = ? AND bond_type = 'rival'`, [JSON.stringify(data), player.id]);
        fallback = `⚔️ Os olhos de ${npc.nome} brilham como lâminas. O nome de ${player.nome} agora foi gravado entre as futuras dívidas de sangue do mundo marcial.`;
    } else if (option.type === 'trade') {
        fallback = `🧮 ${npc.nome} mede seu valor com um sorriso de canto.\n“Uma transação justa pesa menos que uma promessa quebrada.”\n\nSeu favor com este contato agora é ${signedNumber(relation.favor)}.`;
    } else if (option.type === 'threat') {
        fallback = `☠️ A atmosfera esfria quando sua intenção corta o ar. ${npc.nome} não recua, mas registra seu rosto com cuidado perigoso.`;
    } else if (option.type === 'retreat') {
        fallback = `🫥 Você afrouxa a pressão e deixa a conversa esfriar. Nem toda vitória precisa de um cadáver.`;
    } else {
        fallback = `👤 ${npc.nome} responde em tom calmo, mas atento.\n“Os rios do cultivo nunca carregam o mesmo reflexo duas vezes.”`;
    }
    const prompt = [
        'Escreva uma resposta curta de NPC em português brasileiro, estilo wuxia/xianxia.',
        'Não altere regras do jogo, só a narrativa.',
        `NPC: ${npc.nome}`,
        `Título: ${profile?.titulo || 'Figura do Mundo Marcial'}`,
        `Personalidade: ${profile?.personalidade || 'misterioso'}`,
        `Jogador: ${player.nome}, alinhamento ${player.alinhamento}, karma ${player.karma}.`,
        `Opção escolhida: ${option.label}`,
        `Status atual do relacionamento: afinidade ${relation.afinidade}, confiança ${relation.confianca}, medo ${relation.medo}, favor ${relation.favor}.`
    ].join('\n');
    npcDialogueSessions.delete(player.id);
    await sendReply(message, await callOptionalAI(prompt, fallback));
}

async function progressNpcQuests(playerId, updates = {}) {
    const active = await allQuery(`SELECT nqp.*, nq.* FROM npc_quest_progress nqp JOIN npc_quests nq ON nq.id = nqp.quest_id WHERE nqp.player_id = ? AND nqp.status IN ('aceita', 'em_andamento')`, [playerId]);
    for (const row of active) {
        let gained = 0;
        if (row.objetivo_tipo === 'kill' && updates.killName && normalizeKey(updates.killName) === normalizeKey(row.objetivo_alvo)) gained = 1;
        else if (row.objetivo_tipo === 'explore' && updates.region && normalizeKey(updates.region) === normalizeKey(row.objetivo_alvo)) gained = 1;
        else if (row.objetivo_tipo === 'item' && updates.itemName && normalizeKey(updates.itemName) === normalizeKey(row.objetivo_alvo)) gained = Number(updates.itemQty || 1);
        if (gained > 0) {
            const nextValue = Math.min(Number(row.objetivo_quantidade || 1), Number(row.progresso || 0) + gained);
            await runQuery(`UPDATE npc_quest_progress SET progresso = ?, status = 'em_andamento' WHERE player_id = ? AND quest_id = ?`, [nextValue, playerId, row.quest_id]);
        }
    }
}

async function ensureNarrativeWorldEvents() {
    const active = await getQuery(`SELECT id FROM eventos_mundiais WHERE ativo = 1 AND datetime(data_fim) >= datetime('now') LIMIT 1`);
    if (active) return;
    const templates = [
        ['Leilão do Pavilhão Escarlate', 'Relíquias e técnicas antigas mudarão de mãos sob lanternas rubras e promessas envenenadas.', 'Descontos em artefatos e rumores raros.'],
        ['Tribulação sobre o Pico de Jade', 'Nuvens de tribulação cercam o horizonte e atraem cultivadores, oportunistas e mortos-vivos.', 'Maior chance de encontrar essência espiritual.'],
        ['Guerra Fria entre Seitas', 'Mensageiros armados percorrem estradas enquanto velhos pactos tremem sob insultos renovados.', 'Missões de seita rendem mais mérito.'],
        ['Despertar da Besta do Vale', 'Rugidos noturnos ecoam do vale, e caravanas têm evitado a trilha principal.', 'Melhores drops de bestas espirituais.']
    ];
    const chosen = templates[Math.floor(Math.random() * templates.length)];
    const start = new Date();
    const end = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2);
    await runQuery(`INSERT INTO eventos_mundiais (nome, descricao, ativo, data_inicio, data_fim, bonus) VALUES (?, ?, 1, ?, ?, ?)`, [chosen[0], chosen[1], start.toISOString(), end.toISOString(), chosen[2]]);
}

async function buildRumorsForPlayer(player, count = 3) {
    const scope = `${normalizeKey(player.localizacao || 'global')}|${todayKey()}`;
    const cached = await getQuery(`SELECT rumors_json FROM rumor_cache WHERE scope_key = ? AND rumor_date = ?`, [scope, todayKey()]);
    if (cached) {
        const rows = safeJsonParse(cached.rumors_json, []);
        if (rows.length >= count) return rows.slice(0, count);
    }
    await ensureNarrativeWorldEvents();
    const activeEvents = await allQuery(`SELECT nome, descricao, bonus FROM eventos_mundiais WHERE ativo = 1 AND datetime(data_inicio) <= datetime('now') AND datetime(data_fim) >= datetime('now') ORDER BY data_inicio ASC LIMIT 5`);
    const sectRows = await allQuery(`SELECT fac_a, fac_b, relacao, descricao FROM sect_relations ORDER BY ABS(relacao) DESC LIMIT 6`);
    const rivalBond = await getOrAssignBond(player, 'rival');
    const rivalData = safeJsonParse(rivalBond?.data_json, {});
    const pool = [];
    for (const ev of activeEvents) pool.push(`Dizem que *${ev.nome}* já altera o fluxo de Qi em ${player.localizacao}. ${ev.descricao}`);
    for (const rel of sectRows.slice(0, 2)) pool.push(`Sussurra-se que ${rel.fac_a} e ${rel.fac_b} estão em estado de ${rel.relacao >= 0 ? 'trégua cautelosa' : 'hostilidade latente'} — ${rel.descricao}`);
    pool.push(`Há quem diga que ${rivalBond.bond_name} foi visto perto de ${rivalData.ultima_vista || player.localizacao}, refinando intenção assassina.`);
    pool.push(`Peregrinos juram que um mestre recluso avalia discípulos em ${player.localizacao}, mas só responde a quem controla a própria respiração.`);
    pool.push(`Mercadores comentam sobre um mapa rasgado que aponta para um tesouro enterrado sob névoa e raízes retorcidas.`);
    pool.push(`Alguns afirmam que bestas espirituais estão ficando inquietas sempre que o céu escurece ao entardecer.`);
    const rumors = [];
    while (pool.length && rumors.length < count) {
        const index = Math.floor(Math.random() * pool.length);
        rumors.push(pool.splice(index, 1)[0]);
    }
    await runQuery(`INSERT INTO rumor_cache (scope_key, rumor_date, rumors_json) VALUES (?, ?, ?) ON CONFLICT(scope_key, rumor_date) DO UPDATE SET rumors_json = excluded.rumors_json`, [scope, todayKey(), JSON.stringify(rumors)]);
    return rumors;
}

async function cmdRumores(_args, message, telefone) {
    let player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    player = await initializeNarrativeStats(player);
    const rumors = await buildRumorsForPlayer(player, 3);
    await maybeSendEntityPortrait(message, 'regiao', player.localizacao || 'Região Desconhecida', buildEntityPrompt('regiao', player.localizacao || 'Região Desconhecida', 'paisagem mística, estradas antigas, clima de rumor'), `🌄 Ecos de ${player.localizacao}`);
    await sendReply(message, `🕯️ *Rumores de ${player.localizacao}*\n\n${rumors.map((r, i) => `${i + 1}. ${r}`).join('\n\n')}`);
}

async function cmdMestre(_args, message, telefone) {
    let player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    player = await initializeNarrativeStats(player);
    const bond = await getOrAssignBond(player, 'mestre');
    const data = safeJsonParse(bond.data_json, {});
    const npc = await getQuery(`SELECT * FROM npcs WHERE id = ?`, [Number(bond.bond_key || 0)]);
    const profile = npc ? await getNpcProfile(npc.id) : null;
    if (npc) await maybeSendEntityPortrait(message, 'npc', npc.nome, buildEntityPrompt('npc', npc.nome, profile?.prompt_base || profile?.estilo || ''), `🧙 Mestre associado: ${npc.nome}`);
    const fallback = `🧙 *Vínculo de Mestre*\nNome: ${bond.bond_name}\nTítulo: ${data.titulo || profile?.titulo || 'Recluso sem título'}\n📍 Última trilha conhecida: ${data.localizacao || npc?.localizacao || 'Montanhas Distantes'}\n🧪 Provas superadas: ${data.provas || 0}\n📜 Estado: ${data.ensinou ? 'Já reconheceu parte do seu valor.' : 'Ainda o observa à distância.'}`;
    await sendReply(message, await callOptionalAI(`Escreva uma ficha curta e elegante de mestre wuxia/xianxia em português brasileiro.\nMestre: ${bond.bond_name}\nDados: ${JSON.stringify(data)}`, fallback));
}

async function cmdRival(_args, message, telefone) {
    let player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    player = await initializeNarrativeStats(player);
    const bond = await getOrAssignBond(player, 'rival');
    const data = safeJsonParse(bond.data_json, {});
    const fallback = `⚔️ *Rival Marcado pelo Destino*\nNome: ${bond.bond_name}\nTemperamento: ${data.temperamento || 'indefinido'}\nReino estimado: ${data.reino || 1}\nRancor: ${data.rancor || 0}/100\nÚltima vista: ${data.ultima_vista || 'desconhecida'}\n\nDizem que ele também está acumulando histórias sobre você.`;
    await sendReply(message, await callOptionalAI(`Escreva um quadro curto de rival wuxia/xianxia em português brasileiro, tom ameaçador e elegante.\nRival: ${bond.bond_name}\nDados: ${JSON.stringify(data)}`, fallback));
}

async function cmdPoliticaSeita(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const seita = await getPlayerSeita(player.id);
    const faccao = seita?.nome || player.clan || 'Wudang';
    const rows = await allQuery(`SELECT * FROM sect_relations WHERE fac_a = ? ORDER BY relacao ASC, fac_b ASC LIMIT 8`, [faccao]);
    if (!rows.length) {
        await sendReply(message, `🏯 Não há registros políticos sólidos envolvendo ${faccao} ainda.`);
        return;
    }
    let txt = `🏯 *Política de Seitas — ${faccao}*\n`;
    for (const row of rows) {
        const icon = row.relacao >= 15 ? '🤝' : row.relacao <= -15 ? '⚔️' : '⚖️';
        txt += `\n${icon} ${row.fac_b} — ${signedNumber(row.relacao)}\n${row.descricao}`;
    }
    await sendReply(message, txt);
}

async function cmdRetrato(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const type = normalizeKey(args[0] || '');
    const key = args.slice(1).join(' ').trim() || player.localizacao || 'Região Desconhecida';
    if (!['npc','mob','regiao','região'].includes(type)) {
        await sendReply(message, 'Uso: `/retrato <npc|mob|regiao> <nome>`');
        return;
    }
    const entityType = type === 'região' ? 'regiao' : type;
    const sent = await maybeSendEntityPortrait(message, entityType, key, buildEntityPrompt(entityType, key, 'arte wuxia/xianxia, fantasia oriental'), `🖼️ ${capFirst(entityType)}: ${key}`);
    if (!sent) await sendReply(message, `🖼️ O retrato de *${key}* foi registrado em cache, mas nenhum provedor de imagem está configurado no momento.\nConfigure IMAGE_PROVIDER + IMAGE_API_URL para gerar a imagem e IMAGE_HOST_PROVIDER (imgbb/imagekit) para publicar uma URL persistente.`);
}

async function cmdMissoesNPC(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const rows = await allQuery(`SELECT nqp.*, nq.nome, nq.descricao, nq.objetivo_tipo, nq.objetivo_alvo, nq.objetivo_quantidade, nq.recompensa_ouro, nq.recompensa_merito, n.nome AS npc_nome FROM npc_quest_progress nqp JOIN npc_quests nq ON nq.id = nqp.quest_id JOIN npcs n ON n.id = nq.npc_id WHERE nqp.player_id = ? ORDER BY nqp.status ASC, nq.nome ASC`, [player.id]);
    if (!rows.length) {
        await sendReply(message, '📜 Você ainda não possui missões de NPC ativas ou oferecidas.');
        return;
    }
    let txt = '📜 *Missões de NPC*\n';
    for (const row of rows) {
        txt += `\n• [${String(row.status).toUpperCase()}] ${row.nome} — ${row.npc_nome}\n`;
        txt += `  Progresso: ${row.progresso}/${row.objetivo_quantidade} • Objetivo: ${row.objetivo_tipo} ${row.objetivo_alvo}\n`;
        txt += `  Recompensa: ${row.recompensa_ouro || 0} ouro • ${row.recompensa_merito || 0} mérito\n`;
    }
    await sendReply(message, txt);
}

async function cmdNPCInteragir(args, message, telefone) {
    const playerRaw = await ensurePlayerExists(telefone, message);
    if (!playerRaw) return;
    const player = await initializeNarrativeStats(playerRaw);
    const sub = normalizeKey(args[0] || 'listar');

    if (!args.length || sub === 'listar') {
        const npcs = await allQuery(`SELECT n.id, n.nome, n.localizacao, np.titulo, np.arquetipo FROM npcs n LEFT JOIN npc_profiles np ON np.npc_id = n.id WHERE n.localizacao = ? OR n.localizacao = 'global' ORDER BY CASE WHEN n.localizacao = ? THEN 0 ELSE 1 END, n.nome ASC`, [player.localizacao, player.localizacao]);
        if (!npcs.length) {
            await sendReply(message, `👤 Não há NPCs visíveis em ${player.localizacao} no momento.`);
            return;
        }
        let txt = `👤 *NPCs em ${player.localizacao}*\n`;
        for (const npc of npcs) txt += `\n${npc.id}. ${npc.nome}${npc.titulo ? ` — ${npc.titulo}` : ''}${npc.arquetipo ? ` [${npc.arquetipo}]` : ''}`;
        txt += `\n\nUse \`/npc interagir <id|nome>\`, \`/npc perfil <id|nome>\` ou \`/npc retrato <id|nome>\`.`;
        await sendReply(message, txt);
        return;
    }
    if (sub === 'interagir') {
        const npc = await resolveNpcForPlayer(player, args.slice(1).join(' '));
        if (!npc) return sendReply(message, '👤 Você não encontrou esse NPC na sua região atual.');
        await openNpcDialogue(player, message, npc);
        return;
    }
    if (sub === 'perfil') {
        const npc = await resolveNpcForPlayer(player, args.slice(1).join(' '));
        if (!npc) return sendReply(message, 'NPC não encontrado.');
        const profile = await getNpcProfile(npc.id);
        const relation = await getOrCreateNpcRelation(player.id, npc.id);
        await maybeSendEntityPortrait(message, 'npc', npc.nome, buildEntityPrompt('npc', npc.nome, profile?.prompt_base || profile?.estilo || ''), `🖼️ Retrato de ${npc.nome}`);
        await sendReply(message, `👤 *${npc.nome}*${profile?.titulo ? ` — ${profile.titulo}` : ''}\n📍 ${npc.localizacao}\n🧠 Personalidade: ${profile?.personalidade || 'Difícil de ler'}\n🪶 Arquétipo: ${profile?.arquetipo || 'andarilho'}\n🤝 Afinidade ${signedNumber(relation.afinidade)} • Confiança ${signedNumber(relation.confianca)} • Medo ${signedNumber(relation.medo)} • Favor ${signedNumber(relation.favor)}\n📝 Memória: ${relation.memoria_curta || 'Nenhuma lembrança forte ainda.'}`);
        return;
    }
    if (sub === 'responder') {
        const choice = Number(args[1] || args[0]);
        if (!choice || choice < 1 || choice > 4) return sendReply(message, 'Use `/npc responder <1-4>`.');
        await handleNpcChoice(player, message, choice);
        return;
    }
    if (sub === 'aceitar') {
        const questId = Number(args[1] || args[0]);
        if (!questId) return sendReply(message, 'Uso: `/npc aceitar <id_quest>`');
        const quest = await getQuery(`SELECT * FROM npc_quests WHERE id = ?`, [questId]);
        const progress = await getQuery(`SELECT * FROM npc_quest_progress WHERE player_id = ? AND quest_id = ?`, [player.id, questId]);
        if (!quest || !progress) return sendReply(message, 'Essa missão de NPC não foi oferecida a você.');
        await runQuery(`UPDATE npc_quest_progress SET status = 'aceita', data_inicio = CURRENT_TIMESTAMP WHERE player_id = ? AND quest_id = ?`, [player.id, questId]);
        await sendReply(message, `✅ Missão aceita: *${quest.nome}*.\nObjetivo: ${quest.objetivo_tipo} ${quest.objetivo_alvo} (${quest.objetivo_quantidade}).`);
        return;
    }
    if (sub === 'entregar') {
        const questId = Number(args[1] || args[0]);
        if (!questId) return sendReply(message, 'Uso: `/npc entregar <id_quest>`');
        const row = await getQuery(`SELECT nqp.*, nq.*, n.nome AS npc_nome FROM npc_quest_progress nqp JOIN npc_quests nq ON nq.id = nqp.quest_id JOIN npcs n ON n.id = nq.npc_id WHERE nqp.player_id = ? AND nqp.quest_id = ?`, [player.id, questId]);
        if (!row) return sendReply(message, 'Missão não encontrada.');
        if (Number(row.progresso || 0) < Number(row.objetivo_quantidade || 1)) return sendReply(message, `A missão ainda não foi concluída. Progresso atual: ${row.progresso}/${row.objetivo_quantidade}.`);
        if (normalizeKey(row.objetivo_tipo) === 'item') {
            const item = await getItemByName(row.objetivo_alvo);
            const removed = item ? await removeItemFromInventory(player.id, item.id, row.objetivo_quantidade) : false;
            if (!removed) return sendReply(message, `Você ainda precisa carregar ${row.objetivo_quantidade}x ${row.objetivo_alvo} para a entrega.`);
        }
        if (Number(row.recompensa_ouro || 0) > 0) await updatePlayer(player.id, 'ouro', Number(player.ouro || 0) + Number(row.recompensa_ouro || 0));
        if (Number(row.recompensa_merito || 0) > 0) await updatePlayer(player.id, 'merito', Number(player.merito || 0) + Number(row.recompensa_merito || 0));
        if (row.recompensa_item_id) await addItemToInventory(player.id, row.recompensa_item_id, 1);
        await runQuery(`UPDATE npc_quest_progress SET status = 'concluida', data_conclusao = CURRENT_TIMESTAMP WHERE player_id = ? AND quest_id = ?`, [player.id, questId]);
        await updateNpcRelation(player.id, row.npc_id, { afinidade: 6, confianca: 4, favor: -1 }, `Concluiu a missão ${row.nome}`);
        await sendReply(message, `🎉 *${row.nome}* concluída!\nRecebido: ${row.recompensa_ouro || 0} ouro • ${row.recompensa_merito || 0} mérito.`);
        return;
    }
    if (sub === 'retrato') {
        const npc = await resolveNpcForPlayer(player, args.slice(1).join(' '));
        if (!npc) return sendReply(message, 'NPC não encontrado para retrato.');
        const profile = await getNpcProfile(npc.id);
        const sent = await maybeSendEntityPortrait(message, 'npc', npc.nome, buildEntityPrompt('npc', npc.nome, profile?.prompt_base || profile?.estilo || ''), `🖼️ Retrato de ${npc.nome}`);
        if (!sent) await sendReply(message, 'Retrato ainda não pôde ser gerado automaticamente. Configure IMAGE_PROVIDER + IMAGE_API_URL e, se quiser URL pública fixa, IMAGE_HOST_PROVIDER=imgbb ou imagekit.');
        return;
    }
    await sendReply(message, 'Comandos de NPC: `/npc`, `/npc interagir <id|nome>`, `/npc responder <1-4>`, `/npc perfil <id|nome>`, `/npc aceitar <id>`, `/npc entregar <id>`, `/npc retrato <id|nome>`.');
}

async function cmdSeitaExtra(args, message, telefone) {
    const sub = normalizeKey(args[0] || '');
    if (sub === 'politica' || sub === 'política') return cmdPoliticaSeita(args.slice(1), message, telefone);
    return sendReply(message, 'Use `/seita politica` para ver a política entre facções.');
}

async function cmdPerfil(_args, message, telefone) {
    let player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    player = await initializeNarrativeStats(player);

    const perfilTexto = `╭━━⪩ 📊 *ESTADO DE ${String(player.nome || '').toUpperCase()}* ⪨━━\n` +
        `▢ 🆔 ${player.unique_id}\n` +
        `▢ 🧬 ${player.raca} • 🏮 ${player.clan}\n` +
        `▢ 🌿 ${player.raiz_espiritual} (${player.elementos})\n` +
        `▢ 💪 ${player.corpo_divino || 'Corpo Comum'}\n` +
        `▢ ⚖️ ${player.alinhamento} • Karma ${player.karma} • Reputação ${player.reputacao}\n` +
        `▢\n` +
        `▢ ❤️ HP ${formatBar(player.hp_atual, player.hp_maximo)} ${player.hp_atual}/${player.hp_maximo}\n` +
        `▢ 🔷 Qi ${formatBar(player.qi_atual, player.qi_maximo)} ${player.qi_atual}/${player.qi_maximo}\n` +
        `▢ 🕯️ Alma ${formatBar(player.alma_atual, player.alma_maxima)} ${player.alma_atual}/${player.alma_maxima}\n` +
        `▢ 😮‍💨 Fadiga ${formatBar(clamp(Number(player.fadiga || 0), 0, 100), 100)} ${clamp(Number(player.fadiga || 0), 0, 100)}/100\n` +
        `▢\n` +
        `▢ 💪 Força: ${player.forca} • 🛡️ Defesa: ${player.defesa}\n` +
        `▢ ⚡ Agilidade: ${player.agilidade} • 🧠 Inteligência: ${player.inteligencia}\n` +
        `▢ 🧘 Espírito: ${player.espirito} • ❤️ Vigor: ${player.vigor}\n` +
        `▢\n` +
        `▢ 🏆 Físico: ${player.nivel_fisico}-${player.sub_fisico}\n` +
        `▢ 🔮 Espiritual: ${player.nivel_espiritual}-${player.sub_espiritual}\n` +
        `▢ 📍 Localização: ${player.localizacao}\n` +
        `▢\n` +
        `▢ 🪙 Ouro: ${player.ouro}\n` +
        `▢ 🔮 Pérolas Espirituais: ${player.perolas_esp}\n` +
        `▢ 💎 Cristais Espirituais: ${player.cristais_esp}\n` +
        `▢ 🎖️ Mérito: ${player.merito || 0}\n` +
        `▢ 🧿 Essência Imortal: ${player.essencia_imortal}\n` +
        `╰━━─「🌙」─━━`;
    if (player.avatar_url) {
        try {
            const media = await MessageMedia.fromUrl(player.avatar_url, { unsafe: true });
            return sendReply(message, perfilTexto, media);
        } catch (_err) {}
    }
    await sendReply(message, perfilTexto);
}

async function cmdMenu(_args, message) {
    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR');
    const horaStr = agora.toLocaleTimeString('pt-BR');
    const versao = '3.0.0';
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
    menu += `▢ • /rumores - Ouve rumores dinâmicos da região atual\n`;
    menu += `▢ • /retrato <npc|mob|regiao> <nome> - Exibe ou tenta gerar retrato persistente\n`;
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
    menu += `▢ • /aceitarduelo <id> - Aceita um duelo pendente\n`;
    menu += `▢ • /amigos - Lista seus amigos\n`;
    menu += `▢ • /adicionaramigo <id> - Adiciona um amigo\n`;
    menu += `▢ • /inimigo <id> - Declara inimizade\n`;
    menu += `▢ • /lerchat - Lê mensagens não lidas\n`;
    menu += `▢ • /rival - Mostra o rival marcado pelo destino\n`;
    menu += `▢ • /mestre - Mostra o vínculo com seu mestre\n`;
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
    menu += `╭━━⪩ 📋 MISSÕES & NPCS ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /missoes - Mostra missões da seita disponíveis\n`;
    menu += `▢ • /aceitar <id_missao> - Aceita uma missão da seita\n`;
    menu += `▢ • /completarmissao <id> - Resgata recompensa\n`;
    menu += `▢ • /criarmissao <desc> <recompensa> - Cria missão pessoal\n`;
    menu += `▢ • /missoesdisponiveis - Lista missões criadas por outros\n`;
    menu += `▢ • /minhasmissoes - Lista missões que você criou\n`;
    menu += `▢ • /npc - Lista NPCs da região atual\n`;
    menu += `▢ • /npc interagir <id|nome> - Abre diálogo vivo com memória\n`;
    menu += `▢ • /npc responder <1-4> - Escolhe uma resposta do diálogo\n`;
    menu += `▢ • /npc perfil <id|nome> - Mostra relações e personalidade do NPC\n`;
    menu += `▢ • /npc aceitar <id_quest> - Aceita missão de NPC\n`;
    menu += `▢ • /npc entregar <id_quest> - Entrega missão de NPC\n`;
    menu += `▢ • /missoesnpc - Lista suas missões de NPC\n`;
    menu += `▢\n`;
    menu += `╰━━─「📋」─━━\n\n`;
    menu += `╭━━⪩ 🏯 SEITAS & POLÍTICA ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /criarseita <nome> <desc> - Cria sua própria seita\n`;
    menu += `▢ • /convidar <id> - Convida alguém para sua seita\n`;
    menu += `▢ • /aceitarconvite <id_seita> - Aceita um convite de seita\n`;
    menu += `▢ • /sairseita - Sai da seita atual\n`;
    menu += `▢ • /doar <quantidade> - Doa ouro para o tesouro da seita\n`;
    menu += `▢ • /tecnicaseita <id_tecnica> - Adiciona técnica à biblioteca\n`;
    menu += `▢ • /biblioteca - Lista técnicas disponíveis na seita\n`;
    menu += `▢ • /aprender_seita <id> - Aprende técnica da biblioteca\n`;
    menu += `▢ • /politicaseita - Mostra relações políticas entre facções\n`;
    menu += `▢ • /seita politica - Atalho para política de seitas\n`;
    menu += `▢\n`;
    menu += `╰━━─「🏯」─━━\n\n`;
    menu += `╭━━⪩ ℹ️ INFORMAÇÕES ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /changelog - Últimas atualizações do bot\n`;
    menu += `▢ • /mudaraparencia <URL> - Define sua imagem de perfil\n`;
    menu += `▢ • /guia [social|batalha|cultivo|profissao|npcs|ia] - Explica sistemas\n`;
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
        await sendReply(message, '📖 *Guias disponíveis:*\n/guia cultivo\n/guia batalha\n/guia profissao\n/guia social\n/guia npcs\n/guia ia');
        return;
    }
    const assunto = normalizeKey(args[0]);
    let texto = '';
    if (assunto === 'cultivo') texto = `🌿 *Guia de Cultivo*\n\nO cultivo é dividido em dois caminhos: *Físico* e *Espiritual*. Ao atingir o ápice, a tribulação o aguarda.`;
    else if (assunto === 'batalha') texto = `⚔️ *Guia de Combate*\n\nO combate é por turnos. /atacar, /defender, /usaritem, /usartecnica e /fugir continuam sendo a base do confronto.`;
    else if (assunto === 'profissao') texto = `🛠️ *Guia de Profissões*\n\nAlquimista, Forjador, Médico, Mestre de Talismã e Mestre de Formações podem craftar, subir de nível e alimentar sua economia.`;
    else if (assunto === 'social') texto = `👥 *Guia Social*\n\nUse /amigos, /adicionaramigo, /inimigo, /conversar e /lerchat para tecer alianças e inimizades.`;
    else if (assunto === 'npcs') texto = `👤 *Guia de NPCs Vivos*\n\n• /npc — lista NPCs na sua região\n• /npc interagir <id|nome> — abre diálogo vivo com memória\n• /npc responder <1-4> — escolhe sua postura na conversa\n• /npc perfil <id|nome> — vê afinidade, confiança, medo e favor\n• /npc aceitar <id_quest> e /npc entregar <id_quest> — controla missões ramificadas\n\nOs NPCs lembram da sua postura e alteram o tom ao longo do tempo.`;
    else if (assunto === 'ia') texto = `🤖 *Guia de IA Opcional*\n\nTexto vivo: configure AI_PROVIDER=ollama, OLLAMA_URL e OLLAMA_MODEL.\nImagens persistentes: configure IMAGE_PROVIDER e IMAGE_API_URL para um serviço local/bridge de geração.\n\nSem configuração, o bot continua funcionando com texto temático em fallback e registra os retratos em cache para uso futuro.`;
    else texto = 'Assunto não encontrado. Use /guia sem argumentos para ver a lista.';
    await sendReply(message, texto);
}

async function cmdEventos(_args, message) {
    await ensureNarrativeWorldEvents();
    const rows = await allQuery(`SELECT * FROM eventos_mundiais WHERE ativo = 1 AND datetime(data_inicio) <= datetime('now') AND datetime(data_fim) >= datetime('now') ORDER BY data_inicio ASC LIMIT 10`);
    if (!rows.length) return sendReply(message, 'No momento não há eventos mundiais ativos.');
    let txt = '🌍 *Eventos Mundiais Ativos*\n';
    for (const e of rows) txt += `\n*${e.nome}*\n${e.descricao}\n🎁 Bônus: ${e.bonus}\n⏳ Até ${e.data_fim}\n`;
    await sendReply(message, txt);
}

function pickMobForRegion(regionName) {
    const key = normalizeKey(regionName || '');
    if (key.includes('templo')) return { nome: 'Acólito Profanado', hp: 72 + rollDice(18), danoBase: 10, prompt: 'acólito corrompido, templo antigo, energia sombria, arte xianxia' };
    if (key.includes('pico')) return { nome: 'Falcão do Trovão', hp: 78 + rollDice(22), danoBase: 12, prompt: 'ave espiritual de raio, céu tempestuoso, montanha alta, arte xianxia' };
    return { nome: 'Lobo Selvagem', hp: 58 + rollDice(18), danoBase: 8, prompt: 'lobo espiritual selvagem, floresta sombria, olhos luminosos, arte xianxia' };
}

async function cmdAndar(args, message, telefone) {
    const playerRaw = await ensurePlayerExists(telefone, message);
    if (!playerRaw) return;
    const player = await initializeNarrativeStats(playerRaw);
    if (exploracaoAtiva.has(player.id)) return sendReply(message, 'Você já está explorando. Use `/parar` para sair.');
    if (player.fadiga < 10) return sendReply(message, 'Você está exausto. Descanse primeiro (`/descansar`).');
    const regiao = args.join(' ').trim() || 'Floresta Sombria';
    await updatePlayer(player.id, 'localizacao', regiao);
    await progressNpcQuests(player.id, { region: regiao });
    await maybeSendEntityPortrait(message, 'regiao', regiao, buildEntityPrompt('regiao', regiao, 'montanhas, névoa, fantasia oriental'), `🌄 Região: ${regiao}`);
    const fallback = `🌲 *Exploração iniciada em ${regiao}*\nA estrada antiga range sob seus passos enquanto o vento conduz o cheiro de resina, sangue seco e sorte incompleta.\nA cada 5 minutos, o mundo responderá ao seu avanço. Use /parar para sair.`;
    await sendReply(message, await callOptionalAI(`Escreva uma abertura curta de exploração em português brasileiro, estilo wuxia/xianxia.\nRegião: ${regiao}\nJogador: ${player.nome}, karma ${player.karma}, alinhamento ${player.alinhamento}.`, fallback));
    const interval = setInterval(async () => {
        try {
            const pRaw = await getPlayer(telefone);
            if (!pRaw || !exploracaoAtiva.has(pRaw.id)) return;
            const p = await initializeNarrativeStats(pRaw);
            if (p.fadiga <= 0) {
                clearInterval(interval);
                exploracaoAtiva.delete(p.id);
                await client.sendMessage(getChatId(message), '😴 Você desmaiou de cansaço. Volte quando descansar.');
                return;
            }
            await updatePlayer(p.id, 'fadiga', Math.max(0, p.fadiga - 2));
            const evento = rollDice(100);
            if (evento <= 28) await iniciarCombateMonstro(p, message);
            else if (evento <= 46) await encontrarNPC(p, message);
            else if (evento <= 58) {
                const herb = await getItemByName('Erva do Orvalho Noturno');
                if (herb) await addItemToInventory(p.id, herb.id, 1);
                await progressNpcQuests(p.id, { itemName: 'Erva do Orvalho Noturno', itemQty: 1 });
                await client.sendMessage(getChatId(message), '🍃 Você encontra Erva do Orvalho Noturno entre raízes umedecidas.');
            } else if (evento <= 66) await encontrarJogador(p, message);
            else if (evento <= 76) await cmdRumores([], message, telefone);
            else await client.sendMessage(getChatId(message), '🍂 O caminho permanece silencioso, mas não vazio. Você sente olhos invisíveis acompanhando sua passagem.');
        } catch (err) {
            log(`Erro na exploração viva: ${err?.stack || err}`, 'ERRO');
        }
    }, 300000);
    exploracaoAtiva.set(player.id, { interval, regiao });
}

async function iniciarCombateMonstro(player, msg) {
    const mob = pickMobForRegion(player.localizacao);
    batalhasAtivas.set(player.id, { tipo: 'monstro', nome: mob.nome, hp: mob.hp, hpMax: mob.hp, danoBase: mob.danoBase, turno: 'jogador' });
    await maybeSendEntityPortrait(msg, 'mob', mob.nome, buildEntityPrompt('mob', mob.nome, mob.prompt), `🐺 Encontro: ${mob.nome}`);
    const fallback = `⚔️ *COMBATE* ⚔️\nVocê encontra ${mob.nome} em ${player.localizacao}. O ar vibra com intenção assassina.\nHP do inimigo: ${mob.hp}\nUse /atacar, /defender, /usaritem, /fugir ou /usartecnica.`;
    await sendReply(msg, await callOptionalAI(`Escreva uma abertura breve de combate wuxia/xianxia em português brasileiro.\nMonstro: ${mob.nome}\nRegião: ${player.localizacao}\nJogador: ${player.nome}`, fallback));
}

async function encontrarNPC(player, msg) {
    const npc = await getQuery(`SELECT * FROM npcs WHERE localizacao = ? OR localizacao = 'global' ORDER BY CASE WHEN localizacao = ? THEN 0 ELSE 1 END, RANDOM() LIMIT 1`, [player.localizacao, player.localizacao]);
    if (!npc) return client.sendMessage(getChatId(msg), '👤 Um andarilho misterioso cruza seu caminho, mas desaparece na névoa.');
    await openNpcDialogue(player, msg, npc);
}

async function cmdAtacar(_args, message, telefone) {
    let player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    player = await initializeNarrativeStats(player);
    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) return sendReply(message, 'Você não está em combate.');
    const dano = Number(player.forca || 0) + rollDice(15);

    if (batalha.tipo === 'monstro') {
        batalha.hp -= dano;
        await sendReply(message, `⚔️ Você ataca ${batalha.nome} e causa ${dano} de dano. HP restante: ${Math.max(0, batalha.hp)}/${batalha.hpMax}`);
        if (batalha.hp <= 0) {
            const recompensaOuro = 12 + rollDice(20);
            await updatePlayer(player.id, 'ouro', Number(player.ouro || 0) + recompensaOuro);
            await progressNpcQuests(player.id, { killName: batalha.nome });
            const bone = await getItemByName('Fragmento de Osso Espiritual');
            if (bone && rollDice(100) <= 40) await addItemToInventory(player.id, bone.id, 1);
            await sendReply(message, `🏆 Você derrotou ${batalha.nome}! Ganhou ${recompensaOuro} ouro.`);
            batalhasAtivas.delete(player.id);
            return;
        }
        let danoMonstro = Number(batalha.danoBase || 8) + rollDice(8);
        if (batalha.defendendo) { danoMonstro = Math.floor(danoMonstro / 2); batalha.defendendo = false; }
        const novoHP = Math.max(0, Number(player.hp_atual || 0) - danoMonstro);
        await updatePlayer(player.id, 'hp_atual', novoHP);
        await sendReply(message, `🐺 ${batalha.nome} revida e causa ${danoMonstro} de dano. Seu HP: ${novoHP}/${player.hp_maximo}`);
        if (novoHP <= 0) {
            await sendReply(message, '💀 Você tombou no chão poeirento da batalha, mas desperta mais tarde na vila.');
            await updatePlayer(player.id, 'ouro', Math.max(0, Number(player.ouro || 0) - 10));
            await updatePlayer(player.id, 'hp_atual', Number(player.hp_maximo || 1));
            batalhasAtivas.delete(player.id);
        }
        return;
    }
    if (batalha.tipo === 'dominio') {
        batalha.hpInimigo -= dano;
        await sendReply(message, `⚔️ Você ataca o ${batalha.inimigo.nome} e causa ${dano} de dano. HP restante: ${Math.max(0, batalha.hpInimigo)}/${batalha.inimigo.hp}`);
        if (batalha.hpInimigo <= 0) {
            await sendReply(message, `🏆 Você derrotou ${batalha.inimigo.nome}!`);
            db.get(`SELECT di.*, d.andares, d.recompensa_base_ouro FROM dominio_instancias di JOIN dominios d ON di.dominio_id = d.id WHERE di.player_id = ? AND di.dominio_id = ?`, [player.id, batalha.dominioId], async (err, instancia) => {
                if (err || !instancia) return;
                const novoAndar = batalha.andar + 1;
                if (novoAndar > instancia.andares) {
                    db.run(`UPDATE dominio_instancias SET status = 'concluido' WHERE player_id = ? AND dominio_id = ?`, [player.id, batalha.dominioId]);
                    const recompensa = instancia.recompensa_base_ouro + (instancia.andares * 10);
                    await updatePlayer(player.id, 'ouro', Number(player.ouro || 0) + recompensa);
                    await sendReply(message, `🎉 *DOMÍNIO CONCLUÍDO!* Você recebeu ${recompensa} ouro.`);
                    batalhasAtivas.delete(player.id);
                } else {
                    db.run(`UPDATE dominio_instancias SET andar_atual = ? WHERE player_id = ? AND dominio_id = ?`, [novoAndar, player.id, batalha.dominioId]);
                    await sendReply(message, `✨ Você avança para o andar ${novoAndar}/${instancia.andares}. Use /dominio continuar para prosseguir.`);
                    batalhasAtivas.delete(player.id);
                }
            });
            return;
        }
        let danoInimigo = batalha.inimigo.dano + rollDice(5);
        if (batalha.defendendo) { danoInimigo = Math.floor(danoInimigo / 2); batalha.defendendo = false; }
        const novoHP = Math.max(0, Number(player.hp_atual || 0) - danoInimigo);
        await updatePlayer(player.id, 'hp_atual', novoHP);
        await sendReply(message, `💥 ${batalha.inimigo.nome} ataca e causa ${danoInimigo} de dano. Seu HP: ${novoHP}/${player.hp_maximo}`);
        if (novoHP <= 0) {
            await sendReply(message, '💀 Você foi derrotado no domínio! Perdeu o progresso e retorna à vila.');
            db.run(`DELETE FROM dominio_instancias WHERE player_id = ? AND dominio_id = ?`, [player.id, batalha.dominioId]);
            batalhasAtivas.delete(player.id);
            await updatePlayer(player.id, 'hp_atual', Number(player.hp_maximo || 1));
        }
        return;
    }
    await sendReply(message, 'Combate PvP em desenvolvimento.');
}

async function processCommand(message) {
    try {
        if (!message || typeof message !== 'object') return;
        const body = typeof message.body === 'string' ? message.body.trim() : '';
        if (!body) return;
        const telefone = getSenderId(message);
        if (!telefone) return sendReply(message, 'Não foi possível identificar o remetente da mensagem.');

        if (!body.startsWith(COMMAND_PREFIX)) {
            if (respostaPendente?.has(telefone)) {
                const pendente = respostaPendente.get(telefone);
                if (pendente?.tipo === 'registro') {
                    const escolha = parseInt(body, 10);
                    if (Number.isNaN(escolha) || escolha < 1 || escolha > 4) return sendReply(message, 'Resposta inválida. Digite o número da opção (1 a 4).');
                    const perguntaIndex = pendente.dados.perguntaAtual;
                    const pergunta = pendente.perguntas[perguntaIndex];
                    const opcao = pergunta.opcoes[escolha - 1];
                    pendente.dados.karmaTotal += opcao.karma;
                    pendente.dados.perguntaAtual++;
                    await pendente.enviarProxima(message.from, pendente.dados);
                    return;
                }
            }
            if (npcDialogueSessions.has(telefone)) {
                const player = await ensurePlayerExists(telefone, message);
                if (!player) return;
                const choice = parseInt(body, 10);
                if (Number.isNaN(choice) || choice < 1 || choice > 4) return sendReply(message, 'Envie um número de 1 a 4 para responder ao NPC.');
                await handleNpcChoice(await initializeNarrativeStats(player), message, choice);
            }
            return;
        }

        const parts = body.slice(COMMAND_PREFIX.length).trim().split(/\s+/).filter(Boolean);
        const cmd = normalizeKey(parts[0] || '');
        const args = parts.slice(1);

        const commands = {
            registrar: cmdRegistrar,
            perfil: cmdPerfil,
            status: cmdPerfil,
            atributos: cmdPerfil,
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
            romper: cmdRomper,
            jogadores: cmdJogadores,
            encontrar: cmdEncontrar,
            trocar: cmdTrocar,
            duelar: cmdDuelar,
            aceitarduelo: typeof cmdAceitarDuelo === 'function' ? cmdAceitarDuelo : undefined,
            mercado: cmdMercadoGlobal,
            npc: cmdNPCInteragir,
            interagir: cmdNPCInteragir,
            atacar: cmdAtacar,
            defender: cmdDefender,
            fugir: cmdFugir,
            rumores: cmdRumores,
            missoesnpc: cmdMissoesNPC,
            mestre: cmdMestre,
            rival: cmdRival,
            politicaseita: cmdPoliticaSeita,
            retrato: cmdRetrato,
            seita: cmdSeitaExtra
        };
        if (commands[cmd]) return commands[cmd](args, message, telefone);
        await sendReply(message, 'Comando desconhecido. Use `/menu`.');
    } catch (err) {
        log(`Erro em processCommand v3: ${err?.stack || err}`, 'ERRO');
        await sendReply(message, 'Ocorreu um erro ao processar seu comando.');
    }
}

async function bootstrapBot() {
    try {
        await ensureStage3Schema();
        client.initialize();
    } catch (err) {
        log(`Falha no bootstrap do bot: ${err?.stack || err}`, 'ERRO');
        process.exitCode = 1;
    }
}

bootstrapBot();
