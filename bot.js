
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
db.exec(initSQL, (err) => {
    if (err) console.error(chalk.red('Erro ao criar tabelas:', err));
    else console.log(chalk.green('Banco de dados inicializado.'));
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

client.on('message', async (message) => {
    try {
        const body = typeof message?.body === 'string' ? message.body.trim() : '';
        if (!body || !body.startsWith(COMMAND_PREFIX)) return;
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

    db.get(`SELECT * FROM missoes_pessoais WHERE id = ? AND status = 'em_andamento' AND criador_id != ?`, [missaoId, player.id], async (_err, missaoPessoal) => {
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

            db.get(`SELECT * FROM dominio_instancias WHERE player_id = ? AND dominio_id = ? AND status = 'em_andamento'`, [player.id, dominio.id], (_err2, instancia) => {
                if (instancia) {
                    sendReply(message, `Você já está explorando ${dominio.nome} (andar ${instancia.andar_atual}/${dominio.andares}). Continue com /dominio continuar.`);
                    return;
                }

                db.run(`INSERT INTO dominio_instancias (player_id, dominio_id, andar_atual, status) VALUES (?, ?, 1, 'em_andamento')`, [player.id, dominio.id], async (err3) => {
                    if (err3) {
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
        db.get(
            `SELECT di.*, d.nome, d.andares, d.recompensa_base_ouro, d.item_raru_id 
             FROM dominio_instancias di 
             JOIN dominios d ON di.dominio_id = d.id 
             WHERE di.player_id = ? AND di.status = 'em_andamento'`,
            [player.id],
            async (err, instancia) => {
                if (err || !instancia) {
                    await sendReply(message, 'Você não está em nenhum domínio no momento. Use `/dominio entrar <nome>` para começar.');
                    return;
                }

                const andarAtual = instancia.andar_atual;
                const totalAndares = instancia.andares;
                const nome = instancia.nome;
                const inimigo = gerarInimigoDominio(andarAtual, totalAndares);

                await sendReply(message, `🏯 *${nome} - Andar ${andarAtual}/${totalAndares}*\n⚔️ Você encontra: *${inimigo.nome}* (HP: ${inimigo.hp})\nUse /atacar, /defender, /usaritem, /usartecnica.`);

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

    db.run(`UPDATE missoes_pessoais SET status = 'em_andamento' WHERE id = ? AND status = 'aberta'`, [missaoId], async function onUpdate(err) {
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

        // ========== VERIFICAÇÃO DE RESPOSTA PENDENTE (ex: perguntas do registro) ==========
        if (respostaPendente && respostaPendente.has(telefone)) {
            const pendente = respostaPendente.get(telefone);
            if (pendente.tipo === 'registro') {
                const escolha = parseInt(cmd); // O usuário responde apenas com o número, sem "/"
                if (isNaN(escolha) || escolha < 1 || escolha > 4) {
                    await sendReply(message, 'Resposta inválida. Digite o número da opção (1 a 4).');
                    return;
                }
                const perguntaIndex = pendente.dados.perguntaAtual;
                const pergunta = pendente.perguntas[perguntaIndex];
                const opcao = pergunta.opcoes[escolha - 1];
                pendente.dados.karmaTotal += opcao.karma;
                pendente.dados.perguntaAtual++;
                await pendente.enviarProxima(message.from, pendente.dados);
                return;
            }
        }
        // ========== FIM DA VERIFICAÇÃO ==========

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


// =====================================================
// V2 GAMEPLAY PATCH - tribulação, equipamentos, craft,
// bosses, quests NPC e perfil renovado.
// =====================================================

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

function normalizeKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function buildBar(current, max, size = 10) {
    const safeMax = Math.max(1, Number(max || 0));
    const safeCurrent = clamp(Number(current || 0), 0, safeMax);
    const filled = Math.round((safeCurrent / safeMax) * size);
    return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, size - filled))}`;
}

function displayProfessionName(key) {
    const names = {
        alquimista: 'Alquimista',
        forjador: 'Forjador',
        medico: 'Médico',
        mestre_talisma: 'Mestre de Talismã',
        mestre_formacoes: 'Mestre de Formações'
    };
    return names[key] || key || 'Sem profissão';
}

function normalizeProfessionName(input) {
    const key = normalizeKey(input);
    const aliases = {
        alquimista: 'alquimista',
        forjador: 'forjador',
        medico: 'medico',
        medicoo: 'medico',
        'mestre de talisma': 'mestre_talisma',
        'mestre de talismã': 'mestre_talisma',
        talisma: 'mestre_talisma',
        talisman: 'mestre_talisma',
        'mestre de formacoes': 'mestre_formacoes',
        'mestre de formações': 'mestre_formacoes',
        formacoes: 'mestre_formacoes',
        formacao: 'mestre_formacoes'
    };
    return aliases[key] || null;
}

function inferSlotFromItem(row) {
    const explicit = String(row?.slot || '').trim();
    if (explicit) return explicit;
    const tipo = normalizeKey(row?.tipo);
    if (tipo.includes('arma')) return 'arma';
    if (tipo.includes('armadura')) return 'armadura';
    if (tipo.includes('bota')) return 'botas';
    if (tipo.includes('amuleto')) return 'amuleto';
    if (tipo.includes('talisma')) return 'talisma';
    if (tipo.includes('artefato')) return 'artefato';
    return '';
}

async function safeRun(sql, params = []) {
    try {
        await runQuery(sql, params);
    } catch (_err) {
        return null;
    }
    return true;
}

async function addItemToInventory(playerId, itemId, quantidade = 1) {
    const qty = Math.max(1, parseInt(quantidade, 10) || 1);
    await runQuery(
        `INSERT INTO inventario (player_id, item_id, quantidade)
         VALUES (?, ?, ?)
         ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + excluded.quantidade`,
        [playerId, itemId, qty]
    );
}

async function removeItemFromInventory(playerId, itemId, quantidade = 1) {
    const qty = Math.max(1, parseInt(quantidade, 10) || 1);
    const row = await getQuery(`SELECT quantidade FROM inventario WHERE player_id = ? AND item_id = ?`, [playerId, itemId]);
    if (!row || row.quantidade < qty) return false;
    if (row.quantidade === qty) {
        await runQuery(`DELETE FROM inventario WHERE player_id = ? AND item_id = ?`, [playerId, itemId]);
    } else {
        await runQuery(`UPDATE inventario SET quantidade = quantidade - ? WHERE player_id = ? AND item_id = ?`, [qty, playerId, itemId]);
    }
    return true;
}

async function getOrCreateItemByName(nome, defaults = {}) {
    let item = await getQuery(`SELECT * FROM itens WHERE nome = ?`, [nome]);
    if (item) {
        const updates = {
            tipo: defaults.tipo ?? item.tipo ?? 'material',
            raridade: defaults.raridade ?? item.raridade ?? 'Comum',
            efeito: defaults.efeito ?? item.efeito ?? '',
            valor_venda: defaults.valor_venda ?? item.valor_venda ?? 0,
            valor_compra: defaults.valor_compra ?? item.valor_compra ?? 0,
            moeda_tipo: defaults.moeda_tipo ?? item.moeda_tipo ?? 'ouro',
            slot: defaults.slot ?? item.slot ?? null,
            equipavel: defaults.equipavel ?? item.equipavel ?? 0,
            bonus_forca: defaults.bonus_forca ?? item.bonus_forca ?? 0,
            bonus_vigor: defaults.bonus_vigor ?? item.bonus_vigor ?? 0,
            bonus_defesa: defaults.bonus_defesa ?? item.bonus_defesa ?? 0,
            bonus_inteligencia: defaults.bonus_inteligencia ?? item.bonus_inteligencia ?? 0,
            bonus_espirito: defaults.bonus_espirito ?? item.bonus_espirito ?? 0,
            bonus_agilidade: defaults.bonus_agilidade ?? item.bonus_agilidade ?? 0,
            bonus_hp: defaults.bonus_hp ?? item.bonus_hp ?? 0,
            bonus_qi: defaults.bonus_qi ?? item.bonus_qi ?? 0,
            bonus_alma: defaults.bonus_alma ?? item.bonus_alma ?? 0,
            stackavel: defaults.stackavel ?? item.stackavel ?? 1
        };
        await safeRun(
            `UPDATE itens SET tipo = ?, raridade = ?, efeito = ?, valor_venda = ?, valor_compra = ?, moeda_tipo = ?, slot = ?, equipavel = ?,
             bonus_forca = ?, bonus_vigor = ?, bonus_defesa = ?, bonus_inteligencia = ?, bonus_espirito = ?, bonus_agilidade = ?, bonus_hp = ?, bonus_qi = ?, bonus_alma = ?, stackavel = ?
             WHERE id = ?`,
            [
                updates.tipo, updates.raridade, updates.efeito, updates.valor_venda, updates.valor_compra, updates.moeda_tipo,
                updates.slot, updates.equipavel, updates.bonus_forca, updates.bonus_vigor, updates.bonus_defesa, updates.bonus_inteligencia,
                updates.bonus_espirito, updates.bonus_agilidade, updates.bonus_hp, updates.bonus_qi, updates.bonus_alma, updates.stackavel, item.id
            ]
        );
        return await getQuery(`SELECT * FROM itens WHERE id = ?`, [item.id]);
    }

    const payload = {
        tipo: defaults.tipo || 'material',
        raridade: defaults.raridade || 'Comum',
        efeito: defaults.efeito || '',
        valor_venda: defaults.valor_venda ?? 0,
        valor_compra: defaults.valor_compra ?? 0,
        moeda_tipo: defaults.moeda_tipo || 'ouro',
        slot: defaults.slot || null,
        equipavel: defaults.equipavel ?? 0,
        bonus_forca: defaults.bonus_forca ?? 0,
        bonus_vigor: defaults.bonus_vigor ?? 0,
        bonus_defesa: defaults.bonus_defesa ?? 0,
        bonus_inteligencia: defaults.bonus_inteligencia ?? 0,
        bonus_espirito: defaults.bonus_espirito ?? 0,
        bonus_agilidade: defaults.bonus_agilidade ?? 0,
        bonus_hp: defaults.bonus_hp ?? 0,
        bonus_qi: defaults.bonus_qi ?? 0,
        bonus_alma: defaults.bonus_alma ?? 0,
        stackavel: defaults.stackavel ?? 1
    };

    const result = await runQuery(
        `INSERT INTO itens (nome, tipo, raridade, efeito, valor_venda, valor_compra, moeda_tipo, slot, equipavel,
         bonus_forca, bonus_vigor, bonus_defesa, bonus_inteligencia, bonus_espirito, bonus_agilidade, bonus_hp, bonus_qi, bonus_alma, stackavel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            nome, payload.tipo, payload.raridade, payload.efeito, payload.valor_venda, payload.valor_compra, payload.moeda_tipo, payload.slot,
            payload.equipavel, payload.bonus_forca, payload.bonus_vigor, payload.bonus_defesa, payload.bonus_inteligencia, payload.bonus_espirito,
            payload.bonus_agilidade, payload.bonus_hp, payload.bonus_qi, payload.bonus_alma, payload.stackavel
        ]
    );
    return await getQuery(`SELECT * FROM itens WHERE id = ?`, [result.lastID]);
}

async function getEquipmentRows(playerId) {
    return await allQuery(
        `SELECT e.slot, i.*
         FROM equipamentos e
         JOIN itens i ON i.id = e.item_id
         WHERE e.player_id = ?
         ORDER BY e.slot ASC`,
        [playerId]
    );
}

async function getPlayerSheet(playerInput) {
    const player = playerInput?.id ? playerInput : await getPlayerById(playerInput);
    if (!player) return null;

    const equipment = await getEquipmentRows(player.id);
    const bonus = {
        forca: 0, vigor: 0, defesa: 0, inteligencia: 0, espirito: 0, agilidade: 0, hp: 0, qi: 0, alma: 0
    };
    for (const row of equipment) {
        bonus.forca += Number(row.bonus_forca || 0);
        bonus.vigor += Number(row.bonus_vigor || 0);
        bonus.defesa += Number(row.bonus_defesa || 0);
        bonus.inteligencia += Number(row.bonus_inteligencia || 0);
        bonus.espirito += Number(row.bonus_espirito || 0);
        bonus.agilidade += Number(row.bonus_agilidade || 0);
        bonus.hp += Number(row.bonus_hp || 0);
        bonus.qi += Number(row.bonus_qi || 0);
        bonus.alma += Number(row.bonus_alma || 0);
    }

    const totals = {
        forca: Number(player.forca || 0) + bonus.forca,
        vigor: Number(player.vigor || 0) + bonus.vigor,
        defesa: Number(player.defesa || 0) + bonus.defesa,
        inteligencia: Number(player.inteligencia || 0) + bonus.inteligencia,
        espirito: Number(player.espirito || 0) + bonus.espirito,
        agilidade: Number(player.agilidade || 0) + bonus.agilidade,
        hpMax: Math.max(1, Number(player.hp_maximo || 0) + bonus.hp),
        qiMax: Math.max(1, Number(player.qi_maximo || 0) + bonus.qi),
        almaMax: Math.max(1, Number(player.alma_maxima || 0) + bonus.alma),
    };

    return {
        player,
        equipment,
        bonus,
        totals,
        hpAtual: clamp(Number(player.hp_atual || 0), 0, totals.hpMax),
        qiAtual: clamp(Number(player.qi_atual || 0), 0, totals.qiMax),
        almaAtual: clamp(Number(player.alma_atual || 0), 0, totals.almaMax),
        fadigaAtual: clamp(Number(player.fadiga || 0), 0, 100)
    };
}

async function getProfessionRow(playerId) {
    return await getQuery(`SELECT * FROM profissoes WHERE player_id = ?`, [playerId]);
}

async function getCraftRecipeByIdOrName(profissao, query) {
    const maybeId = parseInt(query, 10);
    if (!Number.isNaN(maybeId)) {
        return await getQuery(`SELECT * FROM receitas_craft WHERE profissao = ? AND id = ?`, [profissao, maybeId]);
    }
    return await getQuery(`SELECT * FROM receitas_craft WHERE profissao = ? AND LOWER(nome) = LOWER(?)`, [profissao, query]);
}

async function listCraftRecipesForProfession(profissao) {
    return await allQuery(`SELECT * FROM receitas_craft WHERE profissao = ? ORDER BY nivel_necessario ASC, id ASC`, [profissao]);
}

async function getRecipeIngredients(receitaId) {
    return await allQuery(
        `SELECT ri.item_id, ri.quantidade, i.nome
         FROM receita_ingredientes ri
         JOIN itens i ON i.id = ri.item_id
         WHERE ri.receita_id = ?
         ORDER BY i.nome ASC`,
        [receitaId]
    );
}

async function updateQuestProgressOnKill(playerId, targetName, tipo) {
    const rows = await allQuery(
        `SELECT pq.player_id, pq.quest_id, pq.progresso, q.quantidade
         FROM player_quests pq
         JOIN quests_npc q ON q.id = pq.quest_id
         WHERE pq.player_id = ? AND pq.status = 'em_andamento' AND q.objetivo_tipo = ? AND LOWER(q.alvo_nome) = LOWER(?)`,
        [playerId, tipo, targetName]
    );

    for (const row of rows) {
        const novo = Math.min(Number(row.quantidade || 1), Number(row.progresso || 0) + 1);
        const status = novo >= Number(row.quantidade || 1) ? 'pronta_entrega' : 'em_andamento';
        await runQuery(`UPDATE player_quests SET progresso = ?, status = ? WHERE player_id = ? AND quest_id = ?`, [novo, status, playerId, row.quest_id]);
    }
}

async function ensureStarterSetup(player) {
    await safeRun(`UPDATE players SET banido = COALESCE(banido, 0), merito = COALESCE(merito, 0) WHERE id = ?`, [player.id]);

    const almaBase = Math.max(50, (Number(player.espirito || 0) + Number(player.inteligencia || 0)) * 2);
    if (player.alma_maxima == null || player.alma_maxima <= 0) {
        await safeRun(`UPDATE players SET alma_maxima = ?, alma_atual = COALESCE(alma_atual, ?) WHERE id = ?`, [almaBase, almaBase, player.id]);
    } else if (player.alma_atual == null) {
        await safeRun(`UPDATE players SET alma_atual = alma_maxima WHERE id = ?`, [player.id]);
    }

    const starter = await getQuery(`SELECT id FROM tecnicas WHERE nome = 'Meditação da Respiração Primordial'`);
    if (starter) {
        const learned = await getQuery(`SELECT 1 FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`, [player.id, starter.id]);
        if (!learned) {
            await runQuery(`INSERT INTO tecnicas_aprendidas (player_id, tecnica_id, compreensao, aprendida) VALUES (?, ?, 100, 1)`, [player.id, starter.id]);
        }
    }

    return await getPlayerById(player.id);
}

async function ensurePlayerExists(telefone, message) {
    const player = await getPlayer(telefone);
    if (!player) {
        await sendReply(message, '❌ Você não está registrado! Use `/registrar <nome> <sexo>` para começar.');
        return null;
    }
    if (Number(player.banido || 0) === 1 && !isOwner(message, telefone)) {
        await sendReply(message, '🚫 Seu acesso ao jogo está bloqueado.');
        return null;
    }
    return await ensureStarterSetup(player);
}

async function handlePendingResponse(message) {
    const telefone = getSenderId(message);
    if (!telefone || !respostaPendente.has(telefone)) return false;
    const pendente = respostaPendente.get(telefone);
    if (!pendente || pendente.tipo !== 'registro') return false;

    const rawBody = typeof message?.body === 'string' ? message.body.trim() : '';
    const rawChoice = rawBody.startsWith(COMMAND_PREFIX) ? rawBody.slice(COMMAND_PREFIX.length).trim() : rawBody;
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
        if (!body || body.startsWith(COMMAND_PREFIX)) return;
        await handlePendingResponse(message);
    } catch (err) {
        log(`Erro ao processar resposta pendente: ${err?.stack || err}`, 'ERRO');
    }
});

async function ensureSchemaUpdates() {
    await safeRun(`ALTER TABLE players ADD COLUMN alma_atual INTEGER DEFAULT 50`);
    await safeRun(`ALTER TABLE players ADD COLUMN alma_maxima INTEGER DEFAULT 50`);
    await safeRun(`ALTER TABLE players ADD COLUMN merito INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE players ADD COLUMN banido INTEGER DEFAULT 0`);

    await safeRun(`ALTER TABLE itens ADD COLUMN slot TEXT`);
    await safeRun(`ALTER TABLE itens ADD COLUMN equipavel INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN bonus_forca INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN bonus_vigor INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN bonus_defesa INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN bonus_inteligencia INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN bonus_espirito INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN bonus_agilidade INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN bonus_hp INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN bonus_qi INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN bonus_alma INTEGER DEFAULT 0`);
    await safeRun(`ALTER TABLE itens ADD COLUMN stackavel INTEGER DEFAULT 1`);

    await safeRun(`DROP TABLE IF EXISTS inventario_dedup`);
    await safeRun(`CREATE TABLE inventario_dedup AS SELECT MIN(id) AS id, player_id, item_id, SUM(COALESCE(quantidade,1)) AS quantidade FROM inventario GROUP BY player_id, item_id`);
    await safeRun(`DELETE FROM inventario`);
    await safeRun(`INSERT INTO inventario (id, player_id, item_id, quantidade) SELECT id, player_id, item_id, quantidade FROM inventario_dedup`);
    await safeRun(`DROP TABLE IF EXISTS inventario_dedup`);

    await safeRun(`DROP TABLE IF EXISTS equipamentos_dedup`);
    await safeRun(`CREATE TABLE equipamentos_dedup AS SELECT MIN(rowid) AS rowid_keep, player_id, item_id, slot FROM equipamentos GROUP BY player_id, slot`);
    await safeRun(`DELETE FROM equipamentos WHERE rowid NOT IN (SELECT rowid_keep FROM equipamentos_dedup)`);
    await safeRun(`DROP TABLE IF EXISTS equipamentos_dedup`);

    await safeRun(`DELETE FROM profissoes WHERE rowid NOT IN (SELECT MAX(rowid) FROM profissoes GROUP BY player_id)`);
    await safeRun(`DELETE FROM tecnicas_aprendidas WHERE rowid NOT IN (SELECT MAX(rowid) FROM tecnicas_aprendidas GROUP BY player_id, tecnica_id)`);

    await safeRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventario_unique ON inventario(player_id, item_id)`);
    await safeRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_equipamentos_unique ON equipamentos(player_id, slot)`);
    await safeRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_profissoes_unique ON profissoes(player_id)`);
    await safeRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tecnicas_unique ON tecnicas_aprendidas(player_id, tecnica_id)`);
    await safeRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_seita_membros_unique ON seita_membros(player_id)`);
    await safeRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_biblioteca_unique ON biblioteca_seita(seita_id, tecnica_id)`);

    await safeRun(`CREATE TABLE IF NOT EXISTS receitas_craft (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profissao TEXT NOT NULL,
        nome TEXT NOT NULL,
        resultado_item_id INTEGER NOT NULL,
        resultado_quantidade INTEGER DEFAULT 1,
        nivel_necessario INTEGER DEFAULT 1,
        custo_ouro INTEGER DEFAULT 0,
        chance_base INTEGER DEFAULT 80,
        xp_ganho INTEGER DEFAULT 20,
        descricao TEXT,
        FOREIGN KEY(resultado_item_id) REFERENCES itens(id)
    )`);

    await safeRun(`CREATE TABLE IF NOT EXISTS receita_ingredientes (
        receita_id INTEGER,
        item_id INTEGER,
        quantidade INTEGER DEFAULT 1,
        FOREIGN KEY(receita_id) REFERENCES receitas_craft(id),
        FOREIGN KEY(item_id) REFERENCES itens(id)
    )`);

    await safeRun(`CREATE TABLE IF NOT EXISTS bosses_regiao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        localizacao TEXT,
        descricao TEXT,
        nivel INTEGER DEFAULT 1,
        hp_base INTEGER DEFAULT 100,
        ataque_base INTEGER DEFAULT 20,
        defesa_base INTEGER DEFAULT 10,
        recompensa_ouro INTEGER DEFAULT 50,
        recompensa_merito INTEGER DEFAULT 1,
        drop_item_id INTEGER,
        drop_quantidade INTEGER DEFAULT 1,
        FOREIGN KEY(drop_item_id) REFERENCES itens(id)
    )`);

    await safeRun(`CREATE TABLE IF NOT EXISTS quests_npc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        npc_id INTEGER,
        titulo TEXT,
        descricao TEXT,
        objetivo_tipo TEXT,
        alvo_nome TEXT,
        item_id INTEGER,
        quantidade INTEGER DEFAULT 1,
        recompensa_ouro INTEGER DEFAULT 0,
        recompensa_item_id INTEGER,
        recompensa_merito INTEGER DEFAULT 0,
        FOREIGN KEY(npc_id) REFERENCES npcs(id),
        FOREIGN KEY(item_id) REFERENCES itens(id),
        FOREIGN KEY(recompensa_item_id) REFERENCES itens(id)
    )`);

    await safeRun(`CREATE TABLE IF NOT EXISTS player_quests (
        player_id INTEGER,
        quest_id INTEGER,
        progresso INTEGER DEFAULT 0,
        status TEXT DEFAULT 'em_andamento',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(player_id) REFERENCES players(id),
        FOREIGN KEY(quest_id) REFERENCES quests_npc(id)
    )`);

    await safeRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_player_quests_unique ON player_quests(player_id, quest_id)`);

    await seedGameplayData();
    await safeRun(`UPDATE players SET merito = COALESCE(merito, 0), banido = COALESCE(banido, 0)`);
    await safeRun(`UPDATE players SET alma_maxima = CASE WHEN alma_maxima IS NULL OR alma_maxima <= 0 THEN MAX(50, (COALESCE(espirito,0) + COALESCE(inteligencia,0)) * 2) ELSE alma_maxima END`);
    await safeRun(`UPDATE players SET alma_atual = CASE WHEN alma_atual IS NULL OR alma_atual <= 0 THEN alma_maxima ELSE alma_atual END`);
}

async function seedGameplayData() {
    const itemDefs = [
        { nome: 'Erva Calmante', tipo: 'material', raridade: 'Comum', efeito: 'Ingrediente herbal.', valor_venda: 3, valor_compra: 8 },
        { nome: 'Essência Espiritual', tipo: 'material', raridade: 'Comum', efeito: 'Condensa energia espiritual.', valor_venda: 6, valor_compra: 14 },
        { nome: 'Minério Rústico', tipo: 'material', raridade: 'Comum', efeito: 'Minério bruto para forja.', valor_venda: 5, valor_compra: 12 },
        { nome: 'Pele de Lobo', tipo: 'material', raridade: 'Comum', efeito: 'Couro leve de fera.', valor_venda: 5, valor_compra: 12 },
        { nome: 'Presa Feral', tipo: 'material', raridade: 'Incomum', efeito: 'Presa com energia bestial.', valor_venda: 8, valor_compra: 18 },
        { nome: 'Seda de Aranha', tipo: 'material', raridade: 'Incomum', efeito: 'Fio resistente e flexível.', valor_venda: 8, valor_compra: 18 },
        { nome: 'Fragmento de Jade', tipo: 'material', raridade: 'Incomum', efeito: 'Fragmento espiritual lapidável.', valor_venda: 12, valor_compra: 28 },
        { nome: 'Núcleo Sombrio', tipo: 'material', raridade: 'Raro', efeito: 'Núcleo de energia corrompida.', valor_venda: 20, valor_compra: 50 },
        { nome: 'Sangue Demoníaco', tipo: 'material', raridade: 'Raro', efeito: 'Sangue fervilhante de criatura demoníaca.', valor_venda: 24, valor_compra: 60 },
        { nome: 'Cristal Tempestuoso', tipo: 'material', raridade: 'Raro', efeito: 'Cristal carregado por relâmpagos.', valor_venda: 28, valor_compra: 70 },
        { nome: 'Pílula Condensadora de Qi', tipo: 'pilula', raridade: 'Incomum', efeito: 'Restaura 80 Qi', valor_venda: 16, valor_compra: 32, stackavel: 1 },
        { nome: 'Pílula Revitalizante', tipo: 'pilula', raridade: 'Incomum', efeito: 'Restaura 100 HP', valor_venda: 18, valor_compra: 36, stackavel: 1 },
        { nome: 'Elixir da Alma', tipo: 'pilula', raridade: 'Raro', efeito: 'Restaura 40 Alma', valor_venda: 22, valor_compra: 44, stackavel: 1 },
        { nome: 'Bálsamo Vital', tipo: 'pilula', raridade: 'Comum', efeito: 'Restaura 60 HP', valor_venda: 10, valor_compra: 24, stackavel: 1 },
        { nome: 'Tônico da Alma', tipo: 'pilula', raridade: 'Incomum', efeito: 'Restaura 35 Alma', valor_venda: 16, valor_compra: 32, stackavel: 1 },
        { nome: 'Espada de Ferro', tipo: 'arma', raridade: 'Comum', efeito: 'Uma lâmina firme para iniciantes.', valor_venda: 30, valor_compra: 65, slot: 'arma', equipavel: 1, stackavel: 0, bonus_forca: 6, bonus_agilidade: 1 },
        { nome: 'Armadura de Couro', tipo: 'armadura', raridade: 'Comum', efeito: 'Proteção leve e flexível.', valor_venda: 28, valor_compra: 60, slot: 'armadura', equipavel: 1, stackavel: 0, bonus_defesa: 6, bonus_hp: 25 },
        { nome: 'Botas do Caçador', tipo: 'botas', raridade: 'Incomum', efeito: 'Passos leves e precisos.', valor_venda: 24, valor_compra: 52, slot: 'botas', equipavel: 1, stackavel: 0, bonus_agilidade: 4, bonus_defesa: 1 },
        { nome: 'Talismã do Trovão', tipo: 'talisma', raridade: 'Incomum', efeito: 'Canaliza eletricidade espiritual.', valor_venda: 26, valor_compra: 58, slot: 'talisma', equipavel: 1, stackavel: 0, bonus_inteligencia: 4, bonus_agilidade: 2, bonus_qi: 15 },
        { nome: 'Talismã Escarlate', tipo: 'talisma', raridade: 'Raro', efeito: 'Canaliza ímpeto sanguíneo.', valor_venda: 35, valor_compra: 78, slot: 'talisma', equipavel: 1, stackavel: 0, bonus_forca: 4, bonus_espirito: 2, bonus_qi: 12 },
        { nome: 'Núcleo da Barreira', tipo: 'artefato', raridade: 'Raro', efeito: 'Artefato de suporte defensivo.', valor_venda: 40, valor_compra: 90, slot: 'artefato', equipavel: 1, stackavel: 0, bonus_defesa: 5, bonus_hp: 20, bonus_qi: 10 },
        { nome: 'Bandeira da Formação', tipo: 'artefato', raridade: 'Raro', efeito: 'Amplifica o fluxo espiritual em combate.', valor_venda: 42, valor_compra: 92, slot: 'artefato', equipavel: 1, stackavel: 0, bonus_espirito: 5, bonus_alma: 15 },
        { nome: 'Amuleto Espiritual', tipo: 'amuleto', raridade: 'Incomum', efeito: 'Amuleto simples de foco interno.', valor_venda: 22, valor_compra: 48, slot: 'amuleto', equipavel: 1, stackavel: 0, bonus_espirito: 3, bonus_qi: 10, bonus_alma: 10 }
    ];

    const items = {};
    for (const def of itemDefs) {
        items[def.nome] = await getOrCreateItemByName(def.nome, def);
    }

    await safeRun(`INSERT OR IGNORE INTO loja_rpg (item_id, moeda_tipo, preco) VALUES (?, 'ouro', ?)`, [items['Amuleto Espiritual'].id, 48]);

    const npcDefs = [
        { nome: 'Ancião Mu', localizacao: 'Floresta Sombria', dialogo_inicial: 'A floresta anda inquieta. As feras estão mais agressivas do que o normal.' },
        { nome: 'Ferreiro Han', localizacao: 'Vila Inicial', dialogo_inicial: 'Traga materiais de qualidade e eu lhe ensinarei como sobreviver.' },
        { nome: 'Curandeira Lin', localizacao: 'Vila Inicial', dialogo_inicial: 'O corpo cai, a alma vacila, mas ambos podem ser restaurados.' },
        { nome: 'Mestre Qiao', localizacao: 'Templo Antigo', dialogo_inicial: 'As ruínas guardam ecos de formações antigas e espíritos rancorosos.' }
    ];

    for (const npc of npcDefs) {
        const existing = await getQuery(`SELECT id FROM npcs WHERE nome = ? AND localizacao = ?`, [npc.nome, npc.localizacao]);
        if (!existing) {
            await runQuery(`INSERT INTO npcs (nome, localizacao, dialogo_inicial, opcoes, missao_id) VALUES (?, ?, ?, '', NULL)`, [npc.nome, npc.localizacao, npc.dialogo_inicial]);
        }
    }

    const npcRows = await allQuery(`SELECT * FROM npcs`);
    const npcMap = Object.fromEntries(npcRows.map((row) => [`${row.nome}|${row.localizacao}`, row]));

    const questDefs = [
        {
            npc: 'Ancião Mu|Floresta Sombria',
            titulo: 'Lobos na Névoa',
            descricao: 'Derrote 3 Lobo Cinzento para aliviar a pressão sobre a trilha da floresta.',
            objetivo_tipo: 'kill_mob',
            alvo_nome: 'Lobo Cinzento',
            quantidade: 3,
            recompensa_ouro: 45,
            recompensa_item_id: items['Pílula Condensadora de Qi'].id,
            recompensa_merito: 2
        },
        {
            npc: 'Ferreiro Han|Vila Inicial',
            titulo: 'Minério para a Forja',
            descricao: 'Reúna 4 Minério Rústico para reforçar a oficina do ferreiro.',
            objetivo_tipo: 'collect_item',
            item_id: items['Minério Rústico'].id,
            alvo_nome: 'Minério Rústico',
            quantidade: 4,
            recompensa_ouro: 40,
            recompensa_item_id: items['Espada de Ferro'].id,
            recompensa_merito: 3
        },
        {
            npc: 'Curandeira Lin|Vila Inicial',
            titulo: 'Ervas para o Sopro Vital',
            descricao: 'Colete 5 Erva Calmante para preparar bálsamos curativos.',
            objetivo_tipo: 'collect_item',
            item_id: items['Erva Calmante'].id,
            alvo_nome: 'Erva Calmante',
            quantidade: 5,
            recompensa_ouro: 35,
            recompensa_item_id: items['Bálsamo Vital'].id,
            recompensa_merito: 2
        },
        {
            npc: 'Mestre Qiao|Templo Antigo',
            titulo: 'Purificar as Ruínas',
            descricao: 'Derrote 2 Esqueleto Guerreiro dentro das ruínas antigas.',
            objetivo_tipo: 'kill_mob',
            alvo_nome: 'Esqueleto Guerreiro',
            quantidade: 2,
            recompensa_ouro: 80,
            recompensa_item_id: items['Núcleo da Barreira'].id,
            recompensa_merito: 5
        }
    ];

    for (const quest of questDefs) {
        const npc = npcMap[quest.npc];
        if (!npc) continue;
        const existing = await getQuery(`SELECT id FROM quests_npc WHERE npc_id = ? AND titulo = ?`, [npc.id, quest.titulo]);
        if (!existing) {
            await runQuery(
                `INSERT INTO quests_npc (npc_id, titulo, descricao, objetivo_tipo, alvo_nome, item_id, quantidade, recompensa_ouro, recompensa_item_id, recompensa_merito)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [npc.id, quest.titulo, quest.descricao, quest.objetivo_tipo, quest.alvo_nome, quest.item_id || null, quest.quantidade, quest.recompensa_ouro, quest.recompensa_item_id || null, quest.recompensa_merito || 0]
            );
        }
    }

    const bossDefs = [
        { nome: 'Lobo Alfa da Névoa', localizacao: 'Floresta Sombria', descricao: 'Um alfa colossal envolto em bruma maldita.', nivel: 2, hp_base: 180, ataque_base: 24, defesa_base: 10, recompensa_ouro: 70, recompensa_merito: 5, drop_item_id: items['Presa Feral'].id, drop_quantidade: 2 },
        { nome: 'Matriarca Aracnídea', localizacao: 'Ruínas Antigas', descricao: 'Uma aranha ancestral que tece seda espiritual.', nivel: 4, hp_base: 240, ataque_base: 30, defesa_base: 12, recompensa_ouro: 110, recompensa_merito: 7, drop_item_id: items['Seda de Aranha'].id, drop_quantidade: 3 },
        { nome: 'Guardião de Jade Partido', localizacao: 'Templo Antigo', descricao: 'Estátua viva que pulsa com energia de formações antigas.', nivel: 5, hp_base: 300, ataque_base: 36, defesa_base: 18, recompensa_ouro: 150, recompensa_merito: 9, drop_item_id: items['Fragmento de Jade'].id, drop_quantidade: 2 },
        { nome: 'Serpente do Trovão', localizacao: 'Pico da Tempestade', descricao: 'Serpente rara banhada em raios celestes.', nivel: 7, hp_base: 360, ataque_base: 42, defesa_base: 20, recompensa_ouro: 220, recompensa_merito: 12, drop_item_id: items['Cristal Tempestuoso'].id, drop_quantidade: 2 }
    ];

    for (const boss of bossDefs) {
        const existing = await getQuery(`SELECT id FROM bosses_regiao WHERE nome = ? AND localizacao = ?`, [boss.nome, boss.localizacao]);
        if (!existing) {
            await runQuery(
                `INSERT INTO bosses_regiao (nome, localizacao, descricao, nivel, hp_base, ataque_base, defesa_base, recompensa_ouro, recompensa_merito, drop_item_id, drop_quantidade)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [boss.nome, boss.localizacao, boss.descricao, boss.nivel, boss.hp_base, boss.ataque_base, boss.defesa_base, boss.recompensa_ouro, boss.recompensa_merito, boss.drop_item_id, boss.drop_quantidade]
            );
        }
    }

    const recipes = [
        { profissao: 'alquimista', nome: 'Pílula Condensadora de Qi', resultado: 'Pílula Condensadora de Qi', quantidade: 1, nivel: 1, custo: 6, chance: 85, xp: 28, descricao: 'Condensa energia espiritual em forma de pílula.', ingredientes: { 'Erva Calmante': 2, 'Essência Espiritual': 1 } },
        { profissao: 'alquimista', nome: 'Pílula Revitalizante', resultado: 'Pílula Revitalizante', quantidade: 1, nivel: 2, custo: 8, chance: 80, xp: 34, descricao: 'Mistura medicinal para restaurar o corpo.', ingredientes: { 'Erva Calmante': 2, 'Pele de Lobo': 1, 'Essência Espiritual': 1 } },
        { profissao: 'alquimista', nome: 'Elixir da Alma', resultado: 'Elixir da Alma', quantidade: 1, nivel: 3, custo: 12, chance: 72, xp: 45, descricao: 'Fortalece a alma durante provações espirituais.', ingredientes: { 'Essência Espiritual': 2, 'Fragmento de Jade': 1, 'Núcleo Sombrio': 1 } },
        { profissao: 'forjador', nome: 'Espada de Ferro', resultado: 'Espada de Ferro', quantidade: 1, nivel: 1, custo: 10, chance: 82, xp: 30, descricao: 'Lâmina confiável para cultivadores iniciantes.', ingredientes: { 'Minério Rústico': 3, 'Presa Feral': 1 } },
        { profissao: 'forjador', nome: 'Armadura de Couro', resultado: 'Armadura de Couro', quantidade: 1, nivel: 1, custo: 10, chance: 82, xp: 30, descricao: 'Proteção feita com couro reforçado.', ingredientes: { 'Pele de Lobo': 3, 'Seda de Aranha': 1 } },
        { profissao: 'forjador', nome: 'Botas do Caçador', resultado: 'Botas do Caçador', quantidade: 1, nivel: 2, custo: 12, chance: 78, xp: 36, descricao: 'Botas leves para movimentação rápida.', ingredientes: { 'Pele de Lobo': 2, 'Seda de Aranha': 2, 'Minério Rústico': 1 } },
        { profissao: 'medico', nome: 'Bálsamo Vital', resultado: 'Bálsamo Vital', quantidade: 1, nivel: 1, custo: 6, chance: 88, xp: 24, descricao: 'Unguento aplicado para fechar ferimentos.', ingredientes: { 'Erva Calmante': 3, 'Essência Espiritual': 1 } },
        { profissao: 'medico', nome: 'Tônico da Alma', resultado: 'Tônico da Alma', quantidade: 1, nivel: 2, custo: 9, chance: 76, xp: 32, descricao: 'Poção calmante para restaurar a alma.', ingredientes: { 'Erva Calmante': 2, 'Fragmento de Jade': 1, 'Essência Espiritual': 1 } },
        { profissao: 'mestre_talisma', nome: 'Talismã do Trovão', resultado: 'Talismã do Trovão', quantidade: 1, nivel: 2, custo: 14, chance: 74, xp: 40, descricao: 'Talismã que amplifica reflexos e Qi.', ingredientes: { 'Fragmento de Jade': 2, 'Cristal Tempestuoso': 1, 'Seda de Aranha': 1 } },
        { profissao: 'mestre_talisma', nome: 'Talismã Escarlate', resultado: 'Talismã Escarlate', quantidade: 1, nivel: 3, custo: 18, chance: 68, xp: 50, descricao: 'Talismã agressivo com essência sanguínea.', ingredientes: { 'Sangue Demoníaco': 1, 'Fragmento de Jade': 2, 'Essência Espiritual': 1 } },
        { profissao: 'mestre_formacoes', nome: 'Núcleo da Barreira', resultado: 'Núcleo da Barreira', quantidade: 1, nivel: 2, custo: 16, chance: 70, xp: 42, descricao: 'Âncora para formações defensivas.', ingredientes: { 'Fragmento de Jade': 2, 'Núcleo Sombrio': 1, 'Minério Rústico': 2 } },
        { profissao: 'mestre_formacoes', nome: 'Bandeira da Formação', resultado: 'Bandeira da Formação', quantidade: 1, nivel: 3, custo: 20, chance: 66, xp: 54, descricao: 'Conduz energia espiritual dentro de formações.', ingredientes: { 'Seda de Aranha': 2, 'Fragmento de Jade': 2, 'Essência Espiritual': 2 } }
    ];

    for (const recipe of recipes) {
        const resultItem = items[recipe.resultado] || await getOrCreateItemByName(recipe.resultado, { tipo: 'especial', raridade: 'Comum', efeito: 'Resultado de craft', valor_venda: 10, valor_compra: 20 });
        let existing = await getQuery(`SELECT id FROM receitas_craft WHERE profissao = ? AND nome = ?`, [recipe.profissao, recipe.nome]);
        if (!existing) {
            const result = await runQuery(
                `INSERT INTO receitas_craft (profissao, nome, resultado_item_id, resultado_quantidade, nivel_necessario, custo_ouro, chance_base, xp_ganho, descricao)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [recipe.profissao, recipe.nome, resultItem.id, recipe.quantidade, recipe.nivel, recipe.custo, recipe.chance, recipe.xp, recipe.descricao]
            );
            existing = { id: result.lastID };
        } else {
            await runQuery(
                `UPDATE receitas_craft SET resultado_item_id = ?, resultado_quantidade = ?, nivel_necessario = ?, custo_ouro = ?, chance_base = ?, xp_ganho = ?, descricao = ? WHERE id = ?`,
                [resultItem.id, recipe.quantidade, recipe.nivel, recipe.custo, recipe.chance, recipe.xp, recipe.descricao, existing.id]
            );
            await runQuery(`DELETE FROM receita_ingredientes WHERE receita_id = ?`, [existing.id]);
        }

        for (const [itemName, qtd] of Object.entries(recipe.ingredientes)) {
            const ingredientItem = items[itemName] || await getOrCreateItemByName(itemName, { tipo: 'material', raridade: 'Comum', efeito: 'Ingrediente' });
            await runQuery(`INSERT INTO receita_ingredientes (receita_id, item_id, quantidade) VALUES (?, ?, ?)`, [existing.id, ingredientItem.id, qtd]);
        }
    }

    await safeRun(`INSERT OR IGNORE INTO changelog (versao, data, texto) VALUES ('v2.0.0', date('now'), 'V2 de gameplay: tribulação, equipamentos com bônus, craft com qualidade, bosses por região, quests de NPC e novo perfil RPG.')`);
}

const duelosPendentes = new Map();
const REGION_MOBS = {
    'floresta sombria': [
        { nome: 'Lobo Cinzento', hp: 65, ataque: 14, defesa: 6, ouro: [7, 14], drops: [ ['Pele de Lobo', 75, 1, 2], ['Presa Feral', 20, 1, 1], ['Erva Calmante', 25, 1, 1] ] },
        { nome: 'Goblin Ladrão', hp: 58, ataque: 16, defesa: 5, ouro: [8, 16], drops: [ ['Minério Rústico', 40, 1, 2], ['Essência Espiritual', 35, 1, 1] ] },
        { nome: 'Aranha Tecedeira', hp: 72, ataque: 13, defesa: 8, ouro: [9, 17], drops: [ ['Seda de Aranha', 70, 1, 2], ['Essência Espiritual', 30, 1, 1] ] }
    ],
    'vila inicial': [
        { nome: 'Rato Espiritual', hp: 38, ataque: 8, defesa: 3, ouro: [3, 8], drops: [ ['Erva Calmante', 35, 1, 1], ['Essência Espiritual', 15, 1, 1] ] },
        { nome: 'Javali Ferino', hp: 82, ataque: 18, defesa: 10, ouro: [10, 18], drops: [ ['Presa Feral', 45, 1, 1], ['Pele de Lobo', 25, 1, 1], ['Minério Rústico', 20, 1, 1] ] }
    ],
    'ruinas antigas': [
        { nome: 'Esqueleto Guerreiro', hp: 90, ataque: 22, defesa: 12, ouro: [14, 24], drops: [ ['Osso Antigo', 70, 1, 2], ['Fragmento de Jade', 20, 1, 1], ['Essência Espiritual', 30, 1, 1] ] },
        { nome: 'Espírito Vingativo', hp: 88, ataque: 24, defesa: 9, ouro: [16, 26], drops: [ ['Núcleo Sombrio', 18, 1, 1], ['Essência Espiritual', 40, 1, 2] ] }
    ],
    'templo antigo': [
        { nome: 'Esqueleto Guerreiro', hp: 95, ataque: 22, defesa: 12, ouro: [15, 25], drops: [ ['Osso Antigo', 75, 1, 2], ['Fragmento de Jade', 25, 1, 1] ] },
        { nome: 'Guardião Rúnico', hp: 120, ataque: 28, defesa: 16, ouro: [20, 30], drops: [ ['Fragmento de Jade', 55, 1, 2], ['Essência Espiritual', 35, 1, 2] ] }
    ],
    'pico da tempestade': [
        { nome: 'Falcão Relampejante', hp: 132, ataque: 34, defesa: 14, ouro: [25, 38], drops: [ ['Cristal Tempestuoso', 45, 1, 1], ['Essência Espiritual', 35, 1, 2] ] }
    ]
};

const QUALITY_TIERS = [
    { key: 'comum', label: 'Comum', mult: 1.0, threshold: 60 },
    { key: 'refinado', label: 'Refinado', mult: 1.15, threshold: 85 },
    { key: 'superior', label: 'Superior', mult: 1.3, threshold: 96 },
    { key: 'perfeito', label: 'Perfeito', mult: 1.5, threshold: 101 }
];

function chooseMobForLocation(localizacao) {
    const key = normalizeKey(localizacao);
    const pool = REGION_MOBS[key] || REGION_MOBS['floresta sombria'];
    return pool[Math.floor(Math.random() * pool.length)];
}

async function createQualityVariant(baseItem, qualityLabel) {
    if (!baseItem || qualityLabel === 'Comum') return baseItem;
    const mult = QUALITY_TIERS.find((q) => q.label === qualityLabel)?.mult || 1;
    const suffixName = `${baseItem.nome} [${qualityLabel}]`;
    const scaledEffect = String(baseItem.efeito || '').replace(/(\d+)/g, (m) => String(Math.max(1, Math.round(Number(m) * mult))));
    return await getOrCreateItemByName(suffixName, {
        tipo: baseItem.tipo,
        raridade: qualityLabel,
        efeito: scaledEffect || baseItem.efeito,
        valor_venda: Math.max(1, Math.round(Number(baseItem.valor_venda || 0) * mult)),
        valor_compra: Math.max(1, Math.round(Number(baseItem.valor_compra || 0) * mult)),
        moeda_tipo: baseItem.moeda_tipo || 'ouro',
        slot: baseItem.slot || inferSlotFromItem(baseItem),
        equipavel: Number(baseItem.equipavel || 0),
        stackavel: Number(baseItem.stackavel ?? 1),
        bonus_forca: Math.round(Number(baseItem.bonus_forca || 0) * mult),
        bonus_vigor: Math.round(Number(baseItem.bonus_vigor || 0) * mult),
        bonus_defesa: Math.round(Number(baseItem.bonus_defesa || 0) * mult),
        bonus_inteligencia: Math.round(Number(baseItem.bonus_inteligencia || 0) * mult),
        bonus_espirito: Math.round(Number(baseItem.bonus_espirito || 0) * mult),
        bonus_agilidade: Math.round(Number(baseItem.bonus_agilidade || 0) * mult),
        bonus_hp: Math.round(Number(baseItem.bonus_hp || 0) * mult),
        bonus_qi: Math.round(Number(baseItem.bonus_qi || 0) * mult),
        bonus_alma: Math.round(Number(baseItem.bonus_alma || 0) * mult)
    });
}

function rollCraftQuality(player, profLevel) {
    const fortune = Number(player.fortuna || 0);
    const score = rollDice(100) + Math.floor((profLevel || 1) * 2) + Math.floor(fortune / 12);
    if (score >= 98) return 'Perfeito';
    if (score >= 88) return 'Superior';
    if (score >= 72) return 'Refinado';
    return 'Comum';
}

async function rollMobDrops(mob) {
    const drops = [];
    for (const [name, chance, minQty, maxQty] of mob.drops || []) {
        if (rollDice(100) <= chance) {
            const item = await getOrCreateItemByName(name, { tipo: 'material', raridade: 'Comum', efeito: 'Drop de criatura.' });
            drops.push({ item, quantidade: randomBetween(minQty, maxQty) });
        }
    }
    return drops;
}

async function resolveEnemyAttack(message, player, battle, sheet) {
    let baseDamage = Number(battle.ataque || battle.inimigo?.dano || 10);
    let damage = Math.max(1, baseDamage - Math.floor(sheet.totals.defesa / 4));
    if (battle.defendendo) {
        damage = Math.max(1, Math.floor(damage / 2));
        battle.defendendo = false;
    }
    const newHp = Math.max(0, Number(player.hp_atual || 0) - damage);
    await runQuery(`UPDATE players SET hp_atual = ? WHERE id = ?`, [newHp, player.id]);
    await sendReply(message, `💥 ${battle.nome || battle.inimigo?.nome || 'O inimigo'} revida e causa *${damage}* de dano. Seu HP ficou em ${newHp}/${sheet.totals.hpMax}.`);
    if (newHp <= 0) {
        await runQuery(`UPDATE players SET hp_atual = hp_maximo, qi_atual = qi_maximo, alma_atual = alma_maxima, ouro = MAX(0, ouro - 15) WHERE id = ?`, [player.id]);
        batalhasAtivas.delete(player.id);
        await sendReply(message, '💀 Você caiu em combate e foi levado de volta para um lugar seguro. Perdeu 15 ouro.');
        return true;
    }
    return false;
}

async function concludeBattleVictory(message, player, battle, sheet) {
    if (battle.tipo === 'monstro') {
        const ouro = randomBetween(...(battle.ouroRange || [8, 16]));
        await runQuery(`UPDATE players SET ouro = ouro + ?, reputacao = reputacao + 1 WHERE id = ?`, [ouro, player.id]);
        const drops = await rollMobDrops(battle.mobData || { drops: [] });
        let lootText = `🏆 Você derrotou *${battle.nome}* e ganhou ${ouro} ouro.`;
        for (const drop of drops) {
            await addItemToInventory(player.id, drop.item.id, drop.quantidade);
            lootText += `\n🎁 ${drop.item.nome} x${drop.quantidade}`;
        }
        await updateQuestProgressOnKill(player.id, battle.nome, 'kill_mob');
        batalhasAtivas.delete(player.id);
        await sendReply(message, lootText);
        return;
    }

    if (battle.tipo === 'boss') {
        await runQuery(`UPDATE players SET ouro = ouro + ?, merito = merito + ?, reputacao = reputacao + 3 WHERE id = ?`, [battle.recompensaOuro || 0, battle.recompensaMerito || 0, player.id]);
        let texto = `👑 *Boss derrotado!* ${battle.nome} tombou diante de você.\n🪙 Ouro: +${battle.recompensaOuro || 0}\n🎖️ Mérito: +${battle.recompensaMerito || 0}`;
        if (battle.dropItemId) {
            await addItemToInventory(player.id, battle.dropItemId, battle.dropQuantidade || 1);
            const item = await getQuery(`SELECT nome FROM itens WHERE id = ?`, [battle.dropItemId]);
            texto += `\n🎁 Drop: ${item?.nome || 'Item raro'} x${battle.dropQuantidade || 1}`;
        }
        await updateQuestProgressOnKill(player.id, battle.nome, 'kill_boss');
        batalhasAtivas.delete(player.id);
        await sendReply(message, texto);
        return;
    }

    if (battle.tipo === 'dominio') {
        const instancia = await getQuery(`SELECT di.*, d.nome, d.andares, d.recompensa_base_ouro FROM dominio_instancias di JOIN dominios d ON d.id = di.dominio_id WHERE di.player_id = ? AND di.dominio_id = ?`, [player.id, battle.dominioId]);
        if (!instancia) {
            batalhasAtivas.delete(player.id);
            await sendReply(message, 'Você venceu a luta do domínio, mas a instância não foi encontrada.');
            return;
        }
        const proximoAndar = Number(instancia.andar_atual || 1) + 1;
        if (proximoAndar > Number(instancia.andares || 1)) {
            await runQuery(`UPDATE dominio_instancias SET status = 'concluido' WHERE player_id = ? AND dominio_id = ?`, [player.id, battle.dominioId]);
            const reward = Number(instancia.recompensa_base_ouro || 0) + Number(instancia.andares || 1) * 15;
            await runQuery(`UPDATE players SET ouro = ouro + ?, merito = merito + ?, reputacao = reputacao + 2 WHERE id = ?`, [reward, Number(instancia.andares || 1), player.id]);
            batalhasAtivas.delete(player.id);
            await sendReply(message, `🏯 *Domínio concluído!* Você limpou ${instancia.nome} e recebeu ${reward} ouro, além de ${instancia.andares} mérito.`);
        } else {
            await runQuery(`UPDATE dominio_instancias SET andar_atual = ? WHERE player_id = ? AND dominio_id = ?`, [proximoAndar, player.id, battle.dominioId]);
            batalhasAtivas.delete(player.id);
            await sendReply(message, `✨ Andar limpo. Você agora pode seguir para o andar ${proximoAndar}/${instancia.andares} com /dominio continuar.`);
        }
        return;
    }

    if (battle.tipo === 'pvp') {
        const opponent = await getPlayerById(battle.opponentId);
        await runQuery(`UPDATE players SET merito = merito + 2, reputacao = reputacao + 1 WHERE id = ?`, [player.id]);
        if (opponent) {
            await runQuery(`UPDATE players SET hp_atual = hp_maximo, qi_atual = qi_maximo, alma_atual = alma_maxima WHERE id = ?`, [opponent.id]);
        }
        batalhasAtivas.delete(player.id);
        if (opponent) batalhasAtivas.delete(opponent.id);
        await sendReply(message, `⚔️ Você venceu o duelo contra ${battle.opponentName}!`);
        if (opponent) {
            const target = buildDirectId(opponent.telefone);
            if (target) await client.sendMessage(target, `⚔️ Você foi derrotado em duelo por ${player.nome}.`);
        }
    }
}

async function formatInventoryLine(row) {
    const slot = row.slot ? ` • ${row.slot}` : '';
    const equip = Number(row.equipavel || 0) === 1 ? ' [equipável]' : '';
    return `• ID ${row.id} - ${row.nome} x${row.quantidade}${slot}${equip}`;
}

async function cmdPerfil(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const sheet = await getPlayerSheet(player);
    const eqMap = Object.fromEntries((sheet.equipment || []).map((row) => [row.slot, row]));

    const texto = [
        `📊 *Estado de ${player.nome}*`,
        `🆔 ${player.unique_id}`,
        `🧬 ${player.raca} • 🏮 ${player.clan}`,
        `🌿 ${player.raiz_espiritual} (${player.elementos})`,
        `💪 ${player.corpo_divino || 'Corpo Comum'}`,
        `⚖️ ${player.alinhamento} • Karma ${player.karma} • Reputação ${player.reputacao}`,
        '',
        `❤️ HP ${buildBar(sheet.hpAtual, sheet.totals.hpMax)} ${sheet.hpAtual}/${sheet.totals.hpMax}`,
        `🔷 Qi ${buildBar(sheet.qiAtual, sheet.totals.qiMax)} ${sheet.qiAtual}/${sheet.totals.qiMax}`,
        `🕯️ Alma ${buildBar(sheet.almaAtual, sheet.totals.almaMax)} ${sheet.almaAtual}/${sheet.totals.almaMax}`,
        `😮‍💨 Fadiga ${buildBar(sheet.fadigaAtual, 100)} ${sheet.fadigaAtual}/100`,
        '',
        `⚔️ Força: ${sheet.totals.forca}   🛡️ Defesa: ${sheet.totals.defesa}   ⚡ Agilidade: ${sheet.totals.agilidade}`,
        `🧠 Inteligência: ${sheet.totals.inteligencia}   🧘 Espírito: ${sheet.totals.espirito}   💪 Vigor: ${sheet.totals.vigor}`,
        `🏆 Físico: Reino ${player.nivel_fisico} • Etapa ${player.sub_fisico}/9`,
        `✨ Espiritual: Reino ${player.nivel_espiritual} • Etapa ${player.sub_espiritual}/9`,
        '',
        `🪙 Ouro: ${player.ouro}`,
        `🔮 Pérolas Espirituais: ${player.perolas_esp}`,
        `💎 Cristais Espirituais: ${player.cristais_esp}`,
        `🎖️ Mérito: ${player.merito || 0}`,
        `🧿 Essência Imortal: ${player.essencia_imortal}`,
        '',
        `🧥 *Equipamentos*`,
        `• Arma: ${eqMap.arma?.nome || 'Nenhuma'}`,
        `• Armadura: ${eqMap.armadura?.nome || 'Nenhuma'}`,
        `• Botas: ${eqMap.botas?.nome || 'Nenhuma'}`,
        `• Amuleto: ${eqMap.amuleto?.nome || 'Nenhum'}`,
        `• Talismã: ${eqMap.talisma?.nome || 'Nenhum'}`,
        `• Artefato: ${eqMap.artefato?.nome || 'Nenhum'}`,
        '',
        `📍 Localização: ${player.localizacao || 'Vila Inicial'}`,
        `💼 Profissão: ${displayProfessionName(normalizeProfessionName(player.profissao_principal) || player.profissao_principal || '')} • Nível ${player.nivel_profissao || 0}`
    ].join('\n');

    if (player.avatar_url) {
        try {
            const media = await MessageMedia.fromUrl(player.avatar_url, { unsafe: true });
            await sendReply(message, texto, media);
            return;
        } catch (_err) {
            // segue sem avatar
        }
    }
    await sendReply(message, texto);
}

async function cmdInventario(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const rows = await allQuery(
        `SELECT i.id, i.nome, i.tipo, i.slot, i.equipavel, inv.quantidade
         FROM inventario inv JOIN itens i ON i.id = inv.item_id
         WHERE inv.player_id = ?
         ORDER BY i.tipo ASC, i.nome ASC`,
        [player.id]
    );
    if (!rows.length) {
        await sendReply(message, '🎒 Seu inventário está vazio.');
        return;
    }
    let txt = '🎒 *Inventário do Cultivador*\n';
    for (const row of rows) {
        txt += `\n${await formatInventoryLine(row)}`;
    }
    txt += '\n\nUse `/equipar <id_item>` para vestir equipamentos ou `/usaritem <id_item>` para consumíveis.';
    await sendReply(message, txt);
}

async function cmdEquipamentos(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const eq = await getEquipmentRows(player.id);
    if (!eq.length) {
        await sendReply(message, '🧥 Você não tem equipamentos ativos. Use `/equipar <id_item>` para vestir um item.');
        return;
    }
    let txt = '🧥 *Equipamentos Ativos*\n';
    for (const row of eq) {
        txt += `\n• ${row.slot}: ${row.nome}`;
    }
    await sendReply(message, txt);
}

async function cmdEquipar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const itemId = parseInt(args[0], 10);
    if (Number.isNaN(itemId)) {
        await sendReply(message, 'Uso: `/equipar <id_item>`');
        return;
    }

    const row = await getQuery(
        `SELECT inv.quantidade, i.*
         FROM inventario inv
         JOIN itens i ON i.id = inv.item_id
         WHERE inv.player_id = ? AND inv.item_id = ?`,
        [player.id, itemId]
    );
    if (!row) {
        await sendReply(message, 'Você não possui esse item no inventário.');
        return;
    }
    const slot = inferSlotFromItem(row);
    if (Number(row.equipavel || 0) !== 1 || !slot) {
        await sendReply(message, 'Esse item não pode ser equipado.');
        return;
    }

    const current = await getQuery(`SELECT * FROM equipamentos WHERE player_id = ? AND slot = ?`, [player.id, slot]);
    if (current) {
        await addItemToInventory(player.id, current.item_id, 1);
        await runQuery(`DELETE FROM equipamentos WHERE player_id = ? AND slot = ?`, [player.id, slot]);
    }

    const removed = await removeItemFromInventory(player.id, itemId, 1);
    if (!removed) {
        await sendReply(message, 'Não foi possível equipar esse item.');
        return;
    }

    await runQuery(
        `INSERT INTO equipamentos (player_id, item_id, slot) VALUES (?, ?, ?)
         ON CONFLICT(player_id, slot) DO UPDATE SET item_id = excluded.item_id`,
        [player.id, itemId, slot]
    );

    await sendReply(message, `🧥 Você equipou *${row.nome}* no slot *${slot}*.`);
}

async function cmdDesequipar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const slot = normalizeKey(args[0]);
    const slotAliases = { arma: 'arma', armadura: 'armadura', botas: 'botas', bota: 'botas', amuleto: 'amuleto', talisma: 'talisma', artefato: 'artefato' };
    const realSlot = slotAliases[slot];
    if (!realSlot) {
        await sendReply(message, 'Uso: `/desequipar <arma|armadura|botas|amuleto|talisma|artefato>`');
        return;
    }
    const current = await getQuery(`SELECT * FROM equipamentos WHERE player_id = ? AND slot = ?`, [player.id, realSlot]);
    if (!current) {
        await sendReply(message, 'Não há item equipado nesse slot.');
        return;
    }
    await addItemToInventory(player.id, current.item_id, 1);
    await runQuery(`DELETE FROM equipamentos WHERE player_id = ? AND slot = ?`, [player.id, realSlot]);
    const item = await getQuery(`SELECT nome FROM itens WHERE id = ?`, [current.item_id]);
    await sendReply(message, `📦 Você desequipou *${item?.nome || 'o item'}* do slot *${realSlot}*.`);
}

async function cmdUsarItem(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const itemId = parseInt(args[0], 10);
    if (Number.isNaN(itemId)) {
        await sendReply(message, 'Uso: `/usaritem <id_item>`');
        return;
    }

    const row = await getQuery(
        `SELECT inv.quantidade, i.* FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ? AND inv.item_id = ?`,
        [player.id, itemId]
    );
    if (!row || Number(row.quantidade || 0) < 1) {
        await sendReply(message, 'Item não encontrado no inventário.');
        return;
    }
    if (Number(row.equipavel || 0) === 1) {
        await sendReply(message, 'Esse item é um equipamento. Use `/equipar` para vesti-lo.');
        return;
    }

    let novoQi = Number(player.qi_atual || 0);
    let novoHp = Number(player.hp_atual || 0);
    let novaAlma = Number(player.alma_atual || 0);
    const efeito = String(row.efeito || '');
    let resposta = `✨ Você usou ${row.nome}.`;

    const qMatch = efeito.match(/(\d+)\s*Qi/i);
    if (qMatch) {
        novoQi = Math.min(Number(player.qi_maximo || 0), novoQi + Number(qMatch[1] || 0));
        resposta += `\n🔷 Qi restaurado para ${novoQi}/${player.qi_maximo}.`;
    }
    const hMatch = efeito.match(/(\d+)\s*HP/i);
    if (hMatch) {
        novoHp = Math.min(Number(player.hp_maximo || 0), novoHp + Number(hMatch[1] || 0));
        resposta += `\n❤️ HP restaurado para ${novoHp}/${player.hp_maximo}.`;
    }
    const aMatch = efeito.match(/(\d+)\s*Alma/i);
    if (aMatch) {
        novoAlma = Math.min(Number(player.alma_maxima || 0), novaAlma + Number(aMatch[1] || 0));
        resposta += `\n🕯️ Alma restaurada para ${novoAlma}/${player.alma_maxima}.`;
    }

    await runQuery(`UPDATE players SET qi_atual = ?, hp_atual = ?, alma_atual = ? WHERE id = ?`, [novoQi, novoHp, novoAlma, player.id]);
    await removeItemFromInventory(player.id, itemId, 1);
    await sendReply(message, resposta);
}

async function cmdMenu(_args, message) {
    const versao = '2.0.0';
    const agora = new Date();
    let menu = `╭━━⪩ *CHASING IMMORTALITY* ⪨━━\n`;
    menu += `▢ Data: ${agora.toLocaleDateString('pt-BR')} • Hora: ${agora.toLocaleTimeString('pt-BR')}\n`;
    menu += `▢ Prefixo: / • Versão: ${versao}\n`;
    menu += `╰━━─「🪐」─━━\n\n`;

    menu += `╭━━⪩ 🎯 PRINCIPAL ⪨━━\n`;
    menu += `▢ /registrar <nome> <M/F>\n`;
    menu += `▢ /perfil • /status • /atributos\n`;
    menu += `▢ /inventario • /equipamentos\n`;
    menu += `▢ /equipar <id> • /desequipar <slot>\n`;
    menu += `╰━━─「🎯」─━━\n\n`;

    menu += `╭━━⪩ ☯️ CULTIVO ⪨━━\n`;
    menu += `▢ /cultivar [fisico|espiritual]\n`;
    menu += `▢ /romper [fisico|espiritual]\n`;
    menu += `▢ /tecnicas • /compreender <id> • /aprender <id>\n`;
    menu += `▢ /descansar\n`;
    menu += `╰━━─「☯️」─━━\n\n`;

    menu += `╭━━⪩ ⚔️ COMBATE & MUNDO ⪨━━\n`;
    menu += `▢ /andar [regiao] • /parar\n`;
    menu += `▢ /bosses • /boss <id|nome>\n`;
    menu += `▢ /dominio • /dominio entrar <nome> • /dominio continuar\n`;
    menu += `▢ /atacar • /defender • /usaritem <id> • /usartecnica <id> • /fugir\n`;
    menu += `╰━━─「⚔️」─━━\n\n`;

    menu += `╭━━⪩ 🏪 PROFISSÕES & ECONOMIA ⪨━━\n`;
    menu += `▢ /profissao listar\n`;
    menu += `▢ /profissao escolher <nome>\n`;
    menu += `▢ /craftar listar • /craftar detalhes <id> • /craftar <id>\n`;
    menu += `▢ /subirprofissao\n`;
    menu += `▢ /loja • /mercado [listar|vender|comprar|minhas]\n`;
    menu += `╰━━─「🏪」─━━\n\n`;

    menu += `╭━━⪩ 👤 NPCS & MISSÕES ⪨━━\n`;
    menu += `▢ /npc\n`;
    menu += `▢ /npc aceitar <id_quest>\n`;
    menu += `▢ /npc entregar <id_quest>\n`;
    menu += `▢ /missoesnpc\n`;
    menu += `▢ /missoes • /aceitar <id> • /completarmissao <id>\n`;
    menu += `▢ /criarmissao <desc> <recompensa> • /missoesdisponiveis • /minhasmissoes\n`;
    menu += `╰━━─「👤」─━━\n\n`;

    menu += `╭━━⪩ 🤝 SOCIAL ⪨━━\n`;
    menu += `▢ /jogadores • /encontrar\n`;
    menu += `▢ /duelar <id> • /aceitarduelo <id>\n`;
    menu += `▢ /trocar <id> <item> <qtd>\n`;
    menu += `▢ /amigos • /adicionaramigo <id> • /inimigo <id>\n`;
    menu += `▢ /conversar <id> <msg> • /lerchat\n`;
    menu += `╰━━─「🤝」─━━\n\n`;

    menu += `╭━━⪩ ℹ️ INFORMAÇÕES ⪨━━\n`;
    menu += `▢ /guia [cultivo|batalha|profissao|social]\n`;
    menu += `▢ /ranking [forca|reino|riqueza|karma]\n`;
    menu += `▢ /eventos • /changelog\n`;
    menu += `▢ /mudaraparencia <url>\n`;
    menu += `╰━━─「ℹ️」─━━`;

    await sendReply(message, menu);
}

async function cmdGuia(args, message) {
    if (!args.length) {
        await sendReply(message, '📖 *Guias disponíveis:*\n/guia cultivo\n/guia batalha\n/guia profissao\n/guia social');
        return;
    }
    const assunto = normalizeKey(args[0]);
    let texto = '';
    if (assunto === 'cultivo') {
        texto = '🌿 *Guia de Cultivo*\n\nCultive para subir as etapas 1/9 dos caminhos físico e espiritual. Ao atingir 9/9, use `/romper` para enfrentar a tribulação. A alma participa das provações espirituais, então mantenha HP, Qi e Alma em dia.';
    } else if (assunto === 'batalha') {
        texto = '⚔️ *Guia de Batalha*\n\nVocê pode enfrentar monstros, bosses, domínios e jogadores. Equipamentos aumentam atributos reais, defesa reduz dano e técnicas gastam Qi. Bosses concedem mérito, drops raros e aceleram progressão.';
    } else if (assunto === 'profissao' || assunto === 'profissaoes') {
        texto = '🛠️ *Guia de Profissões*\n\nCada profissão possui receitas próprias. Use `/craftar listar` para ver as receitas, `/craftar detalhes <id>` para conferir ingredientes e `/craftar <id>` para produzir. Crafts podem falhar e também sair com qualidade Refinada, Superior ou Perfeita.';
    } else {
        texto = '👥 *Guia Social*\n\nUse `/duelar`, `/trocar`, `/conversar`, `/amigos` e `/lerchat` para interagir com outros cultivadores. NPCs podem oferecer missões e bosses regionais trazem recompensas cobiçadas.';
    }
    await sendReply(message, texto);
}

async function cmdRomper(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const escolhas = [];
    if (Number(player.sub_fisico || 0) >= 9) escolhas.push('fisico');
    if (Number(player.sub_espiritual || 0) >= 9) escolhas.push('espiritual');
    if (!escolhas.length) {
        await sendReply(message, 'Você ainda não alcançou o pico de um caminho de cultivo. Chegue a 9/9 antes de tentar romper.');
        return;
    }
    let alvo = normalizeKey(args[0]);
    if (!alvo) {
        if (escolhas.length === 2) {
            await sendReply(message, 'Você está pronto em dois caminhos. Escolha: `/romper fisico` ou `/romper espiritual`.');
            return;
        }
        alvo = escolhas[0];
    }
    if (!escolhas.includes(alvo)) {
        await sendReply(message, 'Esse caminho ainda não está pronto para a tribulação.');
        return;
    }

    const sheet = await getPlayerSheet(player);
    const custoQi = alvo === 'fisico' ? 20 : 30;
    const custoAlma = alvo === 'fisico' ? 8 : 15;
    if (sheet.qiAtual < custoQi || sheet.almaAtual < custoAlma || sheet.hpAtual < Math.floor(sheet.totals.hpMax * 0.35)) {
        await sendReply(message, 'Sua condição está instável demais para a tribulação. Recupere HP, Qi e Alma antes de tentar novamente.');
        return;
    }

    const chanceBase = alvo === 'fisico'
        ? 42 + Math.floor((sheet.totals.vigor + sheet.totals.defesa) / 4)
        : 40 + Math.floor((sheet.totals.inteligencia + sheet.totals.espirito) / 4);
    const chance = clamp(chanceBase + Math.floor(Number(player.fortuna || 0) / 12) + (player.corpo_divino ? 8 : 0), 25, 95);
    const roll = rollDice(100);

    await runQuery(`UPDATE players SET qi_atual = qi_atual - ?, alma_atual = alma_atual - ? WHERE id = ?`, [custoQi, custoAlma, player.id]);

    if (roll <= chance) {
        if (alvo === 'fisico') {
            await runQuery(`UPDATE players SET nivel_fisico = nivel_fisico + 1, sub_fisico = 1, forca = forca + 2, vigor = vigor + 2, defesa = defesa + 1, hp_atual = hp_maximo, qi_atual = qi_maximo, alma_atual = alma_maxima, merito = merito + 3 WHERE id = ?`, [player.id]);
        } else {
            await runQuery(`UPDATE players SET nivel_espiritual = nivel_espiritual + 1, sub_espiritual = 1, inteligencia = inteligencia + 2, espirito = espirito + 2, agilidade = agilidade + 1, hp_atual = hp_maximo, qi_atual = qi_maximo, alma_atual = alma_maxima, merito = merito + 4 WHERE id = ?`, [player.id]);
        }
        await sendReply(message, `⚡ *TRIBULAÇÃO SUPERADA!*\nO Céu reconheceu seu avanço no caminho *${alvo}*. Seu reino se elevou, seus meridianos se abriram mais e seu corpo foi reforçado pelo relâmpago da ascensão.`);
    } else {
        const newHp = Math.max(1, Math.floor(sheet.hpAtual * 0.45));
        const downSub = Math.max(8, alvo === 'fisico' ? Number(player.sub_fisico || 9) - 1 : Number(player.sub_espiritual || 9) - 1);
        if (alvo === 'fisico') {
            await runQuery(`UPDATE players SET hp_atual = ?, sub_fisico = ? WHERE id = ?`, [newHp, downSub, player.id]);
        } else {
            await runQuery(`UPDATE players SET hp_atual = ?, sub_espiritual = ? WHERE id = ?`, [newHp, downSub, player.id]);
        }
        await sendReply(message, `🌩️ *A tribulação o rejeitou.*\nVocê falhou no caminho *${alvo}* e sofreu um severo refluxo. Seu HP caiu para ${newHp} e sua etapa recuou para ${downSub}/9.`);
    }
}

async function cmdProfissao(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const sub = normalizeKey(args[0] || '');
    if (!sub || sub === 'status') {
        const key = normalizeProfessionName(player.profissao_principal);
        const row = await getProfessionRow(player.id);
        await sendReply(message, `💼 Profissão atual: *${displayProfessionName(key)}*\nNível: ${row?.nivel || player.nivel_profissao || 0}\nXP: ${row?.experiencia || 0}`);
        return;
    }
    if (sub === 'listar') {
        await sendReply(message, '💼 *Profissões disponíveis*\n• Alquimista\n• Forjador\n• Médico\n• Mestre de Talismã\n• Mestre de Formações\n\nUse `/profissao escolher <nome>`.');
        return;
    }
    if (sub === 'escolher') {
        const prof = normalizeProfessionName(args.slice(1).join(' '));
        if (!prof) {
            await sendReply(message, 'Profissão inválida.');
            return;
        }
        await runQuery(`INSERT INTO profissoes (player_id, profissao, nivel, experiencia) VALUES (?, ?, 1, 0) ON CONFLICT(player_id) DO UPDATE SET profissao = excluded.profissao, nivel = CASE WHEN profissoes.profissao = excluded.profissao THEN profissoes.nivel ELSE 1 END, experiencia = CASE WHEN profissoes.profissao = excluded.profissao THEN profissoes.experiencia ELSE 0 END`, [player.id, prof]);
        const row = await getProfessionRow(player.id);
        await runQuery(`UPDATE players SET profissao_principal = ?, nivel_profissao = ? WHERE id = ?`, [prof, row?.nivel || 1, player.id]);
        await sendReply(message, `🛠️ Você agora trilha a profissão *${displayProfessionName(prof)}*. Use /craftar listar para ver as receitas.`);
        return;
    }
    await sendReply(message, 'Uso: `/profissao listar` ou `/profissao escolher <nome>`.');
}

async function cmdCraftar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const profissao = normalizeProfessionName(player.profissao_principal);
    if (!profissao) {
        await sendReply(message, 'Você ainda não escolheu uma profissão. Use `/profissao escolher <nome>`.');
        return;
    }
    const profRow = await getProfessionRow(player.id) || { nivel: Number(player.nivel_profissao || 1), experiencia: 0 };
    const sub = normalizeKey(args[0] || 'listar');

    if (sub === 'listar') {
        const rows = await listCraftRecipesForProfession(profissao);
        if (!rows.length) {
            await sendReply(message, 'Nenhuma receita disponível para sua profissão.');
            return;
        }
        let txt = `🧪 *Receitas de ${displayProfessionName(profissao)}*\nNível da profissão: ${profRow.nivel}\n`;
        for (const row of rows) {
            const resultItem = await getQuery(`SELECT nome FROM itens WHERE id = ?`, [row.resultado_item_id]);
            txt += `\n• ID ${row.id} - ${row.nome} → ${resultItem?.nome || 'Item'} x${row.resultado_quantidade} | Nível ${row.nivel_necessario} | ${row.chance_base}% base`;
        }
        txt += '\n\nUse `/craftar detalhes <id>` para ver ingredientes ou `/craftar <id>` para produzir.';
        await sendReply(message, txt);
        return;
    }

    if (sub === 'detalhes') {
        const recipe = await getCraftRecipeByIdOrName(profissao, args.slice(1).join(' '));
        if (!recipe) {
            await sendReply(message, 'Receita não encontrada.');
            return;
        }
        const ingredientes = await getRecipeIngredients(recipe.id);
        const resultItem = await getQuery(`SELECT nome FROM itens WHERE id = ?`, [recipe.resultado_item_id]);
        let txt = `📜 *${recipe.nome}*\nResultado: ${resultItem?.nome || 'Item'} x${recipe.resultado_quantidade}\nNível necessário: ${recipe.nivel_necessario}\nChance base: ${recipe.chance_base}%\nCusto em ouro: ${recipe.custo_ouro}\nXP: ${recipe.xp_ganho}\n${recipe.descricao || ''}\n\n*Ingredientes:*`;
        for (const ing of ingredientes) {
            txt += `\n• ${ing.nome} x${ing.quantidade}`;
        }
        await sendReply(message, txt);
        return;
    }

    const recipe = await getCraftRecipeByIdOrName(profissao, args.join(' '));
    if (!recipe) {
        await sendReply(message, 'Receita não encontrada. Use `/craftar listar`.');
        return;
    }
    if (Number(profRow.nivel || 1) < Number(recipe.nivel_necessario || 1)) {
        await sendReply(message, 'Seu nível de profissão ainda é insuficiente para essa receita.');
        return;
    }
    if (Number(player.ouro || 0) < Number(recipe.custo_ouro || 0)) {
        await sendReply(message, 'Você não tem ouro suficiente para esse craft.');
        return;
    }

    const ingredientes = await getRecipeIngredients(recipe.id);
    for (const ing of ingredientes) {
        const row = await getQuery(`SELECT quantidade FROM inventario WHERE player_id = ? AND item_id = ?`, [player.id, ing.item_id]);
        if (!row || Number(row.quantidade || 0) < Number(ing.quantidade || 0)) {
            await sendReply(message, `Faltam ingredientes: ${ing.nome} x${ing.quantidade}.`);
            return;
        }
    }

    for (const ing of ingredientes) {
        await removeItemFromInventory(player.id, ing.item_id, ing.quantidade);
    }
    await runQuery(`UPDATE players SET ouro = ouro - ? WHERE id = ?`, [recipe.custo_ouro, player.id]);

    const chance = clamp(Number(recipe.chance_base || 0) + Number(profRow.nivel || 1) * 4 + Math.floor(Number(player.fortuna || 0) / 20), 20, 98);
    const roll = rollDice(100);
    const xpGain = Number(recipe.xp_ganho || 20);

    if (roll > chance) {
        await runQuery(`UPDATE profissoes SET experiencia = experiencia + ? WHERE player_id = ?`, [Math.max(5, Math.floor(xpGain / 2)), player.id]);
        await sendReply(message, `💥 O craft de *${recipe.nome}* falhou. Os materiais foram consumidos, mas você ainda ganhou experiência de ofício.`);
        return;
    }

    const baseItem = await getQuery(`SELECT * FROM itens WHERE id = ?`, [recipe.resultado_item_id]);
    const quality = rollCraftQuality(player, Number(profRow.nivel || 1));
    const itemToGive = await createQualityVariant(baseItem, quality);
    await addItemToInventory(player.id, itemToGive.id, recipe.resultado_quantidade || 1);
    await runQuery(`UPDATE profissoes SET experiencia = experiencia + ? WHERE player_id = ?`, [xpGain, player.id]);
    await sendReply(message, `✨ Craft concluído com *qualidade ${quality}*!\nVocê produziu ${itemToGive.nome} x${recipe.resultado_quantidade || 1}.`);
}

async function cmdSubirProfissao(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const row = await getProfessionRow(player.id);
    if (!row) {
        await sendReply(message, 'Você ainda não escolheu uma profissão.');
        return;
    }
    const xpNec = Number(row.nivel || 1) * 120;
    if (Number(row.experiencia || 0) < xpNec) {
        await sendReply(message, `Você precisa de mais ${xpNec - Number(row.experiencia || 0)} XP de ofício para subir.`);
        return;
    }
    const novoNivel = Number(row.nivel || 1) + 1;
    await runQuery(`UPDATE profissoes SET nivel = ?, experiencia = experiencia - ? WHERE player_id = ?`, [novoNivel, xpNec, player.id]);
    await runQuery(`UPDATE players SET nivel_profissao = ?, merito = merito + 1 WHERE id = ?`, [novoNivel, player.id]);
    await sendReply(message, `🎉 Sua profissão ascendeu para *nível ${novoNivel}*! Seus crafts agora têm mais chance de sucesso e melhor qualidade.`);
}

async function processExplorationTick(player, message) {
    const evento = rollDice(100);
    if (evento <= 45) {
        const mob = chooseMobForLocation(player.localizacao);
        batalhasAtivas.set(player.id, {
            tipo: 'monstro',
            nome: mob.nome,
            hp: mob.hp,
            hpMax: mob.hp,
            ataque: mob.ataque,
            defesa: mob.defesa,
            ouroRange: mob.ouro,
            mobData: mob,
            chatId: getChatId(message)
        });
        await sendReply(message, `⚔️ *Emboscada!*\nVocê encontrou *${mob.nome}* (HP ${mob.hp}). Use /atacar, /defender, /usaritem ou /usartecnica.`);
        return;
    }
    if (evento <= 65) {
        const materials = ['Erva Calmante', 'Minério Rústico', 'Essência Espiritual'];
        const name = materials[Math.floor(Math.random() * materials.length)];
        const item = await getOrCreateItemByName(name, { tipo: 'material', raridade: 'Comum', efeito: 'Material encontrado em exploração.' });
        const quantidade = randomBetween(1, 2);
        await addItemToInventory(player.id, item.id, quantidade);
        await sendReply(message, `🌿 Você encontrou *${name}* x${quantidade} durante a exploração.`);
        return;
    }
    if (evento <= 82) {
        const npcs = await allQuery(`SELECT nome FROM npcs WHERE localizacao = ? OR localizacao = 'global'`, [player.localizacao]);
        if (npcs.length) {
            await sendReply(message, `👤 Você sente a presença de alguém próximo. Use /npc em *${player.localizacao}* para interagir.`);
            return;
        }
    }
    if (evento <= 92) {
        const bosses = await allQuery(`SELECT id, nome FROM bosses_regiao WHERE localizacao = ?`, [player.localizacao]);
        if (bosses.length) {
            await sendReply(message, '👑 Um poder opressor ecoa pela região. Talvez seja a hora de usar /bosses.');
            return;
        }
    }
    await sendReply(message, '🍃 O vento passa entre as árvores. Nada decisivo aconteceu nesta ronda de exploração.');
}

async function cmdAndar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (exploracaoAtiva.has(player.id)) {
        await sendReply(message, 'Você já está explorando. Use `/parar` para interromper.');
        return;
    }
    if (Number(player.fadiga || 0) < 10) {
        await sendReply(message, 'Você está cansado demais para explorar. Descanse primeiro.');
        return;
    }
    const regiao = args.join(' ').trim() || 'Floresta Sombria';
    await runQuery(`UPDATE players SET localizacao = ? WHERE id = ?`, [regiao, player.id]);
    await sendReply(message, `🧭 Você segue para *${regiao}*. Um evento foi disparado imediatamente e novos eventos continuam a cada 5 minutos.`);
    await processExplorationTick({ ...player, localizacao: regiao }, message);

    const interval = setInterval(async () => {
        try {
            const fresh = await getPlayerById(player.id);
            if (!fresh || !exploracaoAtiva.has(player.id)) return;
            if (Number(fresh.fadiga || 0) <= 0) {
                clearInterval(interval);
                exploracaoAtiva.delete(player.id);
                await sendReply(message, '😴 Você colapsou de exaustão e a exploração foi encerrada.');
                return;
            }
            await runQuery(`UPDATE players SET fadiga = MAX(0, fadiga - 2) WHERE id = ?`, [player.id]);
            const next = await getPlayerById(player.id);
            await processExplorationTick(next, message);
        } catch (err) {
            log(`Erro no tick de exploração: ${err?.stack || err}`, 'ERRO');
        }
    }, 300000);
    exploracaoAtiva.set(player.id, { interval, regiao });
}

async function cmdAtacar(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const battle = batalhasAtivas.get(player.id);
    if (!battle) {
        await sendReply(message, 'Você não está em combate.');
        return;
    }
    const sheet = await getPlayerSheet(player);
    const danoBase = randomBetween(Math.max(4, Math.floor(sheet.totals.forca * 0.7)), Math.max(8, sheet.totals.forca + 8));
    const dano = Math.max(1, danoBase - Math.floor(Number(battle.defesa || battle.inimigo?.defesa || 0) / 3));

    if (battle.tipo === 'pvp') {
        const opponent = await getPlayerById(battle.opponentId);
        if (!opponent) {
            batalhasAtivas.delete(player.id);
            await sendReply(message, 'Seu oponente não pôde ser encontrado.');
            return;
        }
        const oppSheet = await getPlayerSheet(opponent);
        const realDamage = Math.max(1, dano - Math.floor(oppSheet.totals.defesa / 5));
        const newHp = Math.max(0, Number(opponent.hp_atual || 0) - realDamage);
        await runQuery(`UPDATE players SET hp_atual = ? WHERE id = ?`, [newHp, opponent.id]);
        await sendReply(message, `⚔️ Você golpeou ${battle.opponentName} e causou *${realDamage}* de dano.`);
        const target = buildDirectId(opponent.telefone);
        if (target) await client.sendMessage(target, `⚔️ ${player.nome} o atingiu com *${realDamage}* de dano. Seu HP está em ${newHp}/${oppSheet.totals.hpMax}.`);
        if (newHp <= 0) {
            await concludeBattleVictory(message, player, battle, sheet);
        }
        return;
    }

    battle.hp = Math.max(0, Number(battle.hp || battle.hpInimigo || 0) - dano);
    if (battle.hpInimigo != null) battle.hpInimigo = battle.hp;
    await sendReply(message, `⚔️ Você atinge *${battle.nome || battle.inimigo?.nome}* e causa *${dano}* de dano. HP restante: ${battle.hp}/${battle.hpMax || battle.inimigo?.hp || battle.hp}.`);
    if (battle.hp <= 0) {
        await concludeBattleVictory(message, player, battle, sheet);
        return;
    }
    await resolveEnemyAttack(message, player, battle, sheet);
}

async function cmdDefender(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const battle = batalhasAtivas.get(player.id);
    if (!battle) {
        await sendReply(message, 'Você não está em combate.');
        return;
    }
    battle.defendendo = true;
    await sendReply(message, '🛡️ Você assume uma postura defensiva. O próximo golpe recebido terá o dano reduzido.');
}

async function cmdFugir(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const battle = batalhasAtivas.get(player.id);
    if (!battle) {
        await sendReply(message, 'Você não está em combate.');
        return;
    }
    const sheet = await getPlayerSheet(player);
    const chance = clamp(35 + Math.floor(sheet.totals.agilidade / 2), 20, 90);
    if (rollDice(100) <= chance) {
        batalhasAtivas.delete(player.id);
        await sendReply(message, '🏃 Você conseguiu escapar do combate.');
    } else {
        await sendReply(message, '❌ Sua tentativa de fuga falhou.');
        await resolveEnemyAttack(message, player, battle, sheet);
    }
}

async function cmdUsarTecnica(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const battle = batalhasAtivas.get(player.id);
    if (!battle) {
        await sendReply(message, 'Você não está em combate.');
        return;
    }
    const idTec = parseInt(args[0], 10);
    if (Number.isNaN(idTec)) {
        await sendReply(message, 'Uso: `/usartecnica <id_tecnica>`');
        return;
    }
    const row = await getQuery(
        `SELECT t.* FROM tecnicas_aprendidas ta JOIN tecnicas t ON t.id = ta.tecnica_id
         WHERE ta.player_id = ? AND ta.tecnica_id = ? AND ta.aprendida = 1`,
        [player.id, idTec]
    );
    if (!row) {
        await sendReply(message, 'Você não domina essa técnica.');
        return;
    }
    if (Number(player.qi_atual || 0) < Number(row.custo_qi || 0)) {
        await sendReply(message, `Qi insuficiente. Necessário: ${row.custo_qi}.`);
        return;
    }

    const sheet = await getPlayerSheet(player);
    await runQuery(`UPDATE players SET qi_atual = qi_atual - ? WHERE id = ?`, [row.custo_qi, player.id]);

    if (normalizeKey(row.tipo) === 'defensiva') {
        battle.defendendo = true;
        await sendReply(message, `🛡️ Você executou *${row.nome}* e fortaleceu sua defesa para o próximo impacto.`);
        return;
    }

    const base = normalizeKey(row.tipo) === 'fisica' ? sheet.totals.forca : sheet.totals.inteligencia + sheet.totals.espirito;
    const damage = Math.max(1, Number(row.poder_base || 0) + Math.floor(base / 2) - Math.floor(Number(battle.defesa || battle.inimigo?.defesa || 0) / 4));

    if (battle.tipo === 'pvp') {
        const opponent = await getPlayerById(battle.opponentId);
        if (!opponent) {
            batalhasAtivas.delete(player.id);
            await sendReply(message, 'Seu oponente desapareceu antes da técnica acertar.');
            return;
        }
        const oppSheet = await getPlayerSheet(opponent);
        const real = Math.max(1, damage - Math.floor(oppSheet.totals.defesa / 6));
        const newHp = Math.max(0, Number(opponent.hp_atual || 0) - real);
        await runQuery(`UPDATE players SET hp_atual = ? WHERE id = ?`, [newHp, opponent.id]);
        await sendReply(message, `✨ *${row.nome}* acertou ${battle.opponentName} e causou *${real}* de dano!`);
        const target = buildDirectId(opponent.telefone);
        if (target) await client.sendMessage(target, `✨ ${player.nome} usou *${row.nome}* e lhe causou ${real} de dano.`);
        if (newHp <= 0) await concludeBattleVictory(message, player, battle, sheet);
        return;
    }

    battle.hp = Math.max(0, Number(battle.hp || battle.hpInimigo || 0) - damage);
    if (battle.hpInimigo != null) battle.hpInimigo = battle.hp;
    await sendReply(message, `✨ Você lançou *${row.nome}* e causou *${damage}* de dano em ${battle.nome || battle.inimigo?.nome}.`);
    if (battle.hp <= 0) {
        await concludeBattleVictory(message, player, battle, sheet);
        return;
    }
    await resolveEnemyAttack(message, player, battle, sheet);
}

async function cmdBosses(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const rows = await allQuery(`SELECT * FROM bosses_regiao WHERE localizacao = ? ORDER BY nivel ASC`, [player.localizacao]);
    if (!rows.length) {
        await sendReply(message, `Nenhum boss regional foi detectado em *${player.localizacao}* no momento.`);
        return;
    }
    let txt = `👑 *Bosses em ${player.localizacao}*\n`;
    for (const row of rows) {
        txt += `\n• ID ${row.id} - ${row.nome} (Nv.${row.nivel})\n  ${row.descricao}`;
    }
    txt += '\n\nUse `/boss <id>` para desafiar um deles.';
    await sendReply(message, txt);
}

async function cmdBoss(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (batalhasAtivas.has(player.id)) {
        await sendReply(message, 'Você já está em combate.');
        return;
    }
    const query = args.join(' ').trim();
    if (!query) {
        await cmdBosses([], message, telefone);
        return;
    }
    const id = parseInt(query, 10);
    let boss = null;
    if (!Number.isNaN(id)) {
        boss = await getQuery(`SELECT * FROM bosses_regiao WHERE id = ? AND localizacao = ?`, [id, player.localizacao]);
    }
    if (!boss) {
        boss = await getQuery(`SELECT * FROM bosses_regiao WHERE LOWER(nome) = LOWER(?) AND localizacao = ?`, [query, player.localizacao]);
    }
    if (!boss) {
        await sendReply(message, 'Boss não encontrado nesta localização.');
        return;
    }
    batalhasAtivas.set(player.id, {
        tipo: 'boss',
        nome: boss.nome,
        hp: boss.hp_base,
        hpMax: boss.hp_base,
        ataque: boss.ataque_base,
        defesa: boss.defesa_base,
        recompensaOuro: boss.recompensa_ouro,
        recompensaMerito: boss.recompensa_merito,
        dropItemId: boss.drop_item_id,
        dropQuantidade: boss.drop_quantidade
    });
    await sendReply(message, `👑 *BOSS ENCONTRADO*\n${boss.nome} surgiu diante de você!\nHP: ${boss.hp_base} • Ataque: ${boss.ataque_base} • Defesa: ${boss.defesa_base}\nUse /atacar, /defender, /usaritem ou /usartecnica.`);
}

async function cmdNPCInteragir(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const sub = normalizeKey(args[0] || 'listar');

    if (sub === 'listar' || sub === 'interagir') {
        const rows = await allQuery(
            `SELECT n.id, n.nome, n.dialogo_inicial, q.id AS quest_id, q.titulo
             FROM npcs n
             LEFT JOIN quests_npc q ON q.npc_id = n.id
             WHERE n.localizacao = ? OR n.localizacao = 'global'
             ORDER BY n.nome ASC, q.id ASC`,
            [player.localizacao]
        );
        if (!rows.length) {
            await sendReply(message, `Nenhum NPC importante foi encontrado em *${player.localizacao}*.`);
            return;
        }
        let txt = `👤 *NPCs em ${player.localizacao}*\n`;
        let lastNpc = '';
        for (const row of rows) {
            if (row.nome !== lastNpc) {
                txt += `\n*${row.nome}* — ${row.dialogo_inicial || 'Sem diálogo.'}`;
                lastNpc = row.nome;
            }
            if (row.quest_id) {
                txt += `\n   ↳ Quest ${row.quest_id}: ${row.titulo}`;
            }
        }
        txt += '\n\nUse /npc aceitar <id_quest> ou /npc entregar <id_quest>. Veja também /missoesnpc.';
        await sendReply(message, txt);
        return;
    }

    if (sub === 'aceitar') {
        const questId = parseInt(args[1], 10);
        if (Number.isNaN(questId)) {
            await sendReply(message, 'Uso: `/npc aceitar <id_quest>`');
            return;
        }
        const quest = await getQuery(
            `SELECT q.*, n.localizacao, n.nome AS npc_nome
             FROM quests_npc q JOIN npcs n ON n.id = q.npc_id
             WHERE q.id = ?`,
            [questId]
        );
        if (!quest || quest.localizacao !== player.localizacao) {
            await sendReply(message, 'Essa quest não está disponível neste local.');
            return;
        }
        const active = await getQuery(`SELECT * FROM player_quests WHERE player_id = ? AND quest_id = ?`, [player.id, questId]);
        if (active) {
            await sendReply(message, 'Você já possui essa quest ativa ou concluída.');
            return;
        }
        await runQuery(`INSERT INTO player_quests (player_id, quest_id, progresso, status) VALUES (?, ?, 0, 'em_andamento')`, [player.id, questId]);
        await sendReply(message, `📜 Quest aceita: *${quest.titulo}*\n${quest.descricao}`);
        return;
    }

    if (sub === 'entregar') {
        const questId = parseInt(args[1], 10);
        if (Number.isNaN(questId)) {
            await sendReply(message, 'Uso: `/npc entregar <id_quest>`');
            return;
        }
        const pq = await getQuery(
            `SELECT pq.*, q.*, n.localizacao, n.nome AS npc_nome
             FROM player_quests pq
             JOIN quests_npc q ON q.id = pq.quest_id
             JOIN npcs n ON n.id = q.npc_id
             WHERE pq.player_id = ? AND pq.quest_id = ?`,
            [player.id, questId]
        );
        if (!pq) {
            await sendReply(message, 'Você não possui essa quest.');
            return;
        }
        if (pq.localizacao !== player.localizacao) {
            await sendReply(message, `Volte para *${pq.localizacao}* para entregar essa missão.`);
            return;
        }

        if (pq.objetivo_tipo === 'collect_item') {
            const inv = await getQuery(`SELECT quantidade FROM inventario WHERE player_id = ? AND item_id = ?`, [player.id, pq.item_id]);
            if (!inv || Number(inv.quantidade || 0) < Number(pq.quantidade || 1)) {
                await sendReply(message, 'Você ainda não reuniu todos os itens necessários.');
                return;
            }
            await removeItemFromInventory(player.id, pq.item_id, pq.quantidade);
        } else if (Number(pq.progresso || 0) < Number(pq.quantidade || 1)) {
            await sendReply(message, `Progresso insuficiente: ${pq.progresso || 0}/${pq.quantidade}.`);
            return;
        }

        await runQuery(`UPDATE player_quests SET status = 'concluida' WHERE player_id = ? AND quest_id = ?`, [player.id, questId]);
        await runQuery(`UPDATE players SET ouro = ouro + ?, merito = merito + ? WHERE id = ?`, [pq.recompensa_ouro || 0, pq.recompensa_merito || 0, player.id]);
        if (pq.recompensa_item_id) await addItemToInventory(player.id, pq.recompensa_item_id, 1);
        const rewardItem = pq.recompensa_item_id ? await getQuery(`SELECT nome FROM itens WHERE id = ?`, [pq.recompensa_item_id]) : null;
        let txt = `🎉 Quest concluída: *${pq.titulo}*\n🪙 Ouro: +${pq.recompensa_ouro || 0}\n🎖️ Mérito: +${pq.recompensa_merito || 0}`;
        if (rewardItem) txt += `\n🎁 Recompensa adicional: ${rewardItem.nome}`;
        await sendReply(message, txt);
        return;
    }

    await sendReply(message, 'Use `/npc`, `/npc aceitar <id_quest>` ou `/npc entregar <id_quest>`.');
}

async function cmdMissoesNPC(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const rows = await allQuery(
        `SELECT pq.status, pq.progresso, q.id, q.titulo, q.quantidade, q.objetivo_tipo, q.alvo_nome, n.nome AS npc_nome, n.localizacao
         FROM player_quests pq
         JOIN quests_npc q ON q.id = pq.quest_id
         JOIN npcs n ON n.id = q.npc_id
         WHERE pq.player_id = ?
         ORDER BY pq.started_at DESC`,
        [player.id]
    );
    if (!rows.length) {
        await sendReply(message, 'Você não possui quests de NPC ativas no momento.');
        return;
    }
    let txt = '📜 *Quests de NPC*\n';
    for (const row of rows) {
        const prog = row.objetivo_tipo === 'collect_item' ? 'Entrega manual' : `${row.progresso}/${row.quantidade}`;
        txt += `\n• ID ${row.id} - ${row.titulo}\n  NPC: ${row.npc_nome} (${row.localizacao})\n  Alvo: ${row.alvo_nome}\n  Status: ${row.status}\n  Progresso: ${prog}`;
    }
    await sendReply(message, txt);
}

async function cmdJogadores(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const rows = await allQuery(`SELECT nome, unique_id, localizacao, nivel_fisico, nivel_espiritual FROM players WHERE id != ? AND online = 1 ORDER BY nivel_fisico DESC, nivel_espiritual DESC LIMIT 20`, [player.id]);
    if (!rows.length) {
        await sendReply(message, 'Nenhum outro cultivador online foi detectado agora.');
        return;
    }
    let txt = '👥 *Cultivadores Online*\n';
    for (const row of rows) {
        txt += `\n• ${row.nome} (${row.unique_id}) — ${row.localizacao || 'Local desconhecido'} — F${row.nivel_fisico}/E${row.nivel_espiritual}`;
    }
    await sendReply(message, txt);
}

async function cmdEncontrar(_args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const rows = await allQuery(`SELECT nome, unique_id, nivel_fisico, nivel_espiritual FROM players WHERE id != ? AND localizacao = ?`, [player.id, player.localizacao]);
    if (!rows.length) {
        await sendReply(message, `Você não encontrou outros cultivadores em *${player.localizacao}* neste momento.`);
        return;
    }
    let txt = `🔍 *Cultivadores em ${player.localizacao}*\n`;
    for (const row of rows) {
        txt += `\n• ${row.nome} (${row.unique_id}) — F${row.nivel_fisico}/E${row.nivel_espiritual}`;
    }
    txt += '\n\nVocê pode usar /duelar <id> ou /trocar <id> <item> <qtd>.';
    await sendReply(message, txt);
}

async function cmdTrocar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (args.length < 3) {
        await sendReply(message, 'Uso: `/trocar <id_jogador> <id_item> <quantidade>`');
        return;
    }
    const alvo = await getPlayerByUniqueId(args[0]);
    const itemId = parseInt(args[1], 10);
    const quantidade = parseInt(args[2], 10);
    if (!alvo || Number.isNaN(itemId) || Number.isNaN(quantidade) || quantidade <= 0) {
        await sendReply(message, 'Parâmetros inválidos para a troca.');
        return;
    }
    if (alvo.localizacao !== player.localizacao) {
        await sendReply(message, 'O alvo precisa estar na mesma localização.');
        return;
    }
    const item = await getQuery(`SELECT i.nome, inv.quantidade FROM inventario inv JOIN itens i ON i.id = inv.item_id WHERE inv.player_id = ? AND inv.item_id = ?`, [player.id, itemId]);
    if (!item || Number(item.quantidade || 0) < quantidade) {
        await sendReply(message, 'Você não possui esse item em quantidade suficiente.');
        return;
    }
    await removeItemFromInventory(player.id, itemId, quantidade);
    await addItemToInventory(alvo.id, itemId, quantidade);
    await sendReply(message, `🤝 Você entregou *${item.nome}* x${quantidade} para ${alvo.nome}.`);
    const target = buildDirectId(alvo.telefone);
    if (target) await client.sendMessage(target, `📦 ${player.nome} lhe entregou ${item.nome} x${quantidade}.`);
}

async function cmdDuelar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const alvo = await getPlayerByUniqueId(args[0]);
    if (!alvo) {
        await sendReply(message, 'Uso: `/duelar <id_jogador>`');
        return;
    }
    if (alvo.localizacao !== player.localizacao) {
        await sendReply(message, 'O alvo precisa estar na mesma localização.');
        return;
    }
    if (batalhasAtivas.has(player.id) || batalhasAtivas.has(alvo.id)) {
        await sendReply(message, 'Um dos dois já está em combate.');
        return;
    }
    duelosPendentes.set(alvo.id, { challengerId: player.id, challengerName: player.nome, challengerUniqueId: player.unique_id, expiresAt: Date.now() + 5 * 60 * 1000 });
    await sendReply(message, `⚔️ Desafio enviado para ${alvo.nome}. Ele pode aceitar com /aceitarduelo ${player.unique_id}.`);
    const target = buildDirectId(alvo.telefone);
    if (target) await client.sendMessage(target, `⚔️ ${player.nome} (${player.unique_id}) o desafiou para um duelo em ${player.localizacao}. Use /aceitarduelo ${player.unique_id}.`);
}

async function cmdAceitarDuelo(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const challenger = await getPlayerByUniqueId(args[0]);
    if (!challenger) {
        await sendReply(message, 'Uso: `/aceitarduelo <id_jogador>`');
        return;
    }
    const convite = duelosPendentes.get(player.id);
    if (!convite || convite.challengerId !== challenger.id || convite.expiresAt < Date.now()) {
        duelosPendentes.delete(player.id);
        await sendReply(message, 'Nenhum desafio válido encontrado.');
        return;
    }
    duelosPendentes.delete(player.id);
    batalhasAtivas.set(player.id, { tipo: 'pvp', opponentId: challenger.id, opponentName: challenger.nome });
    batalhasAtivas.set(challenger.id, { tipo: 'pvp', opponentId: player.id, opponentName: player.nome });
    await sendReply(message, `⚔️ Duelo iniciado contra ${challenger.nome}!`);
    const target = buildDirectId(challenger.telefone);
    if (target) await client.sendMessage(target, `⚔️ ${player.nome} aceitou o duelo. O combate começou!`);
}

async function cmdDominio(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args.length) {
        const dominios = await allQuery(`SELECT * FROM dominios WHERE nivel_minimo <= ? ORDER BY nivel_minimo ASC`, [player.nivel_fisico]);
        if (!dominios.length) {
            await sendReply(message, 'Nenhum domínio disponível para seu nível.');
            return;
        }
        let txt = '🏯 *Domínios Disponíveis*\n';
        for (const d of dominios) {
            txt += `\n• ${d.nome} — Nível mínimo ${d.nivel_minimo} — ${d.andares} andares\n  ${d.descricao}`;
        }
        txt += '\n\nUse /dominio entrar <nome>.';
        await sendReply(message, txt);
        return;
    }
    const sub = normalizeKey(args[0]);
    const nome = args.slice(1).join(' ');
    if (sub === 'entrar') {
        const dominio = await getQuery(`SELECT * FROM dominios WHERE nome = ? AND nivel_minimo <= ?`, [nome, player.nivel_fisico]);
        if (!dominio) {
            await sendReply(message, 'Domínio não encontrado ou nível insuficiente.');
            return;
        }
        const instancia = await getQuery(`SELECT * FROM dominio_instancias WHERE player_id = ? AND dominio_id = ?`, [player.id, dominio.id]);
        if (instancia && instancia.status === 'em_andamento') {
            await sendReply(message, `Você já está explorando ${dominio.nome} (andar ${instancia.andar_atual}/${dominio.andares}). Use /dominio continuar.`);
            return;
        }
        if (instancia && instancia.status === 'concluido') {
            await runQuery(`UPDATE dominio_instancias SET andar_atual = 1, status = 'em_andamento', data_inicio = CURRENT_TIMESTAMP WHERE player_id = ? AND dominio_id = ?`, [player.id, dominio.id]);
        } else {
            await runQuery(`INSERT INTO dominio_instancias (player_id, dominio_id, andar_atual, status) VALUES (?, ?, 1, 'em_andamento')`, [player.id, dominio.id]);
        }
        await sendReply(message, `🌟 Você entrou em *${dominio.nome}*. Use /dominio continuar para enfrentar o próximo andar.`);
        return;
    }
    if (sub === 'continuar') {
        if (batalhasAtivas.has(player.id)) {
            await sendReply(message, 'Você já está em combate. Resolva a luta atual antes de continuar o domínio.');
            return;
        }
        const instancia = await getQuery(
            `SELECT di.*, d.nome, d.andares, d.recompensa_base_ouro, d.item_raro_id
             FROM dominio_instancias di JOIN dominios d ON d.id = di.dominio_id
             WHERE di.player_id = ? AND di.status = 'em_andamento'`,
            [player.id]
        );
        if (!instancia) {
            await sendReply(message, 'Você não está em um domínio ativo.');
            return;
        }
        const inimigo = gerarInimigoDominio(instancia.andar_atual, instancia.andares);
        batalhasAtivas.set(player.id, {
            tipo: 'dominio',
            dominioId: instancia.dominio_id,
            nome: inimigo.nome,
            hp: inimigo.hp,
            hpMax: inimigo.hp,
            ataque: inimigo.dano,
            defesa: inimigo.defesa || 0,
            inimigo
        });
        await sendReply(message, `🏯 *${instancia.nome} — Andar ${instancia.andar_atual}/${instancia.andares}*\nVocê enfrenta *${inimigo.nome}* (HP ${inimigo.hp}).`);
        return;
    }
    await sendReply(message, 'Use `/dominio`, `/dominio entrar <nome>` ou `/dominio continuar`.');
}

function gerarInimigoDominio(andarAtual, totalAndares) {
    const isBoss = Number(andarAtual) >= Number(totalAndares);
    const baseHP = 70 + Number(andarAtual || 1) * 35;
    const baseAtk = 16 + Number(andarAtual || 1) * 5;
    const baseDef = 8 + Number(andarAtual || 1) * 2;
    if (isBoss) {
        return { nome: 'Guardião do Andar', hp: baseHP * 2, dano: baseAtk + 8, defesa: baseDef + 4, isChefe: true };
    }
    const pool = [
        { nome: 'Esqueleto Guerreiro', hp: baseHP, dano: baseAtk, defesa: baseDef },
        { nome: 'Espírito Vingativo', hp: baseHP - 10, dano: baseAtk + 4, defesa: baseDef - 2 },
        { nome: 'Golem de Pedra', hp: baseHP + 20, dano: baseAtk - 2, defesa: baseDef + 4 }
    ];
    return pool[Math.floor(Math.random() * pool.length)];
}

async function cmdBossAlias(args, message, telefone) {
    return cmdBoss(args, message, telefone);
}

async function cmdMercadoGlobal(args, message, telefone) {
    // mantém a base existente, mas com texto melhor quando vazio
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const sub = normalizeKey(args[0] || 'listar');
    if (sub === 'listar' || sub === 'minhas' || sub === 'vender' || sub === 'comprar') {
        return await (async function wrapped() {
            const _cmd = args[0] || 'listar';
            // reutiliza a implementação anterior declarada no arquivo
            if (_cmd === 'listar' || _cmd === 'minhas' || _cmd === 'vender' || _cmd === 'comprar') {
                // chama a versão antiga via bloco reaproveitado não é simples, então aplicamos lógica equivalente compacta
                if (sub === 'listar') {
                    const rows = await allQuery(`SELECT mp.id, mp.quantidade, mp.preco_unitario, mp.moeda_tipo, i.nome AS item_nome, p.nome AS vendedor_nome FROM mercado_player mp JOIN itens i ON i.id = mp.item_id JOIN players p ON p.id = mp.vendedor_id ORDER BY mp.data_postagem DESC LIMIT 25`);
                    if (!rows.length) return await sendReply(message, '🏪 O mercado global está vazio.');
                    let txt = '🏪 *Mercado Global*\n';
                    for (const r of rows) txt += `\nID ${r.id} - ${r.item_nome} x${r.quantidade} | ${r.preco_unitario} ${r.moeda_tipo} cada | ${r.vendedor_nome}`;
                    txt += '\n\nUse `/mercado vender <id_item> <qtd> <preco> [moeda]`, `/mercado comprar <id_listagem> [qtd]` ou `/mercado minhas`.';
                    return await sendReply(message, txt);
                }
                if (sub === 'minhas') {
                    const rows = await allQuery(`SELECT mp.id, mp.quantidade, mp.preco_unitario, mp.moeda_tipo, i.nome AS item_nome FROM mercado_player mp JOIN itens i ON i.id = mp.item_id WHERE mp.vendedor_id = ? ORDER BY mp.data_postagem DESC`, [player.id]);
                    if (!rows.length) return await sendReply(message, 'Você não tem listagens ativas.');
                    let txt = '📦 *Suas listagens*\n';
                    for (const r of rows) txt += `\nID ${r.id} - ${r.item_nome} x${r.quantidade} | ${r.preco_unitario} ${r.moeda_tipo} cada`;
                    return await sendReply(message, txt);
                }
                if (sub === 'vender') {
                    const itemId = parseInt(args[1], 10);
                    const quantidade = parseInt(args[2], 10);
                    const preco = parseInt(args[3], 10);
                    const moeda = ['ouro', 'perolas_esp', 'cristais_esp', 'essencia_imortal'].includes(args[4]) ? args[4] : 'ouro';
                    if ([itemId, quantidade, preco].some((v) => Number.isNaN(v) || v <= 0)) return await sendReply(message, 'Parâmetros inválidos.');
                    const item = await getQuery(`SELECT inv.quantidade, i.nome FROM inventario inv JOIN itens i ON i.id = inv.item_id WHERE inv.player_id = ? AND inv.item_id = ?`, [player.id, itemId]);
                    if (!item || item.quantidade < quantidade) return await sendReply(message, 'Quantidade insuficiente no inventário.');
                    await removeItemFromInventory(player.id, itemId, quantidade);
                    await runQuery(`INSERT INTO mercado_player (vendedor_id, item_id, quantidade, preco_unitario, moeda_tipo) VALUES (?, ?, ?, ?, ?)`, [player.id, itemId, quantidade, preco, moeda]);
                    return await sendReply(message, `🪙 Listagem criada: ${item.nome} x${quantidade} por ${preco} ${moeda} cada.`);
                }
                if (sub === 'comprar') {
                    const listagemId = parseInt(args[1], 10);
                    const qtdDesejada = parseInt(args[2], 10) || 1;
                    if (Number.isNaN(listagemId) || qtdDesejada <= 0) return await sendReply(message, 'Parâmetros inválidos.');
                    const listagem = await getQuery(`SELECT mp.*, i.nome AS item_nome FROM mercado_player mp JOIN itens i ON i.id = mp.item_id WHERE mp.id = ?`, [listagemId]);
                    if (!listagem) return await sendReply(message, 'Listagem não encontrada.');
                    if (listagem.vendedor_id === player.id) return await sendReply(message, 'Você não pode comprar sua própria listagem.');
                    const quantidade = Math.min(qtdDesejada, listagem.quantidade);
                    const total = quantidade * listagem.preco_unitario;
                    if (Number(player[listagem.moeda_tipo] || 0) < total) return await sendReply(message, `Saldo insuficiente: faltam ${total} ${listagem.moeda_tipo}.`);
                    await runQuery(`UPDATE players SET ${listagem.moeda_tipo} = ${listagem.moeda_tipo} - ? WHERE id = ?`, [total, player.id]);
                    await runQuery(`UPDATE players SET ${listagem.moeda_tipo} = ${listagem.moeda_tipo} + ? WHERE id = ?`, [total, listagem.vendedor_id]);
                    await addItemToInventory(player.id, listagem.item_id, quantidade);
                    if (quantidade >= listagem.quantidade) await runQuery(`DELETE FROM mercado_player WHERE id = ?`, [listagem.id]);
                    else await runQuery(`UPDATE mercado_player SET quantidade = quantidade - ? WHERE id = ?`, [quantidade, listagem.id]);
                    return await sendReply(message, `✅ Compra concluída: ${listagem.item_nome} x${quantidade} por ${total} ${listagem.moeda_tipo}.`);
                }
            }
        })();
    }
    await sendReply(message, 'Use `/mercado listar`, `/mercado minhas`, `/mercado vender <id_item> <qtd> <preco> [moeda]` ou `/mercado comprar <id_listagem> [qtd]`.');
}

async function processCommand(message) {
    try {
        if (!message || typeof message !== 'object') return;
        if (await handlePendingResponse(message)) return;

        const body = typeof message.body === 'string' ? message.body.trim() : '';
        if (!body.startsWith(COMMAND_PREFIX)) return;
        const parts = body.slice(COMMAND_PREFIX.length).trim().split(/\s+/).filter(Boolean);
        const cmd = normalizeKey(parts[0] || '');
        const args = parts.slice(1);
        const telefone = getSenderId(message);
        if (!telefone) {
            await sendReply(message, 'Não foi possível identificar o remetente.');
            return;
        }

        const commands = {
            registrar: cmdRegistrar,
            perfil: cmdPerfil,
            status: cmdPerfil,
            atributos: cmdPerfil,
            inventario: cmdInventario,
            equipamentos: cmdEquipamentos,
            equipar: cmdEquipar,
            desequipar: cmdDesequipar,
            menu: cmdMenu,
            ajuda: cmdAjuda,
            guia: cmdGuia,
            mudaraparencia: cmdMudarAparencia,
            descansar: cmdDescansar,
            cultivar: cmdCultivar,
            romper: cmdRomper,
            tecnicas: cmdTecnicas,
            compreender: cmdCompreender,
            aprender: cmdAprender,
            usar: cmdUsarItem,
            usaritem: cmdUsarItem,
            usartecnica: cmdUsarTecnica,
            loja: cmdLoja,
            profissao: cmdProfissao,
            craftar: cmdCraftar,
            receitas: (a, m, t) => cmdCraftar(['listar'], m, t),
            subirprofissao: cmdSubirProfissao,
            andar: cmdAndar,
            parar: cmdParar,
            dominio: cmdDominio,
            bosses: cmdBosses,
            boss: cmdBossAlias,
            jogadores: cmdJogadores,
            encontrar: cmdEncontrar,
            trocar: cmdTrocar,
            duelar: cmdDuelar,
            aceitarduelo: cmdAceitarDuelo,
            amigos: cmdAmigos,
            adicionaramigo: cmdAdicionarAmigo,
            inimigo: cmdInimigo,
            conversar: cmdConversar,
            lerchat: cmdLerChat,
            npc: cmdNPCInteragir,
            interagir: cmdNPCInteragir,
            missoesnpc: cmdMissoesNPC,
            missoes: cmdMissoes,
            aceitar: cmdAceitarMissao,
            completarmissao: cmdCompletarMissao,
            criarmissao: cmdCriarMissaoPessoal,
            minhasmissoes: cmdMinhasMissoes,
            missoesdisponiveis: cmdMissoesDisponiveis,
            aceitarmissao: cmdAceitarMissaoPessoal,
            criarseita: cmdCriarSeita,
            convidar: cmdConvidar,
            aceitarconvite: cmdAceitarConvite,
            sairseita: cmdSairSeita,
            doar: cmdDoar,
            tecnicaseita: cmdTecnicaSeita,
            biblioteca: cmdBiblioteca,
            aprender_seita: cmdAprenderSeita,
            mercado: cmdMercadoGlobal,
            eventos: cmdEventos,
            ranking: cmdRanking,
            changelog: cmdChangelog,
            atacar: cmdAtacar,
            defender: cmdDefender,
            fugir: cmdFugir,
            banir: cmdBanir,
            daritem: cmdDarItem,
            resetar: cmdResetar,
            anuncio: cmdAnuncio
        };

        if (commands[cmd]) {
            await commands[cmd](args, message, telefone);
        } else {
            await sendReply(message, 'Comando desconhecido. Use `/menu`.');
        }
    } catch (err) {
        log(`Erro em processCommand V2: ${err?.stack || err}`, 'ERRO');
        await sendReply(message, 'Ocorreu um erro ao processar seu comando.');
    }
}

async function bootstrapGameplayV2() {
    try {
        await ensureSchemaUpdates();
        client.initialize();
    } catch (err) {
        log(`Falha ao iniciar V2: ${err?.stack || err}`, 'ERRO');
    }
}

bootstrapGameplayV2();
