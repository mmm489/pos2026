const FALLBACK = "#9A9A9A";

export const FLAVOR_COLORS: Record<string, string> = {
  "Açaí": "#6E4E8F",
  Avellana: "#C7A06A",
  Cafè: "#7B5436",
  "Cheese cake": "#E8D49A",
  Cheesecake: "#E8D49A",
  Coco: "#EDE7DA",
  Crispet: "#E3B968",
  Crispetes: "#E3B968",
  "Dolç de llet": "#C98A45",
  "Dulce de leche": "#C98A45",
  Ferrero: "#7E5430",
  Iogurt: "#F2DDE8",
  Kinder: "#D8BC93",
  Llimona: "#EBD24A",
  Lotus: "#C68B4A",
  Maduixa: "#E36A86",
  Mango: "#F1A93C",
  Maracujà: "#F0B83E",
  "Menta xoco": "#86C9A6",
  "Menta xoc": "#86C9A6",
  Nata: "#F0E8D6",
  Nutella: "#6E4327",
  Oreo: "#4B4A4D",
  Pistatxo: "#A0BC68",
  Pistaxo: "#A0BC68",
  Stracia: "#ECE3CF",
  Turró: "#E0C794",
  Vainilla: "#EFE6C6",
  "Vainilla cookies": "#E6D4AC",
  Xocolata: "#5A3A23",
  Stracciatella: "#ECE3CF",
};

export const ITEM_COLORS: Record<string, string> = {
  "7up": "#53A94A",
  Agua: "#6FB8E8",
  Aigua: "#6FB8E8",
  "Aigua 1,5": "#6FB8E8",
  "Aigua amb gas": "#78C7D8",
  "Aigua 50 cc": "#6FB8E8",
  Aquarius: "#E9C94E",
  "Aquarius llimona": "#E9C94E",
  "Begudes veins": "#6AAE83",
  "Bitter kas": "#D95032",
  Cacaolat: "#8A5A3C",
  Coke: "#D92F2F",
  "Coke 00": "#2B2B2D",
  CocaCola: "#D92F2F",
  "Coca cola": "#D92F2F",
  "Coca-cola": "#D92F2F",
  "Damm lemon": "#EACB45",
  Estrella: "#D8A338",
  "Fanta llimona": "#EBD24A",
  "Fanta taronja": "#F28C35",
  "Free damm": "#B94E3E",
  "Free damm torrada": "#9A5A38",
  "Granini piña": "#F0B83E",
  "Granini pressec": "#EFA255",
  "Granini préssec": "#EFA255",
  "Granini taronja": "#F28C35",
  Nestea: "#B9824B",
  "Tonica sweppes": "#E8D49A",
  "Tónica sweppes": "#E8D49A",
  "Casa hi cream": "#2E9E5B",
  "Max kinder": "#D8BC93",
  "Max lotus": "#C68B4A",
  "Max oreo": "#4B4A4D",
  "Max pistacho": "#A0BC68",
  "Berlines hot helado": "#E06AA0",
  "Mini donut": "#E6B93E",
  "Mini donut decorat": "#D95B72",
  "Chai late": "#B9824B",
  "Chai pistatxo": "#A0BC68",
  "Chai xocolata negre": "#4A2E22",
  "Matcha coco": "#86C9A6",
  "Matcha late": "#7DAA62",
  "Matcha maduixa": "#E36A86",
  "Matcha mango": "#F1A93C",
  "Pistacho latte": "#A0BC68",
  "Special avellana": "#C7A06A",
  "Special caramel": "#C98A45",
  "Special lotus": "#C68B4A",
  "Special mocha blanc": "#EFE6C6",
  "Special mocha negre": "#4A2E22",
  "Special vainilla": "#EFE6C6",
  Crepe: "#E6B93E",
  "Crepe kinder": "#D8BC93",
  "Crepe nutella": "#6E4327",
  "Crepe pistatxo": "#A0BC68",
  "Crepe salsa oreo": "#4B4A4D",
  "Crepe xocolata": "#5A3A23",
  "Crepe xocolata blanca": "#EFE6C6",
  Mediterraneo: "#6AAE83",
  Mixto: "#D8A338",
  Quesos: "#E8D49A",
  "Frappe & nata": "#F0E8D6",
  "Frappe clasic": "#8A5A3C",
  "Frappe matcha": "#7DAA62",
  "Frappe pistatxo": "#A0BC68",
  "Frapuccino candy": "#D95B72",
  "Frapuccino vainilla": "#EFE6C6",
  "Cookies cream": "#4B4A4D",
  "Kinder delight": "#D8BC93",
  "Lotus receta": "#C68B4A",
  "Nutella & go": "#6E4327",
  "Pistacho receta": "#A0BC68",
  "Te macha receta": "#7DAA62",
  "Té macha receta": "#7DAA62",
  "Yogurt pasion": "#F0B83E",
  "Yogurt pasión": "#F0B83E",
  "Cucurutxo S": "#E9C77B",
  "Cucurutxo M": "#DFAE57",
  "Cucurutxo L": "#C98A45",
  "Pot S": "#F0E8D6",
  "Pot M": "#D9C4F0",
  "Pot L": "#E06AA0",
  Tupper: "#86C9A6",
  "Granitzat coco": "#EDE7DA",
  "Granitzat frambuesa": "#D9577A",
  "Granitzat llimona": "#EBD24A",
  "Granitzat maduixa": "#E36A86",
  "Granitzat mango": "#F1A93C",
  "Smoothie açai": "#6E4E8F",
  "Smoothie acai": "#6E4E8F",
  "Smoothie coco": "#EDE7DA",
  "Smoothie frambuesa": "#D9577A",
  "Smoothie fresa": "#E36A86",
  "Smoothie mango": "#F1A93C",
  "Smoothie maracuya": "#F0B83E",
  "Iced cafe": "#7B5436",
  "Iced llimona": "#EBD24A",
  "Iced maduixa": "#E36A86",
  "Iced mango": "#F1A93C",
  "Iced maracuia": "#F0B83E",
  "Milk cafe": "#B9824B",
  "Milk mango": "#F1A93C",
  "Milk maracuia": "#F0B83E",
  "Oreo ice": "#4B4A4D",
  Brownie: "#6F4A2F",
  "Caramel salat": "#B9824B",
  "Crema catalana": "#D7A455",
  Festuc: "#9DBB62",
  Gelat: "#E06AA0",
  "Kinder salsa": "#D8BC93",
  "Lotus salsa": "#C68B4A",
  "Maduixa natural": "#E36A86",
  "Melmelada nabius": "#6678B8",
  "Melmelada fruits vermells": "#B74764",
  "Melmelada maracuia": "#F0B83E",
  "Fruita natural": "#79B66A",
  "Fruits vermells": "#B74764",
  Nabius: "#6678B8",
  "Pols d'oreo": "#4B4A4D",
  "Oreo pols": "#4B4A4D",
  "Pols de lotus": "#C68B4A",
  "Lotus pols": "#C68B4A",
  "Pols de festuc": "#9DBB62",
  "Pistatxo pols": "#9DBB62",
  Lacasitos: "#D95B72",
  "Crispy balls negra": "#4B4A4D",
  "Crispy balls negre": "#4B4A4D",
  "Crispy balls blanca": "#EFE6C6",
  "Crumble cacao": "#6B432A",
  "Crumble caramel": "#C98A45",
  "Crumble maduixa": "#E36A86",
  "Mini nuvols": "#D9C4F0",
  Nube: "#D9C4F0",
  Sucre: "#EDE7DA",
  Platan: "#EBD24A",
  "Plàtan": "#EBD24A",
  "Platan natural": "#EBD24A",
  "Xoco maduixa": "#B9485E",
  "Xocolata blanca": "#EFE6C6",
  "Xocolata pistatxo": "#7DAA62",
  "Pistatxo salsa": "#9DBB62",
  "Oreo salsa": "#4B4A4D",
  "Bola gelat": "#E06AA0",
};

export const CATEGORY_COLORS: Record<string, string> = {
  "Tots els productes": "#7C7F86",
  Batuts: "#8576D0",
  Begudes: "#5B9BE0",
  Berlines: "#EFA255",
  Cafès: "#8A5A3C",
  Especialitat: "#BE6BC4",
  Especialitats: "#BE6BC4",
  Crepes: "#E6B93E",
  Donuts: "#EE9046",
  Frappes: "#7B5642",
  Gelats: "#E06AA0",
  Granissat: "#4FBF95",
  Granissats: "#4FBF95",
  "Hi pop": "#E8A93C",
  "Ice drinks": "#3FB5C9",
  Receptes: "#E2697E",
  Smoothie: "#4FAE86",
  "Frozen iogurt": "#DB8AD8",
  Xips: "#9CC24E",
  Xurros: "#EE9046",
  Varios: "#8A8D94",
  Infusions: "#8FB04E",
  Orxata: "#F0A9AE",
  Cremas: "#C98A45",
  Cremes: "#C98A45",
  "Salsas i cremes": "#C98A45",
  Mermelada: "#F1A93C",
  Crunchy: "#8E7A64",
  Toppings: "#9A7FB8",
  "Toppings 0,5€": "#9A7FB8",
  "Topping 1€ extra": "#8D6E63",
  "Topping bola gelat": "#E06AA0",
  "Topping gelat 1€": "#E06AA0",
  "Topping gelat 2€": "#E06AA0",
  Sabors: "#D6B36A",
  "Sabors gelat": "#D6B36A",
  "Extres batut": "#F0E8D6",
};

const FLAVOR_COLOR_INDEX = buildColorIndex(FLAVOR_COLORS);
const ITEM_COLOR_INDEX = buildColorIndex(ITEM_COLORS);
const CATEGORY_COLOR_INDEX = buildColorIndex(CATEGORY_COLORS);

function buildColorIndex(source: Record<string, string>) {
  return Object.entries(source).reduce<Record<string, string>>((acc, [name, color]) => {
    acc[normaliseName(name)] = color;
    return acc;
  }, {});
}

export function normaliseName(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9]+(?:[,.][0-9]+)?\s*(€|eur)/gi, "")
    .replace(/€/g, "")
    .replace(/^(sabor|topping|gelat|granitzat|granissat|granizado|smoothie|iced|milk|special|frappe|frapuccino|crepe)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ca-ES");
}

export function sentenceCase(value: string | null | undefined): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const lower = text.toLocaleLowerCase("ca-ES");
  const cased = lower.charAt(0).toLocaleUpperCase("ca-ES") + lower.slice(1);
  return cased
    .replace(/\bxl\b/gi, "XL")
    .replace(/\b([sml])\b/gi, (size) => size.toLocaleUpperCase("ca-ES"));
}

export function titleCase(value: string | null | undefined): string {
  return sentenceCase(value)
    .split(" ")
    .map((word) => {
      if (/^(S|M|L|XL)$/i.test(word)) return word.toLocaleUpperCase("ca-ES");
      if (/^[0-9]/.test(word)) return word;
      return word.charAt(0).toLocaleUpperCase("ca-ES") + word.slice(1);
    })
    .join(" ");
}

export function luminance(hex: string): number {
  const clean = hex.startsWith("#") ? hex : FALLBACK;
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function textColorOn(hex: string): string {
  return luminance(hex) > 0.6 ? "#241f1c" : "#ffffff";
}

export function resolveColor(opts: {
  flavor?: string | null;
  category?: string | null;
  productColor?: string | null;
}): string {
  if (opts.flavor) {
    const normalizedFlavor = normaliseName(opts.flavor);
    const flavorColor = FLAVOR_COLOR_INDEX[normalizedFlavor] ?? ITEM_COLOR_INDEX[normalizedFlavor];
    if (flavorColor) return flavorColor;
  }
  if (opts.productColor) return opts.productColor;
  if (opts.category) {
    const categoryColor = CATEGORY_COLOR_INDEX[normaliseName(opts.category)];
    if (categoryColor) return categoryColor;
  }
  return FALLBACK;
}
