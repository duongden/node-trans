export default function PartialResult({ data }) {
  if (!data) return <div className="min-h-8 px-4 py-1.5" />;

  let text = "";
  if (data.originalText) text += data.originalText;
  if (data.translatedText) text += ` → ${data.translatedText}`;

  return (
    <div className="min-h-8 px-4 py-1.5 text-indigo-400/60 dark:text-cyan-500/40 italic text-sm">
      {text}
    </div>
  );
}
