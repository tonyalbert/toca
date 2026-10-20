/**
 * Palavras do Desenha e Adivinha: coisas que dá para desenhar em um minuto e
 * que todo mundo conhece. Acento não importa na hora de chutar.
 */
const WORDS = `
abacaxi abelha abóbora açaí adesivo agulha água aipim alface alicate âncora anel anjo antena apito aquário arame aranha
arco-íris areia árvore aspirador astronauta avião avó azeitona bacia balança balão baleia banana banco bandeira banheira barba
barco barraca basquete bateria batata batom bebê beijo bicicleta bigode biscoito bola bolo bolsa bombeiro boneco borboleta bota
botão braço brigadeiro brinco bruxa buraco cabelo cabide cachoeira cachorro cacto cadeado cadeira café caixa calça calculadora
cama camaleão camelo caminhão camisa campainha caneca caneta canguru canoa capacete caracol carimbo carro carta casa castelo
cavalo caverna cebola cenoura cerca chapéu chave chiclete chinelo chocolate chupeta churrasco chuva chuveiro cobra coco coelho
cogumelo colher computador controle copo coração coroa coruja cozinheiro cruz dado dentista dente despertador diamante dinheiro
dinossauro dragão elefante elevador envelope escada escorregador escova esqueleto estrela esquilo faca fada fantasma farol
feijão fogão fogo fogueira foguete formiga fotografia fruta futebol galinha garfo garrafa gato geladeira gelo gigante girafa
girassol globo golfinho gorila gravata guarda-chuva guitarra hambúrguer helicóptero hipopótamo igreja ilha ímã iogurte janela
jacaré joaninha jornal lâmpada lagarta lago lápis laranja leão leite lençol livro lobo lua luva maçã macaco mala mão mapa
martelo máscara médico mel melancia mesa microfone milho mochila moeda montanha morango mosquito moto mouse navio neve ninho
nuvem óculos olho onda orelha ovelha ovo padeiro palhaço palmeira panela pão papagaio paraquedas pato pavão pé peixe pente
pera perna peru pião pijama pinguim pipa pipoca pirata piscina pizza planeta polvo ponte porco porta presente professor
pulseira queijo rádio raio rato rede relógio remo robô roda rosa sabonete sacola sapato sapo sereia sino sol sorvete sofá
submarino tartaruga tatu telefone televisão tênis tesoura tigre tomate tornado torre trator trem tubarão unicórnio urso uva
vaca vampiro vaso vela ventilador vulcão xícara zebra zíper
`
  .split(/\s+/)
  .filter(Boolean);

/** Sorteia n palavras diferentes, evitando as que já saíram neste jogo */
export function pickWords(n: number, used: ReadonlySet<string>): string[] {
  const fresh = WORDS.filter((w) => !used.has(w));
  const pool = fresh.length >= n ? fresh : WORDS;
  const out: string[] = [];
  while (out.length < n) {
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (!out.includes(w)) out.push(w);
  }
  return out;
}
