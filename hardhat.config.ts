import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
    settings: {
      optimizer: {
        enabled: true, // <--- 开启优化器
        runs: 200,     // <--- 配置运行次数
      },
      viaIR: true, // <--- 在这里添加这一行
    },
  },
  networks: {
    anvil: {
      url: "http://127.0.0.1:8545",
      type: "http",
    },
    hardhat: {
      forking: {
        url: "https://eth-mainnet.g.alchemy.com/v2/Qfdr68Zn1sVkbTNMukVf6BT7vPLuvLjq",
        // 可选：指定区块高度，保证结果可复现
        blockNumber: 24030300,
        enabled: true,
      },
      type: "edr-simulated",
    },
  },
});
