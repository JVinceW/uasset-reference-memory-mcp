import type { GraphSource } from "./GraphSource";
import type { Overview } from "./apiTypes";

export class HttpGraphSource implements GraphSource {
  async getOverview(): Promise<Overview> {
    const response = await fetch("/api/overview");
    const body = (await response.json()) as unknown;

    if (!response.ok) {
      const error = body && typeof body === "object" && "error" in body ? String(body.error) : response.statusText;
      throw new Error(error);
    }

    return body as Overview;
  }
}
