import {useState, useMemo, useEffect, useCallback, useRef} from 'preact/hooks';
import type {IDefinitionParameter} from '../types';

/**
 * Score how well `text` matches `pattern`. Higher = better match.
 * Returns 0 for no match.
 *
 * Scoring: base score + position bonus (earlier match = higher score)
 *  - Exact case match: 1000 + position bonus
 *  - Case-insensitive match: 800 + position bonus
 *  - Multi-token (space-separated), all found: 600 + position bonus
 *  - Position bonus: 0–199 (match at start = 199, match at end = 0)
 */
function matchScore(text: string, pattern: string): number {
    const t = text.toLowerCase();
    const p = pattern.toLowerCase().trim();
    if (!p) return 1;

    // Position bonus: earlier match in string scores higher
    const posBonus = (idx: number) => Math.max(0, 199 - idx);

    // Exact case substring
    const exactIdx = text.indexOf(pattern);
    if (exactIdx >= 0) return 1000 + posBonus(exactIdx);

    // Case-insensitive substring
    const ciIdx = t.indexOf(p);
    if (ciIdx >= 0) return 800 + posBonus(ciIdx);

    // Multi-token: all tokens must be found as substrings
    const tokens = p.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every(tok => t.includes(tok))) {
        // Use position of first token as bonus
        return 600 + posBonus(t.indexOf(tokens[0]));
    }

    return 0;
}

interface TreeNode {
    name: string;
    path: string;
    children: Map<string, TreeNode>;
    parameters: IDefinitionParameter[];
}

interface Props {
    parameters: IDefinitionParameter[];
    onSelect: (param: IDefinitionParameter) => void;
    selectedParam: IDefinitionParameter | null;
}

function countAllParameters(node: TreeNode): number {
    let count = node.parameters.length;
    for (const child of node.children.values()) {
        count += countAllParameters(child);
    }
    return count;
}

function buildTree(parameters: IDefinitionParameter[]): TreeNode {
    const root: TreeNode = {name: 'Root', path: '', children: new Map(), parameters: []};

    for (const param of parameters) {
        let node = root;
        let path = '';

        for (const cat of param.categories) {
            path = path ? `${path}/${cat}` : cat;
            if (!node.children.has(cat)) {
                node.children.set(cat, {name: cat, path, children: new Map(), parameters: []});
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
    onSelect: (p: IDefinitionParameter) => void;
    selectedParam: IDefinitionParameter | null;
    expanded: Set<string>;
    onToggle: (path: string) => void;
}) {
    const isExpanded = expanded.has(node.path);
    const hasChildren = node.children.size > 0 || node.parameters.length > 0;
    const totalCount = countAllParameters(node);

    return (
        <div class={depth > 0 && "pl-4"}>
            {node.name !== 'Root' && (
                <div
                    class={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 ${hasChildren ? 'text-zinc-900 dark:text-zinc-100 font-medium' : 'text-zinc-600 dark:text-zinc-400'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        hasChildren && onToggle(node.path);
                    }}
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
                        .map(param => {
                            // Use address as unique identifier (name + description can be duplicated)
                            const paramId = `${param.address}`;
                            const isSelected = selectedParam?.address === param.address;
                            return (
                                <div
                                    key={paramId}
                                    data-param={paramId}
                                    class={`flex items-center gap-1.5 px-2 py-1 cursor-pointer pl-6 ${
                                        isSelected ? 'bg-blue-500 text-white' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelect(param);
                                    }}
                                >
                  <span
                      class={`inline-flex justify-center items-center w-4 h-4 shrink-0 text-[10px] font-semibold rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                      }`}
                  >
                    {param.type[0]}
                  </span>
                                    <span class="truncate" title={param.name}>
                    {param.customName || param.description || param.name}
                  </span>
                                </div>
                            );
                        })}
                </>
            )}
        </div>
    );
}

export function CategoryTree({parameters, onSelect, selectedParam}: Props) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState('');
    const [debouncedFilter, setDebouncedFilter] = useState('');

    useEffect(() => {
        const id = setTimeout(() => setDebouncedFilter(filter), 150);
        return () => clearTimeout(id);
    }, [filter]);

    const tree = useMemo(() => {
        if (!debouncedFilter) return buildTree(parameters);

        const filtered = parameters.filter(p =>
            matchScore(p.name, debouncedFilter) > 0 ||
            matchScore(p.description, debouncedFilter) > 0 ||
            (p.customName && matchScore(p.customName, debouncedFilter) > 0)
        );

        return buildTree(filtered);
    }, [parameters, debouncedFilter]);

    // Collect all visible parameters in tree order (sorted: folders first, then params)
    const visibleParams = useMemo(() => {
        const result: IDefinitionParameter[] = [];
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
            ? visibleParams.findIndex(p => p.address === selectedParam.address)
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
        // Find element by address (unique identifier)
        const elements = scrollContainerRef.current.querySelectorAll('[data-param]');
        const el = Array.from(elements).find(e => e.getAttribute('data-param') === String(selectedParam.address));
        el?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    }, [selectedParam]);

    return (
        <div class="flex-1 flex flex-col overflow-hidden">
            <div class="flex gap-1 p-2 border-b border-zinc-300 dark:border-zinc-700">
                <input
                    type="text"
                    placeholder="Filter..."
                    value={filter}
                    onInput={e => setFilter((e.target as HTMLInputElement).value)}
                    class="flex-1 px-2 py-1.5 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-zinc-800 dark:text-zinc-200 text-sm placeholder:text-zinc-500"
                />
                <button
                    onClick={expandAll}
                    class="w-7 h-7 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                    title="Expand All"
                >
                    +
                </button>
                <button
                    onClick={() => setExpanded(new Set())}
                    class="w-7 h-7 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600"
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
