export const MODELS = {
  qwen: process.env.MIXROUTER_MODEL_QWEN || "gemini-2.5-flash",
  deepseek: process.env.MIXROUTER_MODEL_DEEPSEEK || "gemini-2.5-flash",
  gpt: process.env.MIXROUTER_MODEL_GPT || "gemini-2.5-flash",
  gemini: process.env.MIXROUTER_MODEL_GEMINI || "gemini-2.5-flash",
  grok: process.env.MIXROUTER_MODEL_GROK || "gemini-2.5-flash",
  claude: process.env.MIXROUTER_MODEL_CLAUDE || "gemini-2.5-flash"
};

export function getModel(key = "qwen") {
  return MODELS[key] || MODELS.qwen;
}
