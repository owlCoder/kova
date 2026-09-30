export function MessageContent({ text }: { text: string }) {
  return (
    <div className="message-content">
      {text.split(/(```[\s\S]*?(?:```|$))/).map((part, index) =>
        part.startsWith('```') ? (
          <pre key={index}>
            <code>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code>
          </pre>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </div>
  );
}
