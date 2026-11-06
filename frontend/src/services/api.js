// Drop this into your EXISTING React project (do not rebuild the UI).
// In dev, Vite proxies /predict /explain /health /model-info → FastAPI, so BASE_URL is "".
// In prod, set VITE_API_URL in the .env file to point at your EC2/server address.
const BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_URL) ||
  ""; // empty = use Vite proxy (same-origin requests)

async function postImage(path, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// -> { status, top1:{label,confidence}, top_k:[...], model_name, inference_ms, s3_key }
export const predictImage = (file) => postImage("/predict", file);

// -> same as above + heatmap_png_base64  (use: <img src={`data:image/png;base64,${r.heatmap_png_base64}`} />)
export const explainImage = (file) => postImage("/explain", file);

// -> { label: 'Real' | 'AI-generated', confidence, probabilities: { real, ai } }
export const detectAIImage = (file) => postImage("/detect-ai", file);

export const getModelInfo = () => fetch(`${BASE_URL}/model-info`).then((r) => r.json());

export const getHealth = () => fetch(`${BASE_URL}/health`).then((r) => r.json());
