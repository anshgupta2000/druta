// Druta Locker — Premium outfit catalog
// Each item has id, name, category, emoji icon, and color variants

const VARIANT_PALETTES = {
  neutral: [
    { id: "blk", name: "Onyx", hex: "#1A1A1E" },
    { id: "wht", name: "Frost", hex: "#F0F0F0" },
    { id: "gry", name: "Slate", hex: "#5A5A6A" },
    { id: "crm", name: "Cream", hex: "#F5E6D3" },
    { id: "chr", name: "Charcoal", hex: "#2D2D35" },
    { id: "stn", name: "Stone", hex: "#8B8B8B" },
  ],
  bold: [
    { id: "blu", name: "Cobalt", hex: "#2D7AFF" },
    { id: "red", name: "Ember", hex: "#FF3B5C" },
    { id: "grn", name: "Neon", hex: "#00E676" },
    { id: "org", name: "Flame", hex: "#FF6B35" },
    { id: "prp", name: "Amethyst", hex: "#8B5CF6" },
    { id: "cyn", name: "Ice", hex: "#00D4FF" },
    { id: "gld", name: "Gold", hex: "#FFCA28" },
    { id: "pnk", name: "Blush", hex: "#EC4899" },
  ],
  earth: [
    { id: "olv", name: "Olive", hex: "#6B8E23" },
    { id: "rst", name: "Rust", hex: "#B7410E" },
    { id: "tan", name: "Sand", hex: "#C2B280" },
    { id: "nav", name: "Navy", hex: "#1B2A4A" },
    { id: "brn", name: "Mocha", hex: "#6F4E37" },
    { id: "teal", name: "Teal", hex: "#008080" },
  ],
};

function makeColors(...paletteNames) {
  const colors = [];
  paletteNames.forEach((p) => {
    const palette = VARIANT_PALETTES[p];
    if (palette) colors.push(...palette);
  });
  return colors;
}

export const CATEGORIES = [
  { id: "all", name: "All", icon: "✦" },
  { id: "hoodies", name: "Hoodies", icon: "🧥" },
  { id: "tops", name: "Tops", icon: "👕" },
  { id: "bottoms", name: "Bottoms", icon: "👖" },
  { id: "shoes", name: "Shoes", icon: "👟" },
  { id: "caps", name: "Caps", icon: "🧢" },
  { id: "accessories", name: "Acc", icon: "⌚" },
];

export const LOCKER_ITEMS = [
  // === HOODIES (12) ===
  {
    id: "h01",
    name: "Druta Classic",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "h02",
    name: "Midnight Run",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "h03",
    name: "Apex Zip",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "h04",
    name: "Storm Shell",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "h05",
    name: "Territory Hoodie",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("bold", "neutral"),
  },
  {
    id: "h06",
    name: "Quantum Pullover",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "h07",
    name: "Vapor Lite",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("bold", "earth"),
  },
  {
    id: "h08",
    name: "Blaze Crop",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "h09",
    name: "Grid Runner",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "h10",
    name: "Neon Nights",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("bold"),
  },
  {
    id: "h11",
    name: "Stealth Zip",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("neutral"),
  },
  {
    id: "h12",
    name: "Summit Parka",
    category: "hoodies",
    icon: "🧥",
    colors: makeColors("neutral", "earth"),
  },

  // === TOPS (12) ===
  {
    id: "t01",
    name: "Performance Tee",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "t02",
    name: "Pace Tank",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "t03",
    name: "Trail Long Sleeve",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "t04",
    name: "Aero Mesh",
    category: "tops",
    icon: "👕",
    colors: makeColors("bold", "neutral"),
  },
  {
    id: "t05",
    name: "Compression Pro",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "t06",
    name: "Logo Crop",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "t07",
    name: "UV Shield",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "t08",
    name: "Wind Tee",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "t09",
    name: "Race Day Jersey",
    category: "tops",
    icon: "👕",
    colors: makeColors("bold"),
  },
  {
    id: "t10",
    name: "Cotton Basics",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral"),
  },
  {
    id: "t11",
    name: "Dry Fit V",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "t12",
    name: "Reflective Strip",
    category: "tops",
    icon: "👕",
    colors: makeColors("neutral", "bold"),
  },

  // === BOTTOMS (12) ===
  {
    id: "b01",
    name: "Stride Shorts",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "b02",
    name: "Marathon Tights",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "b03",
    name: "Trail Cargos",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "b04",
    name: "Flex Joggers",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "b05",
    name: "Split Shorts",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "b06",
    name: "Stealth Leggings",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral"),
  },
  {
    id: "b07",
    name: "Warm-Up Pants",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "b08",
    name: "7-Inch Pace",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "b09",
    name: "Track Pants",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "b10",
    name: "Compression Half",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "b11",
    name: "Wind Pants",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "b12",
    name: "Everyday Sweats",
    category: "bottoms",
    icon: "👖",
    colors: makeColors("neutral"),
  },

  // === SHOES (12) ===
  {
    id: "s01",
    name: "Druta One",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "s02",
    name: "Trail Blazer",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "s03",
    name: "Speed Racer",
    category: "shoes",
    icon: "👟",
    colors: makeColors("bold", "neutral"),
  },
  {
    id: "s04",
    name: "Cloud Stride",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "s05",
    name: "Tempo Max",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "s06",
    name: "Grip Pro",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "s07",
    name: "Ultra Bounce",
    category: "shoes",
    icon: "👟",
    colors: makeColors("bold"),
  },
  {
    id: "s08",
    name: "Carbon Plate",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "s09",
    name: "Daily Trainer",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral"),
  },
  {
    id: "s10",
    name: "Night Runner",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "s11",
    name: "All-Terrain X",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "s12",
    name: "Featherweight",
    category: "shoes",
    icon: "👟",
    colors: makeColors("neutral", "bold"),
  },

  // === CAPS (8) ===
  {
    id: "c01",
    name: "Classic Cap",
    category: "caps",
    icon: "🧢",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "c02",
    name: "Mesh Runner",
    category: "caps",
    icon: "🧢",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "c03",
    name: "Bucket Hat",
    category: "caps",
    icon: "🧢",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "c04",
    name: "Visor Pro",
    category: "caps",
    icon: "🧢",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "c05",
    name: "Beanie",
    category: "caps",
    icon: "🧢",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "c06",
    name: "Trail Cap",
    category: "caps",
    icon: "🧢",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "c07",
    name: "Headband",
    category: "caps",
    icon: "🧢",
    colors: makeColors("bold"),
  },
  {
    id: "c08",
    name: "Snapback",
    category: "caps",
    icon: "🧢",
    colors: makeColors("neutral", "bold"),
  },

  // === ACCESSORIES (10) ===
  {
    id: "a01",
    name: "GPS Watch",
    category: "accessories",
    icon: "⌚",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "a02",
    name: "Running Belt",
    category: "accessories",
    icon: "👝",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "a03",
    name: "Arm Band",
    category: "accessories",
    icon: "💪",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "a04",
    name: "Sunglasses",
    category: "accessories",
    icon: "🕶",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "a05",
    name: "Wristbands",
    category: "accessories",
    icon: "🏋️",
    colors: makeColors("bold"),
  },
  {
    id: "a06",
    name: "Neck Gaiter",
    category: "accessories",
    icon: "🧣",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "a07",
    name: "Compression Socks",
    category: "accessories",
    icon: "🧦",
    colors: makeColors("neutral", "bold"),
  },
  {
    id: "a08",
    name: "Hydration Pack",
    category: "accessories",
    icon: "🎒",
    colors: makeColors("neutral", "earth"),
  },
  {
    id: "a09",
    name: "Reflective Vest",
    category: "accessories",
    icon: "🦺",
    colors: makeColors("bold"),
  },
  {
    id: "a10",
    name: "Gloves",
    category: "accessories",
    icon: "🧤",
    colors: makeColors("neutral", "bold"),
  },
];

export function getItemById(id) {
  return LOCKER_ITEMS.find((item) => item.id === id) || null;
}

export function getItemsByCategory(category) {
  if (category === "all") return LOCKER_ITEMS;
  return LOCKER_ITEMS.filter((item) => item.category === category);
}
