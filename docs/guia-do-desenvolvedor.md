# Guia do desenvolvedor

Como o código do Maresia 97 é organizado, como os sistemas conversam entre si e como mexer neles sem quebrar nada.

- [Visão geral](#visão-geral)
- [Rodar o jogo](#rodar-o-jogo)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [O loop principal](#o-loop-principal)
- [Estado do jogo](#estado-do-jogo)
- [Mundo e coordenadas](#mundo-e-coordenadas)
- [Sistemas](#sistemas)
- [Renderização](#renderização)
- [O que fica salvo no navegador](#o-que-fica-salvo-no-navegador)
- [Receitas: como adicionar coisas](#receitas-como-adicionar-coisas)
- [Depurar](#depurar)
- [Lançar uma versão](#lançar-uma-versão)
- [Pontos de atenção encontrados no código](#pontos-de-atenção-encontrados-no-código)

---

## Visão geral

- **JavaScript puro em módulos ES** (`import`/`export`). Sem framework, sem bundler, sem etapa de build e sem dependências de npm.
- **Three.js** vem incluído em `vendor/three/` (licença MIT) e é importado por caminho relativo.
- **A lógica do jogo é toda 2D** (vista de cima, em pixels). O renderizador 3D só *desenha* esse mundo 2D em 3D. O modo clássico desenha o mesmo estado em Canvas 2D. Por isso dá pra trocar de 3D pra 2D com G a qualquer momento.
- **Tudo é desenhado e sintetizado por código:** não há imagens nem arquivos de som. Os sons são gerados com Web Audio.
- A cidade é **gerada por código com semente fixa**, então sai igual em todo computador.
- Comentários, mensagens e nomes de variáveis de jogo estão em português.

## Rodar o jogo

Como o código usa módulos ES, abrir o `index.html` direto do disco não funciona (o navegador bloqueia `import` em `file://`). Precisa de um servidor local na raiz do repositório:

```bash
npm start                     # roda "npx --yes serve ." (precisa do Node)
# ou
python3 -m http.server 8000   # e abre http://localhost:8000
```

No VS Code, a extensão **Live Server** também resolve. Não há testes automatizados nem lint configurados.

O repositório tem um `.nojekyll`, então dá pra publicar no GitHub Pages direto da raiz sem configuração.

## Estrutura de arquivos

```
index.html              página: canvas 3D (#gl) por baixo e canvas 2D (#c) por cima, pro HUD
vendor/three/           Three.js (licença MIT); em addons/ o carregador de glTF (GLTFLoader + BufferGeometryUtils)
assets/models/          modelos 3D: kenney-car-kit/ (carros do Kenney, CC0, com o colormap.png e a licença)
src/
  main.js               loop principal, recuperação de erros, tecla G e painel F3
  core/
    canvas.js           canvas 2D, tamanho (CW, CH) e densidade de pixels (DPR)
    version.js          número da versão do jogo
    state.js            estado mutável compartilhado (S, player, cam, keys, mouse, view)
    utils.js            aleatório (rng com semente), matemática, cores, fmtMoney
    input.js            teclado e mouse; começar/continuar o jogo
  world/
    map.js              malha de ruas e geração da cidade (prédios, praia, porto, lugares)
    zoning.js           em que bairro fica cada tile (sem imports, de propósito)
    chunks.js           chão desenhado em blocos (cache), versão em baixa resolução e minimapa
    time.js             relógio e ciclo de dia e noite
    districts.js        visual dos bairros, nome da rua num ponto e semáforos
  entities/
    vehicles.js         tipos de veículo (CT) e física dos carros (classe Car)
    peds.js             pedestres (classe Ped)
  ai/
    traffic.js          trânsito seguindo faixas, conversões e semáforo
    police.js           perseguição com campo de fluxo (BFS), visão, bloqueios, policiais a pé
  game/
    world.js            procurado (heat/estrelas), mensagens, spawn, resetWorld
    player.js           entrar/sair do carro, soco, morte, prisão e renascer
    effects.js          explosões, marcas de pneu, atropelamentos, dano no jogador
    weapons.js          armas, tiros (hitscan), loja do pátio e inimigos atirando
    jobs.js             empregos, carreira e veículos de trabalho
    stadium.js          Arena Maresia: dia de jogo, gols e aposta
    blitz.js            bairros fechados (Operação Maré Alta), metas e blitz
    interiors.js        portas e menus (cardápio) de cada lugar
    interior.js         cenas internas onde dá pra andar (plantas em texto)
    tutorial.js         começo guiado e dicas de primeira vez
    titlemenu.js        menu da tela de título e da pausa
    save.js             salvar e carregar
    missions.js         missões dos orelhões
    update.js           atualização do mundo a cada passo, zonas, colisões e pedestres
  render/
    draw.js             mundo em 2D: carros, pessoas, prédios em perspectiva
    hud.js              interface (HUD), minimapa, tela de título e pausa
    style97.js          identidade visual 97: fontes, visor LCD, blocos, estrela em pixel, bip, letra de impacto
    lighting.js         escuridão da noite e pontos de luz (2D)
    icons.js            ícones do minimapa, do mapa e da legenda
    overlays.js         mapa em tela cheia (guia de ruas de papel) e menu das lojas
    interiorDraw.js     interiores em 2D
  render3d/
    build.js            cidade 3D estática (prédios, árvores, postes, estádio...), montada uma vez
    interior3d.js       interiores em 3D, montados a partir das mesmas plantas em texto
    r3d.js              câmera, sol e céu, carros, pessoas, efeitos, blitz, qualidade e HUD por cima
    models.js           carrega os modelos .glb dos carros e repinta a lataria na cor de cada carro
    props.js            modelos .glb do mapa (árvores, postes, casas, cones) e pessoas animadas
    realista.js         qualidade "realista": materiais PBR, texturas fotográficas, céu como mapa de ambiente, bloom e tone mapping
  audio/
    audio.js            motor, sirene e efeitos sintetizados (Web Audio)
```

## O loop principal

`src/main.js`, função `frame(now)`:

1. Calcula `dt` e limita a **0,05 s** (se a aba travar, o jogo não dá um salto gigante).
2. **Agenda o próximo quadro antes de tudo** (`requestAnimationFrame`). Assim um erro nunca congela o jogo.
3. Se o jogo está rodando (começou, sem pausa, sem menu, sem mapa aberto), divide `dt` em **passos fixos de 1/60 s** e chama `update(s)` (na rua) ou `updateInterior(s)` (dentro de um lugar).
4. `sanitize()` remove carros, pedestres e partículas com posição `NaN`/`Infinity` e destrava o jogador e a câmera.
5. Desenha: interior 3D ou 2D, ou a cidade com `render3D()` ou `render()`.
6. Por cima: painel F3, mapa em tela cheia, menu, tela de título/pausa, contador de FPS.
7. Tudo dentro de `try/catch`. Um erro conta em `S.errCount`, aparece numa faixa vermelha embaixo ("Erro recuperado") e chama `sanitize(true)`, que também cancela a missão atual.

`src/game/update.js`, função `update(dt)`, faz em ordem: relógio, controles do jogador, armas, empregos, save automático, tutorial, estádio, bairros/blitz, IA de cada carro (trânsito ou polícia), colisões entre carros, pedestres, cérebro da polícia e queda do procurado, prisão, spawn e despawn, zonas (pintura, posto, Zé), missões e orelhões, partículas, câmera e áudio contínuo.

## Estado do jogo

Tudo que muda durante o jogo fica em objetos exportados por `src/core/state.js`, pra qualquer módulo ler e alterar sem variáveis globais soltas:

| Objeto | O que guarda |
|---|---|
| `S` | listas do mundo (`cars`, `peds`, `parts`, `skids`, `decals`, `tracers`), mensagens (`messages`, `bigMsg`, `toasts`, `floaters`), `mission`, `missionIdx`, `job`, `interior`, `menu`, `mapOpen`, `waypoint`, hora do dia `tod`, dia do calendário `day` (com `lastTod`), partida do dia `match`, `gameTime`, `playTime`, `paused`, `started`, bairros liberados `unlocked`, recorde `best` |
| `player` | posição, ângulo, `health`, `armor`, `money`, `heat`, `car`, `weapon`, `ammo`, `skills`, `state` (`play`, `wasted`, `busted`) |
| `cam` | posição e zoom da câmera 2D |
| `keys`, `mouse` | teclas pressionadas (`keys['KeyW']`) e mouse |
| `view` | funções `project`/`unproject` entre mundo e tela. O 3D troca essas funções pra mira e avisos funcionarem nos dois modos |

Mensagens pro jogador: `msg(texto, duração)` (linha pequena) e `big(título, subtítulo, cor, duração)` (aviso grande), em `src/game/world.js`.

### Visual 97 (`render/style97.js`)
Toda tela desenhada em canvas usa as peças daqui, pra manter a identidade de 1997:
- Fontes: **VT323** (texto, `pf(tamanho)`; já compensa o tamanho menor dela) e **Anton** (títulos, `impact(...)` com contorno e sombra dura). Ficam em `vendor/fonts` (licença OFL) e `main.js` espera carregar antes de montar a cidade, porque os nomes vão pras texturas.
- `lcdPanel` / `lcd7`: visor de 7 segmentos (dinheiro, cronômetro). `blocks`: vida, colete e lataria em blocos. `pixelStar`, `gunIcon`: desenhos em pixel. `bevel`: moldura chanfrada. `pager`: o bip da missão/emprego.
- Cores em `C97`. Amarelo orelhão = ação/seleção, verde LCD = dinheiro, vermelho = perigo.
- No 3D, o **Filtro 97** (opcional, desligado por padrão) (`retroPass` em `r3d.js`) desenha a cena numa resolução baixa fixa (240/300/360 linhas conforme a qualidade) e passa um shader de pontilhado (Bayer 4x4) com 32 níveis por cor. Como desenha menos pixels, é mais leve que o 3D normal.

## Mundo e coordenadas

- **Tile:** `T = 32` px. Mapa de `W × H = 376 × 376` tiles em `map` (`Uint8Array`). A cidade cresceu na 1.8.0: os quarteirões continuam com ~26 tiles entre ruas, mas tem mais ruas em cada bairro. As divisas dos bairros (`zoneAt` em `zoning.js`) ficam sempre em cima de uma rua.
- **Tipos de tile:** `WATER`, `SAND`, `ROAD`, `SIDE` (calçada), `GRASS`, `BUILD`, `TREE`, `PARK` (estacionamento/praça), `POOL`, `DIRT`. Sólidos: água, prédio, árvore, piscina (`isSolidT`).
- **Direções:** `0 = leste, 1 = sul, 2 = oeste, 3 = norte` (`DX`, `DY`).
- **Malha de ruas:** `VL` (linhas verticais) e `HL` (horizontais) em `map.js`, cada uma com tipo `ave`, `rua` ou `beco`, largura, faixas, nome e mão única. `segH[j][i]` e `segV[i][j]` dizem quais trechos existem. Becos só existem na Vila Velha.
- **Bairros:** `zoneAt(tx, ty)` em `zoning.js` devolve `centro`, `jardim`, `rico` (Alto da Maresia), `cajueiro`, `velha`, `porto` ou `orla`. O visual de cada um está em `DISTRICTS` (`districts.js`).
- **Lugares:** `buildings` (cada um com `kind`: `hospital`, `policia`, `farmacia`, `casa`, `estadio`...), `zones` (retângulos de pintura, posto, Zé, armas), `special` (atalhos: `special.ze`, `special.casa`, `special.estac`...), `phones`, `lamps`, `trees`, `decor`.
- **Geração:** `genMap()` roda uma vez ao carregar `map.js`, usando `rng = mulberry(1337)`. Mudar a ordem das chamadas de `rng()` muda a cidade inteira, e saves antigos podem cair em posição inválida (o `loadGame` já trata isso voltando pro hospital).
- **3D:** 1 unidade = 1 tile. X do mundo = X, Y do mundo = Z, altura = Y (`U = 1/T` em `build.js`).

## Sistemas

### Veículos (`entities/vehicles.js`)

`CT` define cada modelo (velocidade, aceleração, freio, aderência, giro, vida, massa, valor, cores, `sand` pra tração na areia). A classe `Car` tem a física de derrapagem: separa a velocidade em frente/lado, aplica aderência no lado, freio de mão reduz a aderência, colisão com o mapa por pontos ao redor da carroceria (`hits`) e `unstick()` pra desencalhar. O dano vem de `damage(valor, origem)`. Origem `'player'` gera procurado e avisa a missão (`onDestroyed`).

Campos que outros sistemas usam: `driver` (`'player'`, `'ai'` ou `null`), `ai` (`'traffic'`, `'police'`, `'block'`, `'cp'`), `mission`, `keep` (não some no despawn), `flat` (pneu furado), `towed`, `wreck`, `burnT`.

### Trânsito (`ai/traffic.js`)

Carros seguem a malha: escolhem faixa, trocam de faixa pra ultrapassar e pra converter, respeitam mão única e semáforo (`signalState` em `districts.js`), não entram no cruzamento se não couberem do outro lado e destravam engarrafamentos fora da tela. Ônibus e caminhões não entram em beco. Carro com `stayOpen` (as caminhonetes da gangue em "Acerto de Contas") não escolhe trecho que passe por bairro fechado; `headingOpen(c)` diz se o trecho atual é todo aberto. O tipo de carro sorteado depende do bairro. `spawnOnRoad()` cria carros fora da tela, e `driveTo()` é a direção usada também pela polícia.

### Polícia (`ai/police.js`, `game/world.js`, `game/update.js`)

- **Procurado:** `player.heat` (0–660) → `heatStars()` (0–6). `addHeat(v)` também chama `reportPlayer()`, ou seja, todo crime "te mostra" pra polícia.
- **Inteligência:** `intel` guarda quando e onde você foi visto pela última vez e em qual carro. Viaturas e policiais a pé atualizam isso quando te veem (`los()` testa linha de visão).
- **Campos de fluxo:** dois BFS no mapa inteiro, um até a última posição vista (`flow`, a cada 0,35 s) e outro até a posição prevista 1,6 s à frente (`flowB`, a cada 0,5 s). Perseguidores seguem `flow`, interceptadores seguem `flowB`. Perto e com visão, vão direto, cada um com um desvio lateral pra cercar.
- **Sem contato:** vasculham pontos aleatórios a 150–500 px da última posição vista.
- **Unidades:** `policeUnit(stars)` sorteia viatura, SWAT, FBI, exército ou blindado. `FOOT` define quem desce de cada veículo. `COP_UNITS` em `update.js` define a arma de cada tropa.
- **Bloqueios:** `updateRoadblocks` (3+ estrelas).
- **Queda e esconderijo:** em `update.js` (`isHideout`, troca de carro sem ser visto).

### Operação Maré Alta (`game/blitz.js`)

- `START_OPEN` e `DISTRICT_ORDER` (bairro, meta, nome) definem a progressão. `S.unlocked` guarda o que já abriu e vai no save.
- `computeRestricted()` marca em `restricted` (um byte por tile) cada tile de bairro fechado cujo quadrado de 9 × 9 tiles em volta seja todo do mesmo bairro. Na prática é o bairro encolhido 4 tiles, o que deixa as avenidas da divisa livres.
- `buildCheckpoints()` anda pelo centro de cada trecho de rua e cria uma blitz onde a rua cruza a borda da área fechada.
- `updateDistricts()` libera o próximo bairro quando `player.money >= meta`, cria e remove viaturas e guardas da blitz conforme a distância, detecta quando você cruza a linha (barrar ou furar) e aplica o "não larga" dentro da área fechada.
- `isOpenAt(x, y)` e `isOpenZone(z)` são usados por missões, empregos, orelhões e tutorial pra só mandar o jogador pra área aberta.
- `lockMask()` gera a textura hachurada do mapa.

### Missões (`game/missions.js`)

`MISSIONS` é uma lista de objetos com `title`, `start(m)`, `update(m, dt)` (devolve `'done'`, `'fail'` ou nada), `target(m)` (o que a seta aponta) e, opcional, `needs` (bairros que precisam estar abertos). O objeto `m` (`S.mission`) é livre pra guardar o que a missão precisar. Ganchos opcionais: `m.onPedDead`, `m.onPedHit`, `m.onDestroyed`, `m.onEnter` (chamados por pedestres e carros marcados com `.mission = m`).

`startMission()` pula missões cujos bairros estão fechados e multiplica o prêmio por `1 + 0,6 × rodada`. `finishMission()` paga, salva e avança `S.missionIdx`. `cleanupMission()` solta os carros e pedestres marcados.

### Empregos (`game/jobs.js`)

`JOBS` mapeia o tipo de emprego ao veículo. Cada emprego tem `next…()` (sorteia o próximo serviço) e `upd…()` (verifica a cada passo). `pay(j, base, texto)` aplica o multiplicador do nível, a sequência e a carreira. `failService()` zera a sequência. `setupJobSpots()` e `maintainSpots()` mantêm os veículos de trabalho estacionados. `openJobMenu()` é o menu do J a pé.

### Interiores (`game/interior.js`, `game/interiors.js`)

- `PLANS` tem a planta de cada tipo de sala em texto. A legenda está no topo de `interior.js`: `#` parede, `.` chão, `E` saída, `S` prateleira, `F` geladeira, `C` balcão, `T` mesa, `c` cadeira, `B` cama, `D` mesa/computador, `K` quadro-negro, `P` planta, `V` sofá, `R` arara de armas, `G` alvo, `J` grade, `a` atendente, `1` balcão, `2` cama, `3` computador, `4` professor.
- `KIND_PLAN` diz qual planta cada `kind` de prédio usa. `THEME` dá as cores.
- A mesma planta é usada pelo 2D (`render/interiorDraw.js`) e pelo 3D (`render3d/interior3d.js`).
- `PLACES` em `interiors.js` é o cardápio de cada lugar. Cada item tem `label`, `price` (número ou função), `run()` e, opcional, `disabled()`/`why` e `station` (qual ponto da sala mostra esse item: `balcao`, `cama`, `mesa`).
- A Arena não tem interior. A porta dela abre direto o menu (`stadiumItems()`).

### Save (`game/save.js`)

`saveGame()` grava um JSON em `localStorage['aq_save']` com a versão, dinheiro, vida, colete, armas, cursos, `missionIdx`, hora, dia do calendário (`day`), `playTime`, `unlocked`, posição e o carro atual. `loadGame()` roda depois de `resetWorld()` e trata saves antigos:

- sem `unlocked` (antes da 1.4.0): zera o dinheiro e volta pra só Centro e Jardim (`S.migratedDistricts` mostra o aviso);
- de antes da cidade nova (0.8.0), ou posição dentro de parede ou de área fechada: começa no hospital.

### Tutorial e dicas (`game/tutorial.js`)

`STEPS` são os 5 passos (cada um com `done()` e, opcional, `target()`). `hintOnce(id, título, texto, teclas)` mostra um cartão só uma vez por navegador.

### Estádio (`game/stadium.js`)

`matchOn()` é verdadeiro das 15h30 às 18h. O dia vem de `S.day`, que sobe 1 sempre que `S.tod` fica menor que no passo anterior (passou da meia-noite, andando, dormindo ou dentro de um interior). O adversário roda pela lista `AWAY`. `match()` guarda o placar, a aposta e se já assistiu.

### Áudio (`audio/audio.js`)

`initAudio()` cria o contexto no primeiro clique/tecla (exigência dos navegadores), com um oscilador de motor e um de sirene sempre ligados (o volume é controlado em `update.js`). `sfxNoise`, `sfxTone`, `sfxWin`, `sfxFail` e `sfxHorn` são efeitos curtos. `AU.muted` é a tecla N.

## Renderização

### 3D (`render3d/`)

- `init3D()` cria o renderizador com `powerPreference: 'high-performance'`. Sem WebGL, `R.ok` fica falso e o jogo usa o 2D.
- `buildCity()` monta a cidade estática uma vez, **dividida em blocos**, e a placa só desenha os blocos perto da câmera.
- **Chão com streaming e LOD:** o chão é desenhado em canvas por blocos de 16 × 16 tiles (`world/chunks.js`) e vira textura. No máximo 3 blocos por quadro, primeiro os visíveis e depois na direção do movimento. Por baixo, o mapa inteiro em baixa resolução (`makeLowres`) cobre o que ainda não carregou. No 3D os tiles de água ficam transparentes (`getChunk3D`, `makeLowres(true)` e `alphaTest`), e o 2D clássico continua usando `getChunk` com a água pintada.
- **Mar** (`makeSea`): plano com ondas facetadas no shader. `shoreField()` (em `chunks.js`) calcula a distância de cada tile de água até a terra, e o shader usa isso pra clarear a água rasa e desenhar a espuma batendo na beira. `uGlow` dá um brilho próprio pra água não ficar preta com o sol baixo.
- **Escala das pessoas:** `PED_SCALE` (0,56) e `PLAYER_SCALE` (0,75) em `r3d.js`. Um andar dos prédios tem 0,95 de altura e um carro uns 1,1 de comprimento, então a pessoa fica com ~0,6 (perto de 1,9 m). O jogador é um pouco maior pra ser fácil de achar.
- **Objetos dinâmicos:** carros reaproveitam malhas por tipo (`carParts`: rodas cilíndricas com calota, para-choques, vidros em volta da cabine, retrovisores). Carroceria e cabine usam a cor do carro; a viatura tem cabine branca fixa. À noite, as lanternas fazem um brilho vermelho no chão (mais forte freando). Pessoas e partículas são desenhadas em lote (instancing).
- **Modelos 3D dos carros** (`models.js`): o Car Kit do Kenney (CC0) carrega em segundo plano depois do `init3D()`. Até chegar, ou se der erro, os carros usam as caixas de `carParts`. Quando termina, `rebuildCars()` refaz os carros da tela.
  - `CAR_MODELS` liga o tipo do jogo ao modelo. Busão, moto, bugue e blindado não têm modelo no kit e seguem com caixas.
  - Os modelos são virados pro +X, ficam do comprimento do carro do jogo e as rodas giram com a velocidade.
  - Cor: o kit pinta tudo com uma paleta (`colormap.png`). `paintCell()` acha a faixa da paleta usada na lataria (ignora o cinza do chassi, prefere faixa colorida com área de lataria) e `paintMat()` faz uma cópia da paleta com essa faixa na cor do carro (guardada por modelo + cor). A viatura usa a pintura original.
  - Na qualidade **leve** os carros voltam pras caixas (pesam menos).
  - O `index.html` tem um *import map* (`"three"` → `vendor/three/three.module.min.js`) porque o `GLTFLoader` importa o Three.js pelo nome.
  - Pra trocar ou adicionar um modelo: copie o `.glb` pra `assets/models/kenney-car-kit/` e aponte o tipo em `CAR_MODELS`. Modelos de outro pacote precisam virar pro +Z e ter as rodas em nós com `wheel` no nome.
- **Modelos do Meshy** (`meshy.js`, arquivos em `assets/models/meshy/`): hatch (Jegue), ônibus (Busão), orelhão, banca e barco. Gerados no Meshy (plano grátis, CC BY 4.0, crédito no README), reduzidos (~1 a 11 mil triângulos), pintados com cor por vértice e comprimidos com meshopt (o decodificador fica em `vendor/meshopt/`).
  - Já vêm no tamanho do jogo, com a base no chão e o centro no meio (pessoa ~1,2 de altura, carro ~2,1 de comprimento, ônibus ~5). Escala **sempre uniforme**: nunca esticar um modelo num eixo só.
  - Carros: a malha `body` é a lataria (pintada na cor do carro) e `detail` é o resto. A frente dos modelos é o -X; `meshyCar()` gira meia volta.
  - Mapa: orelhão, banca e barco são desenhados em lote por setor (`meshyProps`). As versões feitas por código ficam em `city.swap.meshy` e somem quando os modelos chegam (e voltam na qualidade leve).
- **Tamanho dos veículos**: `CT` em `vehicles.js` guarda o tamanho antigo e `VEH_SCALE` (1,9) aumenta todos (menos Jegue e Busão, que já estão no tamanho do modelo). No 3D cada carro é montado no tamanho antigo e o grupo inteiro cresce `VEH_SCALE` (`makeCar`), então caixas, modelos do Kenney e os de `rio97.js` mantêm a proporção. `beco:true` marca quem entra nos becos.
- **Modelos do mapa** (`props.js`): árvores/coqueiros (Nature Kit), postes e cones (City Kit Roads) e casas (City Kit Suburban) carregam em segundo plano e são desenhados em lote (`InstancedMesh`, uma malha por peça do modelo). Quando chegam, `applyProps()` esconde as peças feitas por código que eles substituem (`city.swap` em `build.js`; `houseSwap()` diz quais casas trocam). As pessoas não usam mais modelo pronto: ver `gente97.js` abaixo. Os materiais dos pacotes viram Lambert (`lambertize`). Na qualidade leve nada disso aparece.
- **Pessoas de 97** (`gente97.js`): boneco articulado (coxa, canela, pé, braço, antebraço, tronco, cabeça, cabelo, boné, capacete) desenhado todo instanciado (uma `InstancedMesh` por peça, cor por instância), em todas as qualidades. A pose (`walk`, `run`, `idle`, `down`, `sit`, `punch`, `aim`) é calculada em `putPerson` sem esqueleto. `lookOf(p)` sorteia a roupa (regata, camisa de time inventada, bermuda/jeans, chinelo/tênis, boné) a partir do `id`, da camisa e da pele do pedestre; policiais vão de farda. Quem pilota moto aparece sentado e de capacete (`withHelmet`). A moto 97 fica em `rio97.js` (`moto`, com `repaint` pela cor).
- **Prédios** (`build.js`): paredes com degradê (mais escuras embaixo), rodapé escuro, moldura no topo dos prédios de telhado plano, toldo listrado na frente das lojas (`AWNING`), antena de TV em parte das casas e aquecedor solar, caixa d'água e ar-condicionado nos telhados. Árvores têm duas copas e os coqueiros têm cocos.
- **Sol e céu:** o sol cruza o céu com sombra que acompanha a câmera; de noite ele vira a lua (luz fraca e azulada, mais alta). As cores saem da tabela `SKY_KEYS` (céu/neblina, sol, luz ambiente, mar e água rasa por hora: madrugada, amanhecer rosado, dia, fim de tarde dourado, pôr do sol, crepúsculo roxo e noite), misturadas entre uma hora e outra por `skyAt()`.
- **Qualidade** (`applyQuality`): 3 = realista (como a alta, mais o que está em `realista.js`), 2 = alta (densidade até 2, sombra 2048), 1 = média (densidade até 1, sombra 1024 atualizada quadro sim, quadro não), 0 = leve (densidade 0,75, sem sombra). `adapt()` baixa a qualidade sozinho se mais de ~100 quadros acima de 28 ms se acumularem (abaixo de ~35 FPS por uns 3 s), até o jogador escolher com G.
- **Realista** (`realista.js`): a cada quadro `swapScene()` troca os materiais Lambert/Phong da cena por cópias PBR (`MeshStandardMaterial`; a lataria dos carros vira `MeshPhysicalMaterial` com verniz) e copia cor/brilho/opacidade do original, então o resto do código continua mexendo só nos materiais Lambert. Rugosidade e metal vêm de `userData.pbr` no material original (`{r, m}` ou `{car:true}`). `updateEnv()` desenha o céu da hora (cores do `SKY_KEYS` + disco do sol) num cubo fixo (`CubeCamera`) e filtra com `PMREMGenerator.fromCubemap` sempre no mesmo alvo, no máximo a cada 1,5 s (`ENV_MS`); refazer todo quadro custava ~4 ms por quadro em recompilação. Guarda e devolve `shadowMap.needsUpdate`, porque desenhar qualquer cena zera esse aviso. Como o mapa de ambiente ilumina ~π vezes mais que a `HemisphereLight`, `scene.environmentIntensity` fica em 0,32 de dia (sobe à noite). `renderReal()` desenha com `EffectComposer` (MSAA 4x) → bloom → `OutputPass` com ACES; o tone mapping só vale ali (interior e Filtro 97 ficam como eram). Saindo do realista, `applyQuality` devolve os materiais originais. Quando o jogo chama `dispose()` num material (pedaço do chão que ficou longe), o original e a cópia PBR vão embora juntos. A resolução do realista vai até 1,5x em telas de alta densidade. A oclusão de ambiente (GTAO) foi testada e saiu: apagava as sombras e manchava os letreiros.
  - **Texturas fotográficas** (Poly Haven, CC0, em `assets/textures/polyhaven/`): dois atlas 4 × 2 de 512 px (`chao_cor.jpg` e `chao_normal.jpg`) viram `DataArrayTexture` (uma camada por superfície). Materiais com `userData.pbr.tex` ganham um shader extra: `'chao'` (pedaços do chão e o chão em baixa resolução) escolhe a camada pelo tipo do tile (`surfaceMap()` em `chunks.js`, numa `DataTexture` do mapa inteiro) e `'parede'` (`mats.city`) projeta o reboco no plano de cada parede. A foto não substitui o desenho: multiplica a cor dele pela variação da foto em volta da média dela, e o normal map dá o relevo. Pra não formar listras, cada pixel mistura a foto com uma cópia girada e maior. Escala de cada camada em `SCALE` (unidades por repetição; 1 tile ≈ 3 m) e força do relevo em `NORMAL`. Calçadas com desenho próprio (ondas da orla, tijolo da Vila Velha) recebem só um grão fraco. Pra trocar uma textura: refaça o atlas na mesma ordem (está em `LICENSE.txt` da pasta).
- `warmUp()` compila os materiais na placa ao iniciar e ao trocar sombra, pra não engasgar na primeira explosão.
- `gfxInfo()` alimenta o painel F3.
- O HUD é desenhado no canvas 2D (`#c`) por cima do canvas 3D (`#gl`).

### 2D clássico (`render/`)

`render()` em `draw.js` desenha o chão dos blocos em cache, prédios em perspectiva falsa, carros, pessoas, efeitos e a iluminação noturna (`lighting.js`), e chama o HUD.

## O que fica salvo no navegador

| Chave do `localStorage` | Conteúdo | Apagado por "começar do zero"? |
|---|---|---|
| `aq_save` | o save do jogo | sim |
| `aq_career` | serviços feitos em cada emprego (nível) | não |
| `aq_tutorial_done` | tutorial já feito ou pulado | não |
| `aq_hints` | dicas de primeira vez já mostradas | não |
| `aq_best` | recorde de dinheiro | não |
| `aq_gfx` | modo gráfico (`3d2`, `3d1`, `3d0`, `2d`) | não |
| `aq_fps` | estado do F3 (0, 1, 2) | não |
| `aq_retro2` | Filtro 97 (`1` ligado; desligado por padrão) | não |

Pra zerar tudo durante os testes, rode no console do navegador:

```js
Object.keys(localStorage).filter(k => k.startsWith('aq_')).forEach(k => localStorage.removeItem(k));
```

## Receitas: como adicionar coisas

### Uma missão nova

1. Em `src/game/missions.js`, adicione um objeto em `MISSIONS` com `title`, `start(m)`, `update(m, dt)` e `target(m)`.
2. Em `start`, defina `m.time`, `m.reward` e `m.text`. Use `roadPointFar()` ou `sidewalkPointFar()`, que já evitam bairros fechados.
3. Se depender de um bairro, coloque `needs: ['orla']`.
4. Marque carros ou pedestres da missão com `.mission = m` pra usar os ganchos e pra eles não sumirem no despawn.

### Um emprego novo

1. Em `src/game/jobs.js`, adicione em `JOBS`, em `career` e em `JOB_INFO`.
2. Crie `nextX(j)` e `updX(j, dt)`, e ligue os dois em `startJob` e `updateJobs`.
3. Pague com `pay(j, base, texto)` e falhe com `failService(j, motivo)`.
4. Se tiver veículo estacionado, adicione o ponto em `setupJobSpots()` e o caso em `whereJob()`.

### Um item de loja

Em `src/game/interiors.js`, adicione no `items()` do lugar em `PLACES`. Os atalhos `heal()`, `food()` e `ammo()` cobrem os casos comuns. Compra com preço maior que zero salva sozinha.

### Um lugar com interior

1. Faça a planta em `PLANS` (`src/game/interior.js`) seguindo a legenda e ligue o `kind` em `KIND_PLAN`, `THEME` e `NPC_SHIRT`.
2. Coloque o `kind` em `ENTERABLE` e o cardápio em `PLACES` (`interiors.js`).
3. Escolha os prédios em `assignCommerce()` ou `placeSpecials()` (`src/world/map.js`) e o ícone em `src/render/icons.js`.

### Mudar a progressão dos bairros

Edite `START_OPEN` e `DISTRICT_ORDER` em `src/game/blitz.js`. Se mudar os nomes dos bairros, mantenha as chaves de `zoneAt()`, porque elas vão no save (`unlocked`).

### Um veículo novo

Adicione em `CT` (`vehicles.js`), na mistura de trânsito do bairro (`MIX` em `traffic.js`), a altura em `HEIGHTS` e as peças em `carParts()` (`render3d/r3d.js`), e o desenho 2D em `render/draw.js`.

## Depurar

- **F3**: o contador de FPS já vem ligado (`perf.mode = 1`). Cada toque avança contador → painel completo → desligado → contador. O painel completo mostra FPS, tempo da lógica e do desenho, placa de vídeo, resolução, chamadas de desenho, triângulos e blocos de chão carregados, com o palpite do gargalo.
- **`window.__game`** no console expõe `S`, `player`, `cam`, `keys`, `update`, `render`, `enterExit`, `startMission`, `finishMission` e `phones`. Exemplos:

```js
__game.player.money = 25000          // libera os bairros em sequência
__game.player.heat = 560             // 6 estrelas
__game.S.tod = 21                    // pula pra noite
__game.startMission()                // começa a próxima missão
```

- A faixa vermelha "Erro recuperado (Nx)" mostra a última exceção. O erro completo vai pro console.

## Lançar uma versão

O número segue `MAIOR.MENOR.CORREÇÃO` (explicado no topo do [CHANGELOG](../CHANGELOG.md)).

1. Atualize `VERSION` em `src/core/version.js`, `version` em `package.json` e a versão escrita no `README.md` e no `docs/README.md`.
2. Descreva as mudanças no topo do `CHANGELOG.md`, no mesmo estilo (título curto em negrito e itens em linguagem de jogador).
3. Se mudou algo que o jogador vê, atualize o [guia do jogador](guia-do-jogador.md) e a [referência](referencia.md).
4. Faça o commit com a mensagem `Versão X.Y.Z: resumo` (é o padrão do histórico).
5. Crie a tag e envie:

```bash
git tag vX.Y.Z
git push --tags
```

A versão aparece na tela de título e no canto do minimapa, e vai dentro do save (`v`), o que permite migrar saves antigos em `loadGame()`.

## Pontos de atenção encontrados no código

Coisas notadas ao escrever esta documentação, a partir da geração atual da cidade (semente 1337). Não são mudanças, só registro pra decidir depois.

1. **O que fica aberto no começo (resolvido na 1.8.0).** Antes, com só Centro e Jardim liberados, postos, Zé e lanchonetes ficavam todos em bairro fechado. Com a cidade maior, o Centro e o Jardim têm os dois Postos Maresia, a Oficina do Zé, parte das lanchonetes e lojas (`assignCommerce` põe pelo menos 1/3 de cada comércio lá) e uns 10 dos 18 pontos de ônibus. A Pintura do Cajueiro, o Armas do Tonhão e o estacionamento do Brisa continuam em bairro fechado.
2. **Guincho sem destino aberto (corrigido).** Dava pra furar a blitz, pegar o guincho de um posto fechado e travar o jogo, porque `updTow` não achava destino aberto. Agora `towZones()` é checado ao começar o turno (não começa) e ao engatar o carro (encerra o turno com aviso).
3. **Carreira fora do save.** `aq_career` não é apagado ao começar do zero (BACKSPACE), então os níveis dos empregos continuam.
4. **Bônus do vigilante (corrigido).** Antes dava pra começar o turno entre 5h e 6h (ainda escuro) e receber o bônus na hora. Agora não se começa turno entre 5h e 7h, e o bônus só é pago com pelo menos 2 horas de jogo de turno (`GUARD_MIN_SHIFT`, 1 minuto real).
5. **Horário do vigilante.** A mensagem diz "das 20h às 5h", mas o código libera quando `darkness() >= 0.5`, que acontece por volta das 18h15, e encerra às 5h.
6. **`updateCopsOnFoot`** em `ai/police.js` está vazia (os policiais a pé são atualizados em `updatePeds` via `updateCopPed`).
7. **`TRAFFIC_MIX`** em `vehicles.js` é importado em `world.js` mas não é usado: o trânsito sai de `MIX` em `traffic.js`.
8. **`package.json`** ainda descreve o jogo como "Canvas 2D", mas o padrão hoje é 3D com Three.js.
