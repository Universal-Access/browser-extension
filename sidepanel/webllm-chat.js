// WebLLM chat integration — local browser-based LLM inference

let engine = null;
let isEngineReady = false;
let currentModel = null;
let initProgressCallback = null;
let chatHistoryCallback = null;

// Available models (curated subset for browser compatibility)
const AVAILABLE_MODELS = [
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    name: "LLaMA 3.1 8B Instruct",
    description:
      "A smaller, instruction-tuned model optimized for responsiveness in browser environments. Suitable for general-purpose chat and assistant tasks with lower resource requirements.",
  },
];

export function getAvailableModels() {
  return AVAILABLE_MODELS;
}

export function isReady() {
  return isEngineReady;
}

export function getCurrentModel() {
  return currentModel;
}

export function onInitProgress(callback) {
  initProgressCallback = callback;
}

export function onChatMessage(callback) {
  chatHistoryCallback = callback;
}

// Initialize the WebLLM engine with a selected model
export async function initializeEngine(modelId, progressCallback) {
  try {
    if (!modelId) {
      throw new Error("No model selected");
    }

    // Dynamically import WebLLM from local file
    let webllm;
    try {
      webllm = await import("./lib/webllm.js");
    } catch (importError) {
      console.error("[WebLLM] Import error:", importError);
      throw new Error(
        "Failed to load WebLLM library. Make sure the local webllm.js file exists in sidepanel/lib/",
      );
    }

    const { CreateMLCEngine } = webllm;
    if (!CreateMLCEngine) {
      throw new Error("CreateMLCEngine not found in WebLLM module");
    }

    // Create engine with progress tracking
    const wrappedProgressCallback = (progress) => {
      if (progressCallback) {
        progressCallback({
          text: progress.text,
          percent: progress.percent || 0,
        });
      }
    };

    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: wrappedProgressCallback,
    });

    currentModel = modelId;
    isEngineReady = true;

    if (progressCallback) {
      progressCallback({
        text: "Model loaded and ready",
        percent: 100,
      });
    }

    return true;
  } catch (err) {
    console.error("[WebLLM] Initialization error:", err);
    isEngineReady = false;
    throw err;
  }
}

// Send a message to the LLM and stream the response
export async function sendMessage(userMessage, maxTokens = 512) {
  if (!engine || !isEngineReady) {
    throw new Error("Engine not initialized. Initialize a model first.");
  }

  try {
    const messages = [
      {
        role: "system",
        content: "You are a helpful AI assistant. Be concise and helpful.",
      },
      { role: "user", content: userMessage },
    ];

    // Stream the response
    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: maxTokens,
    });

    let fullResponse = "";
    let usage = null;

    // Iterate over streaming chunks
    for await (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullResponse += delta.content;

        // Callback with partial response for real-time UI update
        if (chatHistoryCallback) {
          chatHistoryCallback({
            type: "chunk",
            content: delta.content,
          });
        }
      }

      if (chunk.usage) {
        usage = chunk.usage;
      }
    }

    // Callback with complete message
    if (chatHistoryCallback) {
      chatHistoryCallback({
        type: "complete",
        role: "assistant",
        content: fullResponse,
        usage,
      });
    }

    return {
      message: fullResponse,
      usage,
    };
  } catch (err) {
    console.error("[WebLLM] Chat error:", err);
    throw err;
  }
}

// Reset chat history in the engine
export async function resetChat() {
  if (!engine || !isEngineReady) {
    throw new Error("Engine not initialized");
  }
  try {
    await engine.resetChat();
    return true;
  } catch (err) {
    console.error("[WebLLM] Reset error:", err);
    throw err;
  }
}

// Get GPU vendor information (for debugging)
export async function getGPUInfo() {
  if (!engine) {
    return { vendor: "Unknown", bufferSize: 0 };
  }
  try {
    const vendor = await engine.getGPUVendor();
    const bufferSize = await engine.getMaxStorageBufferBindingSize();
    return { vendor, bufferSize };
  } catch (err) {
    console.error("[WebLLM] GPU info error:", err);
    return { vendor: "Unknown", bufferSize: 0 };
  }
}

// Unload engine and cleanup
export async function unloadEngine() {
  if (engine && isEngineReady) {
    try {
      await engine.unload();
    } catch (err) {
      console.error("[WebLLM] Unload error:", err);
    }
  }
  engine = null;
  currentModel = null;
  isEngineReady = false;
}
