import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
};

export function AssistantMarkdown({ content }: Props) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
      {content}
    </ReactMarkdown>
  );
}
