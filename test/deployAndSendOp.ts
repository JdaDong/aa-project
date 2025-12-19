import assert from "node:assert/strict";
import { describe, it } from "node:test";
import dotenv from "dotenv";
import { expect } from "chai";
import { privateKeyToAccount } from "viem/accounts";
import { getContract, PrivateKeyAccount, createWalletClient, http, parseEventLogs, zeroAddress, sliceHex, toHex, Hex, type TransactionSerializableEIP7702 } from "viem";
import { encodeFunctionData, encodePacked, concatHex, hexToBytes, verifyAuthorization } from "viem/utils";
import {hardhat, mainnet} from "viem/chains"

import { network } from "hardhat";
import { parseEther, formatEther} from "ethers"

dotenv.config();

describe("test eip7702 erc4337 deploy and send op", async function () {
  /**
   * hardhat + viem 插件提供的 helper
   * walletClients[0]：默认有 ETH 的本地账户（类似 deployer）
   */
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();

  it("test eip7702 erc4337 deploy and send op", async function () {
    /**
     * ========= 1. 准备 EOA =========
     * 这个 EOA：
     * - 发 7702 授权 / 取消授权
     * - 作为 AA Account 的 owner
     */
    const signer = privateKeyToAccount(process.env.EOA_PRIVATE_KEY as `0x${string}`);
    const eoaClient = createWalletClient({
      account: signer,
      chain: mainnet,
      transport: http(process.env.RPC_URL as string),
    });
    /**
     * 给 EOA 打点 ETH（用于 7702 tx 自身的 gas）
     */
    await walletClients[0].sendTransaction({
        to: eoaClient.account.address,
        value: parseEther("10"),
    });
    /**
     * ========= 2. 部署合约 =========
     * - SimpleSmartAccount：AA 账户逻辑
     * - SponsorPaymaster：Gas Sponsor
     * - EntryPoint：已部署，直接 attach
     */
    const simpleSmartAccount = await viem.deployContract("SimpleSmartAccount", []);
    console.log("signer address: ", signer.address);
    console.log("eip7702 address: ", simpleSmartAccount.address);
    const sponsorPaymaster = await viem.deployContract("SponsorPaymaster", [process.env.ENTRYPOINT as `0x${string}`]);
    console.log("sponsorPaymaster address: ", sponsorPaymaster.address);
    const simpleEntryPoint = await viem.getContractAt("SimpleEntryPoint", process.env.ENTRYPOINT as `0x${string}`);


    console.log("strat authorization");

    /**
     * ========= 3. EIP-7702 授权 =========
     *
     * 本质：
     * - EOA 给自己发一笔 type=7702 的交易
     * - 临时把 code 托管成 SimpleSmartAccount
     */
    const nonce = await publicClient.getTransactionCount({ address: eoaClient.account.address });
    console.log("nonce: ", nonce);

    // 授权前 EOA 是没有 code 的
    const b_senderCOde = await publicClient.getCode({ address: eoaClient.account.address });
    console.log("b_senderCOde:", b_senderCOde);

    /**
     * prepareAuthorization：
     * - 指定下一个 nonce
     * - 指定要托管的 logic contract
     */
    const prepareAuthorization = await eoaClient.prepareAuthorization({
      nonce: Number(nonce) + 1,
      account: signer,
      contractAddress: simpleSmartAccount.address,});

    console.log("prepareAuthorization:", prepareAuthorization);

    const authorization = await eoaClient.signAuthorization(prepareAuthorization);
    console.log("authorization:", authorization);
    console.log("start authorization end");
    /**
     * 发送 7702 授权交易
     * 注意：
     * - to = 自己
     * - type = eip7702
     */
    const delegateHash = await eoaClient.sendTransaction({
      authorizationList: [authorization],
	    data: "0x" as `0x${string}`,
      value: 0n,
      account: signer,
	    to: eoaClient.account.address,
      chainId: hardhat.id,
      type: "eip7702",
    });
    console.log(`delegate 7702 tx ${delegateHash}`);
    const delegateTransaction = await publicClient.getTransaction({ hash: delegateHash });
    console.log("delegateTransaction:", delegateTransaction);

    const delegateReceipt = await publicClient.waitForTransactionReceipt({ hash: delegateHash });
    console.log("delegateReceipt:", delegateReceipt);
    // 授权后 EOA 地址已经有 code（但只在本 tx 生命周期内生效）
    const senderCOde = await publicClient.getCode({ address: eoaClient.account.address });
    console.log("senderCode:", senderCOde);
    expect(senderCOde).to.not.equal("0x");


    // deposit
    /**
     * ========= 4. Paymaster 向 EntryPoint 充值 =========
     * sponsor gas 的前提
     */

    // check deposit
    let signerDepositBalance = await simpleEntryPoint.read.balanceOf([sponsorPaymaster.address]);
    console.log("signerDepositBalance:", signerDepositBalance);

    const depositTxHash = await walletClients[0].writeContract({
      address: sponsorPaymaster.address,
      abi: sponsorPaymaster.abi,
      functionName: "deposit",
      args: [],
      value: parseEther("1"),
    });

    const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositTxHash });
    console.log("depositReceipt:", depositReceipt);

    signerDepositBalance = await simpleEntryPoint.read.balanceOf([sponsorPaymaster.address]);
    console.log("signerDepositBalance:", signerDepositBalance);



  /**
     * ========= 5. 构造 UserOperation =========
     * 目标：AA 账户给 walletClients[1] 转 0.1 ETH
     */
    // 0 --add whitelist
    await sponsorPaymaster.write.addToWhiteList([eoaClient.account.address]);

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

  const block = await publicClient.getBlock();

  const now = block.timestamp;
  /**
     * Paymaster 有效期参数（validatePaymasterUserOp 用）
     */
const validAfter = now - 10n; // Valid from 1 minute ago
const validUntil = now + 3600n; // Valid for 1 hour
const paymasterVerificationGasLimit = 100_000n;
const paymasterPostOpGasLimit = 300_000n;

 /**
     * UserOp nonce（注意：不是 EOA nonce）
     */
const userOpNonce = await simpleEntryPoint.read.getNonce([signer.address, 0n]);
console.log("userOpNonce:", userOpNonce);

  const userOp = {
    sender: signer.address,
    nonce: userOpNonce, 
    initCode: "0x" as `0x${string}`,
    // initCode: INITCODE_EIP7702_MARKER as `0x${string}`,
    callData: callData,
     /**
       * accountGasLimits:
       * - verificationGas
       * - callGas
       */
    accountGasLimits: encodePacked(
    ["uint128", "uint128"],
    [
      300_000n, // verificationGas
      300_000n, // callGas
    ]
  ),
    preVerificationGas: 50000n,
    gasFees: encodePacked(
    ["uint128", "uint128"],
    [
      1_000_000_000n, // maxPriorityFeePerGas
      1_000_000_000n, // maxFeePerGas
    ]
  ),
    paymasterAndData: concatHex([sponsorPaymaster.address, "0x"]) as `0x${string}`,
    signature: "0x" as `0x${string}`, // 稍后填
  };

    /**
       * paymasterAndData:
       * address + verificationGas + postOpGas + custom data
       */

  userOp.paymasterAndData = encodePacked(
  ["address", "uint128", "uint128", "bytes"],
  [
    sponsorPaymaster.address,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit,
    encodePacked(
      ["uint48", "uint48"],
      [Number(validAfter), Number(validUntil)]
    ),
  ]
);

  /**
     * ========= 6. UserOp 签名 =========
     */

  const userOpHash = await simpleEntryPoint.read.getUserOpHash([userOp]);

  console.log("userOpHash:", userOpHash);

  // ---------- 3. owner 对 userOpHash 签名 ----------
  const signature = await await signer.sign({
    hash: userOpHash });
  console.log("signature:", signature);

  userOp.signature = signature;

  /**
     * ========= 7. 执行 handleOps =========
     * bundler = walletClients[3]
     * 使用 7702，让 EntryPoint 在 EOA 上执行 AA 逻辑
     */

  const userops = [userOp]

  const before_balance = await publicClient.getBalance({ address: walletClients[1].account.address });

  console.log("before_balance:", before_balance);

  const before_aa_balance = await publicClient.getBalance({ address: simpleSmartAccount.address });

  console.log("before_aa_balance:", before_aa_balance);

  

 /**
     * ========= 8. 校验结果 =========
     * - 目标地址收到 ETH
     */


  const before_eoa_balance =await publicClient.getBalance({ address: signer.address });
  console.log("before_eoa_balance:", before_eoa_balance);

  // ---------- 4. bundler 调用 handleOps ----------
  const op_txHash = await eoaClient.sendTransaction({
    to: simpleEntryPoint.address,
    data: encodeFunctionData({
      abi: simpleEntryPoint.abi,
      functionName: "handleOps",
      args: [userops, walletClients[3].account.address], // fee 归 bundler
    }),
    type: "eip7702",
    authorizationList: [authorization],
    chain: mainnet
  });

  console.log("txHash:", op_txHash);

  const op_transaction = await publicClient.getTransaction({ hash: op_txHash });

  console.log("op_transaction:", op_transaction);

  

  const op_receipt = await publicClient.waitForTransactionReceipt({ hash: op_txHash });

  console.log("op_receipt:", op_receipt);
  console.log("op logs: ", op_receipt.logs);
  signerDepositBalance = await simpleEntryPoint.read.balanceOf([sponsorPaymaster.address]);;
  console.log("signerDepositBalance:", signerDepositBalance);

  const after_balance = await publicClient.getBalance({ address: walletClients[1].account.address });

  console.log("after_balance:", after_balance);
  console.log("add:", after_balance - before_balance);
  console.log("Balance:", formatEther(after_balance - before_balance), "ETH");


  const after_aa_balance = await publicClient.getBalance({ address: simpleSmartAccount.address });

  console.log("after_aa_balance:", after_aa_balance);
  console.log("less:", before_aa_balance - after_aa_balance);
  console.log("Balance:", formatEther(before_aa_balance - after_aa_balance), "ETH");


  const after_eoa_balance =await publicClient.getBalance({ address: signer.address });

  console.log("after_eoa_balance:", after_eoa_balance);
  console.log("less:", before_eoa_balance - after_eoa_balance);
  console.log("Balance:", formatEther(before_eoa_balance - after_eoa_balance), "ETH");

  // 取消授权
  // ========================
// 9. 取消 EIP-7702 授权（undelegate）
// 目的：把 EOA 从「临时 Smart Account」还原成普通 EOA
// ========================

/**
 * 1️⃣ 获取当前 EOA 的交易 nonce
 *
 * ⚠️ 这是 EOA 的 transaction nonce（不是 UserOp nonce）
 * 每一笔 7702 授权 / 取消授权都会消耗一个 nonce
 */

  const undelegateNonce = await publicClient.getTransactionCount({ address: eoaClient.account.address });
  console.log("undelegateNonce: ", undelegateNonce);

  /**
 * 2️⃣ 构造“取消授权”的 Authorization
 *
 * contractAddress = zeroAddress
 * 👉 含义：清除当前托管的 code（undelegate）
 *
 * nonce 必须使用「下一笔交易」的 nonce
 */

  const undelegatePrepareAuthorization = await eoaClient.prepareAuthorization({
    nonce: Number(undelegateNonce) + 1,
    account: signer,
    contractAddress: zeroAddress
  });

  console.log("undelegatePrepareAuthorization:", undelegatePrepareAuthorization);
  /**
 * 3️⃣ 使用 EOA 私钥对 Authorization 签名
 *
 * 这一步不会发交易，只是生成授权签名
 */

  const undelegateAuthorization = await eoaClient.signAuthorization(undelegatePrepareAuthorization);
  console.log("undelegateAuthorization:", undelegateAuthorization);

  /**
 * 4️⃣ 发送 EIP-7702 取消授权交易
 *
 * 关键点：
 * - type: "eip7702"
 * - authorizationList: [undelegateAuthorization]
 * - to = zeroAddress（配合 contractAddress = zeroAddress）
 *
 * 这笔交易执行完成后：
 * - EOA 上的 code 被清空
 * - EOA 恢复成普通账户
 */
  const unDelegateHash = await eoaClient.sendTransaction({
      authorizationList: [undelegateAuthorization],
	    data: "0x" as `0x${string}`,
      value: 0n,
      account: signer,
	    to: zeroAddress,
      chainId: hardhat.id,
      type: "eip7702",
    });
    console.log(`undelegate 7702 tx ${unDelegateHash}`);
    const unDelegateTransaction = await publicClient.getTransaction({ hash: unDelegateHash });
    console.log("unDelegateTransaction:", unDelegateTransaction);

    const unDelegateReceipt = await publicClient.waitForTransactionReceipt({ hash: unDelegateHash });
    console.log("unDelegateReceipt:", unDelegateReceipt);

    /**
 *  5️⃣ 验证结果：EOA 上已经没有 code
 *
 * 正确结果：
 * - senderCode === "0x"
 *
 * 如果不是：
 * - 取消授权失败
 * - nonce / authorization / chainId 可能有问题
 */
    const code = await publicClient.getCode({ address: eoaClient.account.address });
    console.log("senderCode:", code);

  });


});
