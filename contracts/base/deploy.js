#!/usr/bin/env node
/**
 * One-off deploy script for ReverseSpecEscrow.sol on Base Sepolia.
 *
 * No Hardhat/Foundry project here on purpose (matches sibling projects
 * Event-Weaver / Meme-olympics, which also deploy their escrows this way):
 * compile with the solc npm package, deploy with ethers, done.
 *
 * Required env vars (never hardcode these):
 *   BASE_SEPOLIA_RPC_URL           - Base Sepolia JSON-RPC endpoint
 *   BASE_SEPOLIA_RELAYER_PRIVATE_KEY - deployer key; its address also
 *                                      becomes the escrow's `relayer`
 *   BASE_SEPOLIA_USDC_ADDRESS      - USDC token address on Base Sepolia
 *                                    (defaults to the known testnet USDC)
 *
 * Usage:
 *   BASE_SEPOLIA_RPC_URL=... BASE_SEPOLIA_RELAYER_PRIVATE_KEY=... \
 *     node contracts/base/deploy.js
 */
const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");

const DEFAULT_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

function compile() {
  const contractPath = path.join(__dirname, "ReverseSpecEscrow.sol");
  const source = fs.readFileSync(contractPath, "utf8");
  const input = {
    language: "Solidity",
    sources: { "ReverseSpecEscrow.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === "error");
    for (const e of output.errors) console.error(e.formattedMessage);
    if (fatal.length) throw new Error("Solidity compilation failed");
  }
  const contract = output.contracts["ReverseSpecEscrow.sol"]["ReverseSpecEscrow"];
  return { abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object };
}

async function main() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  const privateKey = process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
  const usdcAddress = process.env.BASE_SEPOLIA_USDC_ADDRESS || DEFAULT_USDC;
  if (!rpcUrl) throw new Error("BASE_SEPOLIA_RPC_URL is required");
  if (!privateKey) throw new Error("BASE_SEPOLIA_RELAYER_PRIVATE_KEY is required");

  const { abi, bytecode } = compile();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("Deployer / relayer address:", wallet.address);
  console.log("USDC address:", usdcAddress);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const escrow = await factory.deploy(usdcAddress, wallet.address);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();

  console.log("\nReverseSpecEscrow deployed at:", address);
  console.log("Constructor args: usdc =", usdcAddress, "relayer =", wallet.address);

  const artifactPath = path.join(__dirname, "ReverseSpecEscrow.abi.json");
  fs.writeFileSync(artifactPath, JSON.stringify(abi, null, 2));
  console.log("ABI written to:", artifactPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
