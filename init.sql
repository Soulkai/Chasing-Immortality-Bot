-- =====================================================
-- TABELA DE LOCAIS PRINCIPAIS (Cidades, Reinos, Impérios)
-- =====================================================
CREATE TABLE IF NOT EXISTS locais_mae (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE,
    tipo TEXT CHECK(tipo IN ('cidade', 'reino', 'imperio')),
    descricao TEXT,
    nivel_minimo INTEGER DEFAULT 1,
    nivel_maximo INTEGER DEFAULT 99
);

-- Inserir 5 CIDADES
INSERT OR IGNORE INTO locais_mae (nome, tipo, descricao, nivel_minimo, nivel_maximo) VALUES
('Cidade das Águas Cristalinas', 'cidade', 'Cidade portuária com fontes termais e mercadores de pérolas.', 1, 30),
('Cidade do Vento Eterno', 'cidade', 'Construída no topo de um penhasco, ventos constantes trazem energia espiritual.', 5, 40),
('Cidade da Lua Prateada', 'cidade', 'Cidade noturna iluminada por cristais que brilham como a lua.', 10, 50),
('Cidade do Trovão', 'cidade', 'Cidade cercada por tempestades, abriga forjadores renomados.', 15, 60),
('Cidade de Jade', 'cidade', 'Cidade neutra, centro comercial de artefatos e pílulas.', 1, 70);

-- Inserir 5 REINOS
INSERT OR IGNORE INTO locais_mae (nome, tipo, descricao, nivel_minimo, nivel_maximo) VALUES
('Reino das Bestas Divinas', 'reino', 'Terra onde bestas espirituais vagam livremente, protegidas por clãs antigos.', 10, 60),
('Reino dos Mortos-Vivos', 'reino', 'Reino amaldiçoado, coberto por névoa negra e habitado por espíritos errantes.', 20, 80),
('Reino dos Elfos da Noite', 'reino', 'Floresta perpétua onde elfos das sombras praticam artes marciais velozes.', 15, 70),
('Reino das Montanhas Flamejantes', 'reino', 'Território vulcânico, rico em minérios e metais raros.', 25, 85),
('Reino dos Ventos Uivantes', 'reino', 'Planícies abertas onde tribos nômades dominam o cultivo físico.', 5, 50);

-- Inserir 5 IMPÉRIOS
INSERT OR IGNORE INTO locais_mae (nome, tipo, descricao, nivel_minimo, nivel_maximo) VALUES
('Império Celestial', 'imperio', 'O império mais poderoso dos cultivadores justos, com seitas ortodoxas.', 30, 100),
('Império Demoníaco', 'imperio', 'Domínio dos cultivadores demoníacos, onde a lei do mais forte impera.', 40, 120),
('Império das Nuvens', 'imperio', 'Império flutuante nas nuvens, governado por sábios imortais.', 50, 150),
('Império das Sombras', 'imperio', 'Império subterrâneo, lar de assassinos e ladrões.', 35, 110),
('Império do Dragão', 'imperio', 'Antigo império onde dragões e humanos coexistem.', 45, 140);

-- =====================================================
-- TABELA DE REGIÕES (cada local principal tem suas sub-regiões)
-- =====================================================
CREATE TABLE IF NOT EXISTS regioes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE,
    descricao TEXT,
    nivel_minimo INTEGER,
    nivel_maximo INTEGER,
    perigo TEXT CHECK(perigo IN ('baixo', 'médio', 'alto', 'extremo')),
    local_mae_id INTEGER,
    FOREIGN KEY(local_mae_id) REFERENCES locais_mae(id)
);

-- ========== CIDADE DAS ÁGUAS CRISTALINAS (id 1) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Praia dos Caranguejos', 'Areias brancas habitadas por caranguejos gigantes.', 1, 8, 'baixo', 1),
('Recife dos Corais', 'Recife submerso com criaturas aquáticas.', 3, 12, 'médio', 1),
('Caverna das Pérolas Negras', 'Caverna úmida onde pérolas escuras são encontradas.', 5, 18, 'médio', 1),
('Ilha da Bruma', 'Ilha envolta por névoa, lar de espíritos aquáticos.', 10, 25, 'alto', 1),
('Templo Submerso', 'Ruínas antigas debaixo d''água, guardadas por serpentes marinhas.', 20, 35, 'extremo', 1),
('Baía dos Náufragos', 'Local onde navios naufragaram, cheio de fantasmas.', 15, 30, 'alto', 1);

-- ========== CIDADE DO VENTO ETERNO (id 2) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Planalto dos Falcões', 'Altitude elevada, ninhos de aves de rapina.', 5, 12, 'médio', 2),
('Gruta dos Ventos Uivantes', 'Caverna onde o vento produz sons assustadores.', 8, 18, 'médio', 2),
('Pico da Águia', 'Topo da montanha, território de águias gigantes.', 12, 25, 'alto', 2),
('Vale das Nuvens', 'Vale sempre coberto por nuvens baixas.', 15, 30, 'alto', 2),
('Céu Rachado', 'Fenda no céu que leva a um domínio de vento puro.', 25, 40, 'extremo', 2);

-- ========== CIDADE DA LUA PRATEADA (id 3) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Bosque dos Vaga-lumes', 'Floresta iluminada por insetos brilhantes.', 10, 18, 'baixo', 3),
('Cemitério dos Esquecidos', 'Terreno sagrado onde almas penam.', 12, 25, 'médio', 3),
('Lago dos Sonhos', 'Lago cujas águas induzem visões.', 18, 30, 'alto', 3),
('Templo da Lua Negra', 'Ruínas de um culto noturno.', 22, 38, 'alto', 3),
('Abismo Prateado', 'Ravina profunda com cristais que brilham.', 30, 45, 'extremo', 3);

-- ========== CIDADE DO TROVÃO (id 4) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Campo dos Relâmpagos', 'Planície onde raios caem com frequência.', 15, 22, 'médio', 4),
('Montanha do Trovão', 'Montanha coberta por nuvens de tempestade.', 18, 30, 'alto', 4),
('Forja dos Deuses', 'Caverna com magma e metais raros.', 22, 38, 'alto', 4),
('Vale dos Raios', 'Vale onde relâmpagos atingem o chão constantemente.', 28, 45, 'extremo', 4),
('Pico Trovejante', 'Ponto mais alto, lar de elementais de trovão.', 35, 55, 'extremo', 4);

-- ========== CIDADE DE JADE (id 5) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Terraço dos Mercadores', 'Área segura para comércio.', 1, 10, 'baixo', 5),
('Jardim Suspenso', 'Jardins flutuantes com plantas raras.', 5, 20, 'baixo', 5),
('Mercado Negro', 'Local ilegal onde se compram itens proibidos.', 15, 30, 'médio', 5),
('Arena dos Lutadores', 'Arena onde lutadores competem.', 20, 40, 'médio', 5),
('Torre do Sábio', 'Torre de um ancião que guarda conhecimento secreto.', 30, 50, 'alto', 5),
('Portão do Éter', 'Portal para outras dimensões (perigoso).', 40, 60, 'extremo', 5);

-- ========== REINO DAS BESTAS DIVINAS (id 6) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Clareira dos Espíritos', 'Campo onde bestas sagradas pastam.', 10, 20, 'baixo', 6),
('Floresta dos Ursos', 'Território de ursos espirituais.', 15, 28, 'médio', 6),
('Lago das Fênix', 'Lago onde fênix se banham.', 22, 38, 'alto', 6),
('Caverna do Tigre Branco', 'Covil de um tigre lendário.', 30, 48, 'alto', 6),
('Cume da Garça Dourada', 'Pico habitado por garças imortais.', 40, 58, 'extremo', 6);

-- ========== REINO DOS MORTOS-VIVOS (id 7) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Pântano da Agonia', 'Pântano com névoa tóxica e zumbis.', 20, 30, 'médio', 7),
('Campo dos Ossos', 'Planície coberta de esqueletos.', 22, 35, 'médio', 7),
('Masmorra dos Lamentos', 'Prisão subterrânea de almas penadas.', 28, 42, 'alto', 7),
('Castelo do Vampiro', 'Castelo habitado por vampiros anciãos.', 35, 55, 'extremo', 7),
('Vale das Sombras', 'Vale onde a luz nunca penetra.', 40, 60, 'extremo', 7);

-- ========== REINO DOS ELFOS DA NOITE (id 8) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Bosque Noturno', 'Floresta sempre escura, com elfos arqueiros.', 15, 25, 'médio', 8),
('Clareira dos Cristais', 'Clareira com cristais negros.', 18, 30, 'médio', 8),
('Templo da Noite Eterna', 'Templo onde cultuam a lua negra.', 25, 40, 'alto', 8),
('Abismo dos Elfos', 'Ravina onde elfos caídos vivem.', 32, 50, 'alto', 8),
('Cidade Subterrânea', 'Metrópole subterrânea élfica.', 40, 60, 'extremo', 8);

-- ========== REINO DAS MONTANHAS FLAMEJANTES (id 9) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Encosta Vulcânica', 'Terreno quente com lavas lentas.', 25, 35, 'médio', 9),
('Caverna de Magma', 'Caverna com rios de lava.', 28, 42, 'alto', 9),
('Pico do Dragão de Fogo', 'Montanha habitada por dragões de fogo.', 35, 55, 'extremo', 9),
('Forja da Montanha', 'Local onde anões forjam armas.', 30, 48, 'alto', 9),
('Vale das Cinzas', 'Vale coberto por cinzas vulcânicas.', 22, 38, 'médio', 9);

-- ========== REINO DOS VENTOS UIVANTES (id 10) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Planície dos Nômades', 'Campo aberto onde tribos acampam.', 5, 15, 'baixo', 10),
('Desfiladeiro do Vento', 'Desfiladeiro com ventos fortes.', 10, 22, 'médio', 10),
('Ruínas do Templo Antigo', 'Ruínas de uma civilização passada.', 15, 28, 'médio', 10),
('Caverna dos Uivos', 'Caverna onde o vento produz uivos.', 20, 35, 'alto', 10),
('Pico do Ciclone', 'Topo da montanha com ciclone permanente.', 30, 48, 'extremo', 10);

-- ========== IMPÉRIO CELESTIAL (id 11) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Floresta dos Cinco Dragões', 'Floresta densa onde dragões jovens foram vistos.', 30, 45, 'médio', 11),
('Planície do Sol Nascente', 'Campos dourados, habitados por lobos espirituais.', 35, 50, 'alto', 11),
('Pico da Águia Imortal', 'Montanha íngreme com ninhos de águias gigantes.', 40, 58, 'alto', 11),
('Caverna da Luz Purificadora', 'Caverna com cristais que purificam Qi.', 45, 65, 'extremo', 11),
('Jardim das Flores Eternas', 'Jardim mágico onde flores nunca murcham.', 50, 70, 'extremo', 11),
('Palácio Proibido', 'Antigo palácio imperial, repleto de armadilhas e guardiões.', 60, 85, 'extremo', 11);

-- ========== IMPÉRIO DEMONÍACO (id 12) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Planície de Ossos', 'Campo coberto por ossos de bestas mortas.', 40, 55, 'médio', 12),
('Montanha do Fogo Infernal', 'Vulcão ativo com lagos de lava e elementais de fogo.', 45, 65, 'alto', 12),
('Vale dos Demônios', 'Vale onde demônios de nível médio perambulam.', 50, 70, 'alto', 12),
('Lago de Sangue', 'Lago vermelho como sangue; monstros aquáticos.', 55, 75, 'extremo', 12),
('Fortaleza das Almas Perdidas', 'Fortaleza assombrada por espíritos vingativos.', 65, 90, 'extremo', 12);

-- ========== IMPÉRIO DAS NUVENS (id 13) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Jardins Flutuantes', 'Jardins suspensos com plantas celestiais.', 50, 65, 'médio', 13),
('Palácio das Nuvens', 'Palácio onde reside o imperador celestial.', 55, 75, 'alto', 13),
('Cachoeira do Céu', 'Queda d''água que vem das nuvens.', 60, 80, 'alto', 13),
('Pilar do Mundo', 'Torre que conecta o céu à terra.', 70, 95, 'extremo', 13),
('Domínio dos Sábios', 'Área restrita a imortais.', 80, 110, 'extremo', 13);

-- ========== IMPÉRIO DAS SOMBRAS (id 14) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Mercado das Sombras', 'Bazar subterrâneo de itens ilegais.', 35, 50, 'médio', 14),
('Caverna dos Ladrões', 'Esconderijo de guildas de ladrões.', 40, 58, 'alto', 14),
('Abismo dos Assassinos', 'Ravina onde assassinos treinam.', 48, 68, 'alto', 14),
('Templo da Morte', 'Templo dedicado ao deus da morte.', 55, 78, 'extremo', 14),
('Cidade Fantasma', 'Cidade abandonada, habitada por espectros.', 65, 90, 'extremo', 14);

-- ========== IMPÉRIO DO DRAGÃO (id 15) ==========
INSERT OR IGNORE INTO regioes (nome, descricao, nivel_minimo, nivel_maximo, perigo, local_mae_id) VALUES
('Vale dos Dragões', 'Vale onde dragões jovens brincam.', 45, 60, 'médio', 15),
('Montanha do Trono', 'Montanha onde o rei dragão reside.', 55, 75, 'alto', 15),
('Caverna das Escamas', 'Caverna cheia de escamas de dragão.', 60, 80, 'alto', 15),
('Cemitério dos Dragões', 'Local sagrado onde dragões vão para morrer.', 70, 95, 'extremo', 15),
('Planalto dos Antepassados', 'Campo onde dragões ancestrais vagam.', 80, 110, 'extremo', 15);

-- =====================================================
-- TABELA DE MOBS
-- =====================================================
CREATE TABLE IF NOT EXISTS mobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE,
    descricao TEXT,
    nivel_minimo INTEGER,
    nivel_maximo INTEGER,
    hp_base INTEGER,
    ataque_base INTEGER,
    defesa_base INTEGER,
    experiencia_base INTEGER,
    ouro_base INTEGER,
    regioes_ids TEXT -- IDs das regiões separados por vírgula (ex: '1,2,3')
);

-- =====================================================
-- TABELA DE DROPS (itens de crafting)
-- =====================================================
CREATE TABLE IF NOT EXISTS mob_drops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mob_id INTEGER,
    item_nome TEXT, -- nome do drop (ex: 'Pele de Lobo')
    item_tipo TEXT, -- 'pele', 'dente', 'garra', 'essencia', 'orgao', 'escama', etc.
    chance INTEGER, -- percentual 0-100
    quantidade_min INTEGER,
    quantidade_max INTEGER,
    FOREIGN KEY(mob_id) REFERENCES mobs(id)
);

-- Inserir 60 mobs (vou gerar blocos de 10 para facilitar a leitura)

-- ========== MOBS NÍVEL 1-15 ==========
INSERT OR IGNORE INTO mobs (nome, descricao, nivel_minimo, nivel_maximo, hp_base, ataque_base, defesa_base, experiencia_base, ouro_base, regioes_ids) VALUES
('Caranguejo de Areia', 'Crustáceo que se esconde na areia.', 1, 5, 30, 8, 12, 10, 3, '1'),
('Lobo Cinzento', 'Lobo comum que ataca em matilhas.', 2, 7, 45, 12, 8, 15, 5, '1,2'),
('Morcego Vampiro', 'Morcego que suga sangue.', 3, 8, 35, 10, 6, 12, 4, '2,3'),
('Goblin Ladrão', 'Pequeno humanoide verde que rouba itens.', 4, 10, 40, 14, 5, 18, 8, '3,4'),
('Cobra Venenosa', 'Serpente com mordida tóxica.', 5, 12, 50, 16, 7, 20, 10, '4,5'),
('Javali Ferino', 'Javali com presas afiadas e pele grossa.', 6, 14, 70, 18, 10, 25, 12, '5,6'),
('Aranha Tecedeira', 'Aranha que tece teias pegajosas.', 7, 15, 55, 15, 9, 22, 9, '6,7'),
('Esqueleto Rastejante', 'Esqueleto que surge do chão.', 8, 16, 60, 17, 8, 28, 11, '7,8'),
('Elemental de Água', 'Ser feito de água pura.', 9, 18, 80, 12, 15, 30, 14, '8,9'),
('Harpia Menor', 'Ave com garras afiadas.', 10, 20, 65, 20, 10, 35, 16, '9,10');

-- ========== MOBS NÍVEL 15-30 ==========
INSERT OR IGNORE INTO mobs (nome, descricao, nivel_minimo, nivel_maximo, hp_base, ataque_base, defesa_base, experiencia_base, ouro_base, regioes_ids) VALUES
('Golem de Lodo', 'Golem feito de lama e pedras.', 15, 25, 120, 22, 25, 45, 25, '10,11'),
('Cavaleiro Esqueleto', 'Esqueleto montado em um cavalo morto.', 16, 28, 100, 28, 18, 50, 30, '11,12'),
('Fada Sombria', 'Fada corrompida pela escuridão.', 18, 30, 70, 25, 12, 55, 28, '12,13'),
('Troll da Montanha', 'Troll grande e forte.', 20, 35, 180, 30, 20, 70, 40, '13,14'),
('Elemental de Fogo', 'Ser de chamas puras.', 22, 38, 90, 35, 10, 65, 35, '14,15'),
('Lobo da Névoa', 'Lobo que some na névoa.', 24, 40, 110, 28, 15, 60, 32, '15,16'),
('Aranha Venenosa', 'Aranha gigante com veneno paralizante.', 25, 42, 95, 32, 14, 75, 38, '16,17'),
('Gárgula de Pedra', 'Estátua que ganha vida.', 28, 45, 150, 26, 30, 80, 45, '17,18'),
('Cultista das Sombras', 'Humano corrompido por magia negra.', 30, 48, 100, 34, 16, 85, 50, '18,19'),
('Banshee Chorosa', 'Espírito que grita e causa medo.', 32, 50, 80, 40, 8, 90, 55, '19,20');

-- ========== MOBS NÍVEL 30-50 ==========
INSERT OR IGNORE INTO mobs (nome, descricao, nivel_minimo, nivel_maximo, hp_base, ataque_base, defesa_base, experiencia_base, ouro_base, regioes_ids) VALUES
('Guerreiro Orc', 'Orc armado com machado de ferro.', 30, 45, 140, 38, 20, 100, 60, '20,21'),
('Mago Negro', 'Feiticeiro que lança maldições.', 32, 48, 90, 45, 12, 110, 65, '21,22'),
('Dragão Jovem', 'Dragão pequeno, mas perigoso.', 35, 55, 300, 50, 35, 200, 100, '22,23'),
('Besta Espiritual', 'Criatura mística de grande poder.', 38, 58, 250, 48, 30, 180, 90, '23,24'),
('Vampiro Nobre', 'Vampiro com habilidades de sangue.', 40, 60, 180, 55, 25, 150, 120, '24,25'),
('Lich Ancião', 'Morto-vivo poderoso que usa magia de ossos.', 42, 65, 220, 60, 28, 200, 150, '25,26'),
('Gigante de Gelo', 'Gigante das montanhas geladas.', 45, 70, 400, 70, 45, 300, 200, '26,27'),
('Fênix Renascida', 'Ave de fogo que revive.', 48, 75, 280, 80, 35, 350, 250, '27,28'),
('Cérbero de Três Cabeças', 'Cão do submundo com três cabeças.', 50, 80, 500, 90, 50, 500, 300, '28,29'),
('Demônio de Armadura', 'Demônio revestido por metal infernal.', 52, 85, 600, 85, 60, 600, 350, '29,30');

-- ========== MOBS NÍVEL 50-70 ==========
INSERT OR IGNORE INTO mobs (nome, descricao, nivel_minimo, nivel_maximo, hp_base, ataque_base, defesa_base, experiencia_base, ouro_base, regioes_ids) VALUES
('Guardião de Jade', 'Estátua animada de jade.', 50, 70, 350, 65, 50, 250, 180, '30,31'),
('Sereia Encantadora', 'Sereia que atrai com seu canto.', 52, 75, 200, 70, 25, 280, 200, '31,32'),
('Minotauro Furioso', 'Metade homem, metade touro.', 55, 80, 450, 80, 40, 400, 280, '32,33'),
('Quimera Alada', 'Criatura com cabeça de leão, corpo de bode e asas de dragão.', 58, 85, 500, 85, 45, 500, 320, '33,34'),
('Espectro Real', 'Fantasma de um rei antigo.', 60, 90, 300, 90, 30, 450, 300, '34,35'),
('Elemental de Trovão', 'Ser feito de relâmpagos.', 62, 95, 320, 100, 20, 550, 350, '35,36'),
('Titã de Pedra', 'Gigante de rocha viva.', 65, 100, 800, 95, 80, 700, 500, '36,37'),
('Dragão de Fogo', 'Dragão adulto que cospe fogo.', 68, 105, 1000, 120, 70, 1000, 800, '37,38'),
('Fênix Imortal', 'Fênix lendária, quase imortal.', 70, 110, 1200, 130, 80, 1500, 1000, '38,39'),
('Senhor das Trevas', 'Ser demoníaco supremo.', 75, 120, 2000, 150, 100, 2000, 1500, '39,40');

-- ========== MOBS NÍVEL 70-100 ==========
INSERT OR IGNORE INTO mobs (nome, descricao, nivel_minimo, nivel_maximo, hp_base, ataque_base, defesa_base, experiencia_base, ouro_base, regioes_ids) VALUES
('Avatar da Luz', 'Ser celestial de pura luz.', 70, 100, 800, 110, 60, 800, 600, '40,41'),
('Criatura do Vácuo', 'Monstro que vive no espaço vazio.', 75, 110, 900, 120, 50, 900, 700, '41,42'),
('Rei dos Mortos-Vivos', 'Lich supremo governante do submundo.', 80, 115, 1500, 140, 90, 1500, 1200, '42,43'),
('Dragão Ancestral', 'Dragão milenar de poder imenso.', 85, 125, 3000, 180, 120, 3000, 2000, '43,44'),
('Deus Besta', 'Besta divina que desafia os céus.', 90, 130, 5000, 200, 150, 5000, 3000, '44,45'),
('Elemental Primordial', 'Ser do início dos tempos.', 95, 140, 4000, 220, 130, 4500, 2500, '45,46'),
('Fênix Celestial', 'Fênix que transcendeu a imortalidade.', 100, 150, 6000, 250, 160, 8000, 5000, '46,47'),
('Dragão Celestial', 'Dragão que vive no céu estrelado.', 105, 160, 8000, 280, 180, 10000, 8000, '47,48'),
('Imperador Demoníaco', 'Senhor de todos os demônios.', 110, 170, 10000, 300, 200, 15000, 10000, '48,49'),
('Dao Imortal', 'Ser que alcançou o Dao, nível máximo.', 120, 180, 20000, 500, 300, 50000, 20000, '49,50');

-- Agora os DROPS (60 mobs, cada um com 2-4 drops, total > 150 drops)
-- Vou gerar drops criativos para cada mob, agrupados por tipo.

-- Drops para mobs 1-10 (nível baixo)
INSERT OR IGNORE INTO mob_drops (mob_id, item_nome, item_tipo, chance, quantidade_min, quantidade_max) VALUES
(1, 'Casco de Caranguejo', 'pele', 40, 1, 2),
(1, 'Presa de Caranguejo', 'dente', 20, 1, 1),
(2, 'Pele de Lobo Cinzento', 'pele', 50, 1, 2),
(2, 'Dente de Lobo', 'dente', 35, 1, 2),
(3, 'Asa de Morcego', 'asa', 30, 1, 2),
(3, 'Sangue de Morcego', 'essencia', 15, 1, 1),
(4, 'Dedo de Goblin', 'orgao', 25, 1, 1),
(4, 'Saco de Moedas Pequeno', 'tesouro', 10, 5, 20),
(5, 'Pele de Cobra', 'pele', 45, 1, 2),
(5, 'Dente de Cobra', 'dente', 30, 1, 1),
(5, 'Glândula de Veneno', 'orgao', 20, 1, 1),
(6, 'Pele Grossa de Javali', 'pele', 55, 1, 2),
(6, 'Presa de Javali', 'presa', 40, 1, 2),
(7, 'Seda de Aranha', 'tecido', 45, 1, 3),
(7, 'Glândula de Veneno de Aranha', 'orgao', 25, 1, 1),
(8, 'Poeira de Ossos', 'essencia', 60, 2, 5),
(8, 'Fêmur Quebrado', 'osso', 30, 1, 2),
(9, 'Essência Aquática', 'essencia', 30, 1, 2),
(9, 'Pérola de Água', 'gema', 15, 1, 1),
(10, 'Pena de Harpia', 'pluma', 50, 1, 3),
(10, 'Garra de Harpia', 'garra', 40, 1, 2);

-- Drops para mobs 11-20
INSERT OR IGNORE INTO mob_drops (mob_id, item_nome, item_tipo, chance, quantidade_min, quantidade_max) VALUES
(11, 'Núcleo de Lodo', 'essencia', 30, 1, 1),
(11, 'Fragmento de Pedra', 'minerio', 70, 2, 4),
(12, 'Espada Enferrujada', 'arma', 15, 1, 1),
(12, 'Crânio de Cavaleiro', 'osso', 25, 1, 1),
(13, 'Asa de Fada Sombria', 'asa', 35, 1, 2),
(13, 'Pó de Fada', 'essencia', 20, 1, 1),
(14, 'Pele de Troll', 'pele', 40, 1, 2),
(14, 'Dente de Troll', 'dente', 30, 1, 2),
(14, 'Sangue de Troll', 'essencia', 15, 1, 1),
(15, 'Carvão de Fogo', 'minerio', 55, 1, 2),
(15, 'Essência Flamejante', 'essencia', 20, 1, 1),
(16, 'Pele de Lobo da Névoa', 'pele', 45, 1, 2),
(16, 'Olho Prateado', 'orgao', 10, 1, 1),
(17, 'Fio de Seda Venenosa', 'tecido', 40, 1, 2),
(17, 'Veneno de Aranha', 'essencia', 25, 1, 1),
(18, 'Asa de Gárgula', 'asa', 30, 1, 1),
(18, 'Pedra de Gárgula', 'minerio', 20, 1, 1),
(19, 'Manto Negro', 'tecido', 25, 1, 1),
(19, 'Essência Sombria', 'essencia', 35, 1, 2),
(20, 'Grito Fantasmagórico', 'essencia', 20, 1, 1),
(20, 'Véu de Banshee', 'tecido', 15, 1, 1);

-- Drops para mobs 21-30
INSERT OR IGNORE INTO mob_drops (mob_id, item_nome, item_tipo, chance, quantidade_min, quantidade_max) VALUES
(21, 'Machado de Orc', 'arma', 10, 1, 1),
(21, 'Pele Verde', 'pele', 40, 1, 2),
(22, 'Cajado de Mago', 'arma', 8, 1, 1),
(22, 'Essência Maldita', 'essencia', 30, 1, 2),
(23, 'Escama de Dragão Jovem', 'escama', 30, 1, 2),
(23, 'Dente de Dragão', 'dente', 20, 1, 1),
(23, 'Sangue de Dragão', 'essencia', 15, 1, 1),
(24, 'Pelúcia Etérea', 'pele', 40, 1, 2),
(24, 'Chifre da Besta', 'chifre', 25, 1, 1),
(24, 'Essência Primordial', 'essencia', 10, 1, 1),
(25, 'Capa de Vampiro', 'tecido', 20, 1, 1),
(25, 'Presas de Vampiro', 'dente', 30, 1, 2),
(25, 'Essência Sanguínea', 'essencia', 25, 1, 1),
(26, 'Orbe de Lich', 'essencia', 15, 1, 1),
(26, 'Poeira de Ossos Ancestrais', 'essencia', 40, 2, 5),
(27, 'Pele de Gigante', 'pele', 35, 1, 2),
(27, 'Coração de Gelo', 'orgao', 10, 1, 1),
(28, 'Pena de Fênix', 'pluma', 20, 1, 2),
(28, 'Cinzas de Fênix', 'essencia', 25, 1, 1),
(29, 'Pele de Cérbero', 'pele', 30, 1, 2),
(29, 'Dente de Cérbero', 'dente', 25, 1, 2),
(30, 'Armadura Infernal', 'armadura', 5, 1, 1),
(30, 'Essência Demoníaca', 'essencia', 35, 1, 2);

-- Drops para mobs 31-40
INSERT OR IGNORE INTO mob_drops (mob_id, item_nome, item_tipo, chance, quantidade_min, quantidade_max) VALUES
(31, 'Fragmento de Jade', 'gema', 30, 1, 2),
(31, 'Olho de Jade', 'orgao', 10, 1, 1),
(32, 'Escama de Sereia', 'escama', 25, 1, 2),
(32, 'Voz Encantadora', 'essencia', 15, 1, 1),
(33, 'Chifre de Minotauro', 'chifre', 20, 1, 1),
(33, 'Pele de Touro', 'pele', 40, 1, 2),
(34, 'Asa de Quimera', 'asa', 25, 1, 1),
(34, 'Dente de Leão', 'dente', 30, 1, 2),
(35, 'Coroa Fantasma', 'tesouro', 5, 1, 1),
(35, 'Essência Real', 'essencia', 20, 1, 1),
(36, 'Relâmpago Capturado', 'essencia', 15, 1, 1),
(36, 'Pó de Trovão', 'minerio', 25, 1, 2),
(37, 'Núcleo de Titã', 'essencia', 10, 1, 1),
(37, 'Pedaço de Rocha', 'minerio', 50, 2, 4),
(38, 'Chama de Dragão', 'essencia', 20, 1, 2),
(38, 'Escama de Dragão de Fogo', 'escama', 30, 1, 2),
(39, 'Lágrima de Fênix', 'essencia', 10, 1, 1),
(39, 'Pluma Imortal', 'pluma', 25, 1, 2),
(40, 'Essência das Trevas', 'essencia', 40, 1, 3),
(40, 'Alma Corrompida', 'orgao', 20, 1, 1);

-- Drops para mobs 41-50
INSERT OR IGNORE INTO mob_drops (mob_id, item_nome, item_tipo, chance, quantidade_min, quantidade_max) VALUES
(41, 'Luz Purificadora', 'essencia', 20, 1, 1),
(41, 'Pena Angelical', 'pluma', 30, 1, 2),
(42, 'Essência do Vácuo', 'essencia', 15, 1, 1),
(42, 'Fragmento de Nada', 'minerio', 10, 1, 1),
(43, 'Coroa do Rei Morto', 'tesouro', 5, 1, 1),
(43, 'Essência da Morte', 'essencia', 30, 1, 2),
(44, 'Escama Ancestral', 'escama', 25, 1, 2),
(44, 'Dente de Dragão Ancestral', 'dente', 20, 1, 1),
(45, 'Pele de Deus Besta', 'pele', 20, 1, 1),
(45, 'Essência Divina', 'essencia', 15, 1, 1),
(46, 'Essência Primordial Pura', 'essencia', 10, 1, 1),
(46, 'Fragmento de Criação', 'minerio', 5, 1, 1),
(47, 'Pluma Celestial', 'pluma', 20, 1, 2),
(47, 'Lágrima Estelar', 'essencia', 10, 1, 1),
(48, 'Escama de Dragão Celestial', 'escama', 15, 1, 2),
(48, 'Olho do Céu', 'orgao', 5, 1, 1),
(49, 'Chifre Demoníaco Supremo', 'chifre', 10, 1, 1),
(49, 'Essência Demoníaca Pura', 'essencia', 20, 1, 2),
(50, 'Dao Fragmentado', 'essencia', 5, 1, 1),
(50, 'Semente do Dao', 'tesouro', 1, 1, 1);

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
    banido INTEGER DEFAULT 0,
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
    aceita_por INTEGER,
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
-- =====================================================
-- TÉCNICAS BÁSICAS PARA INICIANTES
-- =====================================================
INSERT OR IGNORE INTO tecnicas (nome, tipo, elementos, descricao, poder_base, custo_qi, efeito) VALUES
('Meditação da Respiração Primordial', 'Meditacao', 'Água', 'Técnica básica de meditação para cultivar Qi.', 0, 0, 'permite_cultivar'),
('Soco da Areia', 'Fisica', 'Terra', 'Um soco simples, mas eficaz.', 10, 5, 'dano'),
('Defesa da Casca', 'Defensiva', 'Madeira', 'Aumenta defesa temporariamente.', 0, 5, 'defesa'),
('Golpe do Vento', 'Fisica', 'Ar', 'Um corte rápido com a mão.', 12, 6, 'dano'),
('Postura da Montanha', 'Defensiva', 'Terra', 'Fica imóvel, reduz dano.', 0, 8, 'defesa'),
('Respiração do Rio', 'Meditacao', 'Água', 'Técnica de meditação que acalma a mente.', 0, 0, 'permite_cultivar'),
('Chama Pequena', 'Espiritual', 'Fogo', 'Conjura uma pequena chama ofensiva.', 15, 10, 'dano'),
('Escudo de Gelo', 'Defensiva', 'Gelo', 'Cria um escudo de gelo frágil.', 0, 12, 'defesa'),
('Soco Duplo', 'Fisica', 'Nenhum', 'Dois socos rápidos.', 18, 15, 'dano'),
('Meditação do Guerreiro', 'Meditacao', 'Metal', 'Técnica de meditação para fortalecer o corpo.', 0, 0, 'permite_cultivar');

-- Essas técnicas são muito fracas e servem apenas para iniciantes.
-- O jogador pode aprender uma delas ao iniciar (dependendo do clã) ou comprar na loja.
-- Inserir alguns itens básicos na loja
-- =====================================================
-- MAIS ITENS PARA A LOJA (20 novos)
-- =====================================================
-- Primeiro, inserir os itens na tabela 'itens' (se não existirem)
-- Vou criar itens básicos que podem ser comprados com ouro.

INSERT OR IGNORE INTO itens (nome, tipo, raridade, efeito, valor_venda, valor_compra, moeda_tipo) VALUES
('Poção de Vida Pequena', 'pilula', 'Comum', 'Restaura 50 HP', 5, 10, 'ouro'),
('Poção de Qi Pequena', 'pilula', 'Comum', 'Restaura 50 Qi', 5, 10, 'ouro'),
('Poção de Vida Média', 'pilula', 'Incomum', 'Restaura 150 HP', 20, 40, 'ouro'),
('Poção de Qi Média', 'pilula', 'Incomum', 'Restaura 150 Qi', 20, 40, 'ouro'),
('Poção de Vida Grande', 'pilula', 'Raro', 'Restaura 500 HP', 80, 150, 'ouro'),
('Poção de Qi Grande', 'pilula', 'Raro', 'Restaura 500 Qi', 80, 150, 'ouro'),
('Antídoto Fraco', 'pilula', 'Comum', 'Cura venenos leves', 15, 30, 'ouro'),
('Pílula de Força', 'pilula', 'Incomum', 'Aumenta Força em 5 por 1 hora', 50, 100, 'ouro'),
('Pílula de Defesa', 'pilula', 'Incomum', 'Aumenta Defesa em 5 por 1 hora', 50, 100, 'ouro'),
('Pílula de Agilidade', 'pilula', 'Incomum', 'Aumenta Agilidade em 5 por 1 hora', 50, 100, 'ouro'),
('Elixir de Cultivo', 'pilula', 'Raro', 'Dobra o ganho de XP de cultivo por 30 min', 200, 400, 'cristais_esp'),
('Pergaminho de Teletransporte', 'consumivel', 'Raro', 'Teleporta para uma cidade conhecida', 100, 200, 'ouro'),
('Talismã de Proteção Fraco', 'talisma', 'Comum', 'Reduz dano em 5% por 1 hora', 30, 60, 'ouro'),
('Talismã de Ataque Fraco', 'talisma', 'Comum', 'Aumenta dano em 5% por 1 hora', 30, 60, 'ouro'),
('Espada de Ferro', 'arma', 'Comum', 'Espada básica, +5 Força', 50, 100, 'ouro'),
('Armadura de Couro', 'armadura', 'Comum', 'Armadura leve, +5 Defesa', 50, 100, 'ouro'),
('Anel de Sorte', 'acessorio', 'Incomum', 'Aumenta sorte em 5 pontos', 100, 200, 'ouro'),
('Colar de Qi', 'acessorio', 'Incomum', 'Aumenta Qi máximo em 50', 120, 240, 'ouro'),
('Bota de Velocidade', 'acessorio', 'Raro', 'Aumenta Agilidade em 10', 200, 400, 'cristais_esp'),
('Pílula de Reversão do Destino', 'especial', 'Lendario', 'Re-roll raça e clã', 500, 1000, 'cristais_esp');

-- Agora, vincular esses itens à loja do jogo (loja_rpg)
INSERT OR IGNORE INTO loja_rpg (item_id, moeda_tipo, preco)
SELECT id, 'ouro', valor_compra FROM itens WHERE nome IN (
    'Poção de Vida Pequena', 'Poção de Qi Pequena', 'Poção de Vida Média', 'Poção de Qi Média',
    'Poção de Vida Grande', 'Poção de Qi Grande', 'Antídoto Fraco', 'Pílula de Força',
    'Pílula de Defesa', 'Pílula de Agilidade', 'Pergaminho de Teletransporte',
    'Talismã de Proteção Fraco', 'Talismã de Ataque Fraco', 'Espada de Ferro', 'Armadura de Couro',
    'Anel de Sorte', 'Colar de Qi'
)
UNION
SELECT id, 'cristais_esp', valor_compra FROM itens WHERE nome IN ('Elixir de Cultivo', 'Bota de Velocidade', 'Pílula de Reversão do Destino');

-- Inserir changelog inicial
INSERT OR IGNORE INTO changelog (versao, data, texto) VALUES
('v1.0.0', date('now'), 'Lançamento oficial do Chasing Immortality. Sistemas: registro, cultivo, combate, seitas, mercado, NPCs, eventos.');


-- Índices e restrições auxiliares
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventario_player_item ON inventario(player_id, item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tecnicas_player_tecnica ON tecnicas_aprendidas(player_id, tecnica_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profissoes_player ON profissoes(player_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seita_membros_unique ON seita_membros(seita_id, player_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_biblioteca_seita_unique ON biblioteca_seita(seita_id, tecnica_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_amigos_inimigos_unique ON amigos_inimigos(player_id, alvo_id, tipo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loja_rpg_item_moeda_unique ON loja_rpg(item_id, moeda_tipo);
