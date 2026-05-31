"use client";

import { useEffect, useMemo, useState } from "react";
import { truncateAddress } from "@/lib/arc/patient-wallet";

type WithdrawStatus = "idle" | "pending" | "success" | "error";

type Props = {
  open: boolean;
  onClose: () => void;
  balanceDisplay: string;
  maxBalance: number;
  defaultDestination: string | null;
  hasSigningKey: boolean;
  status: WithdrawStatus;
  statusMessage?: string;
  onSubmit: (amount: string, destination: string) => Promise<void>;
};

export function WithdrawModal({
  open,
  onClose,
  balanceDisplay,
  maxBalance,
  defaultDestination,
  hasSigningKey,
  status,
  statusMessage,
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setDestination(defaultDestination?.trim() || "");
    setValidationError(null);
  }, [open, defaultDestination]);

  const amountNum = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? n : NaN;
  }, [amount]);

  const preview = useMemo(() => {
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
    const dest = destination.trim();
    const destLabel =
      /^0x[a-fA-F0-9]{40}$/.test(dest) ? truncateAddress(dest, 4, 5) : "—";
    return {
      send: amountNum.toFixed(2),
      destination: destLabel,
      feeNote:
        "Network fee on Arc testnet is paid in USDC from your wallet (typically a small amount).",
    };
  }, [amountNum, destination]);

  function handleMax() {
    if (maxBalance > 0) {
      setAmount(maxBalance.toFixed(2));
      setValidationError(null);
    }
  }

  async function handleConfirm() {
    setValidationError(null);
    const dest = destination.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(dest)) {
      setValidationError("Enter a valid destination address (0x…).");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setValidationError("Enter a valid USDC amount.");
      return;
    }
    if (amountNum > maxBalance + 1e-9) {
      setValidationError(`Amount cannot exceed your balance (${balanceDisplay} USDC).`);
      return;
    }
    await onSubmit(amount, dest);
  }

  if (!open) return null;

  return (
    <div className="checkout-modal wallet-modal" role="presentation" onClick={onClose}>
      <div
        className="checkout-panel panel wallet-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wallet-modal-header">
          <h3 id="withdraw-modal-title">Withdraw USDC</h3>
          <button type="button" className="btn-small wallet-modal-close" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="wallet-muted wallet-modal-sub">
          Send USDC from your in-built wallet to an external address on Arc testnet.
        </p>

        <p className="wallet-modal-balance">
          Available: <strong>{balanceDisplay} USDC</strong>
        </p>

        {!hasSigningKey ? (
          <div className="wallet-warning" role="alert">
            Signing key not found in this browser. Withdraw only works on the device where you
            first opened My wallet.
          </div>
        ) : null}

        <label className="wallet-field-label" htmlFor="withdraw-modal-amount">
          Amount (USDC)
        </label>
        <div className="wallet-amount-row">
          <input
            id="withdraw-modal-amount"
            className="wallet-input"
            type="number"
            min="0.01"
            step="0.01"
            max={maxBalance > 0 ? maxBalance : undefined}
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setValidationError(null);
            }}
            disabled={status === "pending"}
          />
          <button
            type="button"
            className="wallet-btn-outline wallet-btn-max"
            onClick={handleMax}
            disabled={maxBalance <= 0 || status === "pending"}
          >
            Max
          </button>
        </div>

        <label className="wallet-field-label" htmlFor="withdraw-modal-destination">
          Destination address
        </label>
        <input
          id="withdraw-modal-destination"
          className="wallet-input"
          type="text"
          placeholder="0x…"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setValidationError(null);
          }}
          disabled={status === "pending"}
        />
        {defaultDestination ? (
          <p className="wallet-muted wallet-modal-hint">
            Pre-filled from your connected MetaMask. You can edit this to any address.
          </p>
        ) : null}

        {preview ? (
          <div className="wallet-withdraw-preview" aria-live="polite">
            <h4 className="wallet-withdraw-preview-title">Preview</h4>
            <dl className="wallet-withdraw-preview-list">
              <div>
                <dt>You send</dt>
                <dd>{preview.send} USDC</dd>
              </div>
              <div>
                <dt>To</dt>
                <dd>{preview.destination}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>Arc Testnet</dd>
              </div>
              <div>
                <dt>Fees</dt>
                <dd className="wallet-withdraw-preview-fee">{preview.feeNote}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {validationError ? (
          <p className="wallet-error" role="alert">
            {validationError}
          </p>
        ) : null}

        {statusMessage && status !== "idle" ? (
          <p className={status === "success" ? "wallet-success" : "wallet-error"} role="status">
            {statusMessage}
          </p>
        ) : null}

        <div className="wallet-modal-actions">
          <button
            type="button"
            className="wallet-btn-outline"
            onClick={onClose}
            disabled={status === "pending"}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`wallet-btn-primary${status === "pending" ? " is-pending" : ""}`}
            disabled={!hasSigningKey || status === "pending" || !amount || !destination}
            onClick={() => void handleConfirm()}
          >
            {status === "pending" ? "Sending…" : status === "success" ? "✓ Sent" : "Confirm withdrawal"}
          </button>
        </div>
      </div>
    </div>
  );
}
