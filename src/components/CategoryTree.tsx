import { useState, useMemo, useEffect, useCallback, useRef } from 'preact/hooks';
import type { Parameter } from '../types';

function fuzzyMatch(text: string, pattern: string): boolean {
  const t = text.toLowerCase();
  const p = pattern.toLowerCase();
  let ti = 0;
  for (let pi = 0; pi < p.length; pi++) {
    const idx = t.indexOf(p[pi], ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  parameters: Parameter[];
}

interface Props {
  parameters: Parameter[];
  onSelect: (param: Parameter) => void;
  selectedParam: Parameter | null;
}

function countAllParameters(node: TreeNode): number {
  let count = node.parameters.length;
  for (const child of node.children.values()) {
    count += countAllParameters(child);
  }
  return count;
}

function buildTree(parameters: Parameter[]): TreeNode {
  const root: TreeNode = { name: 'Root', path: '', children: new Map(), parameters: [] };

  for (const param of parameters) {
    let node = root;
    let path = '';

    for (const cat of param.categories) {
      path = path ? `${path}/${cat}` : cat;
      if (!node.children.has(cat)) {
        node.children.set(cat, { name: cat, path, children: new Map(), parameters: [] });
      }
      node = node.children.get(cat)!;
    }

    node.parameters.push(param);
  }

  return root;
}

function TreeNodeView({
  node,
  depth,
  onSelect,
  selectedParam,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (p: Parameter) => void;
  selectedParam: Parameter | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isExpanded = expanded.has(node.path);
  const hasChildren = node.children.size > 0 || node.parameters.length > 0;
  const totalCount = countAllParameters(node);

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      {node.name !== 'Root' && (
        <div
          class={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-zinc-700 ${hasChildren ? 'text-zinc-100 font-medium' : 'text-zinc-400'}`}
          onClick={(e) => { e.stopPropagation(); hasChildren && onToggle(node.path); }}
        >
          {hasChildren && (
            <span class="w-3 text-[10px] text-zinc-500">{isExpanded ? '▼' : '▶'}</span>
          )}
          <span class="flex-1">{node.name}</span>
          {totalCount > 0 && (
            <span class="text-xs text-zinc-500">({totalCount})</span>
          )}
        </div>
      )}

      {(node.name === 'Root' || isExpanded) && (
        <>
          {Array.from(node.children.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(child => (
              <TreeNodeView
                key={child.path}
                node={child}
                depth={node.name === 'Root' ? 0 : depth + 1}
                onSelect={onSelect}
                selectedParam={selectedParam}
                expanded={expanded}
                onToggle={onToggle}
              />
            ))}

          {[...node.parameters]
            .sort((a, b) => (a.customName || a.description || a.name).localeCompare(b.customName || b.description || b.name))
            .map(param => (
            <div
              key={param.name}
              data-param={param.name}
              class={`flex items-center gap-1.5 px-2 py-1 cursor-pointer ${
                selectedParam?.name === param.name
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-zinc-700'
              }`}
              style={{ paddingLeft: (depth + 1) * 16 }}
              onClick={(e) => { e.stopPropagation(); onSelect(param); }}
            >
              <span
                class={`inline-flex justify-center items-center w-4 h-4 shrink-0 text-[10px] font-semibold rounded ${
                  selectedParam?.name === param.name
                    ? 'bg-white/20 text-white'
                    : 'bg-zinc-700 text-zinc-400'
                }`}
              >
                {param.type[0]}
              </span>
              <span class="truncate" title={param.name}>
                {param.customName || param.description || param.name}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function CategoryTree({ parameters, onSelect, selectedParam }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const tree = useMemo(() => {
    const filtered = filter
      ? parameters.filter(p =>
          fuzzyMatch(p.name, filter) ||
          fuzzyMatch(p.description, filter) ||
          (p.customName && fuzzyMatch(p.customName, filter))
        )
      : parameters;
    return buildTree(filtered);
  }, [parameters, filter]);

  // Collect all visible parameters in tree order (sorted: folders first, then params)
  const visibleParams = useMemo(() => {
    const result: Parameter[] = [];
    const collect = (node: TreeNode, isRoot: boolean) => {
      if (!isRoot && !expanded.has(node.path)) return;
      // Sort children alphabetically
      const sortedChildren = Array.from(node.children.values())
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const child of sortedChildren) {
        collect(child, false);
      }
      // Sort parameters alphabetically by display name
      const sortedParams = [...node.parameters]
        .sort((a, b) => (a.customName || a.description || a.name).localeCompare(b.customName || b.description || b.name));
      result.push(...sortedParams);
    };
    collect(tree, true);
    return result;
  }, [tree, expanded]);

  const toggleNode = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allPaths = new Set<string>();
    const collect = (node: TreeNode) => {
      if (node.path) allPaths.add(node.path);
      node.children.forEach(collect);
    };
    collect(tree);
    setExpanded(allPaths);
  };

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (visibleParams.length === 0) return;

    e.preventDefault();
    const currentIdx = selectedParam
      ? visibleParams.findIndex(p => p.name === selectedParam.name)
      : -1;

    let nextIdx: number;
    if (e.key === 'ArrowDown') {
      nextIdx = currentIdx < visibleParams.length - 1 ? currentIdx + 1 : 0;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : visibleParams.length - 1;
    }

    onSelect(visibleParams[nextIdx]);
  }, [visibleParams, selectedParam, onSelect]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll selected parameter into view
  useEffect(() => {
    if (!selectedParam || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current.querySelector(`[data-param="${selectedParam.name}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedParam]);

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="flex gap-1 p-2 border-b border-zinc-700">
        <input
          type="text"
          placeholder="Filter..."
          value={filter}
          onInput={e => setFilter((e.target as HTMLInputElement).value)}
          class="flex-1 px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-zinc-200 text-sm placeholder:text-zinc-500"
        />
        <button
          onClick={expandAll}
          class="w-7 h-7 bg-zinc-700 border border-zinc-600 rounded text-zinc-200 hover:bg-zinc-600"
          title="Expand All"
        >
          +
        </button>
        <button
          onClick={() => setExpanded(new Set())}
          class="w-7 h-7 bg-zinc-700 border border-zinc-600 rounded text-zinc-200 hover:bg-zinc-600"
          title="Collapse All"
        >
          -
        </button>
      </div>
      <div ref={scrollContainerRef} class="flex-1 overflow-y-auto py-2 text-sm">
        <TreeNodeView
          node={tree}
          depth={0}
          onSelect={onSelect}
          selectedParam={selectedParam}
          expanded={expanded}
          onToggle={toggleNode}
        />
      </div>
    </div>
  );
}
