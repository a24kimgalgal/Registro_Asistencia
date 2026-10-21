export async function apiRequest(path, options = {}) {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) {
    return null;
  }

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || 'No se pudo completar la operación.');
  }
  return result;
}

export function jsonBody(value) {
  return JSON.stringify(value);
}
