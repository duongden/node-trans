import { SOURCE_LABELS, LANG_LABELS } from "../../utils/constants";

function formatDuration(startedAt, endedAt) {
  if (!endedAt) return "";
  const diffMs = new Date(endedAt + "Z") - new Date(startedAt + "Z");
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
}

const tag = "bg-gray-100/80 dark:bg-white/5 px-2 py-px rounded-full text-[0.7rem] text-gray-500 dark:text-gray-500 whitespace-nowrap";

export default function SessionItem({ session, selectMode, selected, onToggleSelect, onClick }) {
  const startDate = new Date(session.started_at + "Z");
  const date = startDate.toLocaleString("en-US");
  const title = session.title || date;
  const source = SOURCE_LABELS[session.audio_source] || session.audio_source;
  const lang = LANG_LABELS[session.target_language] || session.target_language;
  const duration = formatDuration(session.started_at, session.ended_at);

  return (
    <div
      className="glow-border flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/70 dark:bg-white/3 border border-gray-200/50 dark:border-indigo-500/10 mb-2 cursor-pointer transition-all duration-200 hover:bg-gray-50 dark:hover:bg-white/6 hover:shadow-lg hover:shadow-indigo-500/5 active:scale-[0.99]"
      onClick={onClick}
    >
      <input
        type="checkbox"
        className={`accent-indigo-500 w-4 h-4 shrink-0 ${selectMode ? "inline-block" : "hidden"}`}
        checked={selected}
        onChange={(e) => {
          e.stopPropagation();
          onToggleSelect(session.id);
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-1">{title}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400 dark:text-gray-600">
          <span>{date}</span>
          {duration && <span className={tag}>⏱ {duration}</span>}
          <span className={tag}>{source}</span>
          <span className={tag}>→ {lang}</span>
          {session.utterance_count > 0 && <span className={tag}>💬 {session.utterance_count}</span>}
          {session.speaker_count > 0 && <span className={tag}>👤 {session.speaker_count}</span>}
        </div>
      </div>
    </div>
  );
}
