"use client";

import type { CrossChainPaymentStep, CrossChainProgress } from "@/lib/arc/cctp-bridge-client";

const STEPS: { id: CrossChainPaymentStep; label: string }[] = [
  { id: "initiated", label: "Initiated" },
  { id: "confirmed", label: "Confirmed" },
  { id: "payment_sent", label: "Payment sent" },
];

function stepIndex(step: CrossChainPaymentStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

type Props = {
  progress: CrossChainProgress | null;
  error?: string | null;
};

export function CrossChainPaymentProgress({ progress, error }: Props) {
  const currentIdx = progress ? stepIndex(progress.step) : -1;

  return (
    <div className="cctp-progress" aria-live="polite">
      <p className="cctp-progress-title">Cross-chain payment (CCTP)</p>
      <p className="wallet-muted cctp-progress-sub">
        Ethereum Sepolia → Arc Testnet via Circle Bridge Kit
      </p>

      <ol className="cctp-progress-steps">
        {STEPS.map((step, idx) => {
          const status =
            currentIdx < 0
              ? "pending"
              : idx < currentIdx
                ? "done"
                : idx === currentIdx
                  ? "active"
                  : "pending";
          return (
            <li
              key={step.id}
              className={`cctp-progress-step cctp-progress-step--${status}`}
            >
              <span className="cctp-progress-marker" aria-hidden>
                {status === "done" ? "✓" : idx + 1}
              </span>
              <span className="cctp-progress-step-label">{step.label}</span>
            </li>
          );
        })}
      </ol>

      {progress?.detail ? (
        <p className="cctp-progress-detail">{progress.detail}</p>
      ) : null}

      {error ? (
        <p className="wallet-error cctp-progress-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
