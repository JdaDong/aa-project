import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData, encodePacked, concatHex } from "viem/utils";

import { network } from "hardhat";
import { parseEther, formatEther} from "ethers"

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();

  const minimalEntryPoint = await viem.deployContract("MinimalEntryPoint");
  console.log("minimalEntryPoint address: ", minimalEntryPoint.address);
    const signer = walletClients[0].account;
    const singerAccount = walletClients[0];
    console.log("signer address: ", signer.address);
    const simpleSmartAccount = await viem.deployContract("SimpleSmartAccount", [signer.address, minimalEntryPoint.address]);
    console.log("simpleSmartAccount address: ", simpleSmartAccount.address);
    const sponsorPaymaster = await viem.deployContract("SponsorPaymaster", [minimalEntryPoint.address]);
    console.log("sponsorPaymaster address: ", sponsorPaymaster.address);
    const sponsorPaymasterCode = await publicClient.getCode({
  address: sponsorPaymaster.address,
});

    console.log("sponsorPaymaster code: ", sponsorPaymasterCode);
     // -----------------------------
    // 4. 给 Paymaster 存入押金 (很关键)
    // -----------------------------
    const depositTo_txHash = await singerAccount.sendTransaction({
    to: minimalEntryPoint.address,
    data: encodeFunctionData({
      abi: minimalEntryPoint.abi,
      functionName: "depositTo",
      args: [sponsorPaymaster.address], // fee 归 bundler
    }),
    value: parseEther("1.0"),
  });

  console.log("depositTo_txHash:", depositTo_txHash);

  

  const depositTo_receipt = await publicClient.waitForTransactionReceipt({ hash: depositTo_txHash });

  console.log("depositTo_receipt:", depositTo_receipt);


}


// run
main().catch((err) => {
  console.error(err);
  process.exit(1);
});