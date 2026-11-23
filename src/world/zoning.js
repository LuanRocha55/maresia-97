// Zoneamento da cidade: qual bairro fica em cada tile.
// Sem imports de propósito: o gerador do mapa usa isto enquanto ainda está carregando.
//
//   oeste ............................................ leste (mar)
//   cajueiro | jardim | rico   | orla  | praia | mar
//   cajueiro | centro | centro | orla  | praia | mar
//   velha    | velha  | centro | orla  | praia | mar
//   velha    | porto  | porto  | porto         | mar
//   (nomes na tela: Morro do Cajueiro, Jacarandá, Barra Sul, Praia do Recanto,
//    Vila dos Pescadores, Cais do Porto; veja world/districts.js)
//
// A cidade cresceu na 1.8.0 (de 262 pra 376 tiles): os quarteirões têm o mesmo tamanho,
// mas cada bairro ganhou mais ruas. As divisas ficam sempre em cima de uma rua.

export const CITY_X0=16, CITY_X1=328, CITY_Y0=16, CITY_Y1=354; // centros das ruas da borda (em tiles)
export const VV={x0:16,x1:172,y0:224,y1:354};                  // Vila Velha (becos)
export const BEACH_X0=335, BEACH_X1=362;                        // faixa de areia da praia
export const LAND_Y1=360;                                       // fim da terra firme (cais do porto embaixo)

export function zoneAt(tx,ty){
  if(tx>=332) return 'orla';
  if(tx>=302) return ty>=328?'porto':'orla';
  if(ty>=328&&tx>=172) return 'porto';
  if(tx<172&&ty>=224) return 'velha';
  if(tx>=224&&ty<172) return 'rico';
  if(tx<146) return 'cajueiro';
  if(ty<146) return 'jardim';
  return 'centro';
}

// centro aproximado de cada bairro (para nomes no mapa)
export const ZONE_LABELS={ cajueiro:[78,105], jardim:[185,72], rico:[264,95], centro:[236,250], velha:[94,290], porto:[255,342], orla:[350,180] };
