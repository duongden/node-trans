import { useRef, useCallback } from "react";
import SessionItem from "./SessionItem";

export default function SessionList({ sessions, selectMode, selectedIds, onToggleSelect, onEnterSelectMode, onViewDetail }) {
  const timerRef = useRef(null);
  const longPressedRef = useRef(false);

  const handleMouseDown = useCallback((sessionId) => {
    longPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      onEnterSelectMode(sessionId);
    }, 500);
  }, [onEnterSelectMode]);

  const handleMouseUp = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  const handleClick = useCallback((sessionId) => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    if (selectMode) {
      onToggleSelect(sessionId);
    } else {
      onViewDetail(sessionId);
    }
  }, [selectMode, onToggleSelect, onViewDetail]);

  if (sessions.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="text-gray-300 dark:text-gray-700 text-center py-15 text-sm">No history yet</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {sessions.map((s) => (
        <div
          key={s.id}
          onMouseDown={() => handleMouseDown(s.id)}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={() => handleMouseDown(s.id)}
          onTouchEnd={handleMouseUp}
          onTouchCancel={handleMouseUp}
        >
          <SessionItem
            session={s}
            selectMode={selectMode}
            selected={selectedIds.has(s.id)}
            onToggleSelect={onToggleSelect}
            onClick={() => handleClick(s.id)}
          />
        </div>
      ))}
    </div>
  );
}
