import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function TodoBoardTabs({ boards, activeId, onSelect, onCreate, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    setName("");
    setAdding(false);
    onCreate(value);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
      {boards.map((b) => (
        <div
          key={b.id}
          className={`group flex items-center gap-1.5 rounded-[12px] pl-3 pr-2 py-1.5 text-sm font-medium transition-colors ${
            b.id === activeId ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          <button onClick={() => onSelect(b.id)}>{b.name}</button>
          <button
            onClick={() => onDelete(b)}
            aria-label={`Delete list ${b.name}`}
            className="opacity-60 hover:opacity-100 hover:text-red-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {adding ? (
        <form onSubmit={submit} className="flex items-center gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !name.trim() && setAdding(false)}
            placeholder="List name"
            className="h-9 w-36 rounded-[12px]"
          />
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-[12px] px-3 py-1.5 text-sm font-medium text-neutral-500 border border-dashed border-neutral-300 hover:text-neutral-900 hover:border-neutral-900"
        >
          <Plus className="w-3.5 h-3.5" /> New list
        </button>
      )}
    </div>
  );
}