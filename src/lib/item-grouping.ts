export interface GroupedItem<T> {
  base: T;
  modifiers: T[];
  isOrphanModifier?: boolean;
}

const LINE_MARKER_PREFIX = "HC-LINE:";
const PARENT_LINE_MARKER_PREFIX = "HC-PARENT-LINE:";

function splitNoteLines(notes?: string | null): string[] {
  return notes?.split(/\r?\n/) ?? [];
}

function isInternalLine(line: string): boolean {
  const trimmed = line.trim();
  const normalized = trimmed.toUpperCase();
  return (
    normalized.startsWith(LINE_MARKER_PREFIX) ||
    normalized.startsWith(PARENT_LINE_MARKER_PREFIX) ||
    /^HC[-_\s]*(PARENT[-_\s]*)?LINE\s*:?\s*/i.test(trimmed)
  );
}

function readMarker(notes: string | null | undefined, marker: string): string | null {
  const markerLower = marker.toLowerCase();
  const line = splitNoteLines(notes)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.toLowerCase().startsWith(markerLower));
  return line?.slice(marker.length).trim() || null;
}

export function getModifierParent(notes?: string | null): string | null {
  const trimmed = notes?.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() || "";
  if (!firstLine.toLowerCase().startsWith("per ")) return null;
  return firstLine.slice(4).trim() || null;
}

export function getItemLineId(notes?: string | null): string | null {
  return readMarker(notes, LINE_MARKER_PREFIX);
}

export function getModifierParentLineId(notes?: string | null): string | null {
  return readMarker(notes, PARENT_LINE_MARKER_PREFIX);
}

export function buildBaseLineNote(lineId: string, visibleNote?: string | null): string | null {
  const cleanNote = visibleNote?.trim();
  const lines = [`${LINE_MARKER_PREFIX} ${lineId}`];
  if (cleanNote) lines.push(cleanNote);
  return lines.join("\n");
}

export function getVisibleItemNote(notes?: string | null): string | null {
  const parent = getModifierParent(notes);
  const visible = splitNoteLines(notes)
    .map((line) => line.trim())
    .filter((line, index) => {
      if (!line) return false;
      if (index === 0 && parent) return false;
      if (isInternalLine(line)) return false;
      if (line.toLowerCase().startsWith("nom:")) return false;
      return true;
    })
    .join("\n")
    .trim();
  return visible || null;
}

export function buildModifierNote(
  parentName: string,
  displayName?: string | null,
  parentLineId?: string | null
): string {
  const cleanParent = parentName.trim();
  const cleanDisplay = displayName?.trim();
  const lines = [`Per ${cleanParent}`];
  if (parentLineId) lines.push(`${PARENT_LINE_MARKER_PREFIX} ${parentLineId}`);
  if (cleanDisplay) lines.push(`Nom: ${cleanDisplay}`);
  return lines.join("\n");
}

function stripPriceSuffix(name: string): string {
  return name
    .replace(/\s+\d+(?:[,.]\d+)?\s*€/gi, "")
    .replace(/\s+\d+(?:[,.]\d+)?\s*eur$/gi, "")
    .trim();
}

function stripLeadingWords(name: string, words: string[]): string {
  let current = name.trim();
  for (const word of words) {
    current = current.replace(new RegExp(`^${word}\\s+`, "i"), "").trim();
  }
  return current;
}

function toDisplayWords(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s/-])([a-zà-ÿ])/g, (match, prefix: string, letter: string) =>
      `${prefix}${letter.toUpperCase()}`
    );
}

function cleanFlavorName(name: string): string {
  return toDisplayWords(
    stripLeadingWords(stripPriceSuffix(name), ["bola", "gelat", "helado", "sabor"])
  );
}

function cleanNaturalFruitName(name: string): string {
  return toDisplayWords(stripPriceSuffix(name).replace(/\bnatural\b/gi, "").trim());
}

function cleanModifierName(name: string): string {
  return toDisplayWords(
    stripLeadingWords(stripPriceSuffix(name), ["sabor", "topping", "salsa", "crema"])
  );
}

export function getContextualModifierDisplayName(
  defaultName: string,
  categoryName?: string | null
): string {
  const name = defaultName.trim();
  const lowerName = name.toLowerCase();
  const lowerCategory = String(categoryName || "").toLowerCase();

  if (!name) return defaultName;
  if (/^(sabor gelat|bola gelat|fruita|crema|salsa|cruixent)\s*:/i.test(name)) {
    return name;
  }

  if (lowerCategory.includes("sabor") || lowerName.startsWith("sabor ")) {
    return `Sabor gelat: ${cleanFlavorName(name)}`;
  }

  if (
    lowerCategory.includes("topping gelat") ||
    lowerName.startsWith("bola gelat") ||
    lowerName.startsWith("gelat ") ||
    lowerName.startsWith("helado ")
  ) {
    return `Bola gelat: ${cleanFlavorName(name)}`;
  }

  if (lowerName.includes("natural") && lowerCategory.includes("topping")) {
    return `Fruita: ${cleanNaturalFruitName(name)}`;
  }

  if (
    lowerCategory.includes("salsa") ||
    lowerCategory.includes("crema") ||
    lowerName.startsWith("salsa ") ||
    lowerName.startsWith("crema ")
  ) {
    return `Crema: ${cleanModifierName(name)}`;
  }

  if (lowerCategory.includes("crunchy") || lowerCategory.includes("cruixent")) {
    return `Cruixent: ${cleanModifierName(name)}`;
  }

  return name;
}

export function getModifierDisplayName(defaultName: string, notes?: string | null): string {
  const parent = getModifierParent(notes);
  if (!parent) return getContextualModifierDisplayName(defaultName);

  const lines = notes?.split(/\r?\n/) ?? [];
  const displayLine = lines
    .slice(1)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith("nom:"));

  return getContextualModifierDisplayName(displayLine?.slice(4).trim() || defaultName);
}

function normalizeName(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function groupItemsWithModifiers<T>(
  items: T[],
  getName: (item: T) => string,
  getNotes: (item: T) => string | null | undefined
): GroupedItem<T>[] {
  const groups: Array<GroupedItem<T> & { baseIndex: number; lineId: string | null }> = [];
  const modifiers: Array<{
    item: T;
    parentName: string;
    parentLineId: string | null;
    index: number;
  }> = [];

  items.forEach((item, index) => {
    const notes = getNotes(item);
    const parentName = getModifierParent(notes);
    if (parentName) {
      modifiers.push({
        item,
        parentName,
        parentLineId: getModifierParentLineId(notes),
        index,
      });
      return;
    }
    groups.push({
      base: item,
      modifiers: [],
      baseIndex: index,
      lineId: getItemLineId(notes),
    });
  });

  modifiers.forEach((modifier) => {
    let target = modifier.parentLineId
      ? [...groups].reverse().find((group) => group.lineId === modifier.parentLineId)
      : undefined;

    const parentKey = normalizeName(modifier.parentName);
    if (!target) {
      target = [...groups]
        .reverse()
        .find(
          (group) =>
            group.baseIndex < modifier.index &&
            normalizeName(getName(group.base)) === parentKey
        );
    }

    if (!target) {
      target = [...groups]
        .reverse()
        .find((group) => normalizeName(getName(group.base)) === parentKey);
    }

    if (target) {
      target.modifiers.push(modifier.item);
    } else {
      groups.push({
        base: modifier.item,
        modifiers: [],
        isOrphanModifier: true,
        baseIndex: modifier.index,
        lineId: null,
      });
    }
  });

  return groups
    .sort((a, b) => a.baseIndex - b.baseIndex)
    .map(({ base, modifiers, isOrphanModifier }) => ({
      base,
      modifiers,
      isOrphanModifier,
    }));
}
