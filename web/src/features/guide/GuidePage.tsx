import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import source from '../../../../docs/app-flow.md?raw';
import flow from '../../../../docs/app-flow.svg';

// The documentation and in-app guide share one maintained source.
const content = source
  .replace(/^# .*\n/, '')
  .replace(/!\[.*?\]\(app-flow\.svg\)/, '')
  .replace(/```mermaid[\s\S]*?```/, '');
export default function GuidePage() {
  return (
    <div className="page-container guide-page">
      <div className="guide-intro">
        <h1>Come funziona Expertise</h1>
        <p className="muted">
          Dalla prima fonte ai quattro risultati, con revisione e approvazione
          del perito.
        </p>
      </div>
      <img
        className="guide-flow"
        src={flow}
        width={1120}
        height={1010}
        alt="Flusso completo: pratica, fonti, lettura, proposte, revisione umana, evidenze, chat, quattro risultati, approvazione ed esportazione."
      />
      <div className="guide-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ href, children }) => (
              <a
                href={
                  href?.startsWith('../api/')
                    ? `https://github.com/petrucciii/expertise-automation/blob/main/api/${href.slice(7)}`
                    : href
                }
                target="_blank"
                rel="noreferrer"
              >
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
