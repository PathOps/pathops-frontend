import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

// A tree of one-row tables (Decision 0066's Delivery): each node is a table
// with its header and one row, hung from its parent by a line; a node with
// children has [-] (open) or [+] (closed).
//
// Where a node starts: its defaultOpen (the Delivery's rules: a succeeded
// run's steps closed, a failed run's failed branch open), taken the first
// time the node is seen and kept, so a live update never opens or closes
// anything. Opening a root (a top-level node) opens its whole branch, every
// descendant open; closing it hides the branch, and opening it again opens
// the whole branch again. Below a root each node opens and closes on its own.
// Nothing is stored: a reload starts again.

interface TreeState {
  open: (id: string, defaultOpen: boolean) => boolean;
  toggle: (id: string, root: boolean) => void;
}

const State = createContext<TreeState>({ open: () => true, toggle: () => {} });

const rootOf = (id: string) => id.split("/")[0];

// Tree is the root list; its nodes' open/closed state lives here.
export function Tree({ label, children }: { label: string; children: ReactNode }) {
  // set: what a person chose; opened: roots a person opened (their branch
  // all open); seeds: each node's first default.
  const [set, setSet] = useState<Record<string, boolean>>({});
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const seeds = useRef<Record<string, boolean>>({});
  const open = useCallback(
    (id: string, defaultOpen: boolean) => {
      if (id in set) return set[id];
      if (rootOf(id) !== id && opened[rootOf(id)]) return true;
      seeds.current[id] ??= defaultOpen;
      return seeds.current[id];
    },
    [set, opened],
  );
  const toggle = useCallback(
    (id: string, root: boolean) => {
      const next = !open(id, true);
      if (root) {
        // The branch starts again: no choice of a descendant survives.
        setSet((s) => Object.fromEntries([...Object.entries(s).filter(([k]) => rootOf(k) !== id), [id, next]]));
        setOpened((o) => ({ ...o, [id]: next }));
      } else setSet((s) => ({ ...s, [id]: next }));
    },
    [open],
  );
  return (
    <State.Provider value={{ open, toggle }}>
      <ul className="tree" role="tree" aria-label={label}>
        {children}
      </ul>
    </State.Provider>
  );
}

// Node is one node: id names it in the tree's state (a root's id has no
// "/"), label for a reader; table is its one-row table, note a line under it
// (a failure); children, when there are any, are shown while it is open.
export function Node({
  id,
  label,
  table,
  note,
  defaultOpen = true,
  children,
}: {
  id: string;
  label: string;
  table: ReactNode;
  note?: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const { open, toggle } = useContext(State);
  const kids = hasChildren(children);
  const isOpen = open(id, defaultOpen);
  return (
    <li className="tree-node" role="treeitem" aria-label={label} aria-expanded={kids ? isOpen : undefined}>
      <div className="tree-row">
        {kids ? (
          <button
            type="button"
            className="tree-toggle"
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${label}`}
            aria-expanded={isOpen}
            onClick={() => toggle(id, !id.includes("/"))}
          >
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
