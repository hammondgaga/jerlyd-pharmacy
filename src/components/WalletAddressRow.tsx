"use client";

import { truncateAddress } from "@/lib/arc/patient-wallet";

type Props = {
  address: string;
  onCopy: (address: string) => void;
  truncateHead?: number;
  truncateTail?: number;
};

export function WalletAddressRow({
  address,
  onCopy,
  truncateHead = 4,
  truncateTail = 5,
}: Props) {
  const display = truncateAddress(address, truncateHead, truncateTail);

  return (
    <div className="wallet-address-row">
      <code className="wallet-address-row-text" title={address}>
        {display}
      </code>
      <button
        type="button"
        className="wallet-btn-copy"
        onClick={() => onCopy(address)}
        aria-label="Copy wallet address"
      >
        Copy
      </button>
    </div>
  );
}
