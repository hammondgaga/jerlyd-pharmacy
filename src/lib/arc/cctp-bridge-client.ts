"use client";

import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { EIP1193Provider } from "viem";
import { ensurePatientWallet } from "@/lib/arc/patient-wallet";
import { payUsdcWithArc } from "@/lib/arc/pay-usdc";
import { connectMetaMask, hasMetaMask } from "@/lib/arc/metamask-client";

export type CctpBridgeToken = "USDC" | "EURC";

export type CrossChainPaymentStep = "initiated" | "confirmed" | "payment_sent";

export type CrossChainProgress = {
  step: CrossChainPaymentStep;
  detail: string;
  bridgeAction?: string;
};

type WalletApi = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

type BridgeResultLike = {
  state: string;
  steps?: {
    name?: string;
    state?: string;
    txHash?: string;
    errorMessage?: string;
  }[];
};

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_HEX = `0x${SEPOLIA_CHAIN_ID.toString(16)}`;

export async function ensureSepoliaNetwork(): Promise<void> {
  if (!window.ethereum) {
    throw new Error("MetaMask is required for cross-chain payment.");
  }
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_HEX,
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
      return;
    }
    throw err;
  }
}

function mapBridgeActionToDetail(action: string): string {
  const key = action.toLowerCase();
  if (key.includes("approve")) return "Approving token on Ethereum Sepolia…";
  if (key.includes("burn")) return "Burning on source chain (CCTP)…";
  if (key.includes("attestation") || key.includes("fetch")) {
    return "Fetching CCTP attestation…";
  }
  if (key.includes("mint")) return "Minting on Arc Testnet…";
  if (key.includes("forward")) return "Forwarder submitting mint on Arc…";
  return "Bridging via CCTP…";
}

function extractTxHash(result: BridgeResultLike): string {
  const steps = result.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.state === "success" && step.txHash) {
      return step.txHash;
    }
  }
  const any = steps.find((s) => s.txHash);
  return any?.txHash ?? "";
}

export async function executeCrossChainCheckout(params: {
  api: WalletApi;
  userId: number;
  userEmail: string;
  amountUsdc: number;
  token: CctpBridgeToken;
  onProgress: (progress: CrossChainProgress) => void;
}): Promise<{ bridgeTxHash: string; paymentTxHash: string }> {
  const { api, userId, userEmail, amountUsdc, token, onProgress } = params;

  if (!hasMetaMask()) {
    throw new Error("MetaMask is required. Install MetaMask and connect your wallet.");
  }

  const amount = amountUsdc.toFixed(6);
  if (Number(amount) <= 0) {
    throw new Error("Invalid order amount.");
  }

  onProgress({
    step: "initiated",
    detail: "Connecting MetaMask and preparing CCTP bridge…",
  });

  await connectMetaMask();
  await ensureSepoliaNetwork();

  const { address: arcRecipient } = await ensurePatientWallet(api, userId, userEmail);

  const kit = new BridgeKit({ disableErrorReporting: true });
  const adapter = await createViemAdapterFromProvider({
    provider: window.ethereum as EIP1193Provider,
  });

  const handleBridgeEvent = (payload: { method?: string; name?: string }) => {
    const action = String(payload.method ?? payload.name ?? "bridge");
    onProgress({
      step: "initiated",
      detail: mapBridgeActionToDetail(action),
      bridgeAction: action,
    });
  };

  kit.on("*", handleBridgeEvent);

  try {
    onProgress({
      step: "initiated",
      detail: `Bridging ${amount} ${token} from Ethereum Sepolia to Arc Testnet…`,
    });

    const bridgeResult = await kit.bridge({
      from: { adapter, chain: "Ethereum_Sepolia" },
      to: {
        recipientAddress: arcRecipient,
        chain: "Arc_Testnet",
        useForwarder: true,
      },
      amount,
      token: token as "USDC",
    });

    if (bridgeResult.state !== "success") {
      const failed = bridgeResult.steps?.find((s) => s.state === "error");
      throw new Error(
        failed?.errorMessage ?? "CCTP bridge did not complete. Check MetaMask and try again."
      );
    }

    const bridgeTxHash = extractTxHash(bridgeResult);
    onProgress({
      step: "confirmed",
      detail: `${token} received on your Arc in-built wallet.`,
      bridgeAction: "bridge_complete",
    });

    let paymentTxHash = bridgeTxHash;

    if (token === "USDC") {
      onProgress({
        step: "confirmed",
        detail: "Sending USDC payment to the pharmacy on Arc Testnet…",
        bridgeAction: "pay_start",
      });

      const { privateKey } = await ensurePatientWallet(api, userId, userEmail);
      const pay = await payUsdcWithArc(api, privateKey, amount, "");
      paymentTxHash = pay.txHash;

      onProgress({
        step: "payment_sent",
        detail: "Payment submitted. Finalizing your order…",
        bridgeAction: "pay_complete",
      });
    } else {
      onProgress({
        step: "payment_sent",
        detail:
          "EURC bridged to Arc. Order recorded using bridge transaction (pharmacy settlement in USDC may require a separate USDC payment for production).",
        bridgeAction: "eurc_bridge_only",
      });
    }

    return { bridgeTxHash, paymentTxHash };
  } finally {
    kit.off("*", handleBridgeEvent);
  }
}
