import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// A tree of one-row tables (Decision 0066's Delivery): each node is a table
// with its header and one row, hung from its parent by a line; a node with
// children has [-] (open) or [+] (closed). Everything starts open; what a
// person closes stays closed for the page's life (live updates re-render the
// nodes, never this state), and nothing is stored.

interface TreeState {
  open: (id: string) => boolean;
  toggle: (id: string) => void;
}

const State = createContext<TreeState>({ open: () => true, toggle: () => {} });

// Tree is the root list; its nodes' open/closed state lives here.
export function Tree({ label, children }: { label: string; children: ReactNode }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const open = useCallback((id: string) => !closed[id], [closed]);
  const toggle = useCallback((id: string) => setClosed((c) => ({ ...c, [id]: !c[id] })), []);
  return (
    <State.Provider value={{ open, toggle }}>
      <ul className="tree" role="tree" aria-label={label}>
        {children}
      </ul>
    </State.Provider>
  );
}

// Node is one node: id names it in the tree's state, label for a reader;
// table is its one-row table, note a line under it (a failure); children,
// when there are any, are shown while it is open.
export function Node({ id, label, table, note, children }: { id: string; label: string; table: ReactNode; note?: ReactNode; children?: ReactNode }) {
  const { open, toggle } = useContext(State);
  const kids = hasChildren(children);
  const isOpen = open(id);
  return (
    <li className="tree-node" role="treeitem" aria-label={label} aria-expanded={kids ? isOpen : undefined}>
      <div className="tree-row">
        {kids ? (
          <button type="button" className="tree-toggle" aria-label={`${isOpen ? "Collapse" : "Expand"} ${label}`} aria-expanded={isOpen} onClick={() => toggle(id)}>
            {isOpen ? "[-]" : "[+]"}
          </button>
        ) : (
          <span className="tree-toggle" aria-hidden="true" />
        )}
        <div className="tree-body">
          <div className="scroll">{table}</div>
          {note && <div className="tree-note">{note}</div>}
        </div>
      </div>
      {kids && isOpen && <ul role="group">{children}</ul>}
    </li>
  );
}

function hasChildren(children: ReactNode): boolean {
  if (children === null || children === undefined || children === false) return false;
  if (Array.isArray(children)) return children.some(hasChildren);
  return true;
}

// Row is a node's table: its header and its one row (cells in order).
export function Row({ label, head, cells }: { label: string; head: string[]; cells: ReactNode[] }) {
  return (
    <table aria-label={label} className="tree-table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {cells.map((c, i) => (
            <td key={i}>{c}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
