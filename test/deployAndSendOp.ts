import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData, encodePacked, concatHex } from "viem/utils";

import { network } from "hardhat";
import { parseEther, formatEther} from "ethers"

describe("Counter", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();

  it("Should emit the Increment event when calling the inc() function", async function () {
    const minimalEntryPoint = await viem.deployContract("MinimalEntryPoint");
    const signer = walletClients[0].account;
    console.log("signer address: ", signer.address);
    const simpleSmartAccount = await viem.deployContract("SimpleSmartAccount", [signer.address, minimalEntryPoint.address]);
    const sponsorPaymaster = await viem.deployContract("SponsorPaymaster", [minimalEntryPoint.address]);

    const txHash = await walletClients[0].sendTransaction({
      to: sponsorPaymaster.address,
      value: parseEther("1.0"),
    });
    console.log("txHash:", txHash);

    // 等待确认
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log("receipt:", receipt);

    // transfer to aa
     const aaTransferHash = await walletClients[0].sendTransaction({
      to: simpleSmartAccount.address,
      value: parseEther("1.0"),
    });
    console.log("aaTransferHash:", aaTransferHash);

    // 等待确认
    const aaTransferReceipt = await publicClient.waitForTransactionReceipt({ hash: aaTransferHash });

    console.log("aaTransferReceipt:", aaTransferReceipt);



    // ----------

     // ---------- 1. 构造 UserOperation ----------
  const valueToSend = parseEther("0.1");

  const callData = encodeFunctionData({
    abi: [
      {
        name: "execute",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
        outputs: [],
      },
    ],
    functionName: "execute",
    args: [walletClients[1].account.address, valueToSend, "0x"], // ⭐ 普通转账：data = "0x"
  });

  console.log("signer address: ", signer.address);

  const userOp = {
    sender: simpleSmartAccount.address,
    nonce: 0n,
    initCode: `0x` as `0x${string}`,
    callData: callData,
    accountGasLimits: encodePacked(
    ["uint256"],
    [150000n] // [verificationGasLimit, callGasLimit]
  ),
    preVerificationGas: 50000n,
    gasFees: encodePacked(
    ["uint256"],
    [1000000000n] // [maxPriorityFeePerGas, maxFeePerGas]
  ),
    paymasterAndData: concatHex([sponsorPaymaster.address, "0x"]) as `0x${string}`,
    signature: "0x" as `0x${string}`, // 稍后填
  };

  // ---------- 2. 获取 userOpHash ----------
  // const userOpHash = await publicClient.readContract({
  //   address: minimalEntryPoint.address,
  //   abi: minimalEntryPoint.abi,
  //   functionName: "getUserOpHash",
  //   args: [userOp],
  // });

   const userOpHash = await minimalEntryPoint.read.getUserOpHash([userOp]);

  console.log("userOpHash:", userOpHash);

  // ---------- 3. owner 对 userOpHash 签名 ----------
  const signature = await walletClients[0].signMessage({
    message: { raw: userOpHash },
  });
  console.log("walletClients[0]:", walletClients[0].account.address);
  console.log("signature:", signature);

  userOp.signature = signature;

  const userops = [userOp]

  const before_balance = await publicClient.getBalance({ address: walletClients[1].account.address });

  console.log("before_balance:", before_balance);

  const before_aa_balance = await publicClient.getBalance({ address: simpleSmartAccount.address });

  console.log("before_aa_balance:", before_aa_balance);

  

  // ------------- 3.1 -------------
  const depositTo_txHash = await walletClients[0].sendTransaction({
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


  const before_signer_balance = await publicClient.getBalance({ address: walletClients[3].account.address });

  console.log("before_signer_balance:", before_signer_balance);

  // ---------- 4. bundler 调用 handleOps ----------
  const op_txHash = await walletClients[3].sendTransaction({
    to: minimalEntryPoint.address,
    data: encodeFunctionData({
      abi: minimalEntryPoint.abi,
      functionName: "handleOps",
      args: [userops, walletClients[3].account.address], // fee 归 bundler
    }),
  });

  console.log("txHash:", txHash);

  

  const op_receipt = await publicClient.waitForTransactionReceipt({ hash: op_txHash });

  console.log("op_receipt:", op_receipt);

  const after_balance = await publicClient.getBalance({ address: walletClients[1].account.address });

  console.log("after_balance:", after_balance);
  console.log("add:", after_balance - before_balance);
  console.log("Balance:", formatEther(after_balance - before_balance), "ETH");


  const after_aa_balance = await publicClient.getBalance({ address: simpleSmartAccount.address });

  console.log("after_aa_balance:", after_aa_balance);
  console.log("less:", before_aa_balance - after_aa_balance);
  console.log("Balance:", formatEther(before_aa_balance - after_aa_balance), "ETH");


  const after_signer_balance = await publicClient.getBalance({ address: walletClients[3].account.address });

  console.log("after_signer_balance:", after_signer_balance);
  console.log("less:", after_signer_balance - before_signer_balance);
  console.log("Balance:", formatEther(after_signer_balance - before_signer_balance), "ETH");

  });


});
