import React from "react";
import { Check, Trash2 } from "lucide-react";

export default function TodoRow({ todo, onToggle, onDelete }) {
  return (
    <div className="group flex items-center gap-3 py-2.5 border-b border-neutral-100 last:border-0">
      <button
        onClick={() => onToggle(todo)}
        aria-label={todo.done ? "Mark as not done" : "Mark as done"}
        className={`w-6 h-6 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
          todo.done ? "bg-neutral-900 border-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-900"
        }`}
      >
        {todo.done && <Check className="w-4 h-4" />}
      </button>
      <span className={`flex-1 text-sm ${todo.done ? "text-neutral-400 line-through" : "text-neutral-900"}`}>
        {todo.title}
      </span>
      <button
        onClick={() => onDelete(todo)}
        aria-label="Delete task"
        className="text-neutral-400 hover:text-red-600 transition-colors print:hidden"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}