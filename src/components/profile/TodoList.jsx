import React, { useState, useEffect } from "react";
import { api } from "@/api/client";
import { Plus, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TodoRow from "./TodoRow";
import TodoBoardTabs from "./TodoBoardTabs";

const SUGGESTIONS = [
  "Renew my passport",
  "Buy travel insurance",
  "Pack a universal adapter",
  "Download offline maps",
  "Notify the bank about my trip",
  "Print boarding passes",
  "Check baggage allowance",
  "Order foreign currency",
];

export default function TodoList() {
  const [boards, setBoards] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [todos, setTodos] = useState(null);
  const [title, setTitle] = useState("");
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    Promise.all([
      api.entities.TodoBoard.list("created_date", 50),
      api.entities.TodoItem.list("-created_date", 200),
    ]).then(async ([boardList, items]) => {
      let list = boardList;
      if (list.length === 0) {
        const first = await api.entities.TodoBoard.create({ name: "My list" });
        list = [first];
      }
      setBoards(list);
      setActiveId(list[0].id);
      setTodos(items);
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setHintIndex((i) => (i + 1) % SUGGESTIONS.length), 2500);
    return () => clearInterval(id);
  }, []);

  const add = async (e) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle("");
    const created = await api.entities.TodoItem.create({ title: value, done: false, board_id: activeId });
    setTodos((list) => [created, ...list]);
  };

  const toggle = async (todo) => {
    setTodos((list) => list.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    await api.entities.TodoItem.update(todo.id, { done: !todo.done });
  };

  const remove = async (todo) => {
    setTodos((list) => list.filter((t) => t.id !== todo.id));
    await api.entities.TodoItem.delete(todo.id);
  };

  const createBoard = async (name) => {
    const created = await api.entities.TodoBoard.create({ name });
    setBoards((list) => [...list, created]);
    setActiveId(created.id);
  };

  const deleteBoard = async (board) => {
    const remaining = boards.filter((b) => b.id !== board.id);
    setBoards(remaining);
    setTodos((list) => list.filter((t) => (t.board_id || boards[0]?.id) !== board.id));
    if (activeId === board.id) setActiveId(remaining[0]?.id ?? null);
    await api.entities.TodoBoard.delete(board.id);
  };

  if (todos === null || boards === null) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-4 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
      </div>
    );
  }

  // Tasks created before lists existed belong to the first list
  const firstId = boards[0]?.id;
  const current = todos.filter((t) => (t.board_id || firstId) === activeId);
  const open = current.filter((t) => !t.done);
  const done = current.filter((t) => t.done);

  return (
    <div>
      <TodoBoardTabs
        boards={boards}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={createBoard}
        onDelete={deleteBoard}
      />

      {activeId && (
        <form onSubmit={add} className="flex gap-2 print:hidden">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={SUGGESTIONS[hintIndex]}
            className="h-11 rounded-[12px]"
          />
          <Button type="submit" className="h-11 rounded-[12px] px-4 shrink-0">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </form>
      )}

      <div className="tripsync-print-area mt-5">
        {open.length === 0 ? (
          <p className="text-sm text-neutral-400 py-3">Nothing on the list yet — add your first task above.</p>
        ) : (
          open.map((t) => <TodoRow key={t.id} todo={t} onToggle={toggle} onDelete={remove} />)
        )}

        {done.length > 0 && (
          <div className="mt-6 pt-5 border-t border-neutral-200">
            <p className="font-mono text-[13px] font-medium uppercase tracking-[0.15em] text-neutral-400 mb-1">
              Done · {done.length}
            </p>
            {done.map((t) => <TodoRow key={t.id} todo={t} onToggle={toggle} onDelete={remove} />)}
          </div>
        )}
      </div>

      {current.length > 0 && (
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="mt-6 h-11 rounded-[12px] print:hidden"
        >
          <Printer className="w-4 h-4 mr-2" /> Print list
        </Button>
      )}
    </div>
  );
}
