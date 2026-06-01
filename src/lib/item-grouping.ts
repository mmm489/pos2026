export interface GroupedItem<T> {
  base: T;
  modifiers: T[];
  isOrphanModifier?: boolean;
}

export function getModifierParent(notes?: string | null): string | null {
  const trimmed = notes?.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() || "";
  if (!firstLine.toLowerCase().startsWith("per ")) return null;
  return firstLine.slice(4).trim() || null;
}

export function buildModifierNote(parentName: string, displayName?: string | null): string {
  const cleanParent = parentName.trim();
  const cleanDisplay = displayName?.trim();
  if (!cleanDisplay) return `Per ${cleanParent}`;
  return `Per ${cleanParent}\nNom: ${cleanDisplay}`;
}

export function getModifierDisplayName(defaultName: string, notes?: string | null): string {
  const parent = getModifierParent(notes);
  if (!parent) return defaultName;

  const lines = notes?.split(/\r?\n/) ?? [];
  const displayLine = lines
    .slice(1)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith("nom:"));

  return displayLine?.slice(4).trim() || defaultName;
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
  const groups: Array<GroupedItem<T> & { baseIndex: number }> = [];
  const modifiers: Array<{ item: T; parentName: string; index: number }> = [];

  items.forEach((item, index) => {
    const parentName = getModifierParent(getNotes(item));
    if (parentName) {
      modifiers.push({ item, parentName, index });
      return;
    }
    groups.push({ base: item, modifiers: [], baseIndex: index });
  });

  modifiers.forEach((modifier) => {
    const parentKey = normalizeName(modifier.parentName);
    let target = [...groups]
      .reverse()
      .find(
        (group) =>
          group.baseIndex < modifier.index &&
          normalizeName(getName(group.base)) === parentKey
      );

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
