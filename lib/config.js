export const MODELS = {
  aven: process.env.MIXROUTER_MODEL_FREE || "qwen3.6-flash",
  deepseek: process.env.MIXROUTER_MODEL_DEEPSEEK || "",
  gpt: process.env.MIXROUTER_MODEL_GPT || "",
  qwen: process.env.MIXROUTER_MODEL_QWEN || ""
};

export function getModel(key = "aven") {
  return MODELS[key] || MODELS.aven;
}
