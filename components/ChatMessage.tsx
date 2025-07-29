interface ChatMessageProps {
  role: string;
  content: string;
}

export default function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";
  const containerClass = isUser ? "text-right" : "text-left";
  const bubbleClass = isUser
    ? "bg-blue-500 text-white inline-block px-3 py-2 rounded mb-2 whitespace-pre-wrap"
    : "bg-gray-200 text-gray-900 inline-block px-3 py-2 rounded mb-2 whitespace-pre-wrap";

  return (
    <div className={containerClass}>
      <span className={bubbleClass}>{content}</span>
    </div>
  );
}
