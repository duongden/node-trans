export default function SelectToolbar({ selectedCount, totalCount, onSelectAll, onDelete, onCancel }) {
  return (
    <div className="flex items-center gap-3 py-2 text-sm">
      <label className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 cursor-pointer text-sm">
        <input
          type="checkbox"
          className="accent-indigo-500 w-4 h-4"
          checked={selectedCount === totalCount && totalCount > 0}
          onChange={(e) => onSelectAll(e.target.checked)}
        />
        Select all
      </label>
      <span className="text-cyan-500 font-medium">
        {selectedCount > 0 ? `${selectedCount} selected` : ""}
      </span>
      <button
        className="bg-linear-to-r from-rose-600 to-pink-500 text-white border-none px-3.5 py-1.5 rounded-lg cursor-pointer text-xs font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-md shadow-rose-500/20"
        disabled={selectedCount === 0}
        onClick={onDelete}
      >
        🗑 Delete
      </button>
      <button
        className="bg-gray-100/80 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200/50 dark:border-indigo-500/10 px-3.5 py-1.5 rounded-lg cursor-pointer text-xs transition-all duration-200 hover:bg-gray-200/80 dark:hover:bg-white/10 active:scale-95"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
