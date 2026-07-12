import type { StockCategory, UUID } from "@/types";

export type CategoryTreeNode = StockCategory & {
  children: CategoryTreeNode[];
};

export function buildCategoryTree(categories: StockCategory[]): CategoryTreeNode[] {
  const nodes = new Map<UUID, CategoryTreeNode>();
  for (const category of categories) {
    nodes.set(category.id, { ...category, children: [] });
  }

  const roots: CategoryTreeNode[] = [];
  for (const category of categories) {
    const node = nodes.get(category.id);
    if (!node) continue;
    if (category.parent && nodes.has(category.parent)) {
      nodes.get(category.parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: CategoryTreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    list.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

/** Keep matches plus ancestors and descendants for tree context. */
export function filterCategoriesForTree(
  categories: StockCategory[],
  search: string
): StockCategory[] {
  const query = search.trim().toLowerCase();
  if (!query) return categories;

  const byId = new Map(categories.map((c) => [c.id, c]));
  const included = new Set<UUID>();

  const includeDescendants = (parentId: UUID) => {
    for (const child of categories) {
      if (child.parent === parentId && !included.has(child.id)) {
        included.add(child.id);
        includeDescendants(child.id);
      }
    }
  };

  for (const category of categories) {
    const matches =
      category.name.toLowerCase().includes(query) ||
      category.code.toLowerCase().includes(query);
    if (!matches) continue;

    included.add(category.id);
    includeDescendants(category.id);

    let parentId = category.parent ?? null;
    while (parentId && byId.has(parentId)) {
      included.add(parentId);
      parentId = byId.get(parentId)!.parent ?? null;
    }
  }

  return categories.filter((c) => included.has(c.id));
}

export function collectExpandableIds(categories: StockCategory[]): Set<UUID> {
  return new Set(
    categories.filter((c) => categories.some((x) => x.parent === c.id)).map((c) => c.id)
  );
}
