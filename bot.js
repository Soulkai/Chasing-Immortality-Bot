// ============================================
// CHASING IMMORTALITY BOT - CÓDIGO COMPLETO (CORRIGIDO)
// ============================================

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const sqlite3 = require('sqlite3').verbose();
const qrcode = require('qrcode-terminal');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// ========== CONFIGURAÇÕES ==========
const DONO_NUMERO = '120363425231463609@g.us';   // ⚠️ SUBSTITUA PELO SEU NÚMERO (com código do país)
const COMMAND_PREFIX = '/';
const DB_PATH = './database.db';
const LOG_FILE = './bot.log';

// ========== INICIALIZAÇÃO DO BANCO ==========
let db = new sqlite3.Database(DB_PATH);
const initSQL = fs.readFileSync('./init.sql', 'utf8');
db.exec(initSQL, (err) => {
    if (err) console.error(chalk.red('Erro ao criar tabelas:', err));
    else console.log(chalk.green('Banco de dados inicializado.'));
});

// ========== FUNÇÕES DE LOG ==========
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const colors = { INFO: chalk.blue, ERRO: chalk.red, SUCESSO: chalk.green, BATALHA: chalk.magenta, RECV: chalk.cyan };
    const color = colors[type] || chalk.white;
    console.log(color(`[${timestamp}] [${type}] ${message}`));
    fs.appendFileSync(LOG_FILE, `[${timestamp}] [${type}] ${message}\n`);
}

// ========== FUNÇÕES AUXILIARES ==========
function generateUniqueId() {
    return 'IM-' + Math.floor(Math.random() * 900000 + 100000);
}
function rollDice(max) { return Math.floor(Math.random() * max) + 1; }
function weightedRandom(items, weights) {
    let total = weights.reduce((a,b)=>a+b,0);
    let rand = Math.random() * total;
    let accum = 0;
    for (let i=0; i<items.length; i++) {
        accum += weights[i];
        if (rand < accum) return items[i];
    }
    return items[0];
}

function getPlayer(telefone) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM players WHERE telefone = ?', [telefone], (err, row) => {
            if (err) reject(err);
            else resolve(row);
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
        await client.sendMessage(message.from, '❌ Você não está registrado! Use `/registrar <nome> <sexo>` para começar.');
        return null;
    }
    return player;
}

function getPlayerById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM players WHERE id = ?', [id], (err, row) => resolve(row));
    });
}

function getPlayerByUniqueId(uniqueId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM players WHERE unique_id = ?', [uniqueId], (err, row) => resolve(row));
    });
}

// ========== FUNÇÃO AUXILIAR PARA ENVIAR RESPOSTAS (SUBSTITUI message.reply) ==========
async function sendReply(message, text, media = null) {
    try {
        if (media) {
            await client.sendMessage(message.from, media, { caption: text });
        } else {
            await client.sendMessage(message.from, text);
        }
    } catch (err) {
        log(`Erro ao enviar mensagem: ${err}`, 'ERRO');
    }
}

// ========== CLIENTE WHATSAPP ==========
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    log('QR Code gerado. Escaneie com o WhatsApp.', 'INFO');
});

client.on('ready', () => log('Bot conectado com sucesso!', 'SUCESSO'));

client.on('message', async message => {
    if (message.body.startsWith(COMMAND_PREFIX)) {
        log(`Comando de ${message.from}: ${message.body}`, 'RECV');
        await processCommand(message);
    }
});

// ========== COMANDOS (todos usando sendReply) ==========

async function cmdRegistrar(args, message, telefone) {
    if (args.length < 2) {
        sendReply(message, 'Uso: `/registrar <nome> <sexo>` (sexo M/F)');
        return;
    }
    const nome = args[0];
    let sexo = args[1].toUpperCase();
    if (sexo !== 'M' && sexo !== 'F') {
        sendReply(message, 'Sexo deve ser M ou F.');
        return;
    }
    const existing = await getPlayer(telefone);
    if (existing) {
        sendReply(message, 'Você já está registrado! Use `/perfil`.');
        return;
    }

    // Geração aleatória
    const racas = ['Humano', 'Meio-Demônio', 'Meio-Espírito', 'Elfo da Montanha', 'Anão Guerreiro'];
    const cla = ['Namgung', 'Tang', 'Murong', 'Wudang', 'Emei', 'Shaolin'];
    const raizes = ['Única Inferior', 'Única Média', 'Única Avançada', 'Única Santa', 'Dupla', 'Tripla', 'Divina', 'Imortal', 'Nenhuma'];
    const pesosRaiz = [20, 25, 20, 10, 10, 5, 3, 1, 6];
    const raiz = weightedRandom(raizes, pesosRaiz);
    let elementos = '';
    if (raiz !== 'Nenhuma') {
        const qtd = raiz.includes('Dupla') ? 2 : (raiz.includes('Tripla') ? 3 : (raiz.includes('Divina') ? 4 : (raiz === 'Imortal' ? 12 : 1)));
        const lista = ['Água','Fogo','Terra','Ar','Madeira','Metal','Raio','Gelo','Luz','Trevas','Tempo','Espaço'];
        let sel = [];
        for (let i=0; i<qtd; i++) {
            let e; do { e = lista[Math.floor(Math.random()*lista.length)]; } while (sel.includes(e));
            sel.push(e);
        }
        elementos = sel.join(',');
    } else elementos = 'Nenhum';
    const corpoDivino = (Math.random() < 0.05) ? 'Corpo de Fênix Imortal' : null;
    const orfao = Math.random() < 0.1 ? 1 : 0;
    const fortuna = rollDice(100);
    const forca = 10 + rollDice(10);
    const vigor = 10 + rollDice(10);
    const defesa = 10 + rollDice(10);
    const inteligencia = 10 + rollDice(10);
    const espirito = 10 + rollDice(10);
    const agilidade = 10 + rollDice(10);
    const hp_max = vigor * 10;
    const qi_max = (inteligencia + espirito) * 5;
    const unique_id = generateUniqueId();
    const localizacao = 'Vila Inicial';
    const racaEscolhida = racas[Math.floor(Math.random()*racas.length)];
    const clanEscolhido = cla[Math.floor(Math.random()*cla.length)];

    const stmt = db.prepare(`INSERT INTO players 
        (unique_id, nome, sexo, raca, clan, raiz_espiritual, elementos, corpo_divino, orfao, alinhamento, karma, reputacao, fortuna,
         nivel_fisico, sub_fisico, nivel_espiritual, sub_espiritual, qi_atual, qi_maximo, hp_atual, hp_maximo,
         forca, vigor, defesa, inteligencia, espirito, agilidade, fadiga, meridianos_abertos, profissao_principal, nivel_profissao,
         ouro, perolas_esp, cristais_esp, essencia_imortal, localizacao, telefone, online)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?, ?)`);
    stmt.run(
        unique_id, nome, sexo, racaEscolhida, clanEscolhido, raiz, elementos, corpoDivino, orfao, 'Neutro', 0, 0, fortuna,
        1, 1, 1, 1,
        qi_max, qi_max, hp_max, hp_max,
        forca, vigor, defesa, inteligencia, espirito, agilidade,
        100, '', '', 0,
        100, 0, 0, 0,
        localizacao, telefone, 1,
        (err) => {
            if (err) { 
                log(`Erro registro: ${err}`, 'ERRO'); 
                sendReply(message, 'Erro interno. Tente novamente.'); 
            } else {
                sendReply(message, `🌟 *Bem-vindo ao Chasing Immortality, ${nome}!*\n\n📜 *ID:* ${unique_id}\n🧬 *Raça:* ${racaEscolhida}\n🏮 *Clã:* ${clanEscolhido}\n🌿 *Raiz:* ${raiz} (${elementos})\n💪 *Corpo Divino:* ${corpoDivino || 'Nenhum'}\n❤️ *Órfão:* ${orfao ? 'Sim' : 'Não'}\n\nUse /perfil para ver detalhes. Boa sorte!`);
            }
        });
    stmt.finalize();
}

async function cmdPerfil(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const texto = `🌟 *PERFIL DE ${player.nome}*\n🆔 ${player.unique_id}\n🧬 ${player.raca} | 🏮 ${player.clan}\n🌿 ${player.raiz_espiritual} (${player.elementos})\n💪 ${player.corpo_divino || 'Comum'}\n⚖️ ${player.alinhamento} | ❤️ Karma ${player.karma} | 📈 Reputação ${player.reputacao}\n📊 *ATRIBUTOS:* 💪${player.forca} 🛡️${player.defesa} ⚡${player.agilidade} 🧠${player.inteligencia} 🧘${player.espirito} ❤️${player.hp_atual}/${player.hp_maximo} 🔋${player.qi_atual}/${player.qi_maximo} 😴${player.fadiga}\n🏆 *REINOS:* Físico ${player.nivel_fisico}-${player.sub_fisico} | Espiritual ${player.nivel_espiritual}-${player.sub_espiritual}\n💰 *MOEDAS:* 🪙${player.ouro} 🧪${player.perolas_esp} 💎${player.cristais_esp} ✨${player.essencia_imortal}`;
    if (player.avatar_url) {
        try {
            const media = await MessageMedia.fromUrl(player.avatar_url, { unsafe: true });
            await sendReply(message, texto, media);
        } catch(e) { await sendReply(message, texto + '\n⚠️ Erro ao carregar avatar.'); }
    } else await sendReply(message, texto);
}

async function cmdMudarAparencia(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0] || !args[0].match(/\.(jpg|jpeg|png|gif|webp)/i)) {
        sendReply(message, 'Uso: `/mudaraparencia <URL_da_imagem>` (jpg, png, gif, webp)');
        return;
    }
    await updatePlayer(player.id, 'avatar_url', args[0]);
    sendReply(message, '🧝 Avatar atualizado! Aparecerá no /perfil.');
}

function cmdMenu(message) {
    if (!message || !message.from) return;
    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR');
    const horaStr = agora.toLocaleTimeString('pt-BR');
    const versao = '0.0.1';
    
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
    menu += `▢ • /status - Mostra recursos e condição atual (mesmo que /perfil)\n`;
    menu += `▢ • /atributos - Exibe seus atributos principais (mesmo que /perfil)\n`;
    menu += `▢ • /inventario - Lista seus itens atuais\n`;
    menu += `▢\n`;
    menu += `╰━━─「🎯」─━━\n\n`;
    
    menu += `╭━━⪩ ☯️ CULTIVO ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /cultivar [fisico|espiritual] - Cultiva uma trilha\n`;
    menu += `▢ • /romper - Tenta avançar de reino (desafio de tribulação)\n`;
    menu += `▢ • /tecnicas - Lista técnicas conhecidas\n`;
    menu += `▢ • /compreender <id> - Estuda uma técnica para ganhar compreensão\n`;
    menu += `▢ • /aprender <id> - Tenta aprender uma técnica (50%+ compreensão)\n`;
    menu += `▢ • /guia cultivo - Explica o sistema de cultivo\n`;
    menu += `▢\n`;
    menu += `╰━━─「☯️」─━━\n\n`;
    
    menu += `╭━━⪩ 🧭 MUNDO ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /andar [região] - Viaja para uma região e explora (eventos a cada 5 min)\n`;
    menu += `▢ • /parar - Para de explorar e retorna à vila\n`;
    menu += `▢ • /dominio <nome> - Entra em uma masmorra/domínio (em breve)\n`;
    menu += `▢ • /eventos - Mostra eventos mundiais ativos\n`;
    menu += `▢ • /ranking [forca|reino|riqueza|karma] - Classificações\n`;
    menu += `▢\n`;
    menu += `╰━━─「🧭」─━━\n\n`;
    
    menu += `╭━━⪩ ⚔️ BATALHA ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /atacar - Executa um ataque básico (em combate)\n`;
    menu += `▢ • /defender - Assume postura defensiva (em combate)\n`;
    menu += `▢ • /usaritem <id> - Usa item em combate\n`;
    menu += `▢ • /usartecnica <id> - Usa técnica ofensiva/defensiva (em combate)\n`;
    menu += `▢ • /fugir - Tenta escapar do confronto (em combate)\n`;
    menu += `▢ • /guia batalha - Explica o combate\n`;
    menu += `▢\n`;
    menu += `╰━━─「⚔️」─━━\n\n`;
    
    menu += `╭━━⪩ 🔄 SOCIAL ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /jogadores - Lista cultivadores próximos (em breve)\n`;
    menu += `▢ • /encontrar - Verifica encontro com outro player (via /andar)\n`;
    menu += `▢ • /conversar <id> <msg> - Fala com o jogador encontrado ou envia mensagem privada\n`;
    menu += `▢ • /trocar - Troca itens com o jogador encontrado (em breve)\n`;
    menu += `▢ • /duelar - Inicia um duelo PvP (via encontro)\n`;
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
    menu += `▢ • /mercado - Mercado global entre jogadores (em breve)\n`;
    menu += `▢ • /profissao [listar|escolher] - Mostra ou escolhe sua profissão\n`;
    menu += `▢ • /craftar <item> - Fabricar item (depende da profissão)\n`;
    menu += `▢ • /guia profissao - Explica profissões\n`;
    menu += `▢\n`;
    menu += `╰━━─「🏪」─━━\n\n`;
    
    menu += `╭━━⪩ 📋 MISSÕES ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /missoes - Mostra missões da seita disponíveis\n`;
    menu += `▢ • /aceitar <id_missao> - Aceita uma missão da seita\n`;
    menu += `▢ • /completarmissao <id> - Resgata recompensa da missão (seita ou pessoal)\n`;
    menu += `▢ • /criarmissao <desc> <recompensa> - Cria missão pessoal para outros\n`;
    menu += `▢ • /missoesdisponiveis - Lista missões criadas por outros jogadores\n`;
    menu += `▢ • /minhasmissoes - Lista missões que você criou\n`;
    menu += `▢ • /npc interagir - Aceita missão ou interação de NPC (via /andar)\n`;
    menu += `▢\n`;
    menu += `╰━━─「📋」─━━\n\n`;
    
    menu += `╭━━⪩ 🏯 SEITAS ⪨━━\n`;
    menu += `▢\n`;
    menu += `▢ • /criarseita <nome> <desc> - Cria sua própria seita (custo 1000 ouro ou 1 cristal)\n`;
    menu += `▢ • /convidar <id> - Convida alguém para sua seita\n`;
    menu += `▢ • /sairseita - Sai da seita atual\n`;
    menu += `▢ • /doar <quantidade> - Doa ouro para o tesouro da seita\n`;
    menu += `▢ • /tecnicaseita <id_tecnica> - Adiciona técnica à biblioteca da seita (líder)\n`;
    menu += `▢ • /biblioteca - Lista técnicas disponíveis na seita\n`;
    menu += `▢ • /aprender_seita <id> - Aprende técnica da biblioteca da seita\n`;
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
    
    // Envia o menu em partes (WhatsApp limita a ~4096 caracteres, mas nosso menu é menor)
    // O erro 'replace' pode ser devido a algum caractere não escapado. Vamos enviar como texto puro sem emojis complexos? Mas os emojis funcionam.
    // Tentaremos enviar diretamente, mas se falhar, enviar em pedaços.
    client.sendMessage(message.from, menu).catch(async (err) => {
        log(`Erro ao enviar menu completo: ${err}. Tentando dividir...`, 'ERRO');
        // Divide em partes de 2000 caracteres
        for (let i = 0; i < menu.length; i += 2000) {
            await client.sendMessage(message.from, menu.substring(i, i + 2000));
        }
    });
}

async function cmdGuia(args, message) {
    if (!args.length) {
        sendReply(message, `📖 *Guias disponíveis:*\n/guia cultivo\n/guia batalha\n/guia profissao\n/guia social\n\nUse /guia <assunto> para detalhes.`);
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
            texto = `Assunto não encontrado. Use /guia sem argumentos para ver a lista.`;
    }
    sendReply(message, texto);
}

async function cmdRomper(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (player.sub_fisico === 9 || player.sub_espiritual === 9) {
        sendReply(message, `⚡ O céu escurece... Você sente a Tribulação do Céu se aproximar!\nContinue cultivando para enfrentar o desafio e avançar de reino.`);
    } else {
        sendReply(message, `Você ainda não atingiu o pico do seu reino atual. Continue cultivando para chegar ao subnível 9.`);
    }
}

async function cmdJogadores(args, message, telefone) {
    sendReply(message, `👥 *Jogadores próximos*\nFuncionalidade em desenvolvimento. Use /ranking para ver a lista geral.`);
}
async function cmdEncontrar(args, message, telefone) {
    sendReply(message, `🔍 *Encontrar jogadores*\nUse /andar em uma região e aguarde eventos. Quando outro jogador também estiver explorando, vocês poderão se encontrar.`);
}
async function cmdTrocar(args, message, telefone) {
    sendReply(message, `🔄 *Troca de itens*\nEm breve! Por enquanto, use /loja para comprar/vender.`);
}
async function cmdDuelar(args, message, telefone) {
    sendReply(message, `⚔️ *Duelo PvP*\nPara duelar, ambos devem estar na mesma região e se encontrar via /andar. Em desenvolvimento.`);
}
async function cmdMercadoGlobal(args, message, telefone) {
    sendReply(message, `🏪 *Mercado Global*\nEm desenvolvimento. Use /loja para comprar itens básicos.`);
}
async function cmdNPCInteragir(args, message, telefone) {
    sendReply(message, `👤 Para interagir com NPCs, use /andar e aguarde os eventos. Quando um NPC aparecer, siga as opções numeradas com /escolha <número>.`);
}

function cmdAjuda(args, message) {
    if (!args[0]) { sendReply(message, 'Use `/ajuda <comando>`. Ex: `/ajuda cultivar`'); return; }
    const ajuda = {
        'cultivar': 'Treina cultivo físico ou espiritual. Requer técnica de meditação. Sintaxe: `/cultivar [fisico|espiritual]`',
        'registrar': 'Registra personagem. Sintaxe: `/registrar <nome> <sexo>`',
        'perfil': 'Mostra status, atributos e avatar.',
        'mudaraparencia': 'Define URL da imagem do perfil.',
        'andar': 'Explora a região atual. Pode encontrar monstros, NPCs ou outros jogadores.',
        'combate': 'Comandos de batalha: /atacar, /defender, /usaritem, /fugir, /usartecnica'
    };
    sendReply(message, ajuda[args[0].toLowerCase()] || 'Comando não encontrado.');
}

async function cmdDescansar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const novaFadiga = Math.min(100, player.fadiga + 20);
    const novoQi = Math.min(player.qi_maximo, player.qi_atual + 30);
    await updatePlayer(player.id, 'fadiga', novaFadiga);
    await updatePlayer(player.id, 'qi_atual', novoQi);
    sendReply(message, `😴 Você descansou. Fadiga: ${player.fadiga} → ${novaFadiga} | Qi: ${player.qi_atual} → ${novoQi}`);
}

async function cmdChangelog(message) {
    db.all('SELECT * FROM changelog ORDER BY data DESC LIMIT 5', (err, rows) => {
        if (err) return sendReply(message, 'Erro ao buscar changelog.');
        let text = '📜 *CHANGELOG*\n';
        rows.forEach(r => { text += `\n*${r.versao}* (${r.data}): ${r.texto}`; });
        sendReply(message, text);
    });
}

async function cmdCultivar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const tipo = args[0]?.toLowerCase();
    if (tipo !== 'fisico' && tipo !== 'espiritual') {
        sendReply(message, 'Especifique `/cultivar fisico` ou `/cultivar espiritual`.');
        return;
    }
    const tecnica = await new Promise(resolve => {
        db.get(`SELECT * FROM tecnicas_aprendidas ta JOIN tecnicas t ON ta.tecnica_id = t.id WHERE ta.player_id = ? AND t.tipo = 'Meditacao' AND ta.aprendida = 1`, [player.id], (err, row) => resolve(row));
    });
    if (!tecnica) {
        sendReply(message, 'Você não possui uma técnica de meditação. Adquira uma primeiro!');
        return;
    }
    if (player.fadiga < 20) {
        sendReply(message, 'Você está muito cansado. Descanse (`/descansar`).');
        return;
    }
    if (player.qi_atual < 10) {
        sendReply(message, 'Qi insuficiente. Recupere com pílulas ou descanse.');
        return;
    }
    let ganho = rollDice(20) + (tipo === 'fisico' ? player.forca : player.inteligencia);
    ganho += Math.floor(player.fortuna / 20);
    const custoQi = 10;
    const custoFadiga = 5;
    let novoQi = player.qi_atual - custoQi;
    let novaFadiga = player.fadiga - custoFadiga;
    await updatePlayer(player.id, 'qi_atual', novoQi);
    await updatePlayer(player.id, 'fadiga', novaFadiga);
    let campoSub = tipo === 'fisico' ? 'sub_fisico' : 'sub_espiritual';
    let subAtual = tipo === 'fisico' ? player.sub_fisico : player.sub_espiritual;
    let novoSub = subAtual;
    if (ganho >= 100) {
        novoSub += Math.floor(ganho / 100);
        if (novoSub > 9) {
            novoSub = 1;
            sendReply(message, '⚡ Você sente a tribulação do céu se aproximar! Avançar de reino exigirá um desafio. (implementar depois)');
        }
        ganho = ganho % 100;
    }
    await updatePlayer(player.id, campoSub, novoSub);
    sendReply(message, `🧘 Você cultivou ${tipo} e ganhou ${ganho} de experiência. Qi: ${player.qi_atual}→${novoQi} | Fadiga: ${player.fadiga}→${novaFadiga}`);
}

async function cmdTecnicas(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT t.nome, t.tipo, ta.compreensao, ta.aprendida FROM tecnicas_aprendidas ta JOIN tecnicas t ON ta.tecnica_id = t.id WHERE ta.player_id = ?`, [player.id], (err, rows) => {
        if (err || rows.length === 0) sendReply(message, 'Você não conhece nenhuma técnica ainda.');
        else {
            let txt = '📜 *Suas Técnicas*\n';
            rows.forEach(r => txt += `\n${r.nome} (${r.tipo}) - Compreensão: ${r.compreensao}% - ${r.aprendida ? '✅ Aprendida' : '❌ Não aprendida'}`);
            sendReply(message, txt);
        }
    });
}

async function cmdCompreender(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/compreender <id_tecnica>`'); return; }
    const idTec = parseInt(args[0]);
    db.get(`SELECT * FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`, [player.id, idTec], async (err, row) => {
        if (err || !row) return sendReply(message, 'Você não possui essa técnica.');
        if (row.aprendida) return sendReply(message, 'Você já aprendeu essa técnica completamente.');
        let ganho = rollDice(20) + Math.floor(player.inteligencia / 10) + Math.floor(player.espirito / 20);
        let novaComp = Math.min(100, row.compreensao + ganho);
        db.run(`UPDATE tecnicas_aprendidas SET compreensao = ? WHERE player_id = ? AND tecnica_id = ?`, [novaComp, player.id, idTec]);
        sendReply(message, `📖 Você estudou a técnica e aumentou a compreensão para ${novaComp}%.`);
        if (novaComp >= 100) sendReply(message, '🎉 Você compreendeu completamente a técnica! Agora pode aprendê-la com `/aprender`.');
    });
}

async function cmdAprender(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/aprender <id_tecnica>`'); return; }
    const idTec = parseInt(args[0]);
    db.get(`SELECT * FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`, [player.id, idTec], async (err, row) => {
        if (err || !row) return sendReply(message, 'Técnica não encontrada.');
        if (row.aprendida) return sendReply(message, 'Você já aprendeu essa técnica.');
        if (row.compreensao < 50) return sendReply(message, 'Você precisa de pelo menos 50% de compreensão para tentar aprender.');
        let chance = 50 + Math.floor(player.inteligencia / 20);
        let sucesso = rollDice(100) <= chance;
        if (sucesso || row.compreensao === 100) {
            db.run(`UPDATE tecnicas_aprendidas SET aprendida = 1 WHERE player_id = ? AND tecnica_id = ?`, [player.id, idTec]);
            sendReply(message, '✅ Você aprendeu a técnica! Pode usá-la em combate com `/usartecnica`.');
        } else {
            sendReply(message, '❌ Você falhou ao aprender. Só poderá tentar novamente com 100% de compreensão.');
        }
    });
}

async function cmdInventario(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT i.nome, inv.quantidade, i.id FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ?`, [player.id], (err, rows) => {
        if (err || rows.length === 0) sendReply(message, 'Seu inventário está vazio.');
        else {
            let txt = '🎒 *INVENTÁRIO*\n';
            rows.forEach(r => txt += `\n${r.nome} x${r.quantidade} (ID:${r.id})`);
            sendReply(message, txt);
        }
    });
}

async function cmdUsarItem(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/usar <id_item>`'); return; }
    const itemId = parseInt(args[0]);
    db.get(`SELECT inv.quantidade, i.* FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ? AND inv.item_id = ?`, [player.id, itemId], async (err, row) => {
        if (err || !row) return sendReply(message, 'Item não encontrado.');
        if (row.quantidade < 1) return sendReply(message, 'Você não possui esse item.');
        let efeito = row.efeito;
        let resposta = '';
        if (efeito.includes('Qi')) {
            let valor = parseInt(efeito.match(/\d+/)[0]);
            let novoQi = Math.min(player.qi_maximo, player.qi_atual + valor);
            await updatePlayer(player.id, 'qi_atual', novoQi);
            resposta = `Você usou ${row.nome} e recuperou ${valor} Qi.`;
        } else if (efeito.includes('HP')) {
            let valor = parseInt(efeito.match(/\d+/)[0]);
            let novoHP = Math.min(player.hp_maximo, player.hp_atual + valor);
            await updatePlayer(player.id, 'hp_atual', novoHP);
            resposta = `Você usou ${row.nome} e recuperou ${valor} HP.`;
        } else if (efeito.includes('re-roll')) {
            resposta = `Funcionalidade de re-roll ainda não implementada completamente.`;
        } else resposta = `Você usou ${row.nome}. Efeito: ${row.efeito}`;
        db.run(`UPDATE inventario SET quantidade = quantidade - 1 WHERE player_id = ? AND item_id = ?`, [player.id, itemId]);
        sendReply(message, resposta);
    });
}

async function cmdLoja(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (args[0] === 'comprar' && args[1]) {
        const itemId = parseInt(args[1]);
        db.get(`SELECT l.*, i.nome, i.valor_compra FROM loja_rpg l JOIN itens i ON l.item_id = i.id WHERE i.id = ?`, [itemId], async (err, row) => {
            if (err || !row) return sendReply(message, 'Item não encontrado na loja.');
            let preco = row.preco;
            let moeda = row.moeda_tipo;
            let saldo = player[moeda];
            if (saldo >= preco) {
                let novoSaldo = saldo - preco;
                await updatePlayer(player.id, moeda, novoSaldo);
                db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, 1) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + 1`, [player.id, itemId]);
                sendReply(message, `Você comprou ${row.nome} por ${preco} ${moeda}.`);
            } else sendReply(message, `Moeda insuficiente. Você tem ${saldo} ${moeda}.`);
        });
    } else if (args[0] === 'vender' && args[1]) {
        const itemId = parseInt(args[1]);
        db.get(`SELECT inv.quantidade, i.* FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ? AND inv.item_id = ?`, [player.id, itemId], async (err, row) => {
            if (err || !row || row.quantidade < 1) return sendReply(message, 'Item não encontrado.');
            let valor = row.valor_venda;
            let novoOuro = player.ouro + valor;
            await updatePlayer(player.id, 'ouro', novoOuro);
            db.run(`UPDATE inventario SET quantidade = quantidade - 1 WHERE player_id = ? AND item_id = ?`, [player.id, itemId]);
            sendReply(message, `Você vendeu ${row.nome} por ${valor} ouro.`);
        });
    } else {
        db.all(`SELECT i.id, i.nome, l.preco, l.moeda_tipo FROM loja_rpg l JOIN itens i ON l.item_id = i.id`, (err, rows) => {
            let txt = '🏪 *LOJA DO JOGO*\nCompre: /loja comprar <id>\nVenda: /loja vender <id>\n\n';
            rows.forEach(r => txt += `${r.id} - ${r.nome} - ${r.preco} ${r.moeda_tipo}\n`);
            sendReply(message, txt);
        });
    }
}

// ========================
// SISTEMA DE EXPLORAÇÃO
// ========================
let exploracaoAtiva = new Map();
let batalhasAtivas = new Map();
let interacoesNPC = new Map();

async function cmdAndar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (exploracaoAtiva.has(player.id)) {
        sendReply(message, 'Você já está explorando. Use `/parar` para sair.');
        return;
    }
    if (player.fadiga < 10) {
        sendReply(message, 'Você está exausto. Descanse primeiro (`/descansar`).');
        return;
    }
    const regiao = args[0] || 'Floresta Sombria';
    await updatePlayer(player.id, 'localizacao', regiao);
    sendReply(message, `🌲 Você entrou na ${regiao} para explorar. A cada 5 minutos, eventos acontecerão. Use /parar para sair.`);
    
    const interval = setInterval(async () => {
        const p = await getPlayer(telefone);
        if (!p || !exploracaoAtiva.has(p.id)) return;
        if (p.fadiga <= 0) {
            clearInterval(interval);
            exploracaoAtiva.delete(p.id);
            client.sendMessage(message.from, '😴 Você desmaiou de cansaço. Volte quando descansar.');
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
            client.sendMessage(message.from, `🍃 Você encontrou uma poção de Qi! Foi adicionada ao seu inventário.`);
        } else if (evento <= 70) {
            await encontrarJogador(p, message);
        } else {
            client.sendMessage(message.from, `🍃 Nada de especial aconteceu... Você continua explorando.`);
        }
    }, 300000);
    
    exploracaoAtiva.set(player.id, { interval, regiao });
}

async function cmdParar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const expl = exploracaoAtiva.get(player.id);
    if (!expl) {
        sendReply(message, 'Você não está explorando no momento.');
        return;
    }
    clearInterval(expl.interval);
    exploracaoAtiva.delete(player.id);
    sendReply(message, '🚶 Você parou de explorar e retornou à vila.');
}

async function iniciarCombateMonstro(player, msg) {
    const monstros = ['Lobo Selvagem', 'Espírito de Árvore', 'Goblin Ladrão'];
    const monstro = monstros[Math.floor(Math.random()*monstros.length)];
    const hpMonstro = 50 + rollDice(30);
    batalhasAtivas.set(player.id, {
        tipo: 'monstro',
        nome: monstro,
        hp: hpMonstro,
        hpMax: hpMonstro,
        msgId: msg.id,
        turno: 'jogador'
    });
    client.sendMessage(msg.from, `⚔️ *COMBATE* ⚔️\nVocê encontrou um ${monstro} (HP: ${hpMonstro}). Use /atacar, /defender, /usaritem, /fugir ou /usartecnica.`);
}

async function encontrarNPC(player, msg) {
    db.get(`SELECT * FROM npcs WHERE localizacao = ? OR localizacao = 'global' ORDER BY RANDOM() LIMIT 1`, [player.localizacao], (err, npc) => {
        if (err || !npc) {
            client.sendMessage(msg.from, `👤 Um andarilho misterioso cruza seu caminho, mas desaparece na névoa.`);
            return;
        }
        client.sendMessage(msg.from, `👤 *${npc.nome}*: "${npc.dialogo_inicial}"\n\nOpções:\n1. Perguntar sobre missões\n2. Oferecer presente\n3. Seguir em frente`);
        interacoesNPC.set(player.id, { npcId: npc.id, etapa: 0 });
    });
}

async function encontrarJogador(player, msg) {
    // Placeholder: encontrar outro jogador na mesma região (implementação posterior)
    client.sendMessage(msg.from, `👥 Você avista outro cultivador ao longe, mas ele desaparece na neblina.`);
}

async function cmdAtacar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) { sendReply(message, 'Você não está em combate.'); return; }
    
    let dano = player.forca + rollDice(15);
    
    if (batalha.tipo === 'monstro') {
        batalha.hp -= dano;
        sendReply(message, `⚔️ Você ataca o ${batalha.nome} e causa ${dano} de dano. HP restante: ${batalha.hp}/${batalha.hpMax}`);
        if (batalha.hp <= 0) {
            const recompensaOuro = 10 + rollDice(20);
            await updatePlayer(player.id, 'ouro', player.ouro + recompensaOuro);
            sendReply(message, `🏆 Você derrotou ${batalha.nome}! Ganhou ${recompensaOuro} ouro.`);
            batalhasAtivas.delete(player.id);
            if (rollDice(100) <= 30) {
                const itemId = 2;
                db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, 1) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + 1`, [player.id, itemId]);
                sendReply(message, `🎁 Drop: Poção de Vida!`);
            }
        } else {
            const danoMonstro = 5 + rollDice(10);
            let novoHP = player.hp_atual - danoMonstro;
            if (novoHP < 0) novoHP = 0;
            await updatePlayer(player.id, 'hp_atual', novoHP);
            sendReply(message, `🐺 ${batalha.nome} ataca e causa ${danoMonstro} de dano. Seu HP: ${novoHP}/${player.hp_maximo}`);
            if (novoHP <= 0) {
                sendReply(message, `💀 Você foi derrotado! Perdeu 10 ouro e acorda na vila.`);
                await updatePlayer(player.id, 'ouro', Math.max(0, player.ouro - 10));
                await updatePlayer(player.id, 'hp_atual', player.hp_maximo);
                batalhasAtivas.delete(player.id);
            }
        }
    } else if (batalha.tipo === 'dominio') {
        batalha.hpInimigo -= dano;
        sendReply(message, `⚔️ Você ataca o ${batalha.inimigo.nome} e causa ${dano} de dano. HP restante: ${batalha.hpInimigo}/${batalha.inimigo.hp}`);
        if (batalha.hpInimigo <= 0) {
            sendReply(message, `🏆 Você derrotou ${batalha.inimigo.nome}!`);
            db.get(`SELECT di.*, d.andares, d.recompensa_base_ouro FROM dominio_instancias di JOIN dominios d ON di.dominio_id = d.id WHERE di.player_id = ? AND di.dominio_id = ?`, [player.id, batalha.dominioId], async (err, instancia) => {
                if (err || !instancia) return;
                const novoAndar = batalha.andar + 1;
                if (novoAndar > instancia.andares) {
                    db.run(`UPDATE dominio_instancias SET status = 'concluido' WHERE player_id = ? AND dominio_id = ?`, [player.id, batalha.dominioId]);
                    const recompensa = instancia.recompensa_base_ouro + (instancia.andares * 10);
                    await updatePlayer(player.id, 'ouro', player.ouro + recompensa);
                    sendReply(message, `🎉 *DOMÍNIO CONCLUÍDO!* Você recebeu ${recompensa} ouro.`);
                    batalhasAtivas.delete(player.id);
                } else {
                    db.run(`UPDATE dominio_instancias SET andar_atual = ? WHERE player_id = ? AND dominio_id = ?`, [novoAndar, player.id, batalha.dominioId]);
                    sendReply(message, `✨ Você avança para o andar ${novoAndar}/${instancia.andares}. Use /dominio continuar para prosseguir.`);
                    batalhasAtivas.delete(player.id);
                }
            });
        } else {
            const danoInimigo = batalha.inimigo.dano + rollDice(5);
            let novoHP = player.hp_atual - danoInimigo;
            if (novoHP < 0) novoHP = 0;
            await updatePlayer(player.id, 'hp_atual', novoHP);
            sendReply(message, `💥 ${batalha.inimigo.nome} ataca e causa ${danoInimigo} de dano. Seu HP: ${novoHP}/${player.hp_maximo}`);
            if (novoHP <= 0) {
                sendReply(message, `💀 Você foi derrotado no domínio! Perdeu o progresso e retorna à vila.`);
                db.run(`DELETE FROM dominio_instancias WHERE player_id = ? AND dominio_id = ?`, [player.id, batalha.dominioId]);
                batalhasAtivas.delete(player.id);
                await updatePlayer(player.id, 'hp_atual', player.hp_maximo);
            }
        }
    } else {
        sendReply(message, `Combate PvP em desenvolvimento.`);
    }
}

async function cmdDefender(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) { sendReply(message, 'Você não está em combate.'); return; }
    sendReply(message, `🛡️ Você se defende, reduzindo o próximo dano pela metade.`);
    batalha.defendendo = true;
}

async function cmdFugir(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) { sendReply(message, 'Você não está em combate.'); return; }
    const chance = player.agilidade / 100;
    if (Math.random() < chance) {
        sendReply(message, `🏃 Você fugiu com sucesso!`);
        batalhasAtivas.delete(player.id);
    } else {
        sendReply(message, `😫 Você tentou fugir, mas falhou! O inimigo ataca.`);
        if (batalha.tipo === 'monstro') {
            const danoMonstro = 5 + rollDice(10);
            let novoHP = player.hp_atual - danoMonstro;
            if (novoHP < 0) novoHP = 0;
            await updatePlayer(player.id, 'hp_atual', novoHP);
            sendReply(message, `🐺 ${batalha.nome} causa ${danoMonstro} de dano. HP: ${novoHP}/${player.hp_maximo}`);
        }
    }
}

async function cmdUsarTecnica(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) { sendReply(message, 'Você não está em combate.'); return; }
    if (!args[0]) { sendReply(message, 'Uso: `/usartecnica <id_tecnica>`'); return; }
    const idTec = parseInt(args[0]);
    db.get(`SELECT t.* FROM tecnicas_aprendidas ta JOIN tecnicas t ON ta.tecnica_id = t.id WHERE ta.player_id = ? AND ta.tecnica_id = ? AND ta.aprendida = 1`, [player.id, idTec], async (err, row) => {
        if (err || !row) return sendReply(message, 'Você não aprendeu essa técnica ou ela não existe.');
        if (player.qi_atual < row.custo_qi) return sendReply(message, `Qi insuficiente. Necessário ${row.custo_qi}.`);
        let dano = row.poder_base + (row.tipo === 'Fisica' ? player.forca : player.inteligencia);
        await updatePlayer(player.id, 'qi_atual', player.qi_atual - row.custo_qi);
        sendReply(message, `✨ Você usou *${row.nome}* e causou ${dano} de dano!`);
        if (batalha.tipo === 'monstro') {
            batalha.hp -= dano;
            if (batalha.hp <= 0) {
                sendReply(message, `🏆 Você derrotou ${batalha.nome}!`);
                batalhasAtivas.delete(player.id);
            }
        }
    });
}

// ========================
// SISTEMA DE SEITAS
// ========================

async function cmdCriarSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (args.length < 2) { sendReply(message, 'Uso: `/criarseita <nome> <descricao>`'); return; }
    const nome = args[0];
    const desc = args.slice(1).join(' ');
    db.get(`SELECT id FROM seitas WHERE nome = ?`, [nome], async (err, row) => {
        if (row) return sendReply(message, 'Já existe uma seita com esse nome.');
        if (player.ouro < 1000 && player.cristais_esp < 1) {
            return sendReply(message, 'Você precisa de 1000 ouro ou 1 Cristal Espiritual para criar uma seita.');
        }
        if (player.ouro >= 1000) await updatePlayer(player.id, 'ouro', player.ouro - 1000);
        else await updatePlayer(player.id, 'cristais_esp', player.cristais_esp - 1);
        
        db.run(`INSERT INTO seitas (nome, descricao, lider_id, tesouro) VALUES (?, ?, ?, 0)`, [nome, desc, player.id], function(err) {
            if (err) return sendReply(message, 'Erro ao criar seita.');
            const seitaId = this.lastID;
            db.run(`INSERT INTO seita_membros (seita_id, player_id, cargo) VALUES (?, ?, 'lider')`, [seitaId, player.id]);
            sendReply(message, `🏛️ Seita *${nome}* criada com sucesso! Você é o líder. Use /convidar <id> para adicionar membros.`);
        });
    });
}

async function cmdConvidar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/convidar <id_do_jogador>`'); return; }
    const alvoId = args[0];
    db.get(`SELECT s.* FROM seitas s WHERE s.lider_id = ?`, [player.id], async (err, seita) => {
        if (!seita) return sendReply(message, 'Você não é líder de nenhuma seita.');
        const alvo = await getPlayerByUniqueId(alvoId);
        if (!alvo) return sendReply(message, 'Jogador não encontrado.');
        client.sendMessage(alvo.telefone + '@c.us', `🏮 Você foi convidado para entrar na seita *${seita.nome}*. Use /aceitarconvite ${seita.id} para aceitar.`);
        sendReply(message, `Convite enviado para ${alvo.nome}.`);
    });
}

async function cmdAceitarConvite(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/aceitarconvite <id_seita>`'); return; }
    const seitaId = parseInt(args[0]);
    db.run(`INSERT INTO seita_membros (seita_id, player_id, cargo) VALUES (?, ?, 'membro')`, [seitaId, player.id], (err) => {
        if (err) sendReply(message, 'Erro ao entrar na seita. Talvez você já seja membro.');
        else sendReply(message, '🎉 Você agora é membro da seita!');
    });
}

async function cmdSairSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.run(`DELETE FROM seita_membros WHERE player_id = ?`, [player.id], (err) => {
        if (err) sendReply(message, 'Erro ao sair.');
        else sendReply(message, 'Você saiu da seita.');
    });
}

async function cmdMissoes(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (err, row) => {
        if (!row) return sendReply(message, 'Você não pertence a nenhuma seita.');
        db.all(`SELECT * FROM missoes_seita WHERE seita_id = ? AND status = 'aberta'`, [row.seita_id], (err, missoes) => {
            if (missoes.length === 0) return sendReply(message, 'Nenhuma missão disponível na seita.');
            let txt = '📜 *Missões da Seita*\n';
            missoes.forEach(m => txt += `\nID:${m.id} - Dificuldade:${m.dificuldade} - Recompensa:${m.recompensa_moeda} ouro - ${m.objetivo}`);
            sendReply(message, txt);
        });
    });
}

async function cmdAceitarMissao(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/aceitar <id_missao>`'); return; }
    const missaoId = parseInt(args[0]);
    db.run(`UPDATE missoes_seita SET status = 'em_andamento', aceita_por = ? WHERE id = ? AND status = 'aberta'`, [player.id, missaoId], function(err) {
        if (err || this.changes === 0) sendReply(message, 'Missão não disponível ou já aceita.');
        else sendReply(message, 'Missão aceita! Complete o objetivo e use `/completarmissao <id>` quando terminar.');
    });
}

async function cmdDoar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/doar <quantidade>` (em ouro)'); return; }
    const quant = parseInt(args[0]);
    if (player.ouro < quant) return sendReply(message, 'Você não tem ouro suficiente.');
    await updatePlayer(player.id, 'ouro', player.ouro - quant);
    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (err, row) => {
        if (row) db.run(`UPDATE seitas SET tesouro = tesouro + ? WHERE id = ?`, [quant, row.seita_id]);
    });
    sendReply(message, `Você doou ${quant} ouro para o tesouro da seita.`);
}

async function cmdTecnicaSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/tecnicaseita <id_tecnica>`'); return; }
    const tecId = parseInt(args[0]);
    db.get(`SELECT s.id FROM seitas s WHERE s.lider_id = ?`, [player.id], (err, seita) => {
        if (!seita) return sendReply(message, 'Apenas o líder pode adicionar técnicas à seita.');
        db.run(`INSERT OR IGNORE INTO biblioteca_seita (seita_id, tecnica_id) VALUES (?, ?)`, [seita.id, tecId]);
        sendReply(message, `Técnica adicionada à biblioteca da seita.`);
    });
}

async function cmdBiblioteca(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (err, row) => {
        if (!row) return sendReply(message, 'Você não pertence a nenhuma seita.');
        db.all(`SELECT t.id, t.nome FROM biblioteca_seita bs JOIN tecnicas t ON bs.tecnica_id = t.id WHERE bs.seita_id = ?`, [row.seita_id], (err, tecs) => {
            if (!tecs.length) return sendReply(message, 'A biblioteca da seita está vazia.');
            let txt = '📚 *Biblioteca da Seita*\n';
            tecs.forEach(t => txt += `\n${t.id} - ${t.nome}`);
            sendReply(message, txt);
        });
    });
}

async function cmdAprenderSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/aprender_seita <id_tecnica>`'); return; }
    const tecId = parseInt(args[0]);
    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (err, membro) => {
        if (!membro) return sendReply(message, 'Você não está em uma seita.');
        db.get(`SELECT * FROM biblioteca_seita WHERE seita_id = ? AND tecnica_id = ?`, [membro.seita_id, tecId], async (err, bib) => {
            if (!bib) return sendReply(message, 'Essa técnica não está na biblioteca.');
            db.get(`SELECT * FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`, [player.id, tecId], async (err, exist) => {
                if (exist) return sendReply(message, 'Você já conhece essa técnica.');
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
        sendReply(message, `Profissões disponíveis: Alquimista, Forjador, Médico, Mestre de Talismã, Mestre de Formações. Use /profissao escolher <nome>`);
    } else if (args[0] === 'escolher' && args[1]) {
        const prof = args[1].toLowerCase();
        const validas = ['alquimista', 'forjador', 'médico', 'mestre de talismã', 'mestre de formações'];
        if (!validas.includes(prof)) return sendReply(message, 'Profissão inválida.');
        await updatePlayer(player.id, 'profissao_principal', prof);
        await updatePlayer(player.id, 'nivel_profissao', 1);
        db.run(`INSERT OR REPLACE INTO profissoes (player_id, profissao, nivel, experiencia) VALUES (?, ?, 1, 0)`, [player.id, prof]);
        sendReply(message, `Você agora é um ${prof}. Use /craftar para fabricar itens.`);
    } else {
        sendReply(message, `Sua profissão: ${player.profissao_principal || 'nenhuma'} (nível ${player.nivel_profissao || 0}). Use /profissao escolher <nome> para mudar.`);
    }
}

async function cmdCraftar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!player.profissao_principal) return sendReply(message, 'Você não tem uma profissão. Escolha uma com `/profissao escolher`.');
    if (!args[0]) return sendReply(message, 'Uso: `/craftar <item>` (ex: poção, espada)');
    const itemNome = args[0];
    sendReply(message, `🧪 Você tentou craftar ${itemNome}, mas o sistema de crafting ainda está em desenvolvimento detalhado. Por hora, use /loja para comprar.`);
}

async function cmdSubirProfissao(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!player.profissao_principal) return sendReply(message, 'Você não tem profissão.');
    db.get(`SELECT * FROM profissoes WHERE player_id = ?`, [player.id], async (err, row) => {
        if (!row) return;
        const xpNecessario = row.nivel * 100;
        if (row.experiencia >= xpNecessario) {
            const novoNivel = row.nivel + 1;
            db.run(`UPDATE profissoes SET nivel = ?, experiencia = ? WHERE player_id = ?`, [novoNivel, row.experiencia - xpNecessario, player.id]);
            await updatePlayer(player.id, 'nivel_profissao', novoNivel);
            sendReply(message, `🎉 Parabéns! Sua profissão agora é nível ${novoNivel}.`);
        } else {
            sendReply(message, `Você precisa de ${xpNecessario - row.experiencia} XP para subir de nível. Ganhe XP craftando.`);
        }
    });
}

// ========================
// SISTEMA SOCIAL
// ========================

async function cmdAmigos(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT p.nome, p.unique_id FROM amigos_inimigos ai JOIN players p ON ai.alvo_id = p.id WHERE ai.player_id = ? AND ai.tipo = 'amigo'`, [player.id], (err, rows) => {
        let txt = '👥 *Amigos*\n';
        rows.forEach(r => txt += `\n${r.nome} (${r.unique_id})`);
        if (!rows.length) txt += '\nNenhum amigo ainda.';
        sendReply(message, txt);
    });
}

async function cmdAdicionarAmigo(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/adicionaramigo <id_do_jogador>`'); return; }
    const alvoUnique = args[0];
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return sendReply(message, 'Jogador não encontrado.');
    db.run(`INSERT INTO amigos_inimigos (player_id, alvo_id, tipo) VALUES (?, ?, 'amigo')`, [player.id, alvo.id], (err) => {
        if (err) sendReply(message, 'Já são amigos ou erro.');
        else sendReply(message, `🤝 ${alvo.nome} agora é seu amigo!`);
    });
}

async function cmdInimigo(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/inimigo <id_do_jogador>`'); return; }
    const alvoUnique = args[0];
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return sendReply(message, 'Jogador não encontrado.');
    db.run(`INSERT INTO amigos_inimigos (player_id, alvo_id, tipo) VALUES (?, ?, 'inimigo')`, [player.id, alvo.id], (err) => {
        if (err) sendReply(message, 'Já é inimigo ou erro.');
        else sendReply(message, `⚠️ Você declarou ${alvo.nome} como inimigo!`);
    });
}

async function cmdConversar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (args.length < 2) { sendReply(message, 'Uso: `/conversar <id_do_jogador> <mensagem>`'); return; }
    const alvoUnique = args[0];
    const texto = args.slice(1).join(' ');
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return sendReply(message, 'Jogador não encontrado.');
    db.run(`INSERT INTO mensagens_chat (de_id, para_id, mensagem, lida) VALUES (?, ?, ?, 0)`, [player.id, alvo.id, texto]);
    sendReply(message, `Mensagem enviada para ${alvo.nome}.`);
}

async function cmdLerChat(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT m.mensagem, p.nome as de_nome FROM mensagens_chat m JOIN players p ON m.de_id = p.id WHERE m.para_id = ? AND m.lida = 0`, [player.id], (err, rows) => {
        if (err || !rows.length) return sendReply(message, 'Nenhuma mensagem nova.');
        let txt = '📬 *Mensagens não lidas*\n';
        rows.forEach(r => txt += `\n${r.de_nome}: ${r.mensagem}`);
        db.run(`UPDATE mensagens_chat SET lida = 1 WHERE para_id = ?`, [player.id]);
        sendReply(message, txt);
    });
}

// ========================
// SISTEMA DE DOMÍNIOS (MASMORRAS)
// ========================

async function cmdDominio(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;

    if (args.length === 0) {
        db.all(`SELECT * FROM dominios WHERE nivel_minimo <= ?`, [player.nivel_fisico], (err, dominios) => {
            if (err || dominios.length === 0) {
                return sendReply(message, 'Nenhum domínio disponível para seu nível ainda.');
            }
            let txt = '🏰 *DOMÍNIOS DISPONÍVEIS*\n\n';
            dominios.forEach(d => {
                txt += `*${d.nome}* (nível mínimo ${d.nivel_minimo})\n${d.descricao}\nAndares: ${d.andares} | Recompensa base: ${d.recompensa_base_ouro} ouro\nUse: \`/dominio entrar ${d.nome}\`\n\n`;
            });
            sendReply(message, txt);
        });
        return;
    }

    const subcmd = args[0].toLowerCase();
    const nomeDominio = args.slice(1).join(' ');

    if (subcmd === 'entrar') {
        if (!nomeDominio) {
            sendReply(message, 'Use: `/dominio entrar <nome_do_dominio>`');
            return;
        }
        db.get(`SELECT * FROM dominios WHERE nome = ? AND nivel_minimo <= ?`, [nomeDominio, player.nivel_fisico], async (err, dominio) => {
            if (err || !dominio) {
                return sendReply(message, 'Domínio não encontrado ou seu nível é muito baixo.');
            }
            db.get(`SELECT * FROM dominio_instancias WHERE player_id = ? AND dominio_id = ? AND status = 'em_andamento'`, [player.id, dominio.id], async (err, instancia) => {
                if (instancia) {
                    return sendReply(message, `Você já está explorando ${dominio.nome} (andar ${instancia.andar_atual}/${dominio.andares}). Continue com /dominio continuar.`);
                }
                db.run(`INSERT INTO dominio_instancias (player_id, dominio_id, andar_atual, status) VALUES (?, ?, 1, 'em_andamento')`, [player.id, dominio.id], (err) => {
                    if (err) return sendReply(message, 'Erro ao entrar no domínio.');
                    sendReply(message, `🌟 Você entrou no domínio *${dominio.nome}*. Andar 1/${dominio.andares}. Use /dominio continuar para avançar.`);
                });
            });
        });
    } 
    else if (subcmd === 'continuar') {
        db.get(`SELECT di.*, d.nome, d.andares, d.recompensa_base_ouro, d.item_raru_id 
                FROM dominio_instancias di 
                JOIN dominios d ON di.dominio_id = d.id 
                WHERE di.player_id = ? AND di.status = 'em_andamento'`, [player.id], async (err, instancia) => {
            if (err || !instancia) {
                return sendReply(message, 'Você não está em nenhum domínio no momento. Use `/dominio entrar <nome>` para começar.');
            }
            const andarAtual = instancia.andar_atual;
            const totalAndares = instancia.andares;
            const nomeDominio = instancia.nome;

            const inimigo = gerarInimigoDominio(andarAtual, totalAndares);
            
            sendReply(message, `🏯 *${nomeDominio} - Andar ${andarAtual}/${totalAndares}*\n⚔️ Você encontra: *${inimigo.nome}* (HP: ${inimigo.hp})\nUse /atacar, /defender, /usaritem, /usartecnica.`);
            
            batalhasAtivas.set(player.id, {
                tipo: 'dominio',
                dominioId: instancia.dominio_id,
                andar: andarAtual,
                inimigo: inimigo,
                hpInimigo: inimigo.hp,
                msgId: message.id
            });
        });
    }
    else {
        sendReply(message, 'Comandos de domínio: `/dominio` (lista), `/dominio entrar <nome>`, `/dominio continuar`');
    }
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
    } else {
        const normal = inimigosNormais[Math.floor(Math.random() * inimigosNormais.length)];
        return { nome: normal.nome, hp: normal.hp, dano: normal.dano, isChefe: false };
    }
}

// ========================
// MISSÕES PESSOAIS
// ========================

async function cmdCriarMissaoPessoal(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (args.length < 2) { sendReply(message, 'Uso: `/criarmissao <descrição> <recompensa_ouro>`'); return; }
    const recompensa = parseInt(args[args.length-1]);
    const desc = args.slice(0, -1).join(' ');
    if (player.ouro < recompensa) return sendReply(message, 'Você não tem ouro suficiente para pagar essa recompensa.');
    await updatePlayer(player.id, 'ouro', player.ouro - recompensa);
    db.run(`INSERT INTO missoes_pessoais (criador_id, descricao, recompensa_moeda, status) VALUES (?, ?, ?, 'aberta')`, [player.id, desc, recompensa], function(err) {
        if (err) sendReply(message, 'Erro ao criar missão.');
        else sendReply(message, `✅ Missão criada! ID: ${this.lastID}. Outros jogadores podem aceitá-la.`);
    });
}

async function cmdMissoesDisponiveis(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT mp.id, mp.descricao, mp.recompensa_moeda, p.nome as criador FROM missoes_pessoais mp JOIN players p ON mp.criador_id = p.id WHERE mp.status = 'aberta' AND mp.criador_id != ?`, [player.id], (err, rows) => {
        if (!rows.length) return sendReply(message, 'Nenhuma missão disponível.');
        let txt = '📋 *Missões de outros jogadores*\n';
        rows.forEach(r => txt += `\nID:${r.id} - ${r.descricao} - Recompensa: ${r.recompensa_moeda} ouro - Criador: ${r.criador}`);
        sendReply(message, txt);
    });
}

async function cmdAceitarMissaoPessoal(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/aceitarmissao <id_missao>`'); return; }
    const missaoId = parseInt(args[0]);
    db.run(`UPDATE missoes_pessoais SET status = 'em_andamento' WHERE id = ? AND status = 'aberta'`, [missaoId], function(err) {
        if (err || this.changes === 0) sendReply(message, 'Missão não disponível.');
        else sendReply(message, 'Missão aceita! Complete o objetivo e use `/completarmissao <id>` quando terminar.');
    });
}

async function cmdCompletarMissaoPessoal(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { sendReply(message, 'Uso: `/completarmissao <id_missao>`'); return; }
    const missaoId = parseInt(args[0]);
    db.get(`SELECT * FROM missoes_pessoais WHERE id = ? AND status = 'em_andamento' AND criador_id != ?`, [missaoId, player.id], async (err, missao) => {
        if (!missao) return sendReply(message, 'Missão não encontrada ou não está em andamento.');
        await updatePlayer(player.id, 'ouro', player.ouro + missao.recompensa_moeda);
        db.run(`UPDATE missoes_pessoais SET status = 'concluida' WHERE id = ?`, [missaoId]);
        sendReply(message, `🎉 Missão concluída! Você recebeu ${missao.recompensa_moeda} ouro.`);
        const criador = await getPlayerById(missao.criador_id);
        if (criador) client.sendMessage(criador.telefone + '@c.us', `📢 Sua missão "${missao.descricao}" foi concluída por ${player.nome}.`);
    });
}

async function cmdMinhasMissoes(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT * FROM missoes_pessoais WHERE criador_id = ?`, [player.id], (err, rows) => {
        let txt = '📌 *Suas missões criadas*\n';
        rows.forEach(r => txt += `\nID:${r.id} - ${r.descricao} - Status: ${r.status} - Recompensa: ${r.recompensa_moeda}`);
        sendReply(message, txt);
    });
}

// ========================
// EVENTOS MUNDIAIS
// ========================

async function cmdEventos(args, message, telefone) {
    db.all(`SELECT * FROM eventos_mundiais WHERE ativo = 1 AND datetime(data_inicio) <= datetime('now') AND datetime(data_fim) >= datetime('now')`, (err, rows) => {
        if (!rows.length) return sendReply(message, 'No momento não há eventos mundiais ativos.');
        let txt = '🌍 *Eventos Mundiais Ativos*\n';
        rows.forEach(e => txt += `\n*${e.nome}*: ${e.descricao}\nBônus: ${e.bonus}\nVálido até ${e.data_fim}`);
        sendReply(message, txt);
    });
}

async function cmdRanking(args, message, telefone) {
    let tipo = args[0] || 'forca';
    let order = '';
    let campo = '';
    switch(tipo) {
        case 'forca': order = 'forca DESC'; campo = 'forca'; break;
        case 'reino': order = 'nivel_fisico DESC, sub_fisico DESC'; campo = 'nivel_fisico'; break;
        case 'riqueza': order = 'ouro DESC'; campo = 'ouro'; break;
        case 'karma': order = 'karma DESC'; campo = 'karma'; break;
        default: order = 'forca DESC'; campo = 'forca';
    }
    db.all(`SELECT nome, ${campo} as valor FROM players ORDER BY ${order} LIMIT 10`, (err, rows) => {
        let txt = `🏆 *Ranking de ${tipo}*\n`;
        rows.forEach((r, i) => txt += `\n${i+1}. ${r.nome} - ${r.valor}`);
        sendReply(message, txt);
    });
}

// ========================
// COMANDOS DE ADMIN (APENAS DONO)
// ========================

async function cmdBanir(args, message, telefone) {
    if (telefone !== DONO_NUMERO) return sendReply(message, 'Apenas o dono pode usar este comando.');
    if (!args[0]) return sendReply(message, 'Uso: `/banir <id_do_jogador> [motivo]`');
    const alvoUnique = args[0];
    const motivo = args.slice(1).join(' ') || 'sem motivo';
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return sendReply(message, 'Jogador não encontrado.');
    db.run(`UPDATE players SET banido = 1 WHERE id = ?`, [alvo.id]);
    sendReply(message, `Jogador ${alvo.nome} foi banido. Motivo: ${motivo}`);
    client.sendMessage(alvo.telefone + '@c.us', `⚠️ Você foi banido do jogo. Motivo: ${motivo}`);
}

async function cmdDarItem(args, message, telefone) {
    if (telefone !== DONO_NUMERO) return sendReply(message, 'Apenas o dono.');
    if (args.length < 2) return sendReply(message, 'Uso: `/daritem <id_jogador> <id_item> <quantidade>`');
    const alvoUnique = args[0];
    const itemId = parseInt(args[1]);
    const qtd = parseInt(args[2]) || 1;
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return sendReply(message, 'Jogador não encontrado.');
    db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, ?) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + ?`, [alvo.id, itemId, qtd, qtd]);
    sendReply(message, `Item ${itemId} x${qtd} entregue a ${alvo.nome}.`);
}

async function cmdResetar(args, message, telefone) {
    if (telefone !== DONO_NUMERO) return sendReply(message, 'Apenas o dono.');
    if (!args[0]) return sendReply(message, 'Uso: `/resetar <id_jogador>`');
    const alvoUnique = args[0];
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return sendReply(message, 'Jogador não encontrado.');
    db.run(`DELETE FROM players WHERE id = ?`, [alvo.id]);
    db.run(`DELETE FROM inventario WHERE player_id = ?`, [alvo.id]);
    sendReply(message, `Jogador ${alvo.nome} foi resetado.`);
}

async function cmdAnuncio(args, message, telefone) {
    if (telefone !== DONO_NUMERO) return sendReply(message, 'Apenas o dono.');
    if (!args.length) return sendReply(message, 'Uso: `/anuncio <texto>`');
    const texto = args.join(' ');
    db.all(`SELECT telefone FROM players`, (err, rows) => {
        rows.forEach(row => {
            client.sendMessage(row.telefone + '@c.us', `📢 *ANÚNCIO GLOBAL*: ${texto}`);
        });
        sendReply(message, 'Anúncio enviado a todos os jogadores.');
    });
}

// ========== PROCESSADOR DE COMANDOS ==========
async function processCommand(message) {
    const body = message.body.slice(1).trim();
    const parts = body.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const telefone = message.from.replace('@c.us', '');

    const commands = {
        'registrar': cmdRegistrar,
        'perfil': cmdPerfil,
        'mudaraparencia': cmdMudarAparencia,
        'cultivar': cmdCultivar,
        'tecnicas': cmdTecnicas,
        'compreender': cmdCompreender,
        'aprender': cmdAprender,
        'inventario': cmdInventario,
        'usar': cmdUsarItem,
        'loja': cmdLoja,
        'menu': cmdMenu,
        'ajuda': cmdAjuda,
        'descansar': cmdDescansar,
        'changelog': cmdChangelog,
        'andar': cmdAndar,
        'parar': cmdParar,
        'dominio': cmdDominio,
        'criarseita': cmdCriarSeita,
        'convidar': cmdConvidar,
        'sairseita': cmdSairSeita,
        'missoes': cmdMissoes,
        'aceitar': cmdAceitarMissao,
        'doar': cmdDoar,
        'tecnicaseita': cmdTecnicaSeita,
        'biblioteca': cmdBiblioteca,
        'aprender_seita': cmdAprenderSeita,
        'profissao': cmdProfissao,
        'craftar': cmdCraftar,
        'subirprofissao': cmdSubirProfissao,
        'amigos': cmdAmigos,
        'adicionaramigo': cmdAdicionarAmigo,
        'inimigo': cmdInimigo,
        'conversar': cmdConversar,
        'lerchat': cmdLerChat,
        'criarmissao': cmdCriarMissaoPessoal,
        'minhasmissoes': cmdMinhasMissoes,
        'missoesdisponiveis': cmdMissoesDisponiveis,
        'aceitarmissao': cmdAceitarMissaoPessoal,
        'completarmissao': cmdCompletarMissaoPessoal,
        'eventos': cmdEventos,
        'ranking': cmdRanking,
        'banir': cmdBanir,
        'daritem': cmdDarItem,
        'resetar': cmdResetar,
        'anuncio': cmdAnuncio,
        'guia': cmdGuia,
        'status': cmdPerfil,
        'atributos': cmdPerfil,
        'romper': cmdRomper,
        'jogadores': cmdJogadores,
        'encontrar': cmdEncontrar,
        'trocar': cmdTrocar,
        'duelar': cmdDuelar,
        'mercado': cmdMercadoGlobal,
        'npc': cmdNPCInteragir,
        'interagir': cmdNPCInteragir
    };
    if (commands[cmd]) await commands[cmd](args, message, telefone);
    else await sendReply(message, 'Comando desconhecido. Use `/menu`.');
}

client.initialize();
