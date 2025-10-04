import { type XmcpConfig } from "xmcp";

const config: XmcpConfig = {
  stdio: true,
  paths: {
    prompts: false,
    resources: false,
    tools: "./src/tools",
  },
};

export default config;
