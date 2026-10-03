// Change this one value if the local API runs on another port.
const BACKEND_URL = "http://127.0.0.1:8000";

export async function postJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(
      `Request to ${path} failed (${response.status}): ${await response.text()}`,
    );
  }
  return response.json() as Promise<T>;
}
