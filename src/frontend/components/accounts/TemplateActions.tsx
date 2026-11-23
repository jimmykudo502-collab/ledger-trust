import { useEffect, useState } from "react";

import type { AccountTemplateInfo } from "../../../common/templates/accountTemplateSchemas";

interface TemplateActionsProps {
  clientId: string;
  /** Number of accounts the client has besides system accounts. */
  ownAccountCount: number;
  /** Called after an import adds accounts, so the list can reload. */
  onImported: () => void;
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Buttons to import the master chart of accounts into this client, or save
 * this client's chart as the master (FR-4).
 */
export function TemplateActions({
  clientId,
  ownAccountCount,
  onImported,
}: TemplateActionsProps) {
  const [info, setInfo] = useState<AccountTemplateInfo | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.accountTemplates
      .info()
      .then(setInfo)
      .catch((error: unknown) => setMessage({ text: messageOf(error), error: true }));
  }, []);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await action(), error: false });
    } catch (error) {
      setMessage({ text: messageOf(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  const importTemplate = () =>
    run(async () => {
      const result = await window.accountTemplates.importIntoClient(clientId);
      onImported();
      return result.skipped > 0
        ? `Added ${plural(result.added, "account")}. Skipped ${plural(result.skipped, "account")} whose code this client already uses.`
        : `Added ${plural(result.added, "account")} from the master template.`;
    });

  const saveTemplate = () => {
    const replacing = info
      ? ` This replaces the current master template (${plural(info.accountCount, "account")}).`
      : "";
    if (
      !window.confirm(
        `Save this client's ${plural(ownAccountCount, "account")} as the master template?${replacing}`,
      )
    ) {
      return;
    }
    void run(async () => {
      const saved = await window.accountTemplates.saveFromClient(clientId);
      setInfo(saved);
      return `Saved ${plural(saved.accountCount, "account")} as the master template.`;
    });
  };

  return (
    <div className="template-actions">
      <button
        type="button"
        className="button"
        disabled={busy || info === null}
        title={info === null ? "No master template saved yet" : undefined}
        onClick={() => void importTemplate()}
      >
        Import master template
        {info && ` (${info.accountCount})`}
      </button>
      <button
        type="button"
        className="button"
        disabled={busy || ownAccountCount === 0}
        onClick={saveTemplate}
      >
        Save as master template
      </button>
      {message && (
        <p className={message.error ? "form-error" : "notice"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
