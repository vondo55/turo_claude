import type { FormEvent, ReactNode } from 'react';
import type { CopilotAction, CopilotMessage } from '../lib/copilot';

type CopilotDrawerProps = {
  isOpen: boolean;
  inputValue: string;
  messages: CopilotMessage[];
  isLoading: boolean;
  onToggle: () => void;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onQuickPrompt: (prompt: string) => void;
  onAction: (action: CopilotAction) => void;
  onClear: () => void;
  onReceiptsSelected: (files: FileList) => void;
  onOpenReimbursementForm: () => void;
  receiptUploadLoading: boolean;
  receiptUploadDisabled: boolean;
  reimbursementContent?: ReactNode;
};

const quickPrompts = [
  'Export this view as CSV.',
  'Export this view as PDF.',
  'What is the LR vs Owner split in this filter?',
  'What is the top vehicle in this view?',
];

export default function CopilotDrawer({
  isOpen,
  inputValue,
  messages,
  isLoading,
  onToggle,
  onInputChange,
  onSubmit,
  onQuickPrompt,
  onAction,
  onClear,
  onReceiptsSelected,
  onOpenReimbursementForm,
  receiptUploadLoading,
  receiptUploadDisabled,
  reimbursementContent,
}: CopilotDrawerProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <>
      <button type="button" className="copilot-toggle" onClick={onToggle}>
        {isOpen ? 'Close Copilot' : 'Open Copilot'}
      </button>

      <aside className={isOpen ? 'copilot-drawer open' : 'copilot-drawer'} aria-hidden={!isOpen}>
        <div className="copilot-header">
          <div>
            <h2>Copilot (Read-only)</h2>
            <p>Answers use your current filtered dashboard data.</p>
          </div>
          <button type="button" onClick={onToggle} className="ghost-button">
            Close
          </button>
        </div>

        <div className="copilot-quick-prompts">
          {quickPrompts.map((prompt) => (
            <button key={prompt} type="button" className="chip-button" onClick={() => onQuickPrompt(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <section className="copilot-tools">
          <h3>Tools</h3>
          <div className="tool-buttons">
            <button type="button" onClick={() => onAction({ type: 'export_csv', label: 'Export CSV' })}>
              Export CSV
            </button>
            <button type="button" onClick={() => onAction({ type: 'export_pdf', label: 'Export PDF' })}>
              Export PDF
            </button>
            <button type="button" onClick={onOpenReimbursementForm}>
              Open Reimbursement Form
            </button>
          </div>
          <label className={receiptUploadDisabled ? 'receipt-upload disabled' : 'receipt-upload'}>
            <span>Upload Receipts</span>
            <input
              type="file"
              accept="image/*,.pdf"
              multiple
              disabled={receiptUploadDisabled || receiptUploadLoading}
              onChange={(event) => {
                const nextFiles = event.target.files;
                if (nextFiles && nextFiles.length > 0) {
                  onReceiptsSelected(nextFiles);
                }
                event.target.value = '';
              }}
            />
            <small>
              {receiptUploadDisabled
                ? 'Sign in and configure Supabase to upload receipts.'
                : receiptUploadLoading
                  ? 'Uploading...'
                  : 'Uploads receipts, then opens the reimbursement form with prefill.'}
            </small>
          </label>
        </section>

        {reimbursementContent ? <section className="copilot-reimbursement">{reimbursementContent}</section> : null}

        <div className="copilot-messages">
          {messages.map((message) => (
            <article key={message.id} className={message.role === 'assistant' ? 'message assistant' : 'message user'}>
              <p>{message.text}</p>
              {message.citations && message.citations.length > 0 ? (
                <small>Sources: {message.citations.join(', ')}</small>
              ) : null}
              {message.actions && message.actions.length > 0 ? (
                <div className="message-actions">
                  {message.actions.map((action) => (
                    <button key={`${message.id}-${action.type}`} type="button" onClick={() => onAction(action)}>
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {isLoading ? <p className="copilot-loading">Thinking...</p> : null}
        </div>

        <form className="copilot-input" onSubmit={handleSubmit}>
          <input
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Ask about this filtered view..."
          />
          <div className="copilot-input-actions">
            <button type="button" className="ghost-button" onClick={onClear}>
              Clear
            </button>
            <button type="submit" disabled={isLoading || inputValue.trim().length === 0}>
              Send
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
