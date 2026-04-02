// ============================================
// CHASING IMMORTALITY BOT - CÓDIGO COMPLETO
// ============================================

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const sqlite3 = require('sqlite3').verbose();
const qrcode = require('qrcode-terminal');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// ========== CONFIGURAÇÕES ==========
const DONO_NUMERO = '5521997537769';   // ⚠️ SUBSTITUA PELO SEU NÚMERO (com código do país)
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
        await message.reply('❌ Você não está registrado! Use `/registrar <nome> <sexo>` para começar.');
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

async function cmdRegistrar(args, message, telefone) {
    if (args.length < 2) {
        message.reply('Uso: `/registrar <nome> <sexo>` (sexo M/F)');
        return;
    }
    const nome = args[0];
    let sexo = args[1].toUpperCase();
    if (sexo !== 'M' && sexo !== 'F') {
        message.reply('Sexo deve ser M ou F.');
        return;
    }
    const existing = await getPlayer(telefone);
    if (existing) {
        message.reply('Você já está registrado! Use `/perfil`.');
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
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 1,1,1,1, ?, ?, ?, ?, ?,?,?,?,?,?,?, 100, '', '',0, ?,0,0,0, ?, ?, 1)`);
    stmt.run(unique_id, nome, sexo, racaEscolhida, clanEscolhido, raiz, elementos, corpoDivino, orfao, 'Neutro', 0, 0, fortuna,
        qi_max, qi_max, hp_max, hp_max, forca, vigor, defesa, inteligencia, espirito, agilidade,
        100, '', '', 0, 100, localizacao, telefone, (err) => {
            if (err) { log(`Erro registro: ${err}`, 'ERRO'); message.reply('Erro interno. Tente novamente.'); }
            else {
                message.reply(`🌟 *Bem-vindo ao Chasing Immortality, ${nome}!*\n\n📜 *ID:* ${unique_id}\n🧬 *Raça:* ${racaEscolhida}\n🏮 *Clã:* ${clanEscolhido}\n🌿 *Raiz:* ${raiz} (${elementos})\n💪 *Corpo Divino:* ${corpoDivino || 'Nenhum'}\n❤️ *Órfão:* ${orfao ? 'Sim' : 'Não'}\n\nUse /perfil para ver detalhes. Boa sorte!`);
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
            await message.reply(media, undefined, { caption: texto });
        } catch(e) { await message.reply(texto + '\n⚠️ Erro ao carregar avatar.'); }
    } else await message.reply(texto);
}

async function cmdMudarAparencia(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0] || !args[0].match(/\.(jpg|jpeg|png|gif|webp)/i)) {
        message.reply('Uso: `/mudaraparencia <URL_da_imagem>` (jpg, png, gif, webp)');
        return;
    }
    await updatePlayer(player.id, 'avatar_url', args[0]);
    message.reply('🧝 Avatar atualizado! Aparecerá no /perfil.');
}
function cmdMenu(message) {
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
    
    message.reply(menu);
}

async function cmdGuia(args, message) {
    if (!args.length) {
        message.reply(`📖 *Guias disponíveis:*\n/guia cultivo\n/guia batalha\n/guia profissao\n/guia social\n\nUse /guia <assunto> para detalhes.`);
        return;
    }
    const assunto = args[0].toLowerCase();
    let texto = '';
    switch (assunto) {
        case 'cultivo':
            texto = `🌿 *Guia de Cultivo*\n\n` +
                `O cultivo é dividido em dois caminhos: *Físico* (aumenta Força, Vigor, HP) e *Espiritual* (aumenta Inteligência, Espírito, Qi).\n` +
                `Para cultivar, você precisa de uma técnica de meditação (geralmente recebida do seu clã).\n` +
                `Use /cultivar [fisico|espiritual] – consome Qi e Fadiga. Ganhe XP para subir de subnível (1 a 9).\n` +
                `Ao atingir subnível 9 com XP suficiente, você enfrentará a *Tribulação do Céu* – um combate desafiador para avançar de reino.\n` +
                `Cada reino aumenta significativamente seus atributos e desbloqueia novas técnicas.`;
            break;
        case 'batalha':
            texto = `⚔️ *Guia de Combate*\n\n` +
                `O combate é por turnos. Você pode:\n` +
                `• /atacar – causa dano baseado na Força e arma equipada.\n` +
                `• /defender – reduz o dano recebido pela metade no próximo turno.\n` +
                `• /usaritem <id> – consome um item do inventário (poções, pílulas).\n` +
                `• /usartecnica <id> – usa uma técnica ofensiva ou defensiva que você aprendeu.\n` +
                `• /fugir – tenta escapar (chance baseada na Agilidade).\n\n` +
                `Quando um monstro ou jogador é derrotado, você ganha recompensas (ouro, XP, drops).`;
            break;
        case 'profissao':
            texto = `🛠️ *Guia de Profissões*\n\n` +
                `Escolha uma profissão com /profissao escolher <nome>.\n` +
                `Opções: Alquimista, Forjador, Médico, Mestre de Talismã, Mestre de Formações.\n` +
                `Cada profissão permite craftar itens específicos com /craftar.\n` +
                `Ganhe XP craftando e suba de nível para desbloquear receitas mais poderosas.\n` +
                `Use /subirprofissao para evoluir de nível quando tiver XP suficiente.`;
            break;
        case 'social':
            texto = `👥 *Guia Social*\n\n` +
                `• /amigos – vê sua lista de amigos.\n` +
                `• /adicionaramigo <id> – envia pedido de amizade.\n` +
                `• /inimigo <id> – declara alguém como inimigo (afeta encontros PvP e karma).\n` +
                `• /conversar <id> <msg> – envia mensagem privada.\n` +
                `• /lerchat – lê mensagens não lidas.\n` +
                `• Quando dois jogadores usam /andar na mesma região, podem se encontrar e interagir (batalha, troca, conversa).`;
            break;
        default:
            texto = `Assunto não encontrado. Use /guia sem argumentos para ver a lista.`;
    }
    message.reply(texto);
}

function cmdAjuda(args, message) {
    if (!args[0]) { message.reply('Use `/ajuda <comando>`. Ex: `/ajuda cultivar`'); return; }
    const ajuda = {
        'cultivar': 'Treina cultivo físico ou espiritual. Requer técnica de meditação. Sintaxe: `/cultivar [fisico|espiritual]`',
        'registrar': 'Registra personagem. Sintaxe: `/registrar <nome> <sexo>`',
        'perfil': 'Mostra status, atributos e avatar.',
        'mudaraparencia': 'Define URL da imagem do perfil.',
        'andar': 'Explora a região atual. Pode encontrar monstros, NPCs ou outros jogadores.',
        'combate': 'Comandos de batalha: /atacar, /defender, /usaritem, /fugir, /usartecnica'
    };
    message.reply(ajuda[args[0].toLowerCase()] || 'Comando não encontrado.');
}

async function cmdDescansar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const novaFadiga = Math.min(100, player.fadiga + 20);
    const novoQi = Math.min(player.qi_maximo, player.qi_atual + 30);
    await updatePlayer(player.id, 'fadiga', novaFadiga);
    await updatePlayer(player.id, 'qi_atual', novoQi);
    message.reply(`😴 Você descansou. Fadiga: ${player.fadiga} → ${novaFadiga} | Qi: ${player.qi_atual} → ${novoQi}`);
}

async function cmdChangelog(message) {
    db.all('SELECT * FROM changelog ORDER BY data DESC LIMIT 5', (err, rows) => {
        if (err) return message.reply('Erro ao buscar changelog.');
        let text = '📜 *CHANGELOG*\n';
        rows.forEach(r => { text += `\n*${r.versao}* (${r.data}): ${r.texto}`; });
        message.reply(text);
    });
}

async function cmdRomper(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    // Verifica se está no subnível 9 de algum dos cultivos
    if (player.sub_fisico === 9 || player.sub_espiritual === 9) {
        message.reply(`⚡ O céu escurece... Você sente a Tribulação do Céu se aproximar!\nPara avançar de reino, você precisa enfrentar um desafio. Use /cultivar novamente para iniciar a tribulação.`);
        // Aqui poderia iniciar uma batalha especial, mas por enquanto apenas avisa
    } else {
        message.reply(`Você ainda não atingiu o pico do seu reino atual. Continue cultivando para chegar ao subnível 9.`);
    }
}

async function cmdJogadores(args, message, telefone) {
    message.reply(`👥 *Jogadores próximos*\nFuncionalidade em desenvolvimento. Use /ranking para ver a lista geral.`);
}
async function cmdEncontrar(args, message, telefone) {
    message.reply(`🔍 *Encontrar jogadores*\nUse /andar em uma região e aguarde eventos. Quando outro jogador também estiver explorando, vocês poderão se encontrar.`);
}
async function cmdTrocar(args, message, telefone) {
    message.reply(`🔄 *Troca de itens*\nEm breve! Por enquanto, use /mercado para vender/comprar itens.`);
}
async function cmdDuelar(args, message, telefone) {
    message.reply(`⚔️ *Duelo PvP*\nPara duelar, ambos os jogadores devem estar na mesma região e usar /batalhar quando se encontrarem. Em desenvolvimento.`);
}
async function cmdMercadoGlobal(args, message, telefone) {
    message.reply(`🏪 *Mercado Global*\nEm desenvolvimento. Use /loja para comprar itens básicos.`);
}

async function cmdCultivar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const tipo = args[0]?.toLowerCase();
    if (tipo !== 'fisico' && tipo !== 'espiritual') {
        message.reply('Especifique `/cultivar fisico` ou `/cultivar espiritual`.');
        return;
    }
    // Verifica técnica de meditação
    const tecnica = await new Promise(resolve => {
        db.get(`SELECT * FROM tecnicas_aprendidas ta JOIN tecnicas t ON ta.tecnica_id = t.id WHERE ta.player_id = ? AND t.tipo = 'Meditacao' AND ta.aprendida = 1`, [player.id], (err, row) => resolve(row));
    });
    if (!tecnica) {
        message.reply('Você não possui uma técnica de meditação. Adquira uma primeiro!');
        return;
    }
    if (player.fadiga < 20) {
        message.reply('Você está muito cansado. Descanse (`/descansar`).');
        return;
    }
    if (player.qi_atual < 10) {
        message.reply('Qi insuficiente. Recupere com pílulas ou descanse.');
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
    // Progresso de subnível (simplificado)
    let campoSub = tipo === 'fisico' ? 'sub_fisico' : 'sub_espiritual';
    let subAtual = tipo === 'fisico' ? player.sub_fisico : player.sub_espiritual;
    let novoSub = subAtual;
    if (ganho >= 100) {
        novoSub += Math.floor(ganho / 100);
        if (novoSub > 9) {
            novoSub = 1;
            // Tribulação do céu (simplificada)
            message.reply('⚡ Você sente a tribulação do céu se aproximar! Avançar de reino exigirá um desafio. (implementar depois)');
        }
        ganho = ganho % 100;
    }
    await updatePlayer(player.id, campoSub, novoSub);
    message.reply(`🧘 Você cultivou ${tipo} e ganhou ${ganho} de experiência. Qi: ${player.qi_atual}→${novoQi} | Fadiga: ${player.fadiga}→${novaFadiga}`);
}

async function cmdTecnicas(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT t.nome, t.tipo, ta.compreensao, ta.aprendida FROM tecnicas_aprendidas ta JOIN tecnicas t ON ta.tecnica_id = t.id WHERE ta.player_id = ?`, [player.id], (err, rows) => {
        if (err || rows.length === 0) message.reply('Você não conhece nenhuma técnica ainda.');
        else {
            let txt = '📜 *Suas Técnicas*\n';
            rows.forEach(r => txt += `\n${r.nome} (${r.tipo}) - Compreensão: ${r.compreensao}% - ${r.aprendida ? '✅ Aprendida' : '❌ Não aprendida'}`);
            message.reply(txt);
        }
    });
}

async function cmdCompreender(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/compreender <id_tecnica>`'); return; }
    const idTec = parseInt(args[0]);
    db.get(`SELECT * FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`, [player.id, idTec], async (err, row) => {
        if (err || !row) return message.reply('Você não possui essa técnica.');
        if (row.aprendida) return message.reply('Você já aprendeu essa técnica completamente.');
        let ganho = rollDice(20) + Math.floor(player.inteligencia / 10) + Math.floor(player.espirito / 20);
        let novaComp = Math.min(100, row.compreensao + ganho);
        db.run(`UPDATE tecnicas_aprendidas SET compreensao = ? WHERE player_id = ? AND tecnica_id = ?`, [novaComp, player.id, idTec]);
        message.reply(`📖 Você estudou a técnica e aumentou a compreensão para ${novaComp}%.`);
        if (novaComp >= 100) message.reply('🎉 Você compreendeu completamente a técnica! Agora pode aprendê-la com `/aprender`.');
    });
}

async function cmdAprender(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/aprender <id_tecnica>`'); return; }
    const idTec = parseInt(args[0]);
    db.get(`SELECT * FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`, [player.id, idTec], async (err, row) => {
        if (err || !row) return message.reply('Técnica não encontrada.');
        if (row.aprendida) return message.reply('Você já aprendeu essa técnica.');
        if (row.compreensao < 50) return message.reply('Você precisa de pelo menos 50% de compreensão para tentar aprender.');
        let chance = 50 + Math.floor(player.inteligencia / 20);
        let sucesso = rollDice(100) <= chance;
        if (sucesso || row.compreensao === 100) {
            db.run(`UPDATE tecnicas_aprendidas SET aprendida = 1 WHERE player_id = ? AND tecnica_id = ?`, [player.id, idTec]);
            message.reply('✅ Você aprendeu a técnica! Pode usá-la em combate com `/usartecnica`.');
        } else {
            message.reply('❌ Você falhou ao aprender. Só poderá tentar novamente com 100% de compreensão.');
        }
    });
}

async function cmdInventario(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT i.nome, inv.quantidade, i.id FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ?`, [player.id], (err, rows) => {
        if (err || rows.length === 0) message.reply('Seu inventário está vazio.');
        else {
            let txt = '🎒 *INVENTÁRIO*\n';
            rows.forEach(r => txt += `\n${r.nome} x${r.quantidade} (ID:${r.id})`);
            message.reply(txt);
        }
    });
}

async function cmdUsarItem(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/usar <id_item>`'); return; }
    const itemId = parseInt(args[0]);
    db.get(`SELECT inv.quantidade, i.* FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ? AND inv.item_id = ?`, [player.id, itemId], async (err, row) => {
        if (err || !row) return message.reply('Item não encontrado.');
        if (row.quantidade < 1) return message.reply('Você não possui esse item.');
        // Aplica efeito
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
            // re-roll raça/clã (simplificado)
            resposta = `Funcionalidade de re-roll ainda não implementada completamente.`;
        } else resposta = `Você usou ${row.nome}. Efeito: ${row.efeito}`;
        db.run(`UPDATE inventario SET quantidade = quantidade - 1 WHERE player_id = ? AND item_id = ?`, [player.id, itemId]);
        message.reply(resposta);
    });
}

async function cmdLoja(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (args[0] === 'comprar' && args[1]) {
        const itemId = parseInt(args[1]);
        db.get(`SELECT l.*, i.nome, i.valor_compra FROM loja_rpg l JOIN itens i ON l.item_id = i.id WHERE i.id = ?`, [itemId], async (err, row) => {
            if (err || !row) return message.reply('Item não encontrado na loja.');
            let preco = row.preco;
            let moeda = row.moeda_tipo;
            let saldo = player[moeda];
            if (saldo >= preco) {
                let novoSaldo = saldo - preco;
                await updatePlayer(player.id, moeda, novoSaldo);
                db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, 1) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + 1`, [player.id, itemId]);
                message.reply(`Você comprou ${row.nome} por ${preco} ${moeda}.`);
            } else message.reply(`Moeda insuficiente. Você tem ${saldo} ${moeda}.`);
        });
    } else if (args[0] === 'vender' && args[1]) {
        const itemId = parseInt(args[1]);
        db.get(`SELECT inv.quantidade, i.* FROM inventario inv JOIN itens i ON inv.item_id = i.id WHERE inv.player_id = ? AND inv.item_id = ?`, [player.id, itemId], async (err, row) => {
            if (err || !row || row.quantidade < 1) return message.reply('Item não encontrado.');
            let valor = row.valor_venda;
            let novoOuro = player.ouro + valor;
            await updatePlayer(player.id, 'ouro', novoOuro);
            db.run(`UPDATE inventario SET quantidade = quantidade - 1 WHERE player_id = ? AND item_id = ?`, [player.id, itemId]);
            message.reply(`Você vendeu ${row.nome} por ${valor} ouro.`);
        });
    } else {
        db.all(`SELECT i.id, i.nome, l.preco, l.moeda_tipo FROM loja_rpg l JOIN itens i ON l.item_id = i.id`, (err, rows) => {
            let txt = '🏪 *LOJA DO JOGO*\nCompre: /loja comprar <id>\nVenda: /loja vender <id>\n\n';
            rows.forEach(r => txt += `${r.id} - ${r.nome} - ${r.preco} ${r.moeda_tipo}\n`);
            message.reply(txt);
        });
    }
}

// ========================
// SISTEMA DE EXPLORAÇÃO
// ========================
let exploracaoAtiva = new Map(); // playerId -> { interval, regiao }

async function cmdAndar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (exploracaoAtiva.has(player.id)) {
        message.reply('Você já está explorando. Use `/parar` para sair.');
        return;
    }
    if (player.fadiga < 10) {
        message.reply('Você está exausto. Descanse primeiro (`/descansar`).');
        return;
    }
    const regiao = args[0] || 'Floresta Sombria';
    await updatePlayer(player.id, 'localizacao', regiao);
    message.reply(`🌲 Você entrou na ${regiao} para explorar. A cada 5 minutos, eventos acontecerão. Use /parar para sair.`);
    
    // Inicia intervalo de eventos
    const interval = setInterval(async () => {
        const p = await getPlayer(telefone);
        if (!p || !exploracaoAtiva.has(p.id)) return;
        // Reduz fadiga a cada evento
        if (p.fadiga <= 0) {
            clearInterval(interval);
            exploracaoAtiva.delete(p.id);
            client.sendMessage(message.from, '😴 Você desmaiou de cansaço. Volte quando descansar.');
            return;
        }
        await updatePlayer(p.id, 'fadiga', p.fadiga - 2);
        
        // Evento aleatório
        const evento = rollDice(100);
        if (evento <= 30) { // monstro
            await iniciarCombateMonstro(p, message);
        } else if (evento <= 45) { // NPC
            await encontrarNPC(p, message);
        } else if (evento <= 60) { // item
            const itemId = 1; // Poção pequena
            db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, 1) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + 1`, [p.id, itemId]);
            client.sendMessage(message.from, `🍃 Você encontrou uma poção de Qi! Foi adicionada ao seu inventário.`);
        } else if (evento <= 70) { // outro jogador
            await encontrarJogador(p, message);
        } else {
            client.sendMessage(message.from, `🍃 Nada de especial aconteceu... Você continua explorando.`);
        }
    }, 300000); // 5 minutos
    
    exploracaoAtiva.set(player.id, { interval, regiao });
}

async function cmdParar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const expl = exploracaoAtiva.get(player.id);
    if (!expl) {
        message.reply('Você não está explorando no momento.');
        return;
    }
    clearInterval(expl.interval);
    exploracaoAtiva.delete(player.id);
    message.reply('🚶 Você parou de explorar e retornou à vila.');
}

// Funções auxiliares de combate e encontros
async function iniciarCombateMonstro(player, msg) {
    const monstros = ['Lobo Selvagem', 'Espírito de Árvore', 'Goblin Ladrão'];
    const monstro = monstros[Math.floor(Math.random()*monstros.length)];
    const hpMonstro = 50 + rollDice(30);
    // Armazena estado de combate
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
    // Busca NPC aleatório do banco
    db.get(`SELECT * FROM npcs WHERE localizacao = ? OR localizacao = 'global' ORDER BY RANDOM() LIMIT 1`, [player.localizacao], (err, npc) => {
        if (err || !npc) {
            client.sendMessage(msg.from, `👤 Um andarilho misterioso cruza seu caminho, mas desaparece na névoa.`);
            return;
        }
        client.sendMessage(msg.from, `👤 *${npc.nome}*: "${npc.dialogo_inicial}"\n\nOpções:\n1. Perguntar sobre missões\n2. Oferecer presente\n3. Seguir em frente`);
        // Armazenar estado de interação com NPC
        interacoesNPC.set(player.id, { npcId: npc.id, etapa: 0 });
    });
}

let interacoesNPC = new Map();

// Adicione estas funções ao seu bot.js (substituindo os placeholders)

async function cmdAtacar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) { message.reply('Você não está em combate.'); return; }
    
    let dano = player.forca + rollDice(15);
    if (batalha.tipo === 'monstro') {
        batalha.hp -= dano;
        message.reply(`⚔️ Você ataca o ${batalha.nome} e causa ${dano} de dano. HP restante: ${batalha.hp}/${batalha.hpMax}`);
        if (batalha.hp <= 0) {
            // Vitória
            const recompensaOuro = 10 + rollDice(20);
            await updatePlayer(player.id, 'ouro', player.ouro + recompensaOuro);
            message.reply(`🏆 Você derrotou ${batalha.nome}! Ganhou ${recompensaOuro} ouro.`);
            batalhasAtivas.delete(player.id);
            // Chance de drop de item
            if (rollDice(100) <= 30) {
                const itemId = 2; // poção de vida
                db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, 1) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + 1`, [player.id, itemId]);
                message.reply(`🎁 Drop: Poção de Vida!`);
            }
        } else {
            // Turno do monstro
            const danoMonstro = 5 + rollDice(10);
            let novoHP = player.hp_atual - danoMonstro;
            if (novoHP < 0) novoHP = 0;
            await updatePlayer(player.id, 'hp_atual', novoHP);
            message.reply(`🐺 ${batalha.nome} ataca e causa ${danoMonstro} de dano. Seu HP: ${novoHP}/${player.hp_maximo}`);
            if (novoHP <= 0) {
                message.reply(`💀 Você foi derrotado! Perdeu 10 ouro e acorda na vila.`);
                await updatePlayer(player.id, 'ouro', Math.max(0, player.ouro - 10));
                await updatePlayer(player.id, 'hp_atual', player.hp_maximo);
                batalhasAtivas.delete(player.id);
            }
        }
    } else if (batalha.tipo === 'pvp') {
        // Combate contra outro jogador
        const oponente = await getPlayerById(batalha.oponenteId);
        if (!oponente) { message.reply('Oponente não encontrado.'); batalhasAtivas.delete(player.id); return; }
        // Dano no oponente (simplificado)
        message.reply(`⚔️ Você ataca ${oponente.nome} e causa ${dano} de dano.`);
        // TODO: atualizar HP do oponente no banco e verificar morte
    }
}

async function cmdDefender(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) { message.reply('Você não está em combate.'); return; }
    message.reply(`🛡️ Você se defende, reduzindo o próximo dano pela metade.`);
    batalha.defendendo = true;
}

async function cmdFugir(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) { message.reply('Você não está em combate.'); return; }
    const chance = player.agilidade / 100;
    if (Math.random() < chance) {
        message.reply(`🏃 Você fugiu com sucesso!`);
        batalhasAtivas.delete(player.id);
    } else {
        message.reply(`😫 Você tentou fugir, mas falhou! O inimigo ataca.`);
        // Turno do inimigo
        if (batalha.tipo === 'monstro') {
            const danoMonstro = 5 + rollDice(10);
            let novoHP = player.hp_atual - danoMonstro;
            if (novoHP < 0) novoHP = 0;
            await updatePlayer(player.id, 'hp_atual', novoHP);
            message.reply(`🐺 ${batalha.nome} causa ${danoMonstro} de dano. HP: ${novoHP}/${player.hp_maximo}`);
        }
    }
}

async function cmdUsarTecnica(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    const batalha = batalhasAtivas.get(player.id);
    if (!batalha) { message.reply('Você não está em combate.'); return; }
    if (!args[0]) { message.reply('Uso: `/usartecnica <id_tecnica>`'); return; }
    const idTec = parseInt(args[0]);
    db.get(`SELECT t.* FROM tecnicas_aprendidas ta JOIN tecnicas t ON ta.tecnica_id = t.id WHERE ta.player_id = ? AND ta.tecnica_id = ? AND ta.aprendida = 1`, [player.id, idTec], async (err, row) => {
        if (err || !row) return message.reply('Você não aprendeu essa técnica ou ela não existe.');
        if (player.qi_atual < row.custo_qi) return message.reply(`Qi insuficiente. Necessário ${row.custo_qi}.`);
        let dano = row.poder_base + (row.tipo === 'Fisica' ? player.forca : player.inteligencia);
        await updatePlayer(player.id, 'qi_atual', player.qi_atual - row.custo_qi);
        message.reply(`✨ Você usou *${row.nome}* e causou ${dano} de dano!`);
        if (batalha.tipo === 'monstro') {
            batalha.hp -= dano;
            if (batalha.hp <= 0) {
                message.reply(`🏆 Você derrotou ${batalha.nome}!`);
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
    if (args.length < 2) { message.reply('Uso: `/criarseita <nome> <descricao>`'); return; }
    const nome = args[0];
    const desc = args.slice(1).join(' ');
    // Verifica se já existe seita com esse nome
    db.get(`SELECT id FROM seitas WHERE nome = ?`, [nome], async (err, row) => {
        if (row) return message.reply('Já existe uma seita com esse nome.');
        if (player.ouro < 1000 && player.cristais_esp < 1) {
            return message.reply('Você precisa de 1000 ouro ou 1 Cristal Espiritual para criar uma seita.');
        }
        // Cobrar custo
        if (player.ouro >= 1000) await updatePlayer(player.id, 'ouro', player.ouro - 1000);
        else await updatePlayer(player.id, 'cristais_esp', player.cristais_esp - 1);
        
        db.run(`INSERT INTO seitas (nome, descricao, lider_id, tesouro) VALUES (?, ?, ?, 0)`, [nome, desc, player.id], function(err) {
            if (err) return message.reply('Erro ao criar seita.');
            const seitaId = this.lastID;
            db.run(`INSERT INTO seita_membros (seita_id, player_id, cargo) VALUES (?, ?, 'lider')`, [seitaId, player.id]);
            message.reply(`🏛️ Seita *${nome}* criada com sucesso! Você é o líder. Use /convidar <id> para adicionar membros.`);
        });
    });
}

async function cmdConvidar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/convidar <id_do_jogador>`'); return; }
    const alvoId = args[0];
    // Verifica se é líder de alguma seita
    db.get(`SELECT s.* FROM seitas s WHERE s.lider_id = ?`, [player.id], async (err, seita) => {
        if (!seita) return message.reply('Você não é líder de nenhuma seita.');
        const alvo = await getPlayerByUniqueId(alvoId);
        if (!alvo) return message.reply('Jogador não encontrado.');
        // Envia convite (simplificado: apenas mensagem)
        client.sendMessage(alvo.telefone + '@c.us', `🏮 Você foi convidado para entrar na seita *${seita.nome}*. Use /aceitarconvite ${seita.id} para aceitar.`);
        message.reply(`Convite enviado para ${alvo.nome}.`);
    });
}

async function cmdAceitarConvite(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/aceitarconvite <id_seita>`'); return; }
    const seitaId = parseInt(args[0]);
    db.run(`INSERT INTO seita_membros (seita_id, player_id, cargo) VALUES (?, ?, 'membro')`, [seitaId, player.id], (err) => {
        if (err) message.reply('Erro ao entrar na seita. Talvez você já seja membro.');
        else message.reply('🎉 Você agora é membro da seita!');
    });
}

async function cmdSairSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.run(`DELETE FROM seita_membros WHERE player_id = ?`, [player.id], (err) => {
        if (err) message.reply('Erro ao sair.');
        else message.reply('Você saiu da seita.');
    });
}

async function cmdMissoes(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    // Busca missões da seita do jogador
    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (err, row) => {
        if (!row) return message.reply('Você não pertence a nenhuma seita.');
        db.all(`SELECT * FROM missoes_seita WHERE seita_id = ? AND status = 'aberta'`, [row.seita_id], (err, missoes) => {
            if (missoes.length === 0) return message.reply('Nenhuma missão disponível na seita.');
            let txt = '📜 *Missões da Seita*\n';
            missoes.forEach(m => txt += `\nID:${m.id} - Dificuldade:${m.dificuldade} - Recompensa:${m.recompensa_moeda} ouro - ${m.objetivo}`);
            message.reply(txt);
        });
    });
}

async function cmdAceitarMissao(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/aceitar <id_missao>`'); return; }
    const missaoId = parseInt(args[0]);
    db.run(`UPDATE missoes_seita SET status = 'em_andamento', aceita_por = ? WHERE id = ? AND status = 'aberta'`, [player.id, missaoId], function(err) {
        if (err || this.changes === 0) message.reply('Missão não disponível ou já aceita.');
        else message.reply('Missão aceita! Complete o objetivo e use `/completarmissao <id>` quando terminar.');
    });
}

async function cmdDoar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/doar <quantidade>` (em ouro)'); return; }
    const quant = parseInt(args[0]);
    if (player.ouro < quant) return message.reply('Você não tem ouro suficiente.');
    await updatePlayer(player.id, 'ouro', player.ouro - quant);
    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (err, row) => {
        if (row) db.run(`UPDATE seitas SET tesouro = tesouro + ? WHERE id = ?`, [quant, row.seita_id]);
    });
    message.reply(`Você doou ${quant} ouro para o tesouro da seita.`);
}

async function cmdTecnicaSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/tecnicaseita <id_tecnica>`'); return; }
    const tecId = parseInt(args[0]);
    // Verifica se é líder
    db.get(`SELECT s.id FROM seitas s WHERE s.lider_id = ?`, [player.id], (err, seita) => {
        if (!seita) return message.reply('Apenas o líder pode adicionar técnicas à seita.');
        // Adiciona técnica à biblioteca (tabela biblioteca_seita)
        db.run(`INSERT OR IGNORE INTO biblioteca_seita (seita_id, tecnica_id) VALUES (?, ?)`, [seita.id, tecId]);
        message.reply(`Técnica adicionada à biblioteca da seita.`);
    });
}

async function cmdBiblioteca(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (err, row) => {
        if (!row) return message.reply('Você não pertence a nenhuma seita.');
        db.all(`SELECT t.id, t.nome FROM biblioteca_seita bs JOIN tecnicas t ON bs.tecnica_id = t.id WHERE bs.seita_id = ?`, [row.seita_id], (err, tecs) => {
            if (!tecs.length) return message.reply('A biblioteca da seita está vazia.');
            let txt = '📚 *Biblioteca da Seita*\n';
            tecs.forEach(t => txt += `\n${t.id} - ${t.nome}`);
            message.reply(txt);
        });
    });
}

async function cmdAprenderSeita(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/aprender_seita <id_tecnica>`'); return; }
    const tecId = parseInt(args[0]);
    // Verifica se a técnica está na biblioteca da seita do jogador
    db.get(`SELECT seita_id FROM seita_membros WHERE player_id = ?`, [player.id], (err, membro) => {
        if (!membro) return message.reply('Você não está em uma seita.');
        db.get(`SELECT * FROM biblioteca_seita WHERE seita_id = ? AND tecnica_id = ?`, [membro.seita_id, tecId], async (err, bib) => {
            if (!bib) return message.reply('Essa técnica não está na biblioteca.');
            // Verifica se já não aprendeu
            db.get(`SELECT * FROM tecnicas_aprendidas WHERE player_id = ? AND tecnica_id = ?`, [player.id, tecId], async (err, exist) => {
                if (exist) return message.reply('Você já conhece essa técnica.');
                db.run(`INSERT INTO tecnicas_aprendidas (player_id, tecnica_id, compreensao, aprendida) VALUES (?, ?, 0, 0)`, [player.id, tecId]);
                message.reply(`Você começou a estudar a técnica *${tecId}*. Use /compreender para evoluir.`);
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
        message.reply(`Profissões disponíveis: Alquimista, Forjador, Médico, Mestre de Talismã, Mestre de Formações. Use /profissao escolher <nome>`);
    } else if (args[0] === 'escolher' && args[1]) {
        const prof = args[1].toLowerCase();
        const validas = ['alquimista', 'forjador', 'médico', 'mestre de talismã', 'mestre de formações'];
        if (!validas.includes(prof)) return message.reply('Profissão inválida.');
        await updatePlayer(player.id, 'profissao_principal', prof);
        await updatePlayer(player.id, 'nivel_profissao', 1);
        // Inserir na tabela profissoes
        db.run(`INSERT OR REPLACE INTO profissoes (player_id, profissao, nivel, experiencia) VALUES (?, ?, 1, 0)`, [player.id, prof]);
        message.reply(`Você agora é um ${prof}. Use /craftar para fabricar itens.`);
    } else {
        message.reply(`Sua profissão: ${player.profissao_principal || 'nenhuma'} (nível ${player.nivel_profissao || 0}). Use /profissao escolher <nome> para mudar.`);
    }
}

async function cmdCraftar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!player.profissao_principal) return message.reply('Você não tem uma profissão. Escolha uma com `/profissao escolher`.');
    if (!args[0]) return message.reply('Uso: `/craftar <item>` (ex: poção, espada)');
    const itemNome = args[0];
    // Lógica simplificada: verifica materiais no inventário
    // Por brevidade, vamos apenas simular
    message.reply(`🧪 Você tentou craftar ${itemNome}, mas o sistema de crafting ainda está em desenvolvimento detalhado. Por hora, use /loja para comprar.`);
}

async function cmdSubirProfissao(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!player.profissao_principal) return message.reply('Você não tem profissão.');
    // Gasta XP para subir de nível
    db.get(`SELECT * FROM profissoes WHERE player_id = ?`, [player.id], async (err, row) => {
        if (!row) return;
        const xpNecessario = row.nivel * 100;
        if (row.experiencia >= xpNecessario) {
            const novoNivel = row.nivel + 1;
            db.run(`UPDATE profissoes SET nivel = ?, experiencia = ? WHERE player_id = ?`, [novoNivel, row.experiencia - xpNecessario, player.id]);
            await updatePlayer(player.id, 'nivel_profissao', novoNivel);
            message.reply(`🎉 Parabéns! Sua profissão agora é nível ${novoNivel}.`);
        } else {
            message.reply(`Você precisa de ${xpNecessario - row.experiencia} XP para subir de nível. Ganhe XP craftando.`);
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
        message.reply(txt);
    });
}

async function cmdAdicionarAmigo(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/adicionaramigo <id_do_jogador>`'); return; }
    const alvoUnique = args[0];
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return message.reply('Jogador não encontrado.');
    db.run(`INSERT INTO amigos_inimigos (player_id, alvo_id, tipo) VALUES (?, ?, 'amigo')`, [player.id, alvo.id], (err) => {
        if (err) message.reply('Já são amigos ou erro.');
        else message.reply(`🤝 ${alvo.nome} agora é seu amigo!`);
    });
}

async function cmdInimigo(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/inimigo <id_do_jogador>`'); return; }
    const alvoUnique = args[0];
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return message.reply('Jogador não encontrado.');
    db.run(`INSERT INTO amigos_inimigos (player_id, alvo_id, tipo) VALUES (?, ?, 'inimigo')`, [player.id, alvo.id], (err) => {
        if (err) message.reply('Já é inimigo ou erro.');
        else message.reply(`⚠️ Você declarou ${alvo.nome} como inimigo!`);
    });
}

async function cmdConversar(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (args.length < 2) { message.reply('Uso: `/conversar <id_do_jogador> <mensagem>`'); return; }
    const alvoUnique = args[0];
    const texto = args.slice(1).join(' ');
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return message.reply('Jogador não encontrado.');
    // Verifica se o alvo está online (simplificado: se tiver sessão ativa)
    // Salva mensagem no banco
    db.run(`INSERT INTO mensagens_chat (de_id, para_id, mensagem, lida) VALUES (?, ?, ?, 0)`, [player.id, alvo.id, texto]);
    message.reply(`Mensagem enviada para ${alvo.nome}.`);
    // Se o alvo estiver online, tenta entregar imediatamente (opcional)
}

async function cmdLerChat(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT m.mensagem, p.nome as de_nome FROM mensagens_chat m JOIN players p ON m.de_id = p.id WHERE m.para_id = ? AND m.lida = 0`, [player.id], (err, rows) => {
        if (err || !rows.length) return message.reply('Nenhuma mensagem nova.');
        let txt = '📬 *Mensagens não lidas*\n';
        rows.forEach(r => txt += `\n${r.de_nome}: ${r.mensagem}`);
        db.run(`UPDATE mensagens_chat SET lida = 1 WHERE para_id = ?`, [player.id]);
        message.reply(txt);
    });
}

// ========================
// MISSÕES PESSOAIS
// ========================

async function cmdCriarMissaoPessoal(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (args.length < 2) { message.reply('Uso: `/criarmissao <descrição> <recompensa_ouro>`'); return; }
    const recompensa = parseInt(args[args.length-1]);
    const desc = args.slice(0, -1).join(' ');
    if (player.ouro < recompensa) return message.reply('Você não tem ouro suficiente para pagar essa recompensa.');
    await updatePlayer(player.id, 'ouro', player.ouro - recompensa);
    db.run(`INSERT INTO missoes_pessoais (criador_id, descricao, recompensa_moeda, status) VALUES (?, ?, ?, 'aberta')`, [player.id, desc, recompensa], function(err) {
        if (err) message.reply('Erro ao criar missão.');
        else message.reply(`✅ Missão criada! ID: ${this.lastID}. Outros jogadores podem aceitá-la.`);
    });
}

async function cmdMissoesDisponiveis(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    db.all(`SELECT mp.id, mp.descricao, mp.recompensa_moeda, p.nome as criador FROM missoes_pessoais mp JOIN players p ON mp.criador_id = p.id WHERE mp.status = 'aberta' AND mp.criador_id != ?`, [player.id], (err, rows) => {
        if (!rows.length) return message.reply('Nenhuma missão disponível.');
        let txt = '📋 *Missões de outros jogadores*\n';
        rows.forEach(r => txt += `\nID:${r.id} - ${r.descricao} - Recompensa: ${r.recompensa_moeda} ouro - Criador: ${r.criador}`);
        message.reply(txt);
    });
}

async function cmdAceitarMissaoPessoal(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/aceitarmissao <id_missao>`'); return; }
    const missaoId = parseInt(args[0]);
    db.run(`UPDATE missoes_pessoais SET status = 'em_andamento' WHERE id = ? AND status = 'aberta'`, [missaoId], function(err) {
        if (err || this.changes === 0) message.reply('Missão não disponível.');
        else message.reply('Missão aceita! Complete o objetivo e use `/completarmissao <id>` quando terminar.');
    });
}

async function cmdCompletarMissaoPessoal(args, message, telefone) {
    const player = await ensurePlayerExists(telefone, message);
    if (!player) return;
    if (!args[0]) { message.reply('Uso: `/completarmissao <id_missao>`'); return; }
    const missaoId = parseInt(args[0]);
    db.get(`SELECT * FROM missoes_pessoais WHERE id = ? AND status = 'em_andamento' AND criador_id != ?`, [missaoId, player.id], async (err, missao) => {
        if (!missao) return message.reply('Missão não encontrada ou não está em andamento.');
        // Recompensa
        await updatePlayer(player.id, 'ouro', player.ouro + missao.recompensa_moeda);
        db.run(`UPDATE missoes_pessoais SET status = 'concluida' WHERE id = ?`, [missaoId]);
        message.reply(`🎉 Missão concluída! Você recebeu ${missao.recompensa_moeda} ouro.`);
        // Notificar criador
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
        message.reply(txt);
    });
}

// ========================
// EVENTOS MUNDIAIS
// ========================

async function cmdEventos(args, message, telefone) {
    db.all(`SELECT * FROM eventos_mundiais WHERE ativo = 1 AND datetime(data_inicio) <= datetime('now') AND datetime(data_fim) >= datetime('now')`, (err, rows) => {
        if (!rows.length) return message.reply('No momento não há eventos mundiais ativos.');
        let txt = '🌍 *Eventos Mundiais Ativos*\n';
        rows.forEach(e => txt += `\n*${e.nome}*: ${e.descricao}\nBônus: ${e.bonus}\nVálido até ${e.data_fim}`);
        message.reply(txt);
    });
}

// Ranking
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
        message.reply(txt);
    });
}

// ========================
// COMANDOS DE ADMIN (APENAS DONO)
// ========================

async function cmdBanir(args, message, telefone) {
    if (telefone !== DONO_NUMERO) return message.reply('Apenas o dono pode usar este comando.');
    if (!args[0]) return message.reply('Uso: `/banir <id_do_jogador> [motivo]`');
    const alvoUnique = args[0];
    const motivo = args.slice(1).join(' ') || 'sem motivo';
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return message.reply('Jogador não encontrado.');
    db.run(`UPDATE players SET banido = 1 WHERE id = ?`, [alvo.id]);
    message.reply(`Jogador ${alvo.nome} foi banido. Motivo: ${motivo}`);
    client.sendMessage(alvo.telefone + '@c.us', `⚠️ Você foi banido do jogo. Motivo: ${motivo}`);
}

async function cmdDarItem(args, message, telefone) {
    if (telefone !== DONO_NUMERO) return message.reply('Apenas o dono.');
    if (args.length < 2) return message.reply('Uso: `/daritem <id_jogador> <id_item> <quantidade>`');
    const alvoUnique = args[0];
    const itemId = parseInt(args[1]);
    const qtd = parseInt(args[2]) || 1;
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return message.reply('Jogador não encontrado.');
    db.run(`INSERT INTO inventario (player_id, item_id, quantidade) VALUES (?, ?, ?) ON CONFLICT(player_id, item_id) DO UPDATE SET quantidade = quantidade + ?`, [alvo.id, itemId, qtd, qtd]);
    message.reply(`Item ${itemId} x${qtd} entregue a ${alvo.nome}.`);
}

async function cmdResetar(args, message, telefone) {
    if (telefone !== DONO_NUMERO) return message.reply('Apenas o dono.');
    if (!args[0]) return message.reply('Uso: `/resetar <id_jogador>`');
    const alvoUnique = args[0];
    const alvo = await getPlayerByUniqueId(alvoUnique);
    if (!alvo) return message.reply('Jogador não encontrado.');
    db.run(`DELETE FROM players WHERE id = ?`, [alvo.id]);
    db.run(`DELETE FROM inventario WHERE player_id = ?`, [alvo.id]);
    message.reply(`Jogador ${alvo.nome} foi resetado.`);
}

async function cmdAnuncio(args, message, telefone) {
    if (telefone !== DONO_NUMERO) return message.reply('Apenas o dono.');
    if (!args.length) return message.reply('Uso: `/anuncio <texto>`');
    const texto = args.join(' ');
    // Envia para todos os jogadores cadastrados
    db.all(`SELECT telefone FROM players`, (err, rows) => {
        rows.forEach(row => {
            client.sendMessage(row.telefone + '@c.us', `📢 *ANÚNCIO GLOBAL*: ${texto}`);
        });
        message.reply('Anúncio enviado a todos os jogadores.');
    });
}

async function processCommand(message) {
    const body = message.body.slice(1).trim();
    const parts = body.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const telefone = message.from.replace('@c.us', '');

    const commands = {
        'registrar': cmdRegistrar, 'perfil': cmdPerfil, 'mudaraparencia': cmdMudarAparencia,
        'cultivar': cmdCultivar, 'tecnicas': cmdTecnicas, 'compreender': cmdCompreender, 'aprender': cmdAprender,
        'inventario': cmdInventario, 'usar': cmdUsarItem, 'loja': cmdLoja,
        'menu': cmdMenu, 'ajuda': cmdAjuda, 'descansar': cmdDescansar, 'changelog': cmdChangelog,
        'andar': cmdAndar, 'parar': cmdParar, 'dominio': cmdDominio,
        'criarseita': cmdCriarSeita, 'convidar': cmdConvidar, 'sairseita': cmdSairSeita,
        'missoes': cmdMissoes, 'aceitar': cmdAceitarMissao, 'doar': cmdDoar,
        'tecnicaseita': cmdTecnicaSeita, 'biblioteca': cmdBiblioteca,
        'profissao': cmdProfissao, 'craftar': cmdCraftar, 'subirprofissao': cmdProfissao,
        'amigos': cmdAmigos, 'adicionaramigo': cmdAdicionarAmigo, 'inimigo': cmdInimigo,
        'conversar': cmdConversar, 'lerchat': cmdLerChat,
        'criarmissao': cmdCriarMissaoPessoal, 'minhasmissoes': cmdMinhasMissoes,
        'missoesdisponiveis': cmdMissoesDisponiveis, 'aceitarmissao': cmdAceitarMissaoPessoal,
        'completarmissao': cmdCompletarMissaoPessoal,
        'eventos': cmdEventos, 'ranking': cmdRanking,
        'banir': cmdBanir, 'daritem': cmdDarItem, 'resetar': cmdResetar, 'anuncio': cmdAnuncio
		'guia': cmdGuia,
		'status': cmdPerfil,      // alias
		'atributos': cmdPerfil,   // alias
		'romper': cmdRomper,
		'jogadores': cmdJogadores,
		'encontrar': cmdEncontrar,
		'trocar': cmdTrocar,
		'duelar': cmdDuelar,
		'mercado': cmdMercadoGlobal,
    };
    if (commands[cmd]) await commands[cmd](args, message, telefone);
    else await message.reply('Comando desconhecido. Use `/menu`.');
}

client.initialize();
