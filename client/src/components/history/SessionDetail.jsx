import { useState, useEffect, useMemo } from "react";
import { fetchSession, renameSession, setSpeakerAlias, getExportUrl } from "../../utils/api";
import { SOURCE_LABELS_FULL, LANG_LABELS_FULL } from "../../utils/constants";
import { getSpeakerIndex } from "../../utils/speakerColors";
import Utterance from "../live/Utterance";
import SpeakerList from "./SpeakerList";
import { PromptDialog } from "../Modal";

const btnSecondary = "bg-gray-100/80 dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-indigo-500/10 px-4 py-1.5 rounded-xl cursor-pointer text-sm font-medium transition-all duration-200 hover:bg-gray-200/80 dark:hover:bg-white/10 active:scale-95";

export default function SessionDetail({ sessionId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [renameModal, setRenameModal] = useState(null);
  const [speakerModal, setSpeakerModal] = useState(null);

  const loadData = () => {
    fetchSession(sessionId).then(setData).catch(() => setError(true));
  };

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const speakerColorMap = useMemo(() => {
    if (!data) return new Map();
    const map = new Map();
    (data.utterances || []).forEach((u) => {
      if (u.speaker) getSpeakerIndex(u.speaker, map);
    });
    return map;
  }, [data]);

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <button className={btnSecondary} onClick={onBack}>← Back</button>
        </div>
        <div className="text-gray-300 dark:text-gray-700 text-center py-15 text-sm">Failed to load session</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <button className={btnSecondary} onClick={onBack}>← Back</button>
        </div>
        <div className="text-gray-300 dark:text-gray-700 text-center py-15 text-sm">Loading...</div>
      </div>
    );
  }

  const startDate = new Date(data.started_at + "Z");
  const endDate = data.ended_at ? new Date(data.ended_at + "Z") : null;
  const title = data.title || startDate.toLocaleString("en-US");
  const utts = data.utterances || [];
  const aliases = data.speakerAliases || {};

  let durationText = "In progress";
  if (endDate) {
    const diffMs = endDate - startDate;
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  const sourceText = SOURCE_LABELS_FULL[data.audio_source] || data.audio_source;
  const langText = LANG_LABELS_FULL[data.target_language] || data.target_language;
  const speakers = [...new Set(utts.map((u) => u.speaker).filter(Boolean))];

  const handleRename = () => setRenameModal({ value: title });

  const handleRenameSpeaker = (speaker, currentName) => {
    setSpeakerModal({ speaker, currentName });
  };

  const speakerName = (s) => aliases[s] || `Speaker ${s}`;

  const stats = [
    ["Started", startDate.toLocaleString("en-US")],
    ["Duration", durationText],
    ["Source", sourceText],
    ["Target", langText],
    ["Utterances", utts.length],
    ["Speakers", speakers.length || "—"],
  ];

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <button className={btnSecondary} onClick={onBack}>← Back</button>
        <button className={btnSecondary} onClick={() => window.open(getExportUrl(sessionId), "_blank")}>
          📥 Export Markdown
        </button>
      </div>

      <div className="p-4 bg-white/60 dark:bg-white/3 backdrop-blur-md border border-gray-200/50 dark:border-indigo-500/10 rounded-2xl text-sm text-gray-600 dark:text-gray-400 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-bold text-base text-gray-900 dark:text-gray-100">{title}</span>
          <button
            className="bg-transparent border-none cursor-pointer text-sm px-1.5 py-0.5 rounded opacity-50 transition-opacity hover:opacity-100 hover:bg-gray-100/60 dark:hover:bg-white/5"
            onClick={handleRename}
          >
            🖊️
          </button>
        </div>
        <div className="grid grid-cols-2 gap-y-2 gap-x-6">
          {stats.map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-1 border-b border-gray-100/60 dark:border-indigo-500/10">
              <span className="text-xs text-gray-400 dark:text-gray-600 font-medium">{label}</span>
              <span className="text-sm text-gray-700 dark:text-gray-300 text-right">{value}</span>
            </div>
          ))}
        </div>
        <SpeakerList
          speakers={speakers}
          aliases={aliases}
          speakerColorMap={speakerColorMap}
          onRenameSpeaker={handleRenameSpeaker}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 bg-white/60 dark:bg-[#0b0d18]/60 backdrop-blur-sm border border-gray-200/50 dark:border-indigo-500/10 rounded-2xl shadow-sm">
        {utts.length === 0 ? (
          <div className="text-gray-300 dark:text-gray-700 text-center py-15 text-sm">No content</div>
        ) : (
          utts.map((u, i) => (
            <Utterance
              key={i}
              data={u}
              speakerColorMap={speakerColorMap}
              speakerName={u.speaker ? speakerName(u.speaker) : undefined}
            />
          ))
        )}
      </div>

      <PromptDialog
        open={!!renameModal}
        title="Rename session"
        defaultValue={renameModal?.value || ""}
        onCancel={() => setRenameModal(null)}
        onConfirm={async (newTitle) => {
          setRenameModal(null);
          if (newTitle !== title) {
            await renameSession(sessionId, newTitle);
            loadData();
          }
        }}
      />

      <PromptDialog
        open={!!speakerModal}
        title={`Rename ${speakerModal?.currentName || ""}`}
        defaultValue={speakerModal?.currentName || ""}
        onCancel={() => setSpeakerModal(null)}
        onConfirm={async (newName) => {
          const { speaker, currentName } = speakerModal;
          setSpeakerModal(null);
          if (newName !== currentName) {
            await setSpeakerAlias(sessionId, speaker, newName);
            loadData();
          }
        }}
      />
    </div>
  );
}
