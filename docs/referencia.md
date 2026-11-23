# Referência de números

Valores tirados direto do código da versão 1.4.0, pra consulta e pra balancear o jogo. Cada tabela diz em que arquivo o número mora.

Unidades: distância e velocidade em **pixels do mundo** (1 tile = 32 px; a cidade tem 376 × 376 tiles). Tempo em segundos reais.

## Procurado

Arquivo: `src/game/world.js`, `src/game/update.js`, `src/ai/police.js`

O procurado é um número interno `player.heat` de 0 a 660. As estrelas são `floor((heat + 50) / 100)`, no máximo 6.

| Estrelas | heat a partir de | Viaturas ao mesmo tempo | Quem aparece |
|---|---|---|---|
| 0 | 0 | 0 | — |
| 1 | 50 | 2 | viatura |
| 2 | 150 | 3 | viatura (atiram) |
| 3 | 250 | 5 | viatura + bloqueios |
| 4 | 350 | 7 | 40% SWAT, 60% viatura |
| 5 | 450 | 9 | 50% FBI, 25% SWAT, 25% viatura |
| 6 | 550 | 11 | 40% exército, 15% blindado, 25% FBI, 20% SWAT |

**O que soma heat**

| Ação | heat |
|---|---|
| Cada tiro do jogador | +3 |
| Soco em pedestre (sem derrubar) | +18 |
| Atirar numa viatura (no máx. 1x por segundo) | +25 |
| Roubar carro com motorista | +28 |
| Bater numa viatura (no máx. 1x a cada 1,5 s) | +30 |
| Destruir um carro | +40 |
| Matar pedestre | +55 |
| Matar policial | +120 |
| Alarme do Brisa (missão 3) | +120 |
| Roubar uma viatura | +130 |
| Destruir uma viatura | +150 |
| Furar a blitz | sobe pra 300 (3 estrelas) |
| Ficar mais de 3 s em área fechada | sobe pra 300 e não cai abaixo de 250 |

**Como cai**

| Situação | Queda |
|---|---|
| Ninguém te vê há mais de 4 s | −9 por segundo |
| Isso, parado ou a menos de 25 de velocidade num beco ou estacionamento | −27 por segundo |
| Trocar de carro sem ser visto (mais de 2 s sem contato) | −100 de uma vez |
| Pintura Express | zera ($500 × estrelas) |
| Fiança na delegacia (até 2 estrelas) | zera ($300 × estrelas) |

**Visão da polícia:** viatura te vê a menos de 170 px ou a menos de 480 px com linha de visão livre. Policial a pé vê a 350 px com linha de visão. "Visto recentemente" vale por 2,5 s.

**Bloqueios** (3+ estrelas): só quando você está de carro a mais de 120, a cada 14–22 s, até 4 carros de bloqueio, montados uns 900 px à frente. 2 carros em rua e 3 em avenida. Com 4+ estrelas, o do meio é van da SWAT. Com 6, blindado e jipes.

**Prisão:** viatura encostada com você a menos de 30 de velocidade por 1,6 s. A pé: policial a menos de 30 px, ou viatura a menos de 70 px andando devagar, por 0,9 s.

**Tropa a pé**

| Unidade | Desce de | Quantos (3+ estrelas) | Arma | Alcance | Velocidade | Tiros que aguenta |
|---|---|---|---|---|---|---|
| Polícia | viatura | 2 | pistola | 280 | 110 | 1 |
| SWAT | van da SWAT | 3 | SMG | 320 | 105 | 3 |
| FBI | sedã do FBI | 2 | pistola | 340 | 125 | 2 |
| Exército | jipe / blindado | 3 / 4 | SMG | 380 | 115 | 4 |

Com menos de 3 estrelas desce 1 por veículo. Limite de 5 policiais a pé (9 com 4+ estrelas). Arma com dano 60 ou mais ignora o colete. Nenhuma arma do jogador chega a 60, então o colete sempre conta.

## Operação Maré Alta

Arquivo: `src/game/blitz.js`

| Item | Valor |
|---|---|
| Abertos no começo | Centro, Jardim Maresia |
| Metas | Cajueiro $2.000 · Alto da Maresia $5.000 · Orla $10.000 · Vila Velha $16.000 · Porto $25.000 |
| Área fechada | o bairro encolhido 4 tiles (as avenidas da divisa ficam livres) |
| Velocidade pra furar | 110 ou mais |
| Cancela quebrada | fica aberta 40 s |
| Pneu furado | velocidade máx. × 0,5, aderência × 0,55, até consertar no posto |
| Viaturas e guardas da blitz | aparecem a menos de 1.300 px e somem a mais de 1.900 px |
| Detecção dentro da área fechada | 3 s |

## Veículos

Arquivo: `src/entities/vehicles.js` (`CT`)

| Veículo | Vel. máx. | Aceleração | Freio | Aderência | Giro | Vida | Massa | Valor no Zé |
|---|---|---|---|---|---|---|---|---|
| Jegue 1.0 | 260 | 220 | 460 | 7 | 2,7 | 100 | 1 | $200 |
| Brisa GT | 430 | 360 | 560 | 8,5 | 2,9 | 90 | 1 | $900 |
| Táxi | 290 | 240 | 480 | 7,5 | 2,7 | 110 | 1,1 | $300 |
| Caminhonete | 255 | 210 | 440 | 7 | 2,2 | 180 | 1,7 | $500 |
| Bugue (areia) | 330 | 340 | 480 | 6,2 | 3,3 | 80 | 0,8 | $600 |
| Busão | 200 | 130 | 340 | 7 | 1,7 | 320 | 4 | $800 |
| Motoca | 340 | 380 | 520 | 7,5 | 3,6 | 60 | 0,5 | $250 |
| Guincho | 240 | 190 | 420 | 7 | 2,1 | 220 | 2,2 | $700 |
| Sedã Executivo | 390 | 310 | 560 | 8,4 | 2,6 | 120 | 1,3 | $1.100 |
| Utilitário | 320 | 260 | 500 | 7,8 | 2,4 | 160 | 1,6 | $800 |
| Lotação | 250 | 170 | 400 | 7 | 2 | 200 | 2 | $600 |
| Caminhão Baú | 210 | 120 | 320 | 7 | 1,8 | 300 | 3,5 | $900 |
| Viatura | 390 | 330 | 560 | 8,6 | 2,9 | 150 | 1,3 | $1.200 |
| Van da SWAT | 330 | 250 | 480 | 8 | 2,2 | 340 | 2,6 | $1.800 |
| Sedã do FBI | 450 | 380 | 600 | 9 | 2,8 | 170 | 1,4 | $2.000 |
| Jipe do Exército (areia) | 360 | 320 | 520 | 8,4 | 2,7 | 260 | 2 | $1.500 |
| Blindado | 250 | 150 | 380 | 8 | 1,7 | 1.000 | 6 | $4.000 |

- **Terreno:** areia sem tração pra areia: aderência × 0,5 e velocidade × 0,6. Areia com tração (Bugue, Jipe): aderência × 0,9 e velocidade × 1,05. Grama: aderência × 0,75 e velocidade × 0,75.
- **Dano:** abaixo de 25% de vida, velocidade × 0,75. Abaixo de 35%, fumaça. Em 0, pega fogo e explode depois de 3,2 s (raio de 100 px pra carros, 80 pra pedestres, 90 pro jogador a pé).
- **Desmanche do Zé:** paga `valor × (vida / vida máx.)`, só se a vida estiver acima de 40%.
- **Batida:** impacto acima de 90 contra parede dá dano. Em batida entre carros, o carro do jogador causa bem mais dano no outro (`(impacto − 40) × 0,3`).
- **Curso de direção:** aderência × 1,15 no carro do jogador.
- **Sair do carro:** só abaixo de 60 de velocidade.

**Trânsito por bairro** (`MIX` em `src/ai/traffic.js`; cada entrada é um sorteio, então repetir aumenta a chance):

| Bairro | Mistura |
|---|---|
| Centro | Jegue ×2, Táxi ×2, Sedã Executivo, Utilitário, Busão, Caminhonete, Motoca, Lotação |
| Alto da Maresia | Brisa ×2, Sedã Executivo ×2, Utilitário ×2, Táxi, Bugue |
| Vila Velha | Jegue ×2, Motoca ×2, Táxi, Lotação |
| Alto do Cajueiro | Motoca ×3, Jegue ×2, Caminhonete, Lotação |
| Jardim Maresia | Jegue ×2, Utilitário, Táxi, Motoca, Caminhonete, Lotação |
| Orla | Bugue ×2, Brisa, Jegue, Táxi, Utilitário, Sedã Executivo |
| Porto | Caminhão Baú ×3, Caminhonete, Jegue |

Até 60 carros de trânsito e 60 pedestres perto do jogador.

## Armas

Arquivo: `src/game/weapons.js` (`WEAPONS`)

| Arma | Cadência (s) | Dano em pessoa | Dano em carro | Alcance | Espalhamento | Chumbos | Preço | Pacote |
|---|---|---|---|---|---|---|---|---|
| Pistola | 0,30 | 40 | 9 | 460 | 0,035 | 1 | $300 | 24 |
| Escopeta | 0,85 | 34 | 7 | 250 | 0,22 | 7 | $800 | 12 |
| SMG (automática) | 0,085 | 24 | 5 | 400 | 0,08 | 1 | $1.500 | 90 |

- Pedestre comum morre com 1 tiro. Unidades com colete perdem 1 "vida" por tiro (veja a tropa a pé).
- Tiro inimigo no jogador a pé: dano × 0,28. O colete do jogador absorve 75% do dano.
- Soco: recarga 0,4 s, 3 socos matam.
- Curso de pontaria: espalhamento × 0,55.
- Mira automática no teclado: cone de 0,38 rad. Com mouse: 0,08 rad.

## Missões

Arquivo: `src/game/missions.js` (`MISSIONS`)

| # | Missão | Tempo | Prêmio base | Precisa de |
|---|---|---|---|---|
| 1 | Encomenda da Dona Socorro | 80 s | $1.000 | — |
| 2 | Corrida do Chico | 110 s (+25 ao embarcar) | $1.500 | — |
| 3 | O Brisa do Doutor | 200 s | $2.500 | Alto da Maresia e Orla |
| 4 | Acerto de Contas | 200 s | $3.000 | — |
| 5 | Fuga pela Orla | 150 s | $4.000 | — |

Prêmio = base × (1 + 0,6 × rodada). Rodada 0 é a primeira passada pela lista. Depois de terminar ou falhar, o orelhão espera 3 s.

## Empregos

Arquivo: `src/game/jobs.js`

Multiplicador do nível: `1 + 0,25 × (nível − 1)`. O nível sobe a cada 5 serviços, até 5 (× 2,0).

| Emprego | Pagamento base | Prazo |
|---|---|---|
| Taxista | `50 + distância/9 + 3 × segundos que sobraram`. × 0,6 se o carro levou mais de 25 de dano | `distância/150 + 14` s. Falha com 2+ estrelas |
| Motoboy | `35 + distância/11`, +30 se sobrar mais de 40% do prazo | `distância/190 + 12` s |
| Busão | 14 por passageiro (1–5 por ponto). Volta completa: 200 × mult. | parar a menos de 25 por 1,4 s |
| Guincho | `150 + distância/7` | sem prazo |
| Vigilante | 110 por assaltante. Amanhecer: 300 × mult. (só com 2h de jogo de turno). | até 5h. Assaltantes a cada 9–16 s (mais rápido com nível), até 3 de uma vez, 2 tiros cada |

Sequência: a cada 5 serviços seguidos, bônus de 150 × mult.

## Lojas e serviços

Arquivo: `src/game/interiors.js` (`PLACES`), `src/game/update.js` (zonas)

| Lugar | Item | Preço | Efeito |
|---|---|---|---|
| Farmácia | Curativo | $25 | +30 vida |
| | Kit completo | $80 | vida cheia |
| | Colete | $350 | colete 100 |
| Mercadinho | Refrigerante / Biscoito / Marmita | $5 / $10 / $25 | +10 / +20 / +50 |
| | Raspadinha | $10 | 12% de chance de $250 |
| Padaria | Cafezinho / Pão de queijo / Café da manhã | $4 / $8 / $20 | +10 / +15 / +45 |
| Lanchonete | Pastel / X-tudo / Combo | $10 / $22 / $30 | +20 / +50 / +70 |
| Lojinha do posto | Água / Salgado | $3 / $12 | +8 / +25 |
| Hospital | Tratamento | $100 | vida cheia (+0,5/s só de estar lá dentro) |
| Delegacia | Fiança | $300 × estrelas | zera (só até 2 estrelas) |
| Armas do Tonhão | Pistola / Escopeta / SMG / Colete | $300 / $800 / $1.500 / $350 | munição e colete |
| Escola | Pontaria / Direção / Primeiros socorros | $500 / $400 / $600 | permanente |
| Arena | Assistir / Apostar | $20 / $100 | +15 vida e pula pras 18h / paga $250 se o Maresia ganhar |
| Posto Maresia | Conserto | $150 | vida do carro cheia, apaga fogo, conserta pneu |
| Pintura Express | Pintura | $500 × estrelas | zera o procurado e muda a cor |
| — | Morrer / ser preso | $300 / $500 | perde as armas |

## Tempo

Arquivo: `src/world/time.js`, `src/game/stadium.js`

| Item | Valor |
|---|---|
| Duração do dia | 720 s (12 min). 1 hora do jogo = 30 s reais |
| Hora inicial | 16h30 |
| Escuridão | 0 das 7h às 17h, escurece das 17h às 19h30, noite até 5h, clareia das 5h às 7h |
| Jogo na Arena | 15h30 às 18h. Apostas até 17h |
| Gols | um "lance" a cada 8–18 s, 55% de chance de gol, 55% de ser do Maresia |
| Semáforo | ciclo de 16 s (verde 6,5 s + amarelo 1,5 s por direção) |
| Save automático | a cada 45 s (sem missão e sem estrelas) |

## Cidade

Arquivo: `src/world/map.js`, `src/world/zoning.js`

| Item | Quantidade |
|---|---|
| Tamanho | 376 × 376 tiles de 32 px |
| Comércios | 8 farmácias, 10 mercadinhos, 6 padarias, 4 escolas, 10 lanchonetes (pelo menos 1/3 de cada no Centro e no Jardim) |
| Serviços | 1 hospital, 1 delegacia, 2 Pinturas Express, 1 Armas do Tonhão, 2 Postos Maresia, 1 Oficina do Zé, 1 casa, 1 estádio |
| Orelhões | 22 |
| Motocas de trabalho | em até 6 lanchonetes |

A cidade é gerada sempre igual (semente fixa `mulberry(1337)` em `src/core/utils.js`). Onde cada lugar fica, na geração atual:

| Bairro | Lugares |
|---|---|
| Centro | hospital, delegacia, Arena, Oficina do Zé, 1 Posto Maresia, 4 escolas, 4 lanchonetes, 4 mercadinhos, 2 farmácias, 2 padarias, 7 orelhões |
| Jardim Maresia | sua casa, 1 Pintura Express, 1 Posto Maresia, 1 farmácia, 2 orelhões |
| Alto do Cajueiro | 1 Pintura Express, Armas do Tonhão, 2 lanchonetes, 1 mercadinho, 1 farmácia, 1 padaria, 4 orelhões |
| Alto da Maresia | estacionamento do Brisa, 3 orelhões |
| Orla | hotéis e praia |
| Vila Velha | 5 mercadinhos, 4 farmácias, 4 lanchonetes, 3 padarias, 4 orelhões |
| Porto | 2 orelhões |
