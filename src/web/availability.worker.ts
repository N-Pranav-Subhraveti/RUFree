import { availability, type AvailabilityData } from "../domain/availability";
self.onmessage = (
  event: MessageEvent<{ data: AvailabilityData; start: number; end: number }>,
) => {
  try {
    self.postMessage(
      availability(event.data.data, event.data.start, event.data.end),
    );
  } catch {
    self.postMessage({
      error: "Unable to calculate this range. Try a shorter range.",
    });
  }
};
