-- Tabela de jogadores
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unique_id TEXT UNIQUE,
    nome TEXT,
    sexo TEXT,
    raca TEXT,
    clan TEXT,
    raiz_espiritual TEXT,
    elementos TEXT,
    corpo_divino TEXT,
    orfao INTEGER,
    alinhamento TEXT,
    karma INTEGER,
    reputacao INTEGER,
    fortuna INTEGER,
    nivel_fisico INTEGER,
    sub_fisico INTEGER,
    nivel_espiritual INTEGER,
    sub_espiritual INTEGER,
    qi_atual INTEGER,
    qi_maximo INTEGER,
    hp_atual INTEGER,
    hp_maximo INTEGER,
    forca INTEGER,
    vigor INTEGER,
    defesa INTEGER,
    inteligencia INTEGER,
    espirito INTEGER,
    agilidade INTEGER,
    fadiga INTEGER,
    meridianos_abertos TEXT,
    profissao_principal TEXT,
    nivel_profissao INTEGER,
    ouro INTEGER,
    perolas_esp INTEGER,
    cristais_esp INTEGER,
    essencia_imortal INTEGER,
    localizacao TEXT,
    avatar_url TEXT,
    telefone TEXT UNIQUE,
    online INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Domínios disponíveis no jogo
CREATE TABLE IF NOT EXISTS dominios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE,
    descricao TEXT,
    andares INTEGER DEFAULT 5,
    nivel_minimo INTEGER DEFAULT 1,
    recompensa_base_ouro INTEGER DEFAULT 100,
    item_raro_id INTEGER
);

-- Instâncias de domínio por jogador (progresso)
CREATE TABLE IF NOT EXISTS dominio_instancias (
    player_id INTEGER,
    dominio_id INTEGER,
    andar_atual INTEGER DEFAULT 1,
    status TEXT DEFAULT 'em_andamento', -- 'em_andamento', 'concluido'
    data_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(player_id) REFERENCES players(id),
    FOREIGN KEY(dominio_id) REFERENCES dominios(id),
    PRIMARY KEY (player_id, dominio_id)
);

-- Inserir domínios iniciais
INSERT OR IGNORE INTO dominios (nome, descricao, andares, nivel_minimo, recompensa_base_ouro) VALUES
('Caverna dos Espíritos', 'Uma caverna escura habitada por espíritos errantes.', 3, 1, 50),
('Templo Antigo', 'Ruínas de um templo guardado por golems de pedra.', 5, 3, 150),
('Pico da Tempestade', 'No topo da montanha, um dragão de relâmpago aguarda.', 7, 5, 300);
-- Técnicas disponíveis no jogo
CREATE TABLE IF NOT EXISTS tecnicas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    tipo TEXT,
    elementos TEXT,
    descricao TEXT,
    poder_base INTEGER,
    custo_qi INTEGER,
    efeito TEXT
);

-- Técnicas aprendidas pelos jogadores
CREATE TABLE IF NOT EXISTS tecnicas_aprendidas (
    player_id INTEGER,
    tecnica_id INTEGER,
    compreensao INTEGER,
    aprendida INTEGER,
    FOREIGN KEY(player_id) REFERENCES players(id),
    FOREIGN KEY(tecnica_id) REFERENCES tecnicas(id)
);

-- Itens do jogo
CREATE TABLE IF NOT EXISTS itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    tipo TEXT,
    raridade TEXT,
    efeito TEXT,
    valor_venda INTEGER,
    valor_compra INTEGER,
    moeda_tipo TEXT DEFAULT 'ouro'
);

-- Inventário dos jogadores
CREATE TABLE IF NOT EXISTS inventario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER,
    item_id INTEGER,
    quantidade INTEGER,
    FOREIGN KEY(player_id) REFERENCES players(id),
    FOREIGN KEY(item_id) REFERENCES itens(id)
);

-- Equipamentos ativos
CREATE TABLE IF NOT EXISTS equipamentos (
    player_id INTEGER,
    item_id INTEGER,
    slot TEXT,
    FOREIGN KEY(player_id) REFERENCES players(id),
    FOREIGN KEY(item_id) REFERENCES itens(id)
);

-- Seitas
CREATE TABLE IF NOT EXISTS seitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE,
    descricao TEXT,
    lider_id INTEGER,
    tesouro INTEGER DEFAULT 0,
    nivel INTEGER DEFAULT 1
);

-- Membros de seitas
CREATE TABLE IF NOT EXISTS seita_membros (
    seita_id INTEGER,
    player_id INTEGER,
    cargo TEXT,
    FOREIGN KEY(seita_id) REFERENCES seitas(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);

-- Missões de seita
CREATE TABLE IF NOT EXISTS missoes_seita (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seita_id INTEGER,
    criador_id INTEGER,
    dificuldade TEXT,
    objetivo TEXT,
    recompensa_moeda INTEGER,
    recompensa_item_id INTEGER,
    status TEXT,
    aceita_por INTEGER,
    FOREIGN KEY(seita_id) REFERENCES seitas(id)
);

-- Missões pessoais (players criam)
CREATE TABLE IF NOT EXISTS missoes_pessoais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    criador_id INTEGER,
    descricao TEXT,
    recompensa_moeda INTEGER,
    item_necessario_id INTEGER,
    quantidade_necessaria INTEGER,
    status TEXT,
    FOREIGN KEY(criador_id) REFERENCES players(id)
);

-- Amigos e inimigos
CREATE TABLE IF NOT EXISTS amigos_inimigos (
    player_id INTEGER,
    alvo_id INTEGER,
    tipo TEXT,
    FOREIGN KEY(player_id) REFERENCES players(id),
    FOREIGN KEY(alvo_id) REFERENCES players(id)
);

-- Mensagens privadas offline
CREATE TABLE IF NOT EXISTS mensagens_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    de_id INTEGER,
    para_id INTEGER,
    mensagem TEXT,
    lida INTEGER DEFAULT 0,
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(de_id) REFERENCES players(id),
    FOREIGN KEY(para_id) REFERENCES players(id)
);

-- Eventos mundiais
CREATE TABLE IF NOT EXISTS eventos_mundiais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    descricao TEXT,
    ativo INTEGER,
    data_inicio DATETIME,
    data_fim DATETIME,
    bonus TEXT
);

-- Profissões (níveis e XP)
CREATE TABLE IF NOT EXISTS profissoes (
    player_id INTEGER,
    profissao TEXT,
    nivel INTEGER,
    experiencia INTEGER,
    FOREIGN KEY(player_id) REFERENCES players(id)
);

-- Mercado de players (itens à venda)
CREATE TABLE IF NOT EXISTS mercado_player (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendedor_id INTEGER,
    item_id INTEGER,
    quantidade INTEGER,
    preco_unitario INTEGER,
    moeda_tipo TEXT,
    data_postagem DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(vendedor_id) REFERENCES players(id),
    FOREIGN KEY(item_id) REFERENCES itens(id)
);

-- NPCs
CREATE TABLE IF NOT EXISTS npcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    localizacao TEXT,
    dialogo_inicial TEXT,
    opcoes TEXT,
    missao_id INTEGER
);

-- Loja do RPG (itens fixos)
CREATE TABLE IF NOT EXISTS loja_rpg (
    item_id INTEGER,
    moeda_tipo TEXT,
    preco INTEGER,
    FOREIGN KEY(item_id) REFERENCES itens(id)
);

-- Changelog
CREATE TABLE IF NOT EXISTS changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    versao TEXT,
    data DATE,
    texto TEXT
);

CREATE TABLE IF NOT EXISTS biblioteca_seita (
    seita_id INTEGER,
    tecnica_id INTEGER,
    FOREIGN KEY(seita_id) REFERENCES seitas(id),
    FOREIGN KEY(tecnica_id) REFERENCES tecnicas(id)
);

-- Inserir algumas técnicas iniciais
INSERT OR IGNORE INTO tecnicas (nome, tipo, elementos, descricao, poder_base, custo_qi, efeito) VALUES
('Meditação da Respiração Primordial', 'Meditacao', 'Água', 'Técnica básica de meditação para cultivar Qi.', 0, 0, 'permite_cultivar'),
('Socorro do Tigre de Ferro', 'Fisica', 'Metal', 'Golpe direto com força de metal.', 25, 10, 'dano'),
('Chama da Fênix', 'Espiritual', 'Fogo', 'Invoca chamas sagradas.', 40, 20, 'dano'),
('Escudo da Terra Firme', 'Defensiva', 'Terra', 'Aumenta defesa temporariamente.', 0, 15, 'defesa');

-- Inserir alguns itens básicos na loja
INSERT OR IGNORE INTO itens (nome, tipo, raridade, efeito, valor_venda, valor_compra, moeda_tipo) VALUES
('Poção de Qi Pequena', 'pilula', 'Comum', 'Restaura 50 Qi', 5, 10, 'ouro'),
('Poção de Vida Pequena', 'pilula', 'Comum', 'Restaura 50 HP', 5, 10, 'ouro'),
('Pílula de Reversão do Destino', 'especial', 'Raro', 'Re-roll raça e clã', 500, 1000, 'cristais_esp');

-- Inserir na loja_rpg
INSERT OR IGNORE INTO loja_rpg (item_id, moeda_tipo, preco) VALUES
(1, 'ouro', 10),
(2, 'ouro', 10),
(3, 'cristais_esp', 1);

-- Inserir changelog inicial
INSERT OR IGNORE INTO changelog (versao, data, texto) VALUES
('v1.0.0', date('now'), 'Lançamento oficial do Chasing Immortality. Sistemas: registro, cultivo, combate, seitas, mercado, NPCs, eventos.');


-- ========================
-- ETAPA 3 - MUNDO VIVO / IA OPCIONAL
-- ========================
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventario_player_item_unique ON inventario(player_id, item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipamentos_player_slot_unique ON equipamentos(player_id, slot);
CREATE UNIQUE INDEX IF NOT EXISTS idx_biblioteca_seita_unique ON biblioteca_seita(seita_id, tecnica_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_amigos_inimigos_unique ON amigos_inimigos(player_id, alvo_id, tipo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_npcs_nome_local_unique ON npcs(nome, localizacao);

CREATE TABLE IF NOT EXISTS npc_profiles (
    npc_id INTEGER PRIMARY KEY,
    titulo TEXT,
    personalidade TEXT,
    arquetipo TEXT,
    estilo TEXT,
    prompt_base TEXT,
    FOREIGN KEY(npc_id) REFERENCES npcs(id)
);

CREATE TABLE IF NOT EXISTS npc_relacoes (
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
);

CREATE TABLE IF NOT EXISTS npc_quests (
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
);

CREATE TABLE IF NOT EXISTS npc_quest_progress (
    player_id INTEGER,
    quest_id INTEGER,
    status TEXT DEFAULT 'oferecida',
    progresso INTEGER DEFAULT 0,
    branch_escolhida TEXT DEFAULT 'pragmatica',
    data_inicio TEXT DEFAULT CURRENT_TIMESTAMP,
    data_conclusao TEXT,
    PRIMARY KEY (player_id, quest_id)
);

CREATE TABLE IF NOT EXISTS entity_portraits (
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
);

CREATE TABLE IF NOT EXISTS sect_relations (
    fac_a TEXT,
    fac_b TEXT,
    relacao INTEGER DEFAULT 0,
    descricao TEXT,
    PRIMARY KEY (fac_a, fac_b)
);

CREATE TABLE IF NOT EXISTS player_bonds (
    player_id INTEGER,
    bond_type TEXT,
    bond_key TEXT,
    bond_name TEXT,
    data_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, bond_type)
);

CREATE TABLE IF NOT EXISTS rumor_cache (
    scope_key TEXT,
    rumor_date TEXT,
    rumors_json TEXT,
    PRIMARY KEY (scope_key, rumor_date)
);

INSERT OR IGNORE INTO npcs (nome, localizacao, dialogo_inicial, opcoes, missao_id) VALUES
('Velho Lin', 'Floresta Sombria', 'O velho apoia-se no cajado de bambu e observa sua respiração, como se lesse os meridianos da sua alma.', '[]', NULL),
('Madame Xue', 'Vila Inicial', 'O perfume do incenso e do chá de ameixa envolve o pátio enquanto a mercadora sorri como quem esconde três segredos.', '[]', NULL),
('Monge Shen', 'Templo Antigo', 'Cada pedra do templo parece ecoar sutras antigos quando o monge cruza as mãos diante do peito.', '[]', NULL),
('Bai Qinghe', 'global', 'Um jovem de sobrancelhas afiadas fita você como se esta fosse apenas mais uma página da história que pretende dominar.', '[]', NULL);

INSERT OR IGNORE INTO itens (nome, tipo, raridade, efeito, valor_venda, valor_compra, moeda_tipo) VALUES
('Erva do Orvalho Noturno', 'material', 'Comum', 'Ingrediente espiritual', 8, 16, 'ouro'),
('Fragmento de Osso Espiritual', 'material', 'Incomum', 'Ingrediente de bestas espirituais', 12, 25, 'ouro'),
('Selo de Jade Partido', 'material', 'Raro', 'Vestígio de artefato antigo', 35, 70, 'ouro');

INSERT OR IGNORE INTO sect_relations (fac_a, fac_b, relacao, descricao) VALUES
('Wudang', 'Tang', -10, 'A tensão é fria, mas controlada.'),
('Tang', 'Wudang', -10, 'A tensão é fria, mas controlada.'),
('Wudang', 'Murong', 12, 'Uma aliança cautelosa mantém as estradas seguras.'),
('Murong', 'Wudang', 12, 'Uma aliança cautelosa mantém as estradas seguras.'),
('Shaolin', 'Emei', 18, 'As duas facções cooperam contra artes proibidas.'),
('Emei', 'Shaolin', 18, 'As duas facções cooperam contra artes proibidas.'),
('Namgung', 'Tang', -18, 'Velhas dívidas mancham as relações.'),
('Tang', 'Namgung', -18, 'Velhas dívidas mancham as relações.'),
('Pavilhão da Lua Sangrenta', 'Shaolin', -35, 'Sangue e sutras jamais concordaram.'),
('Shaolin', 'Pavilhão da Lua Sangrenta', -35, 'Sangue e sutras jamais concordaram.'),
('Senda Demoníaca do Norte', 'Wudang', -40, 'O conflito é quase inevitável.'),
('Wudang', 'Senda Demoníaca do Norte', -40, 'O conflito é quase inevitável.');

INSERT OR IGNORE INTO changelog (versao, data, texto) VALUES
('v3.0.0', date('now'), 'Etapa 3: memória de NPC, rumores dinâmicos, eventos narrativos, mestres, rivais, política de seitas e retratos persistentes.');
