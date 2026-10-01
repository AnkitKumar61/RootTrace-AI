import { useEffect, useRef, useState, useCallback } from "react";
import { api, errorMessage } from "../lib/api.js";
export function useResource(path, { pollWhile } = {}) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [errorStatus, setErrorStatus] = useState(null),
    [version, setVersion] = useState(0);
  const pollRef = useRef(pollWhile);
  pollRef.current = pollWhile;
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let disposed = false,
      timer;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setErrorStatus(null);
    setData(null);
    async function load() {
      if (document.hidden) {
        timer = setTimeout(load, 3000);
        return;
      }
      try {
        const response = await api.get(path, { signal: controller.signal });
        if (disposed) return;
        setData(response.data);
        setError("");
        if (pollRef.current?.(response.data)) timer = setTimeout(load, 3000);
      } catch (e) {
        if (!disposed && e.code !== "ERR_CANCELED") {
          setError(errorMessage(e));
          setErrorStatus(e.response?.status);
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    load();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, version]);
  return { data, loading, error, errorStatus, reload };
}
