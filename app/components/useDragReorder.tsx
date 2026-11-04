'use client';

import React, { useState } from 'react';
import { GripVertical } from 'lucide-react';

/**
 * Drag-and-drop reordering for a list of cards (Special Projects, Work Experience, Certifications), shared by the
 * Update Profile form, the Customize CVs editor and the profile-creation forms so they all behave
 * the same way.
 *
 * Dragging starts only from the grip handle (the card is `draggable` only while the handle is
 * pressed), so selecting text inside the card's fields still works. Uses the browser's native drag
 * and drop: no dependency, but no touch or keyboard reordering.
 */
export function useDragReorder(count: number, onMove: (from: number, to: number) => void) {
  const [armed, setArmed] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const end = () => {
    setArmed(null);
    setDragging(null);
    setOver(null);
  };

  /** Spread on the card element. */
  const cardProps = (index: number) => ({
    draggable: armed === index,
    onDragStart: (e: React.DragEvent) => {
      setDragging(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    },
    onDragOver: (e: React.DragEvent) => {
      if (dragging === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== index) setOver(index);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragging !== null && dragging < count) onMove(dragging, index);
      end();
    },
    onDragEnd: end,
  });

  /** Spread on the grip handle. */
  const handleProps = (index: number) => ({
    onMouseDown: () => setArmed(index),
    onMouseUp: () => setArmed(null),
  });

  /** Border/ring classes for the card while it is dragged or is the drop target. */
  const stateClass = (index: number, idle = 'border-slate-200') =>
    dragging === index
      ? 'opacity-50 border-sky-300'
      : over === index && dragging !== null
        ? 'border-sky-500 ring-2 ring-sky-200'
        : idle;

  return { cardProps, handleProps, stateClass };
}

/** Returns a copy of `items` with the entry at `from` moved to `to`. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function DragHandle({
  label,
  handleProps,
}: {
  label: string;
  handleProps: { onMouseDown: () => void; onMouseUp: () => void };
}) {
  return (
    <span
      role="button"
      aria-label={`Drag to reorder ${label}`}
      title="Drag to reorder"
      {...handleProps}
      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-sky-500 -ml-1 p-1 inline-flex"
    >
      <GripVertical className="w-4 h-4" />
    </span>
  );
}
