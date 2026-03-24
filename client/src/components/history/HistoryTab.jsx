import { useState, useEffect, useCallback } from "react";
import { fetchSessions, deleteSession } from "../../utils/api";
import SessionList from "./SessionList";
import SelectToolbar from "./SelectToolbar";
import SessionDetail from "./SessionDetail";
import { ConfirmDialog } from "../Modal";

export default function HistoryTab({ active }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [detailId, setDetailId] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch {
      setSessions([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (active) {
      setView("list");
      setSelectMode(false);
      setSelectedIds(new Set());
      loadSessions();
    }
  }, [active, loadSessions]);

  const handleToggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleEnterSelectMode = useCallback((id) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(sessions.map((s) => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) return;
    setConfirmDelete(true);
  };

  const executeDelete = async () => {
    setConfirmDelete(false);
    await Promise.all([...selectedIds].map((id) => deleteSession(id)));
    setSelectMode(false);
    setSelectedIds(new Set());
    loadSessions();
  };

  const handleCancelSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  if (view === "detail" && detailId) {
    return (
      <SessionDetail
        sessionId={detailId}
        onBack={() => {
          setView("list");
          loadSessions();
        }}
      />
    );
  }

  return (
    <>
      {selectMode && (
        <SelectToolbar
          selectedCount={selectedIds.size}
          totalCount={sessions.length}
          onSelectAll={handleSelectAll}
          onDelete={handleDelete}
          onCancel={handleCancelSelect}
        />
      )}
      {loading ? (
        <div className="flex-1 overflow-y-auto">
          <div className="text-gray-300 dark:text-gray-700 text-center py-15 text-sm">Loading history...</div>
        </div>
      ) : (
        <SessionList
          sessions={sessions}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onEnterSelectMode={handleEnterSelectMode}
          onViewDetail={(id) => {
            setDetailId(id);
            setView("detail");
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete sessions"
        message={`Are you sure you want to delete ${selectedIds.size} session(s)? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="red"
        onConfirm={executeDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
