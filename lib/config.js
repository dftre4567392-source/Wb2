export const MODELS = {
  qwen: process.env.MIXROUTER_MODEL_QWEN || "qwen3.6-flash",
  deepseek: process.env.MIXROUTER_MODEL_DEEPSEEK || "deepseek-v4-flash",
  gpt: process.env.MIXROUTER_MODEL_GPT || "gpt-6-luna",
  gemini: process.env.MIXROUTER_MODEL_GEMINI || "gemini-3.8-flash",
  grok: process.env.MIXROUTER_MODEL_GROK || "grok-4.7",
  claude: process.env.MIXROUTER_MODEL_CLAUDE || "claude-opus-4-8"
};

export function getModel(key = "qwen") {
  return MODELS[key] || MODELS.qwen;
}
